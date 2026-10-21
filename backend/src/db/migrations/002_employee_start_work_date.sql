-- Ngày bắt đầu làm việc của nhân viên — KHÁC ngày tạo tài khoản (created_at):
-- có thể nhập người đã làm từ trước, hoặc tạo tài khoản trước ngày đi làm.
-- Dữ liệu cũ: lấy tạm theo ngày tạo (giờ VN). Chạy lại nhiều lần được.
ALTER TABLE employee ADD COLUMN IF NOT EXISTS start_work_date DATE;
UPDATE employee SET start_work_date = (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
WHERE start_work_date IS NULL;
ALTER TABLE employee ALTER COLUMN start_work_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
ALTER TABLE employee ALTER COLUMN start_work_date SET NOT NULL;
