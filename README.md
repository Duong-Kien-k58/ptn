# PTN WebGIS

PTN WebGIS là hệ thống thực hành GIS trên nền web dành cho giảng viên và học viên. Dự án sử dụng Django cho API, Vite và OpenLayers cho giao diện bản đồ. PostGIS và GeoServer sẽ được tích hợp ở Giai đoạn 3.

## Cấu trúc dự án

```text
ptn/
├─ backend/            # Django API
│  ├─ accounts/        # Tài khoản và phân quyền (Giai đoạn 4)
│  ├─ gisdata/         # Dữ liệu GIS (Giai đoạn 3 và 5)
│  ├─ layers/          # Metadata và API lớp bản đồ
│  └─ config/          # Cấu hình Django
├─ frontend/           # Vite và OpenLayers
│  └─ src/
│     ├─ config/       # Cấu hình lớp bản đồ
│     ├─ map/          # Khởi tạo bản đồ OpenLayers
│     └─ tool/         # Công cụ đo, tìm kiếm, tra cứu và in
├─ docs/               # Tài liệu dự án
└─ .env.example        # Mẫu cấu hình cục bộ
```

## Yêu cầu

- Node.js 20 trở lên
- Python 3.12 trở lên

PostgreSQL/PostGIS, GeoServer và Docker chưa cần thiết để chạy Giai đoạn 1 và 2.

## Chuẩn bị cấu hình

Tại thư mục gốc dự án, tạo tệp `.env` từ tệp mẫu:

```powershell
Copy-Item .env.example .env
```

Mở `.env`, thay `DJANGO_SECRET_KEY` bằng một khóa riêng. Trong Giai đoạn 1, để trống `POSTGRES_HOST` để Django dùng SQLite cục bộ. Không đưa `.env` lên Git.

## Chạy backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Kiểm tra API tại `http://127.0.0.1:8000/api/health/`.

## Chạy frontend

Mở một PowerShell khác:

```powershell
cd frontend
npm ci
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal, thông thường là `http://localhost:5173`.

## Kiểm tra nhanh

- Frontend hiển thị bản đồ nền OpenStreetMap và thanh công cụ.
- Backend trả về JSON tại `/api/health/`.
- Không có mật khẩu, token hoặc khóa thật trong mã nguồn hay Git.

## Trạng thái lộ trình

- Hoàn thành: Giai đoạn 1 — Nền tảng.
- Đang hoàn thiện: Giai đoạn 2 — Giao diện PTN và bản đồ OpenLayers.
- Tiếp theo: Giai đoạn 3 — PostGIS, GeoServer và Docker.
