-- Gói sử dụng của cửa hàng: SĐT chủ cửa hàng, số nhân viên tối đa, ngày hết hạn.
-- Chạy được nhiều lần (IF NOT EXISTS). DB mới tạo bằng `npm run db:reset` đã
-- có sẵn các cột này trong schema.sql.
ALTER TABLE store ADD COLUMN IF NOT EXISTS owner_phone_number VARCHAR(30);
ALTER TABLE store ADD COLUMN IF NOT EXISTS max_employee_count INT
  CHECK (max_employee_count IS NULL OR max_employee_count > 0);
ALTER TABLE store ADD COLUMN IF NOT EXISTS expiry_date DATE;
