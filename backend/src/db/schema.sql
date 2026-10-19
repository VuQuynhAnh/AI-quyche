-- ============================================================
-- SCHEMA CƠ SỞ DỮ LIỆU
-- Trợ lý AI hỗ trợ giải đáp quy chế & văn bản nội bộ doanh nghiệp
-- ============================================================
-- Yêu cầu: PostgreSQL 14+ với extension "pgvector" đã cài đặt
-- (trên Ubuntu: sudo apt install postgresql-16-pgvector, hoặc dùng
--  Docker image "ankane/pgvector" / "pgvector/pgvector")

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- Người dùng ----------
-- role: 'admin'  -> quản trị viên (upload/quản lý văn bản, xem lịch sử hỏi đáp)
--       'employee' -> nhân viên (chỉ dùng trang chat hỏi đáp)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Văn bản / quy chế nội bộ ----------
-- is_sensitive = true  -> tài liệu NHẠY CẢM (VD: hợp đồng lương cá nhân, thông
--   tin kỷ luật, dữ liệu khách hàng...). Loại tài liệu này VẪN được tải lên và
--   tách chunk/embedding để admin có thể tìm kiếm nội bộ, NHƯNG bị loại khỏi
--   kết quả trả lời tự động của chatbot cho nhân viên (xem rag.service.js) —
--   nếu câu hỏi của nhân viên khớp với nội dung này, hệ thống sẽ từ chối trả
--   lời và hướng dẫn liên hệ trực tiếp quản trị viên, đồng thời tự động gắn cờ
--   hội thoại đó để admin vào trả lời (xem models/conversation.model.js).
-- is_sensitive = false -> tài liệu quy chế/chính sách thông thường, chatbot
--   được phép dùng để trả lời tự động.
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             VARCHAR(500) NOT NULL,
  category          VARCHAR(150),              -- VD: 'Nhân sự', 'Tài chính', 'An toàn lao động'
  original_filename VARCHAR(500),
  -- Tên file đã lưu trong thư mục backend/uploads/ (KHÔNG phải đường dẫn đầy
  -- đủ) — phục vụ tính năng "tải tài liệu nguồn" từ popover trích dẫn tin
  -- nhắn (xem services/document.service.js + routes/documentFiles.routes.js).
  storage_path      VARCHAR(1000),
  is_sensitive      BOOLEAN NOT NULL DEFAULT false,
  status            VARCHAR(20) NOT NULL DEFAULT 'processing'
                      CHECK (status IN ('processing', 'ready', 'failed')),
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Thêm cột "storage_path" cho CSDL đã được tạo TRƯỚC KHI có tính năng tải
-- tài liệu nguồn (script trên chỉ chạy CREATE TABLE IF NOT EXISTS nên sẽ
-- không tự thêm cột mới vào bảng đã tồn tại) — chạy lại file schema.sql này
-- là đủ để cập nhật, không cần xoá dữ liệu cũ.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path VARCHAR(1000);

-- ---------- Đoạn văn bản đã tách nhỏ (chunk) + vector embedding ----------
-- 768 chiều = số chiều đầu ra của model "text-embedding-004" (Gemini)
CREATE TABLE IF NOT EXISTS document_chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  content       TEXT NOT NULL,
  embedding     VECTOR(768),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index tìm kiếm vector gần nhất theo cosine similarity
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON document_chunks (document_id);

-- ---------- Hội thoại & tin nhắn ----------
-- Đã CHUYỂN SANG MongoDB (xem backend/src/models/conversation.model.js).
-- Lý do: mỗi tin nhắn có số lượng nguồn trích dẫn khác nhau và luôn được đọc/ghi
-- theo trọn 1 hội thoại — hợp với mô hình document lồng nhau của Mongo hơn là
-- 2 bảng quan hệ phải join. Xem phần "So sánh PostgreSQL vs MongoDB" trong README.

-- ============================================================
-- PHẦN CHẤM CÔNG & TÍNH LƯƠNG (nâng cấp)
-- Idempotent: chạy lại nhiều lần không lỗi, không mất dữ liệu.
-- Mốc thời gian lưu dạng TIMESTAMPTZ (UTC); "ngày làm việc" và "tháng" luôn
-- tính theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7) ở tầng code.
-- (Không lưu IP — chưa làm chấm công theo wifi, chỉ lưu vị trí GPS.)
-- ===== BEGIN ATTENDANCE =====

-- ---------- Gian hàng / cửa hàng ----------
-- Mỗi gian hàng có QR riêng (link /s/<id>) dán tại quầy. Giờ ca và tiền phạt
-- cấu hình theo gian hàng. lat/lng/radius_m là tuỳ chọn: nếu có thì mỗi lần
-- chấm công sẽ ghi khoảng cách tới gian hàng và gắn cờ "ngoài phạm vi"
-- (chỉ để admin xem, KHÔNG chặn nhân viên chấm công).
CREATE TABLE IF NOT EXISTS stalls (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               VARCHAR(255) NOT NULL,
  address            VARCHAR(500),
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  radius_m           INT NOT NULL DEFAULT 100,
  shift_start        TIME NOT NULL DEFAULT '08:00',
  shift_end          TIME NOT NULL DEFAULT '17:00',
  penalty_per_minute NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (shift_end > shift_start),
  CHECK (penalty_per_minute >= 0)
);

