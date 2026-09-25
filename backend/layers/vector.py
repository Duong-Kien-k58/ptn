import json  # Đọc và chuyển đổi dữ liệu JSON/GeoJSON
import logging  # Ghi log khi xảy ra lỗi
import math  # Kiểm tra tọa độ có phải số hợp lệ hay không
from django.db import DatabaseError, connection  # Kết nối trực tiếp PostgreSQL và bắt lỗi database
from accounts.permissions import admin_required  # Chỉ tài khoản admin mới được thêm/sửa/xóa
from .api import error, success  # Hàm chuẩn hóa JSON trả về khi thành công hoặc lỗi
logger = logging.getLogger(__name__)  # Tạo logger cho file hiện tại

def layer(table, geometry_type, fields):
    return {
        "table": table,  # Tên bảng thật trong PostgreSQL
        "id_field": "gid",  # Khóa chính của đối tượng
        "geometry_field": "geom",  # Cột lưu dữ liệu không gian PostGIS
        "geometry_type": geometry_type,  # Kiểu hình học Point/Line/Polygon
        "fields": fields,  # Các trường thuộc tính được phép chỉnh sửa
    }

LAYER_CONFIG = {
    "ub_tinh": layer("ub_tinh", "Point", ["ten", "caphc", "tinh"]),  # Lớp điểm UB tỉnh
    "tinhlo": layer("tinhlo", "MultiLineString", ["tenduong", "loaiduong", "tdg"]),  # Lớp đường tỉnh lộ
    "vn_tinh": layer("vn_tinh", "MultiPolygon", ["ma_tinh", "ten_tinh", "sap_nhap", "quy_mo", "tru_so", "loai"]),  # Ranh giới tỉnh
    "vn_xa": layer("vn_xa", "MultiPolygon", ["ma_xa", "ten_xa", "sap_nhap", "tru_so", "loai", "ma_tinh", "ten_tinh"]),  # Ranh giới xã
    "qlo": layer("qlo", "MultiLineString", ["bientap", "td"]),  # Quốc lộ
    "nenbien": layer("nenbien", "MultiPolygon", ["dosau"]),  # Nền biển
    "nuocngoai": layer("nuocngoai", "MultiPolygon", ["ten"]),  # Vùng nước ngoài
}

ALLOWED_GEOMETRIES = {
    "Point": {"Point"},  # Lớp Point chỉ nhận Point
    "MultiLineString": {"LineString", "MultiLineString"},  # Lớp MultiLineString có thể nhận LineString
    "MultiPolygon": {"Polygon", "MultiPolygon"},  # Lớp MultiPolygon có thể nhận Polygon
}

def read_json(request):
    try:
        data = json.loads(request.body or "{}")  # Đọc body từ request và chuyển JSON thành dict Python
    except (TypeError, json.JSONDecodeError):
        return None  # JSON lỗi thì trả về None
    return data if isinstance(data, dict) else None  # Chỉ chấp nhận JSON dạng object

def valid_position(value):
    return (
        isinstance(value, (list, tuple))  # Tọa độ phải là danh sách hoặc tuple
        and len(value) >= 2  # Ít nhất phải có X và Y
        and all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in value[:2])  # X,Y phải là số hữu hạn
    )

def valid_coordinates(coordinates, geometry_type):
    if geometry_type == "Point":
        return valid_position(coordinates)  # Point có dạng [x, y]
    if geometry_type == "LineString":
        return isinstance(coordinates, list) and len(coordinates) >= 2 and all(valid_position(item) for item in coordinates)  # Đường phải có ít nhất 2 điểm
    if geometry_type == "MultiLineString":
        return isinstance(coordinates, list) and bool(coordinates) and all(valid_coordinates(item, "LineString") for item in coordinates)  # Nhiều LineString
    if geometry_type == "Polygon":
        return isinstance(coordinates, list) and bool(coordinates) and all(
            isinstance(ring, list)  # Mỗi phần của Polygon phải là một vòng
            and len(ring) >= 4  # Vòng Polygon ít nhất 4 tọa độ
            and all(valid_position(item) for item in ring)  # Tất cả tọa độ phải hợp lệ
            and ring[0][:2] == ring[-1][:2]  # Điểm đầu và cuối phải trùng nhau để đóng Polygon
            for ring in coordinates
        )
    if geometry_type == "MultiPolygon":
        return isinstance(coordinates, list) and bool(coordinates) and all(valid_coordinates(item, "Polygon") for item in coordinates)  # Kiểm tra từng Polygon
    return False  # Kiểu hình học khác thì không chấp nhận

def validate_geometry(geometry, expected_type):
    if (
        not isinstance(geometry, dict)  # Geometry phải là object GeoJSON
        or geometry.get("type") not in ALLOWED_GEOMETRIES[expected_type]  # Kiểm tra type có đúng với lớp không
        or "coordinates" not in geometry  # Bắt buộc phải có coordinates
    ):
        return f"Lớp này yêu cầu GeoJSON kiểu {expected_type} hợp lệ."
    return None if valid_coordinates(geometry["coordinates"], geometry["type"]) else "Tọa độ GeoJSON không hợp lệ."  # Kiểm tra cấu trúc tọa độ

