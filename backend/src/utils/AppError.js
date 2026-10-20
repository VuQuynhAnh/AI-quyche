// Lỗi nghiệp vụ có kèm HTTP status — tầng service chỉ việc `throw` lỗi này,
// không cần biết gì về Express (req/res). Middleware xử lý lỗi tập trung
// (middleware/errorHandler.js) sẽ chuyển nó thành response JSON:
//   { error: message, code?, ...details }
export class AppError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, options) {
    return new AppError(400, message, options);
  }

  static unauthorized(message, options) {
    return new AppError(401, message, options);
  }

  static forbidden(message, options) {
    return new AppError(403, message, options);
  }

  static notFound(message, options) {
    return new AppError(404, message, options);
  }

  static conflict(message, options) {
    return new AppError(409, message, options);
  }
}
