import json  # Xử lý dữ liệu JSON
import logging  # Ghi log khi xảy ra lỗi
import math  # Kiểm tra giá trị số
import os  # Đọc biến môi trường
import re  # Kiểm tra tên raster bằng biểu thức chính quy
from base64 import b64encode  # Mã hóa tài khoản GeoServer theo Basic Auth
from pathlib import Path  # Xử lý đường dẫn file
from urllib.error import HTTPError, URLError  # Bắt lỗi khi gọi GeoServer
from urllib.request import Request, urlopen  # Gửi request tới GeoServer
from django.db import DatabaseError, connection  # Kết nối và chạy SQL với PostgreSQL/PostGIS
from django.http import JsonResponse  # Trả dữ liệu JSON cho frontend
from dotenv import dotenv_values  # Đọc giá trị trong file .env
from accounts.permissions import admin_required

logger = logging.getLogger(__name__)  # Tạo bộ ghi log cho file hiện tại

RASTER_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,62}$")  # Quy định tên raster phải bắt đầu bằng chữ

LAYER_CONFIG = {
    "ub_tinh": {
        "table": "ub_tinh", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "Point", "fields": ["ten", "caphc", "tinh"],
    },
    "tinhlo": {
        "table": "tinhlo", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "MultiLineString", "fields": ["tenduong", "loaiduong", "tdg"],
    },
    "vn_tinh": {
        "table": "vn_tinh", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "MultiPolygon",
        "fields": ["ma_tinh", "ten_tinh", "sap_nhap", "quy_mo", "tru_so", "loai"],
    },
    "vn_xa": {
        "table": "vn_xa", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "MultiPolygon",
        "fields": ["ma_xa", "ten_xa", "sap_nhap", "tru_so", "loai", "ma_tinh", "ten_tinh"],
    },
    "qlo": {
        "table": "qlo", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "MultiLineString", "fields": ["bientap", "td"],
    },
    "nenbien": {
        "table": "nenbien", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "MultiPolygon", "fields": ["dosau"],
    },
    "nuocngoai": {
        "table": "nuocngoai", "id_field": "gid", "geometry_field": "geom",
        "geometry_type": "MultiPolygon", "fields": ["ten"],
    },
}

ALLOWED_INPUT_GEOMETRIES = {
    "Point": {"Point"},  # Point chỉ nhận Point
    "MultiLineString": {"LineString", "MultiLineString"},  # Đường nhận LineString hoặc MultiLineString
    "MultiPolygon": {"Polygon", "MultiPolygon"},  # Vùng nhận Polygon hoặc MultiPolygon
}


def health(request):
    """API kiểm tra backend có đang hoạt động hay không."""
    return JsonResponse(
        {"status": "ok", "service": "PTN WebGIS backend", "message": "Backend đang hoạt động bình thường."}
    )


def json_error(message, status=400):
    """Trả về lỗi với một định dạng thống nhất cho frontend."""
    return JsonResponse({"success": False, "message": message}, status=status)


def json_success(message, **data):
    """Trả về kết quả thành công với một định dạng thống nhất."""
    return JsonResponse({"success": True, "message": message, **data})


def parse_request_data(request):
    try:
        data = json.loads(request.body or "{}")  # Chuyển JSON frontend gửi thành dict Python
    except (TypeError, json.JSONDecodeError):
        return None, "Dữ liệu gửi lên phải có định dạng JSON hợp lệ."  # JSON sai

    if not isinstance(data, dict):
        return None, "Dữ liệu JSON phải là một đối tượng."  # Không chấp nhận list, chuỗi...

    return data, None  # Trả dữ liệu nếu hợp lệ

def validate_geometry(geometry, expected_type):
    """Kiểm tra kiểu GeoJSON trước khi đưa hình học vào PostGIS."""
    if not isinstance(geometry, dict):
        return "Hình học phải là một đối tượng GeoJSON."
    if geometry.get("type") not in ALLOWED_INPUT_GEOMETRIES[expected_type]:
        return f"Lớp này yêu cầu hình học kiểu {expected_type}."
    if "coordinates" not in geometry:
        return "GeoJSON chưa có thuộc tính coordinates."
    if not has_valid_coordinates(geometry["coordinates"], geometry["type"]):
        return "Tọa độ GeoJSON không hợp lệ hoặc chưa đủ điểm để tạo đối tượng."
    return None


def is_position(value):
    """Một vị trí GeoJSON cần tối thiểu kinh độ và vĩ độ hữu hạn."""
    return (
        isinstance(value, (list, tuple))
        and len(value) >= 2
        and all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in value[:2])
    )