-- ---------- Thông tin nhân viên (mở rộng bảng users) ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS stall_id  UUID REFERENCES stalls(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone     VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position  VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS users_stall_id_idx ON users (stall_id);

-- ---------- Lịch sử lương giờ ----------
-- Mỗi lần đổi lương giờ thêm 1 dòng mới (không sửa dòng cũ) để các ngày trước
-- đó vẫn tính theo mức lương cũ. Mức áp dụng cho 1 ngày = dòng có
-- effective_from lớn nhất mà <= ngày đó.
CREATE TABLE IF NOT EXISTS employee_rates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hourly_rate    NUMERIC(12,2) NOT NULL CHECK (hourly_rate >= 0),
  effective_from DATE NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

-- ---------- Các lần chấm công ----------
-- Thời điểm (occurred_at) luôn do SERVER ghi, không tin giờ của điện thoại.
-- Không xoá cứng: sửa/huỷ đều đổi status = 'voided' + ghi attendance_edits.
CREATE TABLE IF NOT EXISTS attendance_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stall_id     UUID REFERENCES stalls(id) ON DELETE SET NULL,
  type         VARCHAR(3) NOT NULL CHECK (type IN ('in', 'out')),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  accuracy_m   DOUBLE PRECISION,
  distance_m   DOUBLE PRECISION,           -- khoảng cách tới gian hàng (nếu gian hàng có toạ độ)
  out_of_range BOOLEAN NOT NULL DEFAULT false,
  device_id    VARCHAR(100),
  method       VARCHAR(10) NOT NULL DEFAULT 'self' CHECK (method IN ('self', 'admin')),
  status       VARCHAR(10) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'voided')),
  note         VARCHAR(500),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sửa giờ KHÔNG ghi đè dòng cũ: dòng cũ bị đánh dấu 'voided', 1 dòng MỚI
-- (method = 'admin') được tạo và trỏ về dòng cũ qua replaces_event_id.
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS replaces_event_id UUID REFERENCES attendance_events(id) ON DELETE SET NULL;

-- Bất biến: các lần chấm công KHÔNG THỂ bị sửa nội dung (giờ, loại, người,
-- vị trí, nguồn). Chỉ cho phép đổi status 'valid' -> 'voided'. Ràng buộc đặt
-- ngay trong CSDL nên dù có lỗi code/gọi thẳng SQL cũng không ghi đè được lịch sử.
CREATE OR REPLACE FUNCTION attendance_events_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.stall_id IS DISTINCT FROM OLD.stall_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.lat IS DISTINCT FROM OLD.lat
     OR NEW.lng IS DISTINCT FROM OLD.lng
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.replaces_event_id IS DISTINCT FROM OLD.replaces_event_id THEN
    RAISE EXCEPTION 'Lần chấm công không thể sửa nội dung (chỉ được huỷ).';
  END IF;
  IF OLD.status = 'voided' AND NEW.status <> 'voided' THEN
    RAISE EXCEPTION 'Lần chấm công đã huỷ không thể khôi phục.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS attendance_events_immutable_trg ON attendance_events;
CREATE TRIGGER attendance_events_immutable_trg BEFORE UPDATE ON attendance_events
  FOR EACH ROW EXECUTE FUNCTION attendance_events_immutable();

CREATE INDEX IF NOT EXISTS attendance_events_user_time_idx ON attendance_events (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS attendance_events_stall_time_idx ON attendance_events (stall_id, occurred_at);

-- ---------- Nhật ký chỉnh sửa chấm công (admin) ----------
CREATE TABLE IF NOT EXISTS attendance_edits (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   UUID REFERENCES attendance_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- nhân viên bị sửa
  admin_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(10) NOT NULL CHECK (action IN ('create', 'update', 'void')),
  before     JSONB,
  after      JSONB,
  reason     VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_edits_user_idx ON attendance_edits (user_id, created_at);
-- Bản mới không yêu cầu nhập lý do khi chỉnh sửa
ALTER TABLE attendance_edits ALTER COLUMN reason DROP NOT NULL;

-- ---------- Bảng lương đã chốt ----------
-- Tháng đã kết thúc được "đóng băng" 1 lần: lưu kết quả + chi tiết từng ngày,
-- để đổi lương giờ / giờ ca / tiền phạt về sau không làm thay đổi lương cũ.
CREATE TABLE IF NOT EXISTS payroll_months (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month          CHAR(7) NOT NULL,          -- 'YYYY-MM'
  stall_id       UUID REFERENCES stalls(id) ON DELETE SET NULL,
  days_worked    INT NOT NULL,
  worked_minutes INT NOT NULL,
  late_minutes   INT NOT NULL,
  early_minutes  INT NOT NULL,
  gross          NUMERIC(14,2) NOT NULL,
  penalty        NUMERIC(14,2) NOT NULL,
  net            NUMERIC(14,2) NOT NULL,
  detail         JSONB NOT NULL,            -- từng ngày + cấu hình đã dùng
  locked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
CREATE INDEX IF NOT EXISTS payroll_months_month_idx ON payroll_months (month);
-- ===== END ATTENDANCE =====
