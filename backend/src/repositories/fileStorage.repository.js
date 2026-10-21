// Lưu trữ file gốc của văn bản trên đĩa (backend/uploads/). Đây là lưu trữ
// dạng "file cục bộ", đơn giản và dễ hiểu cho mục đích giảng dạy — hệ thống
// thật ở quy mô lớn nên dùng object storage (S3, GCS...): khi đó chỉ cần viết
// 1 repository mới cùng các method rồi đổi trong container.js.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Thư mục tính tương đối theo vị trí file này, KHÔNG theo thư mục đang chạy
// lệnh, để luôn đúng dù chạy `node` từ đâu.
const DEFAULT_UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");

export function createFileStorage({ uploadDir = DEFAULT_UPLOAD_DIR } = {}) {
  const resolvePath = (storagePath) => path.join(uploadDir, storagePath);

  return {
    resolvePath,

    // Ghi buffer xuống đĩa với tên `storagePath`
    async save(storagePath, buffer) {
      await fs.mkdir(path.dirname(resolvePath(storagePath)), { recursive: true });
      await fs.writeFile(resolvePath(storagePath), buffer);
    },

    // Xoá file; bỏ qua nếu file không còn tồn tại
    async remove(storagePath) {
      await fs.unlink(resolvePath(storagePath)).catch(() => {});
    },
  };
}
