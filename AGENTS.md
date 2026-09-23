# PTN WebGIS - Quy tắc cho Codex

## Phạm vi
- Chỉ được tạo, sửa, đổi tên, di chuyển hoặc xóa file trong repository `ptn/`.
- `../LapTrinhGis/` và `../Nghiên cứu/` chỉ được đọc để tham khảo, tuyệt đối không sửa.
- Không sao chép `.env`, `.venv`, `node_modules`, mật khẩu, token, database hoặc dữ liệu riêng tư từ dự án cũ.

## Nguyên tắc tham khảo dự án cũ
- `../LapTrinhGis/` là nguồn tham khảo chính cho các ý tưởng, chức năng, luồng xử lý và cách tổ chức WebGIS.
- Khi xây dựng chức năng mới trong `ptn`, trước tiên hãy kiểm tra xem `LapTrinhGis` đã có chức năng hoặc ý tưởng tương tự chưa.
- Nếu có, ưu tiên kế thừa ý tưởng, cách hoạt động, luồng dữ liệu và trải nghiệm sử dụng từ `LapTrinhGis`.
- Không sao chép máy móc code cũ; phải đọc, hiểu và viết lại phù hợp với kiến trúc hiện tại của `ptn`.
- Nếu kiến trúc cũ xung đột với kiến trúc hiện tại của `ptn`, ưu tiên kiến trúc hiện tại của `ptn`.
- Chỉ tự đề xuất cách làm hoàn toàn mới khi `LapTrinhGis` không có chức năng tương tự hoặc cách cũ không còn phù hợp.

## Trước khi sửa code
1. Chạy `git status` trong `ptn/`.
2. Đọc file cần sửa và các file liên quan.
3. Xác định đúng nguyên nhân và luồng xử lý trước khi thay đổi.
4. Nếu cần, tham khảo chức năng tương tự trong `LapTrinhGis/`.
5. Chỉ sửa phần liên quan đến yêu cầu hiện tại.

## Kiến trúc dự án
- `backend/layers/`: quản lý layer, dữ liệu GIS và API CRUD.
- `backend/config/`: cấu hình Django.
- `frontend/src/config/`: cấu hình layer, WMS/WFS.
- `frontend/src/map/`: khởi tạo OpenLayers.
- `frontend/src/tool/`: các công cụ bản đồ.
- Không tạo thêm app/module nếu chức năng hiện tại có thể đảm nhiệm.

## Kiến trúc GIS
- PostGIS: lưu dữ liệu.
- GeoServer: WMS/WFS và style.
- Django: thêm, sửa, xóa và xử lý nghiệp vụ.
- OpenLayers: hiển thị và tương tác.

Luồng chuẩn:
`OpenLayers -> WFS lấy feature -> Django API -> PostGIS -> refresh WMS`

- WMS dùng để hiển thị.
- WFS dùng để lấy feature, geometry và thuộc tính khi cần.
- CRUD vẫn đi qua Django.
- Không dùng WFS-T nếu chưa được yêu cầu.

## Cổng dịch vụ
- Frontend: `localhost:5173`
- Django: `localhost:8000`
- GeoServer: `localhost:8080`
- PostgreSQL: `localhost:5432`

## Nguyên tắc viết code
- Viết ngắn gọn, dễ đọc, dễ hiểu.
- Không refactor ngoài phạm vi yêu cầu.
- Không viết lại cả file nếu chỉ cần sửa một phần.
- Không tạo file mới nếu không cần.
- Comment ngắn, rõ ràng, đặt gần code liên quan.

## Kiểm tra
- Django: `python manage.py check`
- Frontend: `npm run build`
- Nếu liên quan GeoServer: kiểm tra WMS/WFS và CORS.
- Không coi nhiệm vụ hoàn thành nếu chưa kiểm tra phù hợp.

## Git
- Không tự commit hoặc push.
- Không chạy `git reset --hard`, `git clean -fd`, `git push --force` nếu chưa được yêu cầu.
- Không chạy `git init` tại `C:\Users\KIEN\Documents`.
- Không làm mất các thay đổi hiện có của người dùng.

## Ưu tiên
1. Yêu cầu hiện tại của người dùng.
2. `AGENTS.md`.
3. Code hiện tại của `ptn`.
4. `LapTrinhGis` chỉ để tham khảo.
