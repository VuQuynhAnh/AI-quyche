// Kiểm tra định dạng dùng chung cho tầng service.
import { AppError } from "./AppError.js";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MIN_PASSWORD_LENGTH = 6;

export const isUuid = (value) => UUID_RE.test(String(value));

export function assertUuid(value, message = "ID không hợp lệ.") {
  if (!isUuid(value)) throw AppError.badRequest(message);
}

// Chuỗi bắt buộc, đã trim, cắt theo độ dài tối đa
export function requiredText(value, message, maxLength = 255) {
  const text = String(value ?? "").trim();
  if (!text) throw AppError.badRequest(message);
  return text.slice(0, maxLength);
}

// Chuỗi tuỳ chọn: rỗng -> null
export function optionalText(value, maxLength = 255) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function assertPassword(password) {
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw AppError.badRequest(`Mật khẩu cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
  }
}

export function normalizeEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw AppError.badRequest("Email không hợp lệ.");
  return value;
}

// Số tiền >= 0 (lương giờ, tiền phạt)
export function parseMoney(value, message) {
  const n = Number(value);
  if (value === "" || value == null || !Number.isFinite(n) || n < 0 || n > 1e9) {
    throw AppError.badRequest(message);
  }
  return n;
}