def has_valid_coordinates(coordinates, geometry_type):
    """Kiểm tra cấu trúc cơ bản trước khi PostGIS xử lý geometry."""
    if geometry_type == "Point":
        return is_position(coordinates)
    if geometry_type == "LineString":
        return isinstance(coordinates, list) and len(coordinates) >= 2 and all(is_position(item) for item in coordinates)
    if geometry_type == "MultiLineString":
        return isinstance(coordinates, list) and bool(coordinates) and all(has_valid_coordinates(item, "LineString") for item in coordinates)
    if geometry_type == "Polygon":
        return isinstance(coordinates, list) and bool(coordinates) and all(
            isinstance(ring, list)
            and len(ring) >= 4
            and all(is_position(item) for item in ring)
            and ring[0][:2] == ring[-1][:2]
            for ring in coordinates
        )
    if geometry_type == "MultiPolygon":
        return isinstance(coordinates, list) and bool(coordinates) and all(has_valid_coordinates(item, "Polygon") for item in coordinates)
    return False


def geometry_sql(config):
    """Chuẩn hóa hình học thành SRID 4326 và kiểu hình học đúng của lớp."""
    base_sql = "ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))"
    if config["geometry_type"] == "MultiPolygon":
        return "ST_Multi(ST_CollectionExtract(ST_MakeValid(" + base_sql + "), 3))"
    if config["geometry_type"] == "MultiLineString":
        return "ST_Multi(" + base_sql + ")"
    return base_sql


def editable_properties(data, config):
    """Chỉ lấy các thuộc tính đã được cho phép trong cấu hình lớp."""
    return {field: data[field] for field in config["fields"] if field in data}


@admin_required
def add_feature(request, layer_name):
    """Thêm một đối tượng không gian mới vào bảng PostGIS được cho phép."""
    if request.method != "POST":
        return json_error("Chỉ hỗ trợ phương thức POST.", 405)
    config = LAYER_CONFIG.get(layer_name)
    if not config:
        return json_error("Lớp không tồn tại hoặc chưa được phép chỉnh sửa.", 404)
    data, error = parse_request_data(request)
    if error:
        return json_error(error)
    geometry = data.get("geometry")
    geometry_error = validate_geometry(geometry, config["geometry_type"])
    if geometry_error:
        return json_error(geometry_error)

    properties = editable_properties(data, config)
    columns = [*properties.keys(), config["geometry_field"]]
    placeholders = ["%s"] * len(properties) + [geometry_sql(config)]
    values = [*properties.values(), json.dumps(geometry)]
    sql = (
        f"INSERT INTO {config['table']} ({', '.join(columns)}) "
        f"VALUES ({', '.join(placeholders)}) RETURNING {config['id_field']}"
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, values)
            feature_id = cursor.fetchone()[0]
    except DatabaseError:
        logger.exception("Không thể thêm đối tượng vào lớp %s", layer_name)
        return json_error("Không thể thêm đối tượng. Vui lòng kiểm tra dữ liệu và cơ sở dữ liệu.", 500)
    return json_success("Đã thêm đối tượng.", feature_id=feature_id)


@admin_required
def edit_feature(request, layer_name, feature_id):
    """Cập nhật thuộc tính và/hoặc hình học của một đối tượng."""
    if request.method != "PUT":
        return json_error("Chỉ hỗ trợ phương thức PUT.", 405)
    config = LAYER_CONFIG.get(layer_name)
    if not config:
        return json_error("Lớp không tồn tại hoặc chưa được phép chỉnh sửa.", 404)
    data, error = parse_request_data(request)
    if error:
        return json_error(error)

    properties = editable_properties(data, config)
    assignments = [f"{field} = %s" for field in properties]
    values = list(properties.values())
    if "geometry" in data:
        geometry_error = validate_geometry(data["geometry"], config["geometry_type"])
        if geometry_error:
            return json_error(geometry_error)
        assignments.append(f"{config['geometry_field']} = {geometry_sql(config)}")
        values.append(json.dumps(data["geometry"]))
    if not assignments:
        return json_error("Chưa có thuộc tính hoặc hình học hợp lệ để cập nhật.")

    values.append(feature_id)
    sql = f"UPDATE {config['table']} SET {', '.join(assignments)} WHERE {config['id_field']} = %s"
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, values)
            if cursor.rowcount == 0:
                return json_error("Không tìm thấy đối tượng cần cập nhật.", 404)
    except DatabaseError:
        logger.exception("Không thể cập nhật đối tượng %s của lớp %s", feature_id, layer_name)
        return json_error("Không thể cập nhật đối tượng. Vui lòng kiểm tra dữ liệu.", 500)
    return json_success("Đã cập nhật đối tượng.", feature_id=feature_id)


@admin_required
def delete_feature(request, layer_name, feature_id):
    """Xóa một đối tượng theo khóa chính của lớp được phép."""
    if request.method != "DELETE":
        return json_error("Chỉ hỗ trợ phương thức DELETE.", 405)
    config = LAYER_CONFIG.get(layer_name)
    if not config:
        return json_error("Lớp không tồn tại hoặc chưa được phép chỉnh sửa.", 404)

    sql = f"DELETE FROM {config['table']} WHERE {config['id_field']} = %s"
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, [feature_id])
            if cursor.rowcount == 0:
                return json_error("Không tìm thấy đối tượng cần xóa.", 404)
    except DatabaseError:
        logger.exception("Không thể xóa đối tượng %s của lớp %s", feature_id, layer_name)
        return json_error("Không thể xóa đối tượng. Vui lòng kiểm tra cơ sở dữ liệu.", 500)
    return json_success("Đã xóa đối tượng.", feature_id=feature_id)


