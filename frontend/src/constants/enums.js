// BỘ ENUM DÙNG CHUNG phía frontend — BẢN SAO của backend/src/constants/enums.js
// (sửa bên đó thì sửa cả ở đây). Code không viết chuỗi "admin", "draft"...
// trực tiếp mà luôn dùng hằng số ở đây.

export const ROLE = Object.freeze({
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  USER: "user",
});

export const CLOCKING_ACTION = Object.freeze({
  CHECK_IN: "check_in",
  CHECK_OUT: "check_out",
});

// Cách nhân viên tự chấm công: quét QR, hoặc Wi-Fi cửa hàng (khi cửa hàng bật)
export const CLOCKING_METHOD = Object.freeze({
  QR: "qr",
  WIFI: "wifi",
});

export const CLOCKING_SOURCE = Object.freeze({
  EMPLOYEE: "employee",
  ADMIN: "admin",
});

export const CLOCKING_HISTORY_STATUS = Object.freeze({
  VALID: "valid",
  VOIDED: "voided",
});

export const PAYSHEET_STATUS = Object.freeze({
  DRAFT: "draft",
  FINALIZED: "finalized",
  CANCELLED: "cancelled",
});

export const DOCUMENT_PROCESSING_STATUS = Object.freeze({
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
});

export const CONVERSATION_STATUS = Object.freeze({
  NORMAL: "normal",
  FLAGGED: "flagged",
  RESOLVED: "resolved",
});

export const MESSAGE_SENDER = Object.freeze({
  USER: "user",
  ASSISTANT: "assistant",
  ADMIN: "admin",
});

export const MESSAGE_FEEDBACK = Object.freeze({
  HELPFUL: "helpful",
  UNHELPFUL: "unhelpful",
});

// ---------- Nhãn hiển thị ----------
export const ROLE_LABEL = Object.freeze({
  [ROLE.SUPERADMIN]: "Superadmin",
  [ROLE.ADMIN]: "Quản trị viên",
  [ROLE.USER]: "Nhân viên",
});

export const CLOCKING_ACTION_LABEL = Object.freeze({
  [CLOCKING_ACTION.CHECK_IN]: "VÀO",
  [CLOCKING_ACTION.CHECK_OUT]: "RA",
});

export const PAYSHEET_STATUS_LABEL = Object.freeze({
  [PAYSHEET_STATUS.DRAFT]: { text: "Nháp", cls: "text-bg-warning" },
  [PAYSHEET_STATUS.FINALIZED]: { text: "Đã chốt", cls: "text-bg-success" },
  [PAYSHEET_STATUS.CANCELLED]: { text: "Đã huỷ", cls: "text-bg-secondary" },
});

// Trang chủ của từng role sau khi đăng nhập
export const HOME_PATH_BY_ROLE = Object.freeze({
  [ROLE.SUPERADMIN]: "/superadmin",
  [ROLE.ADMIN]: "/admin",
  [ROLE.USER]: "/work",
});

export const homePathForRole = (role) => HOME_PATH_BY_ROLE[role] || "/login";
