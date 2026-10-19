// Logic tính công & lương — TOÀN BỘ là hàm thuần (không đụng DB) nên test được
// độc lập (xem backend/test/payroll.test.js).
//
// Quy ước:
//  - Múi giờ nghiệp vụ cố định Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè).
//    Server (Render) chạy giờ UTC nên KHÔNG dùng getHours()/getMonth() trực
//    tiếp — luôn đi qua các hàm bên dưới.
//  - Lương ngày = lương giờ × số phút làm việc nằm TRONG khung ca / 60.
//    Đến sớm hơn giờ vào ca không được tính thêm; về muộn hơn giờ tan ca
//    cũng không (không có tăng ca ở bản này).
//  - Đi muộn = (giờ check-in đầu tiên − giờ vào ca), về sớm = (giờ tan ca −
//    giờ check-out cuối cùng), làm tròn XUỐNG phút. Tiền phạt = (đi muộn +
//    về sớm) × tiền phạt mỗi phút. Phạt trừ THÊM ngoài việc không được tính
//    lương cho khoảng thời gian muộn/sớm đó.
//  - Ngày không có lần chấm công nào = không có lương, không bị phạt thêm.
//  - Lần check-in không có check-out tương ứng: không tính phút nào cho
//    đoạn đó và gắn cờ missingCheckout để admin sửa.
//  - Tiền làm tròn đến đồng ở MỖI NGÀY để tổng tháng = tổng các ngày.
//  - Lương thực nhận cả tháng không âm: net = max(0, gross − penalty).

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

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

// Tháng đã qua = đã bị khoá (cứng, từ 00:00 ngày 1 tháng kế tiếp giờ VN)
export function isMonthLocked(monthKey, now = new Date()) {
  return monthKey < vnMonthKey(now);
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

// Mức lương giờ áp dụng cho 1 ngày: dòng có effective_from lớn nhất <= ngày đó
export function rateForDate(rates, dateKey) {
  let best = null;
  for (const r of rates || []) {
    const from = typeof r.effective_from === "string" ? r.effective_from.slice(0, 10) : r.effective_from;
    if (from <= dateKey && (!best || from > best.from)) {
      best = { from, rate: Number(r.hourly_rate) };
    }
  }
  return best ? best.rate : 0;
}

// Tính 1 ngày. events: các lần chấm công HỢP LỆ của đúng ngày đó
// ({type:'in'|'out', occurred_at, out_of_range?}); shift: {start:'08:00', end:'17:00'}.
export function computeDay({ dateKey, events, shift, hourlyRate, penaltyPerMinute }) {
  const dayStart = vnDayStart(dateKey).getTime();
  const shiftStart = dayStart + timeToMinutes(shift.start) * MINUTE_MS;
  const shiftEnd = dayStart + timeToMinutes(shift.end) * MINUTE_MS;
  const shiftMinutes = Math.round((shiftEnd - shiftStart) / MINUTE_MS);

  const sorted = [...events]
    .map((e) => ({ ...e, t: new Date(e.occurred_at).getTime() }))
    .sort((a, b) => a.t - b.t);

  let open = null;
  let workedMs = 0;
  let firstIn = null;
  let lastOut = null;
  let strayOut = false;

  for (const e of sorted) {
    if (e.type === "in") {
      if (!open) open = e; // 'in' trùng liên tiếp: giữ lần đầu
      if (!firstIn) firstIn = e;
    } else if (e.type === "out") {
      if (open) {
        const from = Math.max(open.t, shiftStart);
        const to = Math.min(e.t, shiftEnd);
        if (to > from) workedMs += to - from;
        lastOut = e;
        open = null;
      } else {
        strayOut = true; // 'out' không có 'in' đi trước
      }
    }
  }

  const missingCheckout = open !== null;
  const workedMinutes = Math.floor(workedMs / MINUTE_MS);

  let lateMinutes = 0;
  let earlyMinutes = 0;
  if (firstIn) {
    lateMinutes = Math.min(shiftMinutes, Math.max(0, Math.floor((firstIn.t - shiftStart) / MINUTE_MS)));
  }
  if (lastOut && !missingCheckout) {
    earlyMinutes = Math.min(
      shiftMinutes - lateMinutes,
      Math.max(0, Math.floor((shiftEnd - lastOut.t) / MINUTE_MS))
    );
  }

  const gross = Math.round((Number(hourlyRate) * workedMinutes) / 60);
  const penalty = Math.round((lateMinutes + earlyMinutes) * Number(penaltyPerMinute));

  return {
    date: dateKey,
    firstIn: firstIn ? new Date(firstIn.t).toISOString() : null,
    lastOut: lastOut ? new Date(lastOut.t).toISOString() : null,
    eventCount: sorted.length,
    workedMinutes,
    lateMinutes,
    earlyMinutes,
    gross,
    penalty,
    net: gross - penalty,
    hourlyRate: Number(hourlyRate),
    missingCheckout,
    strayOut,
    outOfRange: sorted.some((e) => e.out_of_range),
  };
}

// Tính cả tháng cho 1 nhân viên.
// events: toàn bộ lần chấm công hợp lệ của nhân viên trong tháng (mọi ngày).
export function computeMonth({ monthKey, events, shift, rates, penaltyPerMinute }) {
  const byDate = new Map();
  for (const e of events) {
    const key = vnDateKey(e.occurred_at);
    if (!key.startsWith(monthKey)) continue; // phòng dữ liệu lệch tháng
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(e);
  }

  const days = [...byDate.keys()]
    .sort()
    .map((dateKey) =>
      computeDay({
        dateKey,
        events: byDate.get(dateKey),
        shift,
        hourlyRate: rateForDate(rates, dateKey),
        penaltyPerMinute,
      })
    );

  const sum = (f) => days.reduce((s, d) => s + d[f], 0);
  const gross = sum("gross");
  const penalty = sum("penalty");

  return {
    month: monthKey,
    days,
    totals: {
      daysWorked: days.filter((d) => d.workedMinutes > 0 || d.eventCount > 0).length,
      workedMinutes: sum("workedMinutes"),
      lateMinutes: sum("lateMinutes"),
      earlyMinutes: sum("earlyMinutes"),
      gross,
      penalty,
      net: Math.max(0, gross - penalty),
    },
    config: { shift, penaltyPerMinute: Number(penaltyPerMinute) },
  };
}

// Khoảng cách giữa 2 toạ độ (mét) — công thức haversine
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