def geoserver_setting(name, default=None):
    """Ưu tiên biến môi trường, sau đó mới đọc cấu hình cục bộ ``.env``."""
    value = os.getenv(name) or dotenv_values(Path(__file__).resolve().parents[2] / ".env").get(name)
    return value or default


def geoserver_rest_url(path):
    """Tạo URL REST GeoServer từ cấu hình môi trường của máy chủ."""
    base_url = geoserver_setting("GEOSERVER_REST_URL", "http://localhost:8080/geoserver/rest").rstrip("/")
    return f"{base_url}/{path.lstrip('/')}"


def geoserver_request(path, method="GET", data=None, content_type=None):
    """Gọi GeoServer REST ở backend để không lộ tài khoản quản trị ra frontend."""
    # ``.env`` có thể được bổ sung sau khi Django đã chạy. Chỉ dùng nó làm
    # fallback, vì biến môi trường thực vẫn phải có độ ưu tiên cao hơn.
    username = geoserver_setting("GEOSERVER_ADMIN_USER")
    password = geoserver_setting("GEOSERVER_ADMIN_PASSWORD")
    if not username or not password:
        raise RuntimeError("Chưa cấu hình tài khoản GeoServer cho quản trị raster.")
    token = b64encode(f"{username}:{password}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}
    if content_type:
        headers["Content-Type"] = content_type
    request = Request(geoserver_rest_url(path), data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=45) as response:
            return response.status, response.read()
    except HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"GeoServer trả về HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError("Không kết nối được GeoServer.") from error


def validate_raster_name(name):
    if not isinstance(name, str) or not RASTER_NAME_PATTERN.fullmatch(name):
        return "Tên raster chỉ gồm chữ cái, số, dấu gạch nối hoặc gạch dưới; bắt đầu bằng chữ cái."
    return None


def list_rasters(request):
    """Liệt kê coverage store raster trong workspace GeoServer hiện tại."""
    if request.method != "GET":
        return json_error("Chỉ hỗ trợ phương thức GET.", 405)
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "ptn")
    try:
        _, content = geoserver_request(f"workspaces/{workspace}/coveragestores.json")
        stores = json.loads(content or b"{}")
    except (RuntimeError, json.JSONDecodeError) as error:
        logger.exception("Không thể đọc danh sách raster")
        return json_error(str(error), 502)
    collection = stores.get("coverageStores", {})
    items = collection.get("coverageStore", []) if isinstance(collection, dict) else []
    items = items or []
    return json_success("Đã tải danh sách raster.", rasters=[{"id": item["name"], "title": item["name"]} for item in items])


@admin_required
def save_raster(request, raster_name=None):
    """Thêm hoặc thay thế GeoTIFF bằng REST API của GeoServer."""
    if request.method != "POST":
        return json_error("Chỉ hỗ trợ phương thức POST.", 405)
    name = raster_name or request.POST.get("name", "")
    name_error = validate_raster_name(name)
    if name_error:
        return json_error(name_error)
    upload = request.FILES.get("file")
    if not upload:
        return json_error("Hãy chọn tệp GeoTIFF.")
    if not upload.name.lower().endswith((".tif", ".tiff")):
        return json_error("Chỉ hỗ trợ tệp GeoTIFF (.tif hoặc .tiff).")
    if upload.size > 512 * 1024 * 1024:
        return json_error("Tệp GeoTIFF vượt quá giới hạn 512 MB.")

    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "ptn")
    try:
        geoserver_request(
            f"workspaces/{workspace}/coveragestores/{name}/file.geotiff?configure=all",
            method="PUT",
            data=upload.read(),
            content_type="image/tiff",
        )
    except RuntimeError as error:
        logger.exception("Không thể lưu raster %s", name)
        return json_error(str(error), 502)
    return json_success("Đã xuất bản raster trên GeoServer.", raster={"id": name, "title": name})


@admin_required
def delete_raster(request, raster_name):
    """Xóa coverage store cùng coverage raster tương ứng trên GeoServer."""
    if request.method != "DELETE":
        return json_error("Chỉ hỗ trợ phương thức DELETE.", 405)
    name_error = validate_raster_name(raster_name)
    if name_error:
        return json_error(name_error)
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "ptn")
    try:
        geoserver_request(
            f"workspaces/{workspace}/coveragestores/{raster_name}?recurse=true",
            method="DELETE",
        )
    except RuntimeError as error:
        logger.exception("Không thể xóa raster %s", raster_name)
        return json_error(str(error), 502)
    return json_success("Đã xóa raster.", raster_id=raster_name)
