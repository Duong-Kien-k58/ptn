import json  # Đọc dữ liệu JSON như bbox
import logging  # Ghi log lỗi
import math  # Kiểm tra số hữu hạn
import os  # Đọc biến môi trường
import re  # Kiểm tra định dạng tên raster
from base64 import b64encode  # Mã hóa tài khoản GeoServer theo Basic Authentication
from pathlib import Path  # Xử lý đường dẫn file .env
from urllib.error import HTTPError, URLError  # Bắt lỗi khi gọi GeoServer REST API
from urllib.request import Request, urlopen  # Gửi HTTP request đến GeoServer
from django.db import DatabaseError  # Bắt lỗi PostgreSQL
from dotenv import dotenv_values  # Đọc biến cấu hình từ file .env
from accounts.permissions import admin_required  # Chỉ admin được thêm/xóa raster
from .api import error, success  # Chuẩn hóa response thành công/lỗi
from .models import RasterMetadata  # Model lưu metadata raster trong PostgreSQL
logger = logging.getLogger(__name__)  # Logger của file hiện tại
RASTER_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,62}$")  # Tên raster phải bắt đầu bằng chữ, tối đa 63 ký tự
MAX_RASTER_SIZE = 512 * 1024 * 1024  # Web chỉ nhận GeoTIFF nhỏ hơn 512 MB

def geoserver_setting(name, default=None):
    project_env = Path(__file__).resolve().parents[2] / ".env"  # Xác định file .env ở thư mục gốc backend/project
    return os.getenv(name) or dotenv_values(project_env).get(name) or default  # Ưu tiên biến hệ thống → .env → giá trị mặc định

def geoserver_request(path, *, method="GET", data=None, content_type=None, content_length=None, allow_not_found=False, read_body=False):
    username = geoserver_setting("GEOSERVER_ADMIN_USER")  # Lấy tài khoản admin GeoServer
    password = geoserver_setting("GEOSERVER_ADMIN_PASSWORD")  # Lấy mật khẩu GeoServer
    if not username or not password:
        raise RuntimeError("Chưa cấu hình tài khoản GeoServer cho quản trị raster.")  # Không có tài khoản thì dừng
    base_url = geoserver_setting("GEOSERVER_REST_URL", "http://localhost:8080/geoserver/rest").rstrip("/")  # URL REST API GeoServer
    headers = {"Authorization": f"Basic {b64encode(f'{username}:{password}'.encode()).decode()}"}  # Tạo Basic Auth
    if content_type:
        headers["Content-Type"] = content_type  # Ví dụ image/tiff khi upload GeoTIFF
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    try:
        request = Request(f"{base_url}/{path.lstrip('/')}", data=data, headers=headers, method=method)  # Tạo HTTP request
        with urlopen(request, timeout=45) as response:
            return response.read() if read_body else response.status
    except HTTPError as exc:
        if allow_not_found and exc.code == 404:
            return None
        detail = exc.read().decode("utf-8", "replace")[:500]  # Đọc nội dung lỗi GeoServer, tối đa 500 ký tự
        raise RuntimeError(f"GeoServer trả về HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError("Không kết nối được GeoServer.") from exc  # GeoServer tắt hoặc sai URL

def validate_name(name):
    if not isinstance(name, str) or not RASTER_NAME_PATTERN.fullmatch(name):
        return "Tên raster chỉ gồm chữ cái, số, dấu gạch nối hoặc gạch dưới; bắt đầu bằng chữ cái."  # Tên không hợp lệ
    return None  # Tên hợp lệ

def serialize(raster):
    return {
        "id": raster.name,  # Dùng tên raster làm id phía frontend
        "name": raster.name,  # Tên kỹ thuật của raster
        "title": raster.title,  # Tên hiển thị
        "crs": raster.crs,  # Hệ tọa độ
        "bbox": raster.bbox,  # Phạm vi raster
        "width": raster.width,  # Số pixel chiều ngang
        "height": raster.height,  # Số pixel chiều dọc
        "source_filename": raster.source_filename,  # Tên file GeoTIFF gốc
        "technical_metadata": raster.technical_metadata,  # Band, kiểu pixel và NoData
        "created_at": raster.created_at.isoformat(),
        "updated_at": raster.updated_at.isoformat(),
    }

def read_metadata(request, fallback_name=""):
    name = request.POST.get("name", fallback_name).strip()  # Lấy tên raster frontend gửi lên
    title = request.POST.get("title", name).strip()  # Lấy tên hiển thị, mặc định bằng name
    if name_error := validate_name(name):
        return None, name_error  # Dừng nếu tên không hợp lệ
    if not title:
        return None, "Hãy nhập tên hiển thị raster."
    try:
        bbox = json.loads(request.POST.get("bbox", "[]"))  # Chuyển bbox JSON thành list Python
        width, height = int(request.POST.get("width", 0)), int(request.POST.get("height", 0))  # Đọc kích thước raster
        technical_metadata = json.loads(request.POST.get("technical_metadata", "{}"))
    except (ValueError, json.JSONDecodeError):
        return None, "Thông tin raster không hợp lệ."
    if not isinstance(technical_metadata, dict):
        return None, "Metadata kỹ thuật raster không hợp lệ."
    if (
        not isinstance(bbox, list)
        or len(bbox) != 4  # BBox phải có minX, minY, maxX, maxY
        or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in bbox)  # Tất cả phải là số hữu hạn
    ):
        return None, "BBox raster phải gồm bốn tọa độ số hữu hạn."
    if width <= 0 or height <= 0:
        return None, "Kích thước raster phải lớn hơn 0."  # Không cho width/height bằng 0 hoặc âm
    return {
        "name": name,
        "title": title[:150],  # Giới hạn title tối đa 150 ký tự
        "crs": request.POST.get("crs", "").strip()[:64],  # Hệ tọa độ, tối đa 64 ký tự
        "bbox": bbox,
        "width": width,
        "height": height,
        "source_filename": request.POST.get("source_filename", "").strip()[:255],
        "technical_metadata": technical_metadata,
    }, None

