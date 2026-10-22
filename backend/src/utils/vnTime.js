// Các hàm ngày/tháng theo múi giờ nghiệp vụ Asia/Ho_Chi_Minh (UTC+7, không có
// giờ mùa hè). Server (Render) chạy giờ UTC nên KHÔNG dùng getHours()/getMonth()
// trực tiếp — luôn đi qua các hàm bên dưới.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

export function toVN(date) {
  return new Date(new Date(date).getTime() + VN_OFFSET_MS);
}

// 'YYYY-MM-DD' theo giờ VN
export function vnDateKey(date) {
  const d = toVN(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// 'YYYY-MM' theo giờ VN
export function vnMonthKey(date) {
  return vnDateKey(date).slice(0, 7);
}

export function isValidMonthKey(m) {
  return typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function isValidDateKey(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
}

// Thời điểm (UTC) bắt đầu 00:00 giờ VN của 1 ngày 'YYYY-MM-DD'
export function vnDayStart(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS);
}

// [start, end) của 1 tháng 'YYYY-MM' tính theo giờ VN
export function vnMonthRange(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - VN_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - VN_OFFSET_MS),
  };
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Tháng đã kết thúc (tính từ 00:00 ngày 1 tháng kế tiếp giờ VN)
export function isMonthEnded(monthKey, now = new Date()) {
  return monthKey < vnMonthKey(now);
}

// Ngày đầu / cuối của 1 tháng 'YYYY-MM' dạng 'YYYY-MM-DD'
export function monthDateRange(monthKey) {
  return { firstDate: `${monthKey}-01`, lastDate: `${monthKey}-${pad(daysInMonth(monthKey))}` };
}

// Cộng/trừ n ngày cho 'YYYY-MM-DD'
export function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Tháng liền trước 1 'YYYY-MM'
export function prevMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

// 'HH:MM' hoặc 'HH:MM:SS' -> số phút từ 00:00
export function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}
