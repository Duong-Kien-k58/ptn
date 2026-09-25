# PTN WebGIS

PTN WebGIS chạy trực tiếp trên máy, theo mô hình quen thuộc của `LapTrinhGis`:

`OpenLayers (Vite) → WFS/WMS (GeoServer) → Django API → PostGIS`

Docker không còn là một phần của dự án. Hệ thống chạy trực tiếp bằng Vite, Django, GeoServer và PostgreSQL/PostGIS trên máy cục bộ.

## Chuẩn bị dữ liệu

1. Tạo một database PostgreSQL/PostGIS mới trên máy.
2. Khôi phục bản sao lưu của database `webgis` vào database mới đó.
3. Tạo workspace và các layer tương ứng trên GeoServer cục bộ, trỏ đến database vừa khôi phục.
4. Sao chép `.env.example` thành `.env`, rồi điền tên database, tài khoản PostgreSQL và tài khoản GeoServer của máy.

Các tên layer trong `frontend/src/config/layers.js` và `backend/layers/views.py` phải khớp workspace/layer đã xuất bản trong GeoServer.

## Chạy backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py check
python manage.py runserver
```

Backend mặc định chạy tại `http://localhost:8000`.

## Chạy frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend chạy tại `http://localhost:5173`. Vite chuyển tiếp `/api` tới Django và `/geoserver` tới GeoServer cục bộ (`http://localhost:8080`).

## Giữ frontend và backend hoạt động khi phát triển

Chạy backend và frontend trong **hai terminal riêng**. Không đóng terminal tương ứng khi vẫn muốn dịch vụ tiếp tục hoạt động.

```powershell
# Terminal Backend
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py runserver
```

```powershell
# Terminal Frontend
cd frontend
npm run dev
```

- Bắt buộc kích hoạt `.venv` trước khi chạy `python manage.py runserver`. Python toàn cục có thể không có Django và khiến backend dừng ngay khi khởi động.
- Django và Vite được thiết kế tiếp tục chạy cho đến khi người dùng nhấn `Ctrl+C`, đóng terminal, tắt máy hoặc có lỗi khởi động.
- Nếu thấy lỗi cổng đã được sử dụng, kiểm tra xem một phiên backend (`8000`) hoặc frontend (`5173`) khác có đang chạy hay không trước khi mở thêm phiên mới.
- Địa chỉ kiểm tra nhanh: `http://localhost:8000/api/health/` cho backend và `http://localhost:5173` cho frontend.

## Lưu ý

- Hệ thống có đăng ký, đăng nhập, hồ sơ cá nhân, đổi mật khẩu và phân quyền `student`/`admin`. Các API thêm, sửa, xóa dữ liệu vector và raster yêu cầu quyền quản trị viên.
- Không chạy migration để tạo dữ liệu GIS. Dự án sử dụng các bảng đã có trong database PostGIS được khôi phục.
