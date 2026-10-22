-- ============================================================
-- SCHEMA CƠ SỞ DỮ LIỆU (PostgreSQL 14+ có extension pgvector)
-- Chấm công, bảng lương & trợ lý AI hỏi đáp quy chế — nhiều cửa hàng
-- ============================================================
-- Quy ước đặt tên:
--  - Tên bảng số ít, snake_case, theo nghiệp vụ; bảng con dạng <cha>_detail /
--    <cha>_history.
--  - Không viết tắt; đơn vị ghi trong tên (_minutes, _meters); boolean bắt đầu
--    bằng is_; khoá ngoại ghi rõ vai trò (created_by_account_id).
--  - Mốc thời gian lưu TIMESTAMPTZ (UTC); "ngày làm việc" (work_date) và
--    "tháng lương" (pay_month) luôn theo giờ Việt Nam (Asia/Ho_Chi_Minh).
--
-- CÁC KIỂU ENUM (account_role, paysheet_status...) KHÔNG khai báo ở đây: chúng
-- được sinh từ backend/src/constants/enums.js (POSTGRES_ENUM_TYPES) bởi
-- db/seed.js ngay trước khi chạy file này — nguồn giá trị duy nhất.
--
-- Chạy bằng: npm run db:reset (XOÁ SẠCH rồi tạo lại + nạp dữ liệu mẫu)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- Cửa hàng ----------
-- Do superadmin tạo (kèm 1 admin đầu tiên); sau đó cửa hàng tự quản lý.
-- Gói sử dụng do superadmin đặt:
--  - max_employee_count: số tài khoản ĐANG HOẠT ĐỘNG tối đa (admin + nhân viên);
--    NULL = không giới hạn.
--  - expiry_date: dùng được tới HẾT ngày này (giờ VN); NULL = không thời hạn.
--    Hết hạn hoặc is_active = false -> mọi tài khoản của cửa hàng bị chặn.
--  - owner_phone_number: SĐT chủ cửa hàng để chăm sóc khách hàng.
CREATE TABLE store (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  address               VARCHAR(500),
  owner_phone_number    VARCHAR(30),
  max_employee_count    INT CHECK (max_employee_count IS NULL OR max_employee_count > 0),
  expiry_date           DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by_account_id UUID,           -- FK thêm sau khi có bảng account
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Thiết lập cửa hàng (KEY-VALUE) ----------
-- Mỗi thiết lập 1 dòng, key & value đều là chuỗi. Danh sách key, kiểu dữ liệu
-- và giá trị mặc định khai báo ở constants/enums.js (SETTING_KEY,
-- SETTING_DATA_TYPE, SETTING_DEFINITIONS) — thêm thiết lập mới KHÔNG cần đổi
-- cấu trúc bảng. Key chưa có dòng nào = dùng giá trị mặc định.
CREATE TABLE store_setting (
  store_id   UUID NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  key        VARCHAR(100) NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, key)
);

-- ---------- Tài khoản đăng nhập ----------
-- superadmin không thuộc cửa hàng nào; admin/user luôn thuộc đúng 1 cửa hàng.
CREATE TABLE account (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES store(id) ON DELETE CASCADE,
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          account_role NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role = 'superadmin') = (store_id IS NULL))
);
CREATE INDEX account_store_id_idx ON account (store_id);

ALTER TABLE store
  ADD CONSTRAINT store_created_by_account_id_fkey
  FOREIGN KEY (created_by_account_id) REFERENCES account(id) ON DELETE SET NULL;

