// BỘ ENUM DÙNG CHUNG — nguồn DUY NHẤT cho mọi giá trị cố định (role, trạng
// thái...). Code KHÔNG viết chuỗi "admin", "draft"... trực tiếp mà luôn dùng
// hằng số ở đây (VD: ROLE.ADMIN, PAYSHEET_STATUS.DRAFT).
//
// Các kiểu ENUM của PostgreSQL được SINH TỰ ĐỘNG từ file này (xem
// POSTGRES_ENUM_TYPES bên dưới + db/seed.js), nên thêm/bớt giá trị chỉ cần sửa
// ở đây rồi chạy lại `npm run db:reset`.
//
// Frontend có bản sao tại frontend/src/constants/enums.js — sửa ở đây thì sửa
// cả bên đó.

// Vai trò tài khoản
//  - superadmin: quản trị toàn hệ thống — tạo cửa hàng (kèm admin đầu tiên) và
//                tạo superadmin khác; KHÔNG quản lý admin/user của cửa hàng
//  - admin     : quản lý 1 cửa hàng (nhân viên, chấm công, bảng lương, quy chế)
//  - user      : nhân viên của cửa hàng (chấm công, xem lương, chat)
export const ROLE = Object.freeze({
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  USER: "user",
});

// Role được gán cho tài khoản thuộc 1 cửa hàng (admin cửa hàng tự quản lý)
export const STORE_ROLES = Object.freeze([ROLE.ADMIN, ROLE.USER]);

// Loại 1 lần bấm chấm công
export const CLOCKING_ACTION = Object.freeze({
  CHECK_IN: "check_in",
  CHECK_OUT: "check_out",
});

// Ai tạo ra 1 dòng lịch sử chấm công
export const CLOCKING_SOURCE = Object.freeze({
  EMPLOYEE: "employee", // nhân viên tự chấm (GPS + QR)
  ADMIN: "admin", // admin chỉnh sửa giờ
});

// Trạng thái 1 dòng lịch sử chấm công (không xoá — chỉ huỷ)
export const CLOCKING_HISTORY_STATUS = Object.freeze({
  VALID: "valid",
  VOIDED: "voided",
});

// ---------- Thiết lập cửa hàng (key-value) ----------
// Mỗi thiết lập là 1 dòng (store_id, key, value) trong bảng store_setting; key
// và value đều LƯU DẠNG CHUỖI. Thêm thiết lập mới chỉ cần khai báo ở đây
// (SETTING_KEY + SETTING_DEFINITIONS), KHÔNG phải thêm cột / migration.

// Kiểu dữ liệu: quyết định cách đổi chuỗi <-> giá trị (utils/settingValue.js)
export const SETTING_DATA_TYPE = Object.freeze({
  STRING: "string",
  NUMBER: "number", // số thực, VD tiền, toạ độ
  INTEGER: "integer",
  BOOLEAN: "boolean", // "true" / "false"
  TIME: "time", // "HH:MM"
});

// Các loại thiết lập (giá trị = key lưu trong DB)
export const SETTING_KEY = Object.freeze({
  SHIFT_START_TIME: "shift_start_time",
  SHIFT_END_TIME: "shift_end_time",
  PENALTY_AMOUNT_PER_MINUTE: "penalty_amount_per_minute",
  LATITUDE: "latitude",
  LONGITUDE: "longitude",
  CHECK_IN_RADIUS_METERS: "check_in_radius_meters",
  WIFI_CLOCKING_ENABLED: "wifi_clocking_enabled",
  WIFI_MAX_DISTANCE_METERS: "wifi_max_distance_meters",
});

