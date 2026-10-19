# Nâng cấp: Chấm công & Tính lương

Chat AI vẫn giữ nguyên toàn bộ tính năng, chỉ còn là cửa sổ nổi bên nhân viên và nhóm "Trợ lý AI" bên admin.

## Cập nhật dự án đang chạy (KHÔNG xoá dữ liệu)

1. Giải nén đè lên thư mục dự án (không chứa `.env`, `node_modules`).
2. `cd backend && npm run migrate` — thêm bảng mới, giữ nguyên văn bản/hội thoại/tài khoản cũ.
   (Đừng chạy `npm run seed` trên dữ liệu thật: seed xoá sạch TOÀN BỘ dữ liệu — tài khoản, gian hàng, chấm công, bảng lương, văn bản, hội thoại — rồi nạp lại dữ liệu mẫu.)
3. `cd frontend && npm install` (thêm thư viện `qrcode`).
4. Commit + push: Render và Vercel tự deploy lại. Không có biến môi trường mới.

## Cách dùng

- Admin: Gian hàng & ca → tạo gian hàng (giờ vào/tan ca, phạt mỗi phút, vị trí tuỳ chọn) → bấm **Mã QR** để in dán tại quầy.
- Admin: Chấm công → bấm vào một ô ngày → "Chỉnh sửa" để sửa giờ vào/ra (chỉ tháng hiện tại).
- Admin: Nhân viên → tạo tài khoản, gán gian hàng, đặt lương giờ.
- Nhân viên: quét QR → đăng nhập → bấm CHECK-IN / CHECK-OUT (cần bật GPS, trang phải chạy HTTPS).

## Quy tắc tính

- Lương ngày = lương giờ × số giờ làm **trong khung ca** − (phút muộn + phút về sớm) × tiền phạt/phút. Đến sớm/về muộn không được tính thêm.
- Muộn/sớm làm tròn xuống phút. Lương thực nhận cả tháng không âm.
- Ngày/tháng tính theo giờ Việt Nam. Từ 00:00 ngày 1 tháng sau, tháng cũ **khoá cứng** (API từ chối sửa).
- Tháng đã qua được **chốt** (bảng `payroll_months`): đổi lương giờ / giờ ca / tiền phạt sau đó không làm đổi lương cũ.
- Lịch sử chấm công **không sửa/xoá được**. Admin bấm "Chỉnh sửa" để đặt lại giờ vào và/hoặc giờ ra của một ngày: giờ gốc được giữ (hiện mờ), giờ mới được ghi là "Đã thay đổi bởi admin" (không lý do, không vị trí). CSDL có trigger chặn sửa trực tiếp.
- Chỉ lưu vị trí GPS, không lưu IP. Vị trí ngoài bán kính gian hàng chỉ gắn cờ cho admin, không chặn.

## AI trả lời về lương / đi muộn

Câu hỏi có tự xưng ("lương tháng này của tôi", "tháng 9 em đi muộn mấy lần") được trả lời từ số liệu hệ thống tính; Gemini chỉ diễn đạt lại. Gemini lỗi thì trả số liệu thô. Câu hỏi chính sách chung vẫn đi đường tra tài liệu như cũ.
