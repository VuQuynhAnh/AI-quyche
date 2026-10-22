// Định dạng thời gian/tiền cho phần chấm công. Mọi mốc giờ hiển thị theo
// múi giờ Việt Nam (Asia/Ho_Chi_Minh) bất kể máy người dùng đặt múi giờ nào —
// khớp với cách backend chia ngày/tháng (xem payroll.service.js).
const TZ = "Asia/Ho_Chi_Minh";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

function vnParts(date) {
  const d = new Date(new Date(date).getTime() + VN_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
}

export function vnDateKey(date = new Date()) {
  const { y, m, d } = vnParts(date);
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function vnMonthKey(date = new Date()) {
  return vnDateKey(date).slice(0, 7);
}

export function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Cộng/trừ n ngày cho 'YYYY-MM-DD'
export function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Thứ Hai của tuần chứa ngày 'YYYY-MM-DD' (tuần bắt đầu từ Thứ Hai)
export function weekStart(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = CN
  return addDays(dateKey, -((dow + 6) % 7));
}

// '2026-10-19' -> '19/10'
export function fmtDayMonth(dateKey) {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

// Thứ của ngày 1 trong tháng, quy về 0 = Thứ Hai ... 6 = Chủ Nhật
export function firstWeekdayMonFirst(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = CN
  return (dow + 6) % 7;
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

export function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", hour12: false, timeZone: TZ,
  });
}

export function fmtDateLong(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const names = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${names[dow]}, ${pad(d)}/${pad(m)}/${y}`;
}

// 495 -> "8h 15p"
export function fmtMinutes(min) {
  const n = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m}p`;
  return m === 0 ? `${h}h` : `${h}h ${pad(m)}p`;
}

export function fmtMoney(v) {
  return `${Math.round(Number(v) || 0).toLocaleString("vi-VN")} đ`;
}

// Chuyển giá trị <input type="datetime-local"> (giờ VN, không có múi giờ) -> ISO UTC
export function vnLocalToIso(local) {
  return new Date(`${local}:00+07:00`).toISOString();
}

// ISO -> giá trị cho <input type="datetime-local"> theo giờ VN
export function isoToVnLocal(iso) {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Id thiết bị ngẫu nhiên, lưu ở trình duyệt — chỉ để admin đối soát khi cần
export function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `d-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem("deviceId", id);
    }
    return id;
  } catch {
    return null;
  }
}
