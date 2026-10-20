// Middleware xử lý lỗi tập trung — mọi lỗi throw/reject trong route async (đã
// bọc bằng asyncHandler) sẽ rơi vào đây. Lỗi nghiệp vụ (AppError do tầng
// service ném ra) được trả về đúng status + thông báo; lỗi khác coi là lỗi hệ
// thống (500) và được log ra console để debug.
import { AppError } from "../utils/AppError.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (!(err instanceof AppError)) console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Lỗi hệ thống.",
    ...(err instanceof AppError && err.code ? { code: err.code } : {}),
    ...(err instanceof AppError ? err.details : {}),
  });
}
