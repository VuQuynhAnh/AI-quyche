-- Ảnh đại diện nhân viên: tên file trong backend/uploads/ (VD "avatars/<uuid>.jpg").
-- Chạy lại nhiều lần được.
ALTER TABLE employee ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(255);
