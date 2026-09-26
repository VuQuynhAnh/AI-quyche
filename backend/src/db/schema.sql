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
