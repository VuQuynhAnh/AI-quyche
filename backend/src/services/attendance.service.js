// Lớp truy cập dữ liệu chấm công/lương: đọc từ PostgreSQL rồi giao cho các hàm
// thuần trong payroll.service.js tính toán. Dùng chung cho API nhân viên, API
// admin và (sau này) công cụ hỏi đáp AI — để mọi nơi cùng ra MỘT con số.
import { query } from "../config/db.js";
import {
  computeMonth,
  vnMonthRange,
  vnMonthKey,
  vnDateKey,
  vnDayStart,
  isMonthLocked,
} from "./payroll.service.js";

export const DEFAULT_SHIFT = { start: "08:00", end: "17:00" };

const hhmm = (t) => String(t).slice(0, 5);

// Tháng hiện tại (giờ VN) dạng 'YYYY-MM'
export const currentMonthKey = (now = new Date()) => vnMonthKey(now);

// Tính tháng cho nhiều nhân viên cùng lúc (4 query cố định, không phụ thuộc số
// người). Trả về Map<userId, kết quả computeMonth + { locked, frozen }>.
// - Tháng đã khoá + có bản chốt trong payroll_months  -> trả bản chốt (frozen).
// - Tháng đã khoá + chưa có bản chốt + có dữ liệu      -> tính rồi chốt luôn.
// - Tháng đang chạy                                      -> tính trực tiếp.
export async function computeMonthsForUsers(userIds, monthKey, now = new Date()) {
  const out = new Map();
  if (!userIds.length) return out;

  const locked = isMonthLocked(monthKey, now);
  const { start, end } = vnMonthRange(monthKey);

  const [usersRes, eventsRes, ratesRes, snapRes] = await Promise.all([
    query(
      `SELECT u.id, u.stall_id, s.shift_start, s.shift_end, s.penalty_per_minute
       FROM users u LEFT JOIN stalls s ON s.id = u.stall_id
       WHERE u.id = ANY($1::uuid[])`,
      [userIds]
    ),
    query(
      `SELECT user_id, type, occurred_at, out_of_range
       FROM attendance_events
       WHERE user_id = ANY($1::uuid[]) AND status = 'valid'
         AND occurred_at >= $2 AND occurred_at < $3
       ORDER BY occurred_at`,
      [userIds, start, end]
    ),
    query(
      `SELECT user_id, hourly_rate, to_char(effective_from, 'YYYY-MM-DD') AS effective_from
       FROM employee_rates WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    ),
    locked
      ? query(
          `SELECT user_id, detail FROM payroll_months WHERE month = $1 AND user_id = ANY($2::uuid[])`,
          [monthKey, userIds]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const group = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id).push(r);
    }
    return m;
  };
  const eventsBy = group(eventsRes.rows);
  const ratesBy = group(ratesRes.rows);
  const snapBy = new Map(snapRes.rows.map((r) => [r.user_id, r.detail]));

  for (const u of usersRes.rows) {
    if (snapBy.has(u.id)) {
      out.set(u.id, { ...snapBy.get(u.id), locked: true, frozen: true });
      continue;
    }
    const shift = u.shift_start
      ? { start: hhmm(u.shift_start), end: hhmm(u.shift_end) }
      : DEFAULT_SHIFT;
    const result = computeMonth({
      monthKey,
      events: eventsBy.get(u.id) || [],
      shift,
      rates: ratesBy.get(u.id) || [],
      penaltyPerMinute: u.penalty_per_minute ?? 0,
    });
    result.stallId = u.stall_id;

    let frozen = false;
    if (locked && result.days.length > 0) {
      frozen = await saveSnapshot(u.id, monthKey, u.stall_id, result);
    }
    out.set(u.id, { ...result, locked, frozen });
  }
  return out;
}

export async function computeMonthForUser(userId, monthKey, now = new Date()) {
  const map = await computeMonthsForUsers([userId], monthKey, now);
  return map.get(userId) || null;
}

async function saveSnapshot(userId, monthKey, stallId, r) {
  const t = r.totals;
  const res = await query(
    `INSERT INTO payroll_months
       (user_id, month, stall_id, days_worked, worked_minutes, late_minutes, early_minutes,
        gross, penalty, net, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id, month) DO NOTHING`,
    [
      userId, monthKey, stallId || null, t.daysWorked, t.workedMinutes, t.lateMinutes,
      t.earlyMinutes, t.gross, t.penalty, t.net, JSON.stringify(r),
    ]
  );
  return res.rowCount >= 0;
}

// Chốt tất cả (nhân viên, tháng) đã kết thúc mà chưa có bản chốt. Gọi khi
// server khởi động, định kỳ, và TRƯỚC khi admin đổi giờ ca/tiền phạt/lương giờ/
// gian hàng — để các tháng đã qua không bị tính lại theo cấu hình mới.
export async function freezeFinishedMonths(now = new Date()) {
  const currentStart = vnMonthRange(vnMonthKey(now)).start;
  const res = await query(
    `SELECT DISTINCT e.user_id,
            to_char(e.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month
     FROM attendance_events e
     WHERE e.status = 'valid' AND e.occurred_at < $1
       AND NOT EXISTS (
         SELECT 1 FROM payroll_months p
         WHERE p.user_id = e.user_id
           AND p.month = to_char(e.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM'))`,
    [currentStart]
  );
  const byMonth = new Map();
  for (const r of res.rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, []);
    byMonth.get(r.month).push(r.user_id);
  }
  for (const [month, ids] of byMonth) {
    await computeMonthsForUsers(ids, month, now);
  }
  return res.rows.length;
}

// Các lần chấm công (hợp lệ) của 1 nhân viên trong 1 ngày 'YYYY-MM-DD' giờ VN
export async function getDayEvents(userId, dateKey, { includeVoided = false } = {}) {
  const start = vnDayStart(dateKey);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const res = await query(
    `SELECT e.id, e.type, e.occurred_at, e.lat, e.lng, e.accuracy_m, e.distance_m,
            e.out_of_range, e.method, e.status, e.note, e.stall_id, e.replaces_event_id, s.name AS stall_name
     FROM attendance_events e LEFT JOIN stalls s ON s.id = e.stall_id
     WHERE e.user_id = $1 AND e.occurred_at >= $2 AND e.occurred_at < $3
       ${includeVoided ? "" : "AND e.status = 'valid'"}
     ORDER BY e.occurred_at`,
    [userId, start, end]
  );
  return res.rows;
}

// Trạng thái hôm nay: lần chấm công tiếp theo là 'in' hay 'out'
export async function getTodayState(userId, now = new Date()) {
  const dateKey = vnDateKey(now);
  const events = await getDayEvents(userId, dateKey);
  const last = events[events.length - 1];
  return {
    date: dateKey,
    events,
    nextType: last && last.type === "in" ? "out" : "in",
  };
}
