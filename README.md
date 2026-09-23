# PTN WebGIS

PTN WebGIS chạy trực tiếp trên máy, theo mô hình quen thuộc của `LapTrinhGis`:

`OpenLayers (Vite) → WFS/WMS (GeoServer) → Django API → PostGIS`

Docker không còn là một phần của dự án. Giao diện và các chức năng bản đồ hiện có được giữ lại; đăng nhập, đăng ký và phân quyền đã được gỡ bỏ để CRUD dữ liệu dùng trực tiếp API Django.

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

## Lưu ý

- API CRUD không còn lớp đăng nhập/phân quyền, phù hợp cho môi trường học tập hoặc máy nội bộ. Khi triển khai công khai, cần bổ sung cơ chế bảo vệ riêng.
- Không chạy migration để tạo dữ liệu GIS. Dự án sử dụng các bảng đã có trong database PostGIS được khôi phục.