-- Mạng Wi-Fi của cửa hàng = IP công cộng lúc admin cửa hàng đăng nhập. Mỗi lần
-- IP đổi thêm 1 dòng; dòng MỚI NHẤT là mạng hiện tại, dòng cũ giữ làm lịch sử.
CREATE TABLE store_network (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               UUID NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  ip_address             VARCHAR(45) NOT NULL,
  detected_by_account_id UUID REFERENCES account(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX store_network_store_created_idx ON store_network (store_id, created_at DESC);

-- ---------- Hồ sơ nhân viên (1–1 với account thuộc cửa hàng) ----------
-- Mỗi nhân viên chỉ có 1 mức lương giờ. Đổi lương chỉ ảnh hưởng các bảng lương
-- CHƯA chốt (bảng đã chốt lưu lại mức lương đã dùng trong paysheet_detail).
CREATE TABLE employee (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL UNIQUE REFERENCES account(id) ON DELETE CASCADE,
  phone_number VARCHAR(30),
  job_title    VARCHAR(100),
  hourly_wage  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hourly_wage >= 0),
  -- Ngày bắt đầu đi làm (giờ VN) — KHÁC created_at (ngày tạo tài khoản), admin sửa được
  start_work_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  -- Ảnh đại diện: tên file trong backend/uploads/ (VD "avatars/<uuid>.jpg"); NULL = chưa có
  avatar_path  VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Chấm công theo NGÀY ----------
-- Mỗi nhân viên mỗi ngày làm việc (giờ VN) 1 dòng — tổng hợp từ clocking_history.
-- Giờ ca được chụp lại lúc tạo dòng, để đổi thiết lập sau đó không làm sai
-- các ngày đã qua.
CREATE TABLE clocking (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             UUID NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  work_date            DATE NOT NULL,
  shift_start_time     TIME NOT NULL,
  shift_end_time       TIME NOT NULL,
  check_in_time        TIMESTAMPTZ,
  check_out_time       TIMESTAMPTZ,
  worked_minutes       INT NOT NULL DEFAULT 0,
  late_minutes         INT NOT NULL DEFAULT 0,
  early_leave_minutes  INT NOT NULL DEFAULT 0,
  is_missing_check_out BOOLEAN NOT NULL DEFAULT false,
  is_out_of_range      BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX clocking_store_work_date_idx ON clocking (store_id, work_date);

-- ---------- Lịch sử chấm công (từng lần bấm + các lần admin sửa) ----------
-- Thời điểm (clock_time) do SERVER ghi. Không xoá, không sửa: admin "sửa giờ" =
-- huỷ dòng cũ (status voided) + thêm dòng mới (source admin) trỏ về dòng cũ
-- qua replaced_history_id.
CREATE TABLE clocking_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clocking_id              UUID NOT NULL REFERENCES clocking(id) ON DELETE CASCADE,
  action_type              clocking_action_type NOT NULL,
  clock_time               TIMESTAMPTZ NOT NULL DEFAULT now(),
  source                   clocking_source NOT NULL,
  latitude                 DOUBLE PRECISION,
  longitude                DOUBLE PRECISION,
  gps_accuracy_meters      DOUBLE PRECISION,
  distance_to_store_meters DOUBLE PRECISION,
  is_out_of_range          BOOLEAN NOT NULL DEFAULT false,
  device_identifier        VARCHAR(100),
  method                   clocking_method,          -- NULL = admin sửa giờ
  client_ip                VARCHAR(45),
  status                   clocking_history_status NOT NULL DEFAULT 'valid',
  replaced_history_id      UUID REFERENCES clocking_history(id) ON DELETE CASCADE,
  created_by_account_id    UUID REFERENCES account(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clocking_history_clocking_id_idx ON clocking_history (clocking_id, clock_time);

-- Bất biến: chỉ cho đổi status valid -> voided, mọi cột khác không sửa được.
-- Đặt ngay trong CSDL nên dù lỗi code/gọi thẳng SQL cũng không ghi đè lịch sử.
-- Ngoại lệ: created_by_account_id được về NULL (khi xoá tài khoản admin đã sửa giờ).
CREATE FUNCTION clocking_history_immutable() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'created_by_account_id')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'created_by_account_id')
     OR (NEW.created_by_account_id IS NOT NULL
         AND NEW.created_by_account_id IS DISTINCT FROM OLD.created_by_account_id) THEN
    RAISE EXCEPTION 'Lịch sử chấm công không thể sửa nội dung (chỉ được huỷ).';
  END IF;
  IF OLD.status = 'voided' AND NEW.status <> 'voided' THEN
    RAISE EXCEPTION 'Lần chấm công đã huỷ không thể khôi phục.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER clocking_history_immutable_trg BEFORE UPDATE ON clocking_history
  FOR EACH ROW EXECUTE FUNCTION clocking_history_immutable();

-- ---------- Bảng lương tháng của cửa hàng ----------
-- Admin tạo (draft) -> tính lại khi cần -> chốt (finalized) hoặc huỷ (cancelled).
-- Mỗi cửa hàng chỉ có 1 bảng lương CHƯA HUỶ cho mỗi tháng (unique index bên dưới).
-- Tháng có bảng lương finalized: không sửa được chấm công của tháng đó.
CREATE TABLE paysheet (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                  UUID NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  pay_month                 CHAR(7) NOT NULL CHECK (pay_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status                    paysheet_status NOT NULL DEFAULT 'draft',
  penalty_amount_per_minute NUMERIC(12,2) NOT NULL DEFAULT 0, -- mức phạt đã dùng khi tính
  employee_count            INT NOT NULL DEFAULT 0,
  total_worked_minutes      INT NOT NULL DEFAULT 0,
  total_gross_salary        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_penalty_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net_salary          NUMERIC(14,2) NOT NULL DEFAULT 0,
  calculated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_account_id     UUID REFERENCES account(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_by_account_id   UUID REFERENCES account(id) ON DELETE SET NULL,
  finalized_at              TIMESTAMPTZ,
  cancelled_by_account_id   UUID REFERENCES account(id) ON DELETE SET NULL,
  cancelled_at              TIMESTAMPTZ,
  cancel_reason             VARCHAR(500),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX paysheet_one_active_per_month_idx
  ON paysheet (store_id, pay_month) WHERE status <> 'cancelled';

-- ---------- Chi tiết bảng lương: lương từng nhân viên ----------
CREATE TABLE paysheet_detail (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paysheet_id            UUID NOT NULL REFERENCES paysheet(id) ON DELETE CASCADE,
  employee_id            UUID NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  hourly_wage            NUMERIC(12,2) NOT NULL, -- mức lương đã dùng khi tính
  worked_days            INT NOT NULL,
  worked_minutes         INT NOT NULL,
  late_minutes           INT NOT NULL,
  early_leave_minutes    INT NOT NULL,
  missing_check_out_days INT NOT NULL,
  gross_salary           NUMERIC(14,2) NOT NULL,
  penalty_amount         NUMERIC(14,2) NOT NULL,
  net_salary             NUMERIC(14,2) NOT NULL,
  daily_breakdown        JSONB NOT NULL,         -- từng ngày: giờ vào/ra, phút, tiền
  UNIQUE (paysheet_id, employee_id)
);
CREATE INDEX paysheet_detail_employee_id_idx ON paysheet_detail (employee_id);

-- ---------- Văn bản quy chế (riêng từng cửa hàng) ----------
-- is_sensitive = true: tài liệu NHẠY CẢM — vẫn tách đoạn/embedding nhưng
-- chatbot KHÔNG dùng để tự trả lời; câu hỏi khớp nội dung này được chuyển cho
-- admin cửa hàng (đoạn chat tự gắn cờ).
CREATE TABLE document (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               UUID NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  title                  VARCHAR(500) NOT NULL,
  category               VARCHAR(150),
  original_file_name     VARCHAR(500),
  stored_file_name       VARCHAR(1000),  -- tên file trong backend/uploads/
  is_sensitive           BOOLEAN NOT NULL DEFAULT false,
  processing_status      document_processing_status NOT NULL DEFAULT 'processing',
  uploaded_by_account_id UUID REFERENCES account(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_store_id_idx ON document (store_id);

-- ---------- Chi tiết văn bản: các đoạn đã tách + vector embedding ----------
-- 768 chiều = số chiều embedding (GEMINI_EMBEDDING_DIMENSIONS).
CREATE TABLE document_detail (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(768),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX document_detail_embedding_idx
  ON document_detail USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------- Hội thoại & tin nhắn ----------
-- Lưu ở MongoDB (backend/src/models/), có storeId để tách theo cửa hàng.