def list_rasters(request):
    if request.method != "GET":
        return error("Chỉ hỗ trợ phương thức GET.", 405)  # Danh sách raster chỉ cho GET
    try:
        rasters = [serialize(raster) for raster in RasterMetadata.objects.all()]  # Đọc toàn bộ raster từ PostgreSQL
    except DatabaseError:
        logger.exception("Không thể đọc metadata raster")  # Ghi lỗi vào log
        return error("Không thể đọc danh sách raster từ cơ sở dữ liệu.", 500)
    return success("Đã tải danh sách raster.", rasters=rasters)  # Trả danh sách raster về frontend


def geoserver_json(path):
    try:
        return json.loads(geoserver_request(path, read_body=True).decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("GeoServer không trả về metadata JSON hợp lệ.") from exc


def coverage_metadata(workspace, store_name, coverage_name):
    coverage = geoserver_json(
        f"workspaces/{workspace}/coveragestores/{store_name}/coverages/{coverage_name}.json"
    ).get("coverage", {})
    bbox_data = coverage.get("nativeBoundingBox") or coverage.get("latLonBoundingBox") or {}
    try:
        bbox = [float(bbox_data[key]) for key in ("minx", "miny", "maxx", "maxy")]
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("GeoServer không trả về phạm vi hợp lệ cho raster.") from exc
    grid_range = coverage.get("grid", {}).get("range", {})
    try:
        low = [int(value) for value in grid_range["low"].split()]
        high = [int(value) for value in grid_range["high"].split()]
        width, height = high[0] - low[0] + 1, high[1] - low[1] + 1
    except (KeyError, IndexError, TypeError, ValueError):
        width = height = None
    dimensions = coverage.get("dimensions", {}).get("coverageDimension", [])
    if isinstance(dimensions, dict):
        dimensions = [dimensions]
    data_types = [item.get("dimensionType", {}).get("name") for item in dimensions]
    data_types = [item for item in data_types if item]
    # GeoServer trả về dạng UNSIGNED_8BITS hoặc REAL_32BITS.
    bits = sorted({match.group(1) for item in data_types if (match := re.search(r"(\d+)_?BITS", item))})
    no_data = [item.get("nullValues", {}).get("double") for item in dimensions]
    grid = coverage.get("grid", {})
    source_type = coverage.get("nativeFormat", "GeoServer")
    return {
        "crs": coverage.get("srs") or bbox_data.get("crs", ""),
        "bbox": bbox,
        "width": width,
        "height": height,
        "source_filename": f"{source_type}: {store_name}",
        "technical_metadata": {
            "source_type": source_type,
            "coverage_store": store_name,
            "band_count": len(dimensions) or None,
            "band_names": [item.get("name") for item in dimensions],
            "bits_per_sample": f"{', '.join(bits)} bit × {len(dimensions)} band" if bits and dimensions else None,
            "data_type": ", ".join(sorted(set(data_types))) or None,
            "no_data": no_data if any(value is not None for value in no_data) else None,
            "resolution_x": abs(grid.get("transform", {}).get("scaleX", 0)) or None,
            "resolution_y": abs(grid.get("transform", {}).get("scaleY", 0)) or None,
        },
    }


@admin_required
def sync_raster_from_geoserver(request, raster_name):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)
    if name_error := validate_name(raster_name):
        return error(name_error)
    store_name = request.POST.get("store_name", raster_name).strip()
    if name_error := validate_name(store_name):
        return error(name_error)
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "ptn")
    try:
        metadata = coverage_metadata(workspace, store_name, raster_name)
        raster, _ = RasterMetadata.objects.update_or_create(
            name=raster_name,
            defaults={**metadata, "title": request.POST.get("title", raster_name).strip()[:150] or raster_name},
        )
    except (DatabaseError, RuntimeError) as exc:
        logger.exception("Không thể đồng bộ metadata raster %s", raster_name)
        return error(str(exc), 502 if isinstance(exc, RuntimeError) else 500)
    return success("Đã đồng bộ metadata từ GeoServer.", raster=serialize(raster))


