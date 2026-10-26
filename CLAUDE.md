# Quy tắc dự án

## Cơ sở dữ liệu
- CSDL luôn coi là **phiên bản đầu tiên**: KHÔNG viết migration, không giữ tương thích với dữ liệu cũ.
  Mọi thay đổi cấu trúc sửa thẳng vào `backend/src/db/schema.sql` (và `drop.sql` nếu thêm bảng/kiểu/hàm mới),
  rồi chạy `npm run seed` (trong `backend/`) để xoá sạch và tạo lại toàn bộ CSDL + dữ liệu mẫu.
- Dữ liệu mẫu trong `backend/src/db/seed.js` phải cập nhật theo schema mới.
- Mọi bảng đều **xoá mềm**: cột `is_deleted BOOLEAN NOT NULL DEFAULT false` + `deleted_at TIMESTAMPTZ`
  (MongoDB: `isDeleted` + `deletedAt`). Không dùng `DELETE`; truy vấn đọc phải lọc `NOT is_deleted`.
  Ràng buộc duy nhất dùng unique index một phần `... WHERE NOT is_deleted`.

## Giao diện
- Đang gọi API đã có lớp phủ "Đang xử lý..." toàn màn hình (`components/GlobalLoading.jsx`), nên nút bấm
  khi đang lưu / tải chỉ cần `disabled`, **không đổi chữ** (không viết kiểu `saving ? "Đang lưu..." : "Lưu"`).
  Riêng request chạy ngầm truyền `{ silent: true }` (không có lớp phủ) mới cần chỉ báo riêng.
