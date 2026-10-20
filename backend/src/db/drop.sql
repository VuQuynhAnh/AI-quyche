-- Xoá TOÀN BỘ bảng/kiểu/hàm của ứng dụng (kể cả tên của các phiên bản cũ) để
-- tạo lại từ đầu. Chỉ dùng bởi db/seed.js (npm run db:reset).

-- Phiên bản hiện tại
DROP TABLE IF EXISTS
  document_detail, document, paysheet_detail, paysheet,
  clocking_history, clocking, employee, setting, account, store
  CASCADE;
DROP FUNCTION IF EXISTS clocking_history_immutable() CASCADE;

-- Phiên bản cũ (trước khi đổi thiết kế)
DROP TABLE IF EXISTS
  payroll_months, attendance_edits, attendance_events, employee_rates,
  document_chunks, documents, users, stalls
  CASCADE;
DROP FUNCTION IF EXISTS attendance_events_immutable() CASCADE;

-- Kiểu ENUM được xoá trong db/seed.js theo danh sách POSTGRES_ENUM_TYPES