def upload_chunks(upload):
    yield from upload.chunks()


def publish_raster(workspace, name, upload, *, replace=False):
    store_path = f"workspaces/{workspace}/coveragestores/{name}"
    if replace:
        geoserver_request(f"{store_path}?recurse=true&purge=all", method="DELETE", allow_not_found=True)
    geoserver_request(
        f"{store_path}/file.geotiff?configure=all",
        method="PUT",
        data=upload_chunks(upload),
        content_type="image/tiff",
        content_length=upload.size,
    )


@admin_required
def update_raster_metadata(request, raster_name):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)
    metadata, metadata_error = read_metadata(request, raster_name)
    if metadata_error:
        return error(metadata_error)
    if metadata["name"] != raster_name:
        return error("Tên raster không được thay đổi khi chỉ cập nhật metadata.")
    try:
        raster, _ = RasterMetadata.objects.update_or_create(
            name=raster_name,
            defaults=metadata,
        )
    except DatabaseError:
        logger.exception("Không thể cập nhật metadata raster %s", raster_name)
        return error("Không thể lưu metadata raster vào PostgreSQL.", 500)
    return success("Đã cập nhật metadata raster.", raster=serialize(raster))

@admin_required
def save_raster(request, raster_name=None):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)  # Thêm/sửa raster dùng POST
    metadata, metadata_error = read_metadata(request, raster_name or "")  # Đọc và kiểm tra metadata
    if metadata_error:
        return error(metadata_error)
    upload = request.FILES.get("file")  # Lấy file raster được upload
    if not upload:
        return error("Hãy chọn tệp GeoTIFF.")  # Không có file thì dừng
    if not upload.name.lower().endswith((".tif", ".tiff")):
        return error("Chỉ hỗ trợ tệp GeoTIFF (.tif hoặc .tiff).")  # Chỉ cho phép tif/tiff
    if upload.size >= MAX_RASTER_SIZE:
        return error("Tệp từ 512 MB phải publish thủ công lên GeoServer rồi khai báo trong RASTER_LAYER_CONFIGS.")
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "ptn")  # Lấy workspace GeoServer, mặc định là ptn
    replace_existing = raster_name is not None or RasterMetadata.objects.filter(name=metadata["name"]).exists()
    try:
        publish_raster(workspace, metadata["name"], upload, replace=replace_existing)
    except RuntimeError as exc:
        logger.exception("Không thể publish raster %s", metadata["name"])
        return error(str(exc), 502)  # GeoServer lỗi thì trả 502
    try:
        raster, _ = RasterMetadata.objects.update_or_create(
            name=metadata["name"],  # Tìm raster theo name
            defaults={**metadata, "source_filename": upload.name[:255]},  # Có rồi thì update, chưa có thì create
        )
    except DatabaseError:
        logger.exception("Đã publish nhưng không lưu được metadata raster %s", metadata["name"])
        return error("Đã publish GeoServer nhưng không lưu được metadata vào PostgreSQL.", 500)
    return success("Đã publish raster và lưu metadata.", raster=serialize(raster))  # Trả raster vừa thêm về frontend


@admin_required
def delete_raster(request, raster_name):
    if request.method != "DELETE":
        return error("Chỉ hỗ trợ phương thức DELETE.", 405)  # Xóa phải dùng DELETE
    if name_error := validate_name(raster_name):
        return error(name_error)  # Kiểm tra tên raster
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "ptn")  # Workspace chứa raster
    try:
        geoserver_request(
            f"workspaces/{workspace}/coveragestores/{raster_name}?recurse=true",  # Xóa CoverageStore và layer liên quan
            method="DELETE"
        )
    except RuntimeError as exc:
        logger.exception("Không thể xóa raster %s", raster_name)
        return error(str(exc), 502)
    try:
        RasterMetadata.objects.filter(name=raster_name).delete()  # Xóa metadata raster trong PostgreSQL
    except DatabaseError:
        logger.exception("Đã gỡ GeoServer nhưng không xóa được metadata %s", raster_name)
        return error("Đã gỡ GeoServer nhưng không xóa được metadata PostgreSQL.", 500)
    return success("Đã xóa raster và metadata.", raster_id=raster_name)  # Báo frontend xóa thành công