def geometry_expression(config):
    expression = "ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))"  # GeoJSON → PostGIS geometry → gán EPSG:4326 → chỉ giữ X,Y
    if config["geometry_type"] == "MultiPolygon":
        return f"ST_Multi(ST_CollectionExtract(ST_MakeValid({expression}), 3))"  # Sửa Polygon lỗi và ép thành MultiPolygon
    return f"ST_Multi({expression})" if config["geometry_type"] == "MultiLineString" else expression  # LineString → MultiLineString nếu cần

def get_config(layer_name):
    return LAYER_CONFIG.get(layer_name)  # Tìm cấu hình của layer theo tên

@admin_required  # Chỉ admin được gọi API này
def add_feature(request, layer_name):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)  # Thêm đối tượng phải dùng POST
    config, data = get_config(layer_name), read_json(request)  # Lấy cấu hình lớp và dữ liệu frontend gửi lên
    if not config:
        return error("Lớp không tồn tại hoặc chưa được phép chỉnh sửa.", 404)  # Không cho thao tác với lớp ngoài danh sách
    if data is None:
        return error("Dữ liệu gửi lên phải là JSON hợp lệ.")  # Body không phải JSON hợp lệ
    geometry_error = validate_geometry(data.get("geometry"), config["geometry_type"])  # Kiểm tra hình học
    if geometry_error:
        return error(geometry_error)
    properties = {field: data[field] for field in config["fields"] if field in data}  # Chỉ lấy thuộc tính được cho phép
    columns = [*properties, config["geometry_field"]]  # Danh sách cột INSERT
    values = [*properties.values(), json.dumps(data["geometry"])]  # Danh sách giá trị INSERT
    placeholders = [*(["%s"] * len(properties)), geometry_expression(config)]  # Tạo placeholder để tránh SQL Injection
    sql = (
        f"INSERT INTO {config['table']} ({', '.join(columns)}) "  # Tạo câu INSERT
        f"VALUES ({', '.join(placeholders)}) RETURNING {config['id_field']}"  # Trả về gid vừa tạo
    )
    try:
        with connection.cursor() as cursor:  # Mở cursor PostgreSQL
            cursor.execute(sql, values)  # Thực thi INSERT
            feature_id = cursor.fetchone()[0]  # Lấy gid của đối tượng mới
    except DatabaseError:
        logger.exception("Không thể thêm đối tượng vào lớp %s", layer_name)  # Ghi log lỗi
        return error("Không thể thêm đối tượng vào cơ sở dữ liệu.", 500)
    return success("Đã thêm đối tượng.", feature_id=feature_id)  # Trả về thành công

@admin_required
def edit_feature(request, layer_name, feature_id):
    if request.method != "PUT":
        return error("Chỉ hỗ trợ phương thức PUT.", 405)  # Sửa dùng PUT
    config, data = get_config(layer_name), read_json(request)
    if not config:
        return error("Lớp không tồn tại hoặc chưa được phép chỉnh sửa.", 404)
    if data is None:
        return error("Dữ liệu gửi lên phải là JSON hợp lệ.")
    properties = {field: data[field] for field in config["fields"] if field in data}  # Lấy các thuộc tính cần sửa
    assignments, values = [f"{field} = %s" for field in properties], list(properties.values())  # Tạo field=value cho UPDATE
    if "geometry" in data:  # Nếu người dùng sửa cả vị trí/hình dạng
        geometry_error = validate_geometry(data["geometry"], config["geometry_type"])  # Kiểm tra geometry mới
        if geometry_error:
            return error(geometry_error)
        assignments.append(f"{config['geometry_field']} = {geometry_expression(config)}")  # Cập nhật geom
        values.append(json.dumps(data["geometry"]))  # Thêm GeoJSON mới
    if not assignments:
        return error("Chưa có thuộc tính hoặc hình học hợp lệ để cập nhật.")  # Không có gì để sửa
    try:
        with connection.cursor() as cursor:
            sql = f"UPDATE {config['table']} SET {', '.join(assignments)} WHERE {config['id_field']} = %s"  # UPDATE theo gid
            cursor.execute(sql, [*values, feature_id])  # Thực thi UPDATE
            if not cursor.rowcount:
                return error("Không tìm thấy đối tượng cần cập nhật.", 404)  # gid không tồn tại
    except DatabaseError:
        logger.exception("Không thể cập nhật đối tượng %s của lớp %s", feature_id, layer_name)
        return error("Không thể cập nhật đối tượng.", 500)
    return success("Đã cập nhật đối tượng.", feature_id=feature_id)

@admin_required
def delete_feature(request, layer_name, feature_id):
    if request.method != "DELETE":
        return error("Chỉ hỗ trợ phương thức DELETE.", 405)  # Xóa phải dùng DELETE
    config = get_config(layer_name)  # Lấy cấu hình layer
    if not config:
        return error("Lớp không tồn tại hoặc chưa được phép chỉnh sửa.", 404)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM {config['table']} WHERE {config['id_field']} = %s", [feature_id])  # Xóa đối tượng theo gid
            if not cursor.rowcount:
                return error("Không tìm thấy đối tượng cần xóa.", 404)
    except DatabaseError:
        logger.exception("Không thể xóa đối tượng %s của lớp %s", feature_id, layer_name)
        return error("Không thể xóa đối tượng.", 500)
    return success("Đã xóa đối tượng.", feature_id=feature_id)