// Kiểu dữ liệu + giá trị mặc định (dùng khi cửa hàng chưa lưu key đó)
export const SETTING_DEFINITIONS = Object.freeze({
  [SETTING_KEY.SHIFT_START_TIME]: { type: SETTING_DATA_TYPE.TIME, defaultValue: "08:00" },
  [SETTING_KEY.SHIFT_END_TIME]: { type: SETTING_DATA_TYPE.TIME, defaultValue: "17:00" },
  [SETTING_KEY.PENALTY_AMOUNT_PER_MINUTE]: { type: SETTING_DATA_TYPE.NUMBER, defaultValue: 0 },
  // Vị trí cửa hàng (tuỳ chọn): có thì chấm công ngoài bán kính bị gắn cờ cho admin xem
  [SETTING_KEY.LATITUDE]: { type: SETTING_DATA_TYPE.NUMBER, defaultValue: null },
  [SETTING_KEY.LONGITUDE]: { type: SETTING_DATA_TYPE.NUMBER, defaultValue: null },
  [SETTING_KEY.CHECK_IN_RADIUS_METERS]: { type: SETTING_DATA_TYPE.INTEGER, defaultValue: 100 },
  // Cho nhân viên chấm công bằng Wi-Fi cửa hàng (bên cạnh QR)
  [SETTING_KEY.WIFI_CLOCKING_ENABLED]: { type: SETTING_DATA_TYPE.BOOLEAN, defaultValue: false },
  // Chấm bằng Wi-Fi chỉ hợp lệ khi điện thoại (GPS) cách vị trí cửa hàng tối đa
  // ngần này mét — chặn trường hợp "Wi-Fi cửa hàng" là mạng ở nơi khác (VD admin
  // đăng nhập ở nhà, nhân viên dùng chung mạng đó)
  [SETTING_KEY.WIFI_MAX_DISTANCE_METERS]: { type: SETTING_DATA_TYPE.INTEGER, defaultValue: 200 },
});

// Cách nhân viên tự chấm công (admin sửa giờ thì không có)
//  - qr  : quét mã QR dán tại quầy
//  - wifi: đang dùng Wi-Fi cửa hàng (IP công cộng trùng IP lần admin đăng nhập
//          gần nhất — xem services/storeNetwork.service.js). Chỉ khi cửa hàng
//          bật SETTING_KEY.WIFI_CLOCKING_ENABLED.
export const CLOCKING_METHOD = Object.freeze({
  QR: "qr",
  WIFI: "wifi",
});

// Vòng đời bảng lương tháng:
//   draft ──(chốt)──▶ finalized
//     │                  │
//     └──(huỷ)──▶ cancelled ◀──(huỷ)──┘
// Mỗi cửa hàng chỉ có 1 bảng lương KHÁC "cancelled" cho mỗi tháng.
export const PAYSHEET_STATUS = Object.freeze({
  DRAFT: "draft",
  FINALIZED: "finalized",
  CANCELLED: "cancelled",
});

// Trạng thái xử lý văn bản quy chế (trích xuất text + embedding chạy nền)
export const DOCUMENT_PROCESSING_STATUS = Object.freeze({
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
});

// Trạng thái đoạn chat (MongoDB)
export const CONVERSATION_STATUS = Object.freeze({
  NORMAL: "normal",
  FLAGGED: "flagged", // cần admin trả lời
  RESOLVED: "resolved",
});

// Người gửi 1 tin nhắn (MongoDB)
export const MESSAGE_SENDER = Object.freeze({
  USER: "user",
  ASSISTANT: "assistant",
  ADMIN: "admin",
});

// Đánh giá câu trả lời của chatbot
export const MESSAGE_FEEDBACK = Object.freeze({
  HELPFUL: "helpful",
  UNHELPFUL: "unhelpful",
});

// Tên kiểu ENUM trong PostgreSQL -> enum JS tương ứng
export const POSTGRES_ENUM_TYPES = Object.freeze({
  account_role: ROLE,
  clocking_action_type: CLOCKING_ACTION,
  clocking_source: CLOCKING_SOURCE,
  clocking_method: CLOCKING_METHOD,
  clocking_history_status: CLOCKING_HISTORY_STATUS,
  paysheet_status: PAYSHEET_STATUS,
  document_processing_status: DOCUMENT_PROCESSING_STATUS,
});

export const enumValues = (enumObject) => Object.values(enumObject);

export const isEnumValue = (enumObject, value) => enumValues(enumObject).includes(value);
