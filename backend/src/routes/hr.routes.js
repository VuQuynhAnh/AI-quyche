// API QUẢN TRỊ chấm công & lương (chỉ admin) — mount tại /api/hr:
//  /stalls      : gian hàng (giờ ca, tiền phạt/phút, toạ độ)
//  /employees   : nhân viên (thông tin cơ bản, gian hàng, lương giờ)
//  /attendance  : tổng quan theo tháng, chi tiết ngày, thêm/sửa/huỷ lần chấm
//  /payroll     : bảng lương tháng (+ xuất CSV)
// Quy tắc khoá tháng: mọi thao tác sửa chấm công vào 1 tháng đã qua (giờ VN)
// bị TỪ CHỐI ngay tại API (không chỉ ẩn nút trên giao diện).
import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { query, pool } from "../config/db.js";
import {
  isMonthLocked,
  isValidDateKey,
  isValidMonthKey,
  vnDateKey,
  vnDayStart,
  vnMonthKey,
  vnMonthRange,
  daysInMonth,
} from "../services/payroll.service.js";
import {
  computeMonthsForUsers,
  computeMonthForUser,
  freezeFinishedMonths,
  getDayEvents,
} from "../services/attendance.service.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const bad = (res, msg, status = 400) => res.status(status).json({ error: msg });
const hhmm = (t) => String(t).slice(0, 5);
const toMonth = (q) => q || vnMonthKey(new Date());

function lockedError(res) {
  return res.status(403).json({
    error: "Tháng này đã khoá, không thể chỉnh sửa chấm công.",
    code: "MONTH_LOCKED",
  });
}

// ============================ GIAN HÀNG ============================
function serializeStall(s) {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    radiusM: s.radius_m,
    shiftStart: hhmm(s.shift_start),
    shiftEnd: hhmm(s.shift_end),
    penaltyPerMinute: Number(s.penalty_per_minute),
    isActive: s.is_active,
    employeeCount: s.employee_count ?? undefined,
  };
}

router.get(
  "/stalls",
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT s.*, (SELECT COUNT(*)::int FROM users u WHERE u.stall_id = s.id AND u.is_active) AS employee_count
       FROM stalls s ORDER BY s.created_at`
    );
    res.json({ stalls: r.rows.map(serializeStall) });
  })
);

// Kiểm tra & chuẩn hoá dữ liệu gian hàng; trả {error} hoặc {value}
function parseStallBody(b, { partial }) {
  const v = {};
  if (!partial || b.name !== undefined) {
    if (!b.name || !String(b.name).trim()) return { error: "Thiếu tên gian hàng." };
    v.name = String(b.name).trim().slice(0, 255);
  }
  if (b.address !== undefined) v.address = b.address ? String(b.address).slice(0, 500) : null;
  for (const [key, col] of [["shiftStart", "shift_start"], ["shiftEnd", "shift_end"]]) {
    if (b[key] !== undefined) {
      if (!TIME_RE.test(b[key])) return { error: "Giờ ca phải dạng HH:MM." };
      v[col] = b[key];
    }
  }
  if (b.penaltyPerMinute !== undefined) {
    const p = Number(b.penaltyPerMinute);
    if (!Number.isFinite(p) || p < 0) return { error: "Tiền phạt mỗi phút không hợp lệ." };
    v.penalty_per_minute = p;
  }
  if (b.radiusM !== undefined) {
    const r = Number(b.radiusM);
    if (!Number.isInteger(r) || r < 10 || r > 5000) return { error: "Bán kính phải từ 10 đến 5000 mét." };
    v.radius_m = r;
  }
  if (b.lat !== undefined || b.lng !== undefined) {
    const hasLat = b.lat !== null && b.lat !== "" && b.lat !== undefined;
    const hasLng = b.lng !== null && b.lng !== "" && b.lng !== undefined;
    if (hasLat !== hasLng) return { error: "Cần nhập đủ cả vĩ độ và kinh độ (hoặc để trống cả hai)." };
    if (hasLat) {
      const la = Number(b.lat), ln = Number(b.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
        return { error: "Toạ độ không hợp lệ." };
      }
      v.lat = la; v.lng = ln;
    } else {
      v.lat = null; v.lng = null;
    }
  }
  if (b.isActive !== undefined) v.is_active = !!b.isActive;
  return { value: v };
}

router.post(
  "/stalls",
  asyncHandler(async (req, res) => {
    const p = parseStallBody(req.body || {}, { partial: false });
    if (p.error) return bad(res, p.error);
    const v = p.value;
    if (v.shift_start && v.shift_end && v.shift_end <= v.shift_start) {
      return bad(res, "Giờ kết thúc ca phải sau giờ bắt đầu.");
    }
    const cols = Object.keys(v);
    const r = await query(
      `INSERT INTO stalls (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
      cols.map((c) => v[c])
    );
    res.status(201).json({ stall: serializeStall(r.rows[0]) });
  })
);

router.patch(
  "/stalls/:id",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return bad(res, "ID không hợp lệ.");
    const p = parseStallBody(req.body || {}, { partial: true });
    if (p.error) return bad(res, p.error);
    const v = p.value;
    if (!Object.keys(v).length) return bad(res, "Không có thay đổi.");

    const cur = await query(`SELECT * FROM stalls WHERE id = $1`, [req.params.id]);
    if (!cur.rows[0]) return bad(res, "Không tìm thấy gian hàng.", 404);
    const start = v.shift_start ?? hhmm(cur.rows[0].shift_start);
    const end = v.shift_end ?? hhmm(cur.rows[0].shift_end);
    if (end <= start) return bad(res, "Giờ kết thúc ca phải sau giờ bắt đầu.");

    // Chốt các tháng đã qua TRƯỚC khi đổi cấu hình để lương cũ không bị tính lại
    if (v.shift_start || v.shift_end || v.penalty_per_minute !== undefined) {
      await freezeFinishedMonths();
    }

    const cols = Object.keys(v);
    const r = await query(
      `UPDATE stalls SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING *`,
      [req.params.id, ...cols.map((c) => v[c])]
    );
    res.json({ stall: serializeStall(r.rows[0]) });
  })
);

// Không xoá cứng gian hàng đã có dữ liệu chấm công — chỉ xoá khi hoàn toàn trống
router.delete(
  "/stalls/:id",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return bad(res, "ID không hợp lệ.");
    const used = await query(
      `SELECT (SELECT COUNT(*) FROM users WHERE stall_id = $1)::int AS u,
              (SELECT COUNT(*) FROM attendance_events WHERE stall_id = $1)::int AS e`,
      [req.params.id]
    );
    if (used.rows[0].u > 0 || used.rows[0].e > 0) {
      return bad(res, "Gian hàng đã có nhân viên hoặc dữ liệu chấm công — hãy chọn 'Tạm ngưng' thay vì xoá.", 409);
    }
    await query(`DELETE FROM stalls WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  })
);

// ============================ NHÂN VIÊN ============================
function serializeEmployee(r) {
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    position: r.position,
    isActive: r.is_active,
    stallId: r.stall_id,
    stallName: r.stall_name,
    hourlyRate: r.hourly_rate == null ? null : Number(r.hourly_rate),
    createdAt: r.created_at,
  };
}

const EMPLOYEE_SELECT = `
  SELECT u.id, u.full_name, u.email, u.phone, u.position, u.is_active, u.stall_id, u.created_at,
         s.name AS stall_name,
         (SELECT hourly_rate FROM employee_rates er
            WHERE er.user_id = u.id AND er.effective_from <= $1::date
            ORDER BY er.effective_from DESC LIMIT 1) AS hourly_rate
  FROM users u LEFT JOIN stalls s ON s.id = u.stall_id`;

router.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const params = [vnDateKey(new Date())];
    let where = `WHERE u.role = 'employee'`;
    if (req.query.stallId) {
      if (!UUID_RE.test(req.query.stallId)) return bad(res, "stallId không hợp lệ.");
      params.push(req.query.stallId);
      where += ` AND u.stall_id = $2`;
    }
    const r = await query(`${EMPLOYEE_SELECT} ${where} ORDER BY u.is_active DESC, u.full_name`, params);
    res.json({ employees: r.rows.map(serializeEmployee) });
  })
);

async function stallExists(id) {
  if (!UUID_RE.test(String(id))) return false;
  const r = await query(`SELECT 1 FROM stalls WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

function parseRate(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : null;
}

router.post(
  "/employees",
  asyncHandler(async (req, res) => {
    const { fullName, email, password, phone, position, stallId, hourlyRate } = req.body || {};
    if (!fullName || !email || !password) return bad(res, "Thiếu họ tên, email hoặc mật khẩu.");
    if (String(password).length < 6) return bad(res, "Mật khẩu cần tối thiểu 6 ký tự.");
    const rate = parseRate(hourlyRate ?? 0);
    if (rate === null) return bad(res, "Lương giờ không hợp lệ.");
    if (stallId && !(await stallExists(stallId))) return bad(res, "Gian hàng không tồn tại.");

    const dup = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (dup.rowCount) return bad(res, "Email đã được sử dụng.", 409);

    const hash = await bcrypt.hash(String(password), 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const u = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, stall_id, phone, position)
         VALUES ($1,$2,$3,'employee',$4,$5,$6) RETURNING id`,
        [String(fullName).trim(), String(email).trim(), hash, stallId || null,
         phone ? String(phone).slice(0, 30) : null, position ? String(position).slice(0, 100) : null]
      );
      // Mức lương đầu tiên áp dụng từ rất sớm để mọi ngày đều có mức lương
      await client.query(
        `INSERT INTO employee_rates (user_id, hourly_rate, effective_from, created_by)
         VALUES ($1,$2,'2000-01-01',$3)`,
        [u.rows[0].id, rate, req.user.id]
      );
      await client.query("COMMIT");
      const r = await query(`${EMPLOYEE_SELECT} WHERE u.id = $2`, [vnDateKey(new Date()), u.rows[0].id]);
      res.status(201).json({ employee: serializeEmployee(r.rows[0]) });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/employees/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!UUID_RE.test(id)) return bad(res, "ID không hợp lệ.");
    const b = req.body || {};

    const cur = await query(`SELECT id FROM users WHERE id = $1 AND role = 'employee'`, [id]);
    if (!cur.rows[0]) return bad(res, "Không tìm thấy nhân viên.", 404);

    const sets = [];
    const vals = [id];
    const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

    if (b.fullName !== undefined) {
      if (!String(b.fullName).trim()) return bad(res, "Họ tên không được trống.");
      add("full_name", String(b.fullName).trim());
    }
    if (b.phone !== undefined) add("phone", b.phone ? String(b.phone).slice(0, 30) : null);
    if (b.position !== undefined) add("position", b.position ? String(b.position).slice(0, 100) : null);
    if (b.isActive !== undefined) add("is_active", !!b.isActive);
    if (b.password) {
      if (String(b.password).length < 6) return bad(res, "Mật khẩu cần tối thiểu 6 ký tự.");
      add("password_hash", await bcrypt.hash(String(b.password), 10));
    }
    if (b.stallId !== undefined) {
      if (b.stallId && !(await stallExists(b.stallId))) return bad(res, "Gian hàng không tồn tại.");
      // Đổi gian hàng đổi luôn cấu hình ca của tháng hiện tại — chốt các tháng cũ trước
      await freezeFinishedMonths();
      add("stall_id", b.stallId || null);
    }

    // Đổi lương giờ: thêm dòng lịch sử mới, không được lùi vào tháng đã khoá
    if (b.hourlyRate !== undefined) {
      const rate = parseRate(b.hourlyRate);
      if (rate === null) return bad(res, "Lương giờ không hợp lệ.");
      const from = b.effectiveFrom || vnDateKey(new Date());
      if (!isValidDateKey(from)) return bad(res, "Ngày áp dụng không hợp lệ.");
      if (isMonthLocked(from.slice(0, 7))) {
        return bad(res, "Ngày áp dụng nằm trong tháng đã khoá. Hãy chọn ngày từ đầu tháng này.", 403);
      }
      await freezeFinishedMonths();
      await query(
        `INSERT INTO employee_rates (user_id, hourly_rate, effective_from, created_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, effective_from) DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate, created_by = EXCLUDED.created_by`,
        [id, rate, from, req.user.id]
      );
    }

    if (sets.length) {
      await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, vals);
    }
    const r = await query(`${EMPLOYEE_SELECT} WHERE u.id = $2`, [vnDateKey(new Date()), id]);
    res.json({ employee: serializeEmployee(r.rows[0]) });
  })
);

// ============================ CHẤM CÔNG ============================
// Tổng quan tháng: mỗi nhân viên 1 dòng, mỗi ngày số phút làm + cờ muộn/sớm/thiếu check-out
router.get(
  "/attendance/overview",
  asyncHandler(async (req, res) => {
    const month = toMonth(req.query.month);
    if (!isValidMonthKey(month)) return bad(res, "Tháng không hợp lệ (YYYY-MM).");
    const params = [];
    let where = `WHERE u.role = 'employee'`;
    if (req.query.stallId) {
      if (!UUID_RE.test(req.query.stallId)) return bad(res, "stallId không hợp lệ.");
      params.push(req.query.stallId);
      where += ` AND u.stall_id = $1`;
    }
    // Hiện nhân viên đang hoạt động + người đã có công trong tháng (kể cả đã nghỉ việc)
    const { start, end } = vnMonthRange(month);
    params.push(start, end);
    const users = await query(
      `SELECT u.id, u.full_name, u.stall_id, s.name AS stall_name, u.is_active
       FROM users u LEFT JOIN stalls s ON s.id = u.stall_id
       ${where} AND (u.is_active OR EXISTS (
         SELECT 1 FROM attendance_events e WHERE e.user_id = u.id AND e.status = 'valid'
           AND e.occurred_at >= $${params.length - 1} AND e.occurred_at < $${params.length}))
       ORDER BY u.full_name`,
      params
    );
    const results = await computeMonthsForUsers(users.rows.map((u) => u.id), month);

    res.json({
      month,
      daysInMonth: daysInMonth(month),
      locked: isMonthLocked(month),
      rows: users.rows.map((u) => {
        const r = results.get(u.id);
        return {
          userId: u.id,
          fullName: u.full_name,
          stallName: u.stall_name,
          isActive: u.is_active,
          totals: r.totals,
          days: r.days.map((d) => ({
            date: d.date, workedMinutes: d.workedMinutes, lateMinutes: d.lateMinutes,
            earlyMinutes: d.earlyMinutes, missingCheckout: d.missingCheckout, outOfRange: d.outOfRange,
          })),
        };
      }),
    });
  })
);

// Chi tiết 1 ngày của 1 nhân viên: các lần chấm + vị trí + nhật ký chỉnh sửa
router.get(
  "/attendance/day",
  asyncHandler(async (req, res) => {
    const { userId, date } = req.query;
    if (!UUID_RE.test(String(userId))) return bad(res, "userId không hợp lệ.");
    if (!isValidDateKey(date)) return bad(res, "Ngày không hợp lệ (YYYY-MM-DD).");

    const month = date.slice(0, 7);
    const monthResult = await computeMonthForUser(userId, month);
    const events = await getDayEvents(userId, date, { includeVoided: true });
    const day = monthResult?.days.find((d) => d.date === date) || null;

    res.json({
      date,
      locked: isMonthLocked(month),
      day,
      config: monthResult?.config || null,
      events,
    });
  })
);

// --- Chỉnh sửa chấm công (admin) ---
// Lịch sử KHÔNG thể sửa/xoá. "Chỉnh sửa" = đặt lại giờ vào và/hoặc giờ ra của
// 1 ngày: lần chấm cũ bị đánh dấu huỷ (giữ nguyên giờ gốc + vị trí gốc), 1 lần
// mới method = 'admin' được thêm (không có vị trí, không cần lý do) và trỏ về
// lần cũ. Không có API xoá hay sửa đè từng dòng. Tháng đã qua bị khoá.
async function logEdit(client, { eventId, userId, adminId, action, before, after }) {
  await client.query(
    `INSERT INTO attendance_edits (event_id, user_id, admin_id, action, before, after, reason)
     VALUES ($1,$2,$3,$4,$5,$6,NULL)`,
    [eventId, userId, adminId, action, before ? JSON.stringify(before) : null,
     after ? JSON.stringify(after) : null]
  );
}

router.post(
  "/attendance/day-edit",
  asyncHandler(async (req, res) => {
    const { userId, date, checkIn, checkOut } = req.body || {};
    if (!UUID_RE.test(String(userId))) return bad(res, "userId không hợp lệ.");
    if (!isValidDateKey(date)) return bad(res, "Ngày không hợp lệ (YYYY-MM-DD).");
    for (const t of [checkIn, checkOut]) {
      if (t != null && t !== "" && !TIME_RE.test(t)) return bad(res, "Giờ phải dạng HH:MM.");
    }
    if (isMonthLocked(date.slice(0, 7))) return lockedError(res);

    const u = await query(`SELECT id, stall_id FROM users WHERE id = $1 AND role = 'employee'`, [userId]);
    if (!u.rows[0]) return bad(res, "Không tìm thấy nhân viên.", 404);

    const events = await getDayEvents(userId, date); // chỉ lần còn hiệu lực, theo thứ tự thời gian
    const curIn = events.find((e) => e.type === "in") || null;
    const curOuts = events.filter((e) => e.type === "out");
    const curOut = curOuts.length ? curOuts[curOuts.length - 1] : null;

    const dayStart = vnDayStart(date).getTime();
    const toDate = (hm) => {
      const [h, m] = hm.split(":").map(Number);
      return new Date(dayStart + (h * 60 + m) * 60 * 1000);
    };
    const sameMinute = (a, b) => Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);

    const changes = []; // {type, at, replaces}
    if (checkIn) {
      const at = toDate(checkIn);
      if (!curIn || !sameMinute(curIn.occurred_at, at)) changes.push({ type: "in", at, replaces: curIn });
    }
    if (checkOut) {
      const at = toDate(checkOut);
      if (!curOut || !sameMinute(curOut.occurred_at, at)) changes.push({ type: "out", at, replaces: curOut });
    }
    if (!changes.length) return bad(res, "Không có thay đổi.");

    for (const c of changes) {
      if (c.at.getTime() > Date.now() + 60 * 1000) return bad(res, "Không thể đặt giờ trong tương lai.");
    }

    const finalIn = changes.find((c) => c.type === "in")?.at ?? (curIn ? new Date(curIn.occurred_at) : null);
    const finalOut = changes.find((c) => c.type === "out")?.at ?? (curOut ? new Date(curOut.occurred_at) : null);
    if (finalIn && finalOut && finalOut.getTime() <= finalIn.getTime()) {
      return bad(res, "Giờ ra phải sau giờ vào.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const c of changes) {
        if (c.replaces) {
          await client.query(`UPDATE attendance_events SET status = 'voided' WHERE id = $1`, [c.replaces.id]);
        }
        const ins = await client.query(
          `INSERT INTO attendance_events
             (user_id, stall_id, type, occurred_at, method, created_by, replaces_event_id)
           VALUES ($1,$2,$3,$4,'admin',$5,$6) RETURNING id, occurred_at`,
          [userId, u.rows[0].stall_id, c.type, c.at, req.user.id, c.replaces ? c.replaces.id : null]
        );
        await logEdit(client, {
          eventId: ins.rows[0].id, userId, adminId: req.user.id,
          action: c.replaces ? "update" : "create",
          before: c.replaces ? { type: c.type, occurred_at: c.replaces.occurred_at, method: c.replaces.method } : null,
          after: { type: c.type, occurred_at: ins.rows[0].occurred_at, method: "admin" },
        });
      }
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  })
);

// ============================ BẢNG LƯƠNG ============================
async function payrollRows(month, stallId) {
  const params = [];
  let where = `WHERE u.role = 'employee'`;
  if (stallId) {
    params.push(stallId);
    where += ` AND u.stall_id = $1`;
  }
  const { start, end } = vnMonthRange(month);
  params.push(start, end);
  const users = await query(
    `SELECT u.id, u.full_name, u.position, s.name AS stall_name, u.is_active
     FROM users u LEFT JOIN stalls s ON s.id = u.stall_id
     ${where} AND (u.is_active OR EXISTS (
       SELECT 1 FROM attendance_events e WHERE e.user_id = u.id AND e.status = 'valid'
         AND e.occurred_at >= $${params.length - 1} AND e.occurred_at < $${params.length}))
     ORDER BY u.full_name`,
    params
  );
  const results = await computeMonthsForUsers(users.rows.map((u) => u.id), month);
  return users.rows.map((u) => {
    const r = results.get(u.id);
    return {
      userId: u.id,
      fullName: u.full_name,
      position: u.position,
      stallName: u.stall_name,
      isActive: u.is_active,
      frozen: !!r.frozen,
      daysWorked: r.totals.daysWorked,
      workedMinutes: r.totals.workedMinutes,
      lateMinutes: r.totals.lateMinutes,
      earlyMinutes: r.totals.earlyMinutes,
      gross: r.totals.gross,
      penalty: r.totals.penalty,
      net: r.totals.net,
      // Hôm nay chưa check-out là đang làm, chưa tính là thiếu
      missingCheckoutDays: r.days.filter((d) => d.missingCheckout && d.date !== vnDateKey(new Date())).length,
    };
  });
}

router.get(
  "/payroll",
  asyncHandler(async (req, res) => {
    const month = toMonth(req.query.month);
    if (!isValidMonthKey(month)) return bad(res, "Tháng không hợp lệ (YYYY-MM).");
    if (req.query.stallId && !UUID_RE.test(req.query.stallId)) return bad(res, "stallId không hợp lệ.");
    const rows = await payrollRows(month, req.query.stallId);
    const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
    res.json({
      month,
      locked: isMonthLocked(month),
      rows,
      totals: { gross: sum("gross"), penalty: sum("penalty"), net: sum("net"), workedMinutes: sum("workedMinutes") },
    });
  })
);

router.get(
  "/payroll/export",
  asyncHandler(async (req, res) => {
    const month = toMonth(req.query.month);
    if (!isValidMonthKey(month)) return bad(res, "Tháng không hợp lệ (YYYY-MM).");
    if (req.query.stallId && !UUID_RE.test(req.query.stallId)) return bad(res, "stallId không hợp lệ.");
    const rows = await payrollRows(month, req.query.stallId);
    // Chống "CSV injection": ô bắt đầu bằng = + - @ bị Excel hiểu là công thức
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ["Nhân viên", "Gian hàng", "Số ngày công", "Giờ làm", "Phút muộn", "Phút về sớm", "Lương gộp", "Tiền phạt", "Thực nhận"];
    const lines = [header.map(cell).join(",")];
    for (const r of rows) {
      lines.push([
        r.fullName, r.stallName || "", r.daysWorked, (r.workedMinutes / 60).toFixed(2),
        r.lateMinutes, r.earlyMinutes, r.gross, r.penalty, r.net,
      ].map(cell).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bang-luong-${month}.csv"`);
    res.send("﻿" + lines.join("\r\n"));
  })
);

router.get(
  "/payroll/:userId",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.userId)) return bad(res, "userId không hợp lệ.");
    const month = toMonth(req.query.month);
    if (!isValidMonthKey(month)) return bad(res, "Tháng không hợp lệ (YYYY-MM).");
    const u = await query(`SELECT id, full_name FROM users WHERE id = $1 AND role = 'employee'`, [req.params.userId]);
    if (!u.rows[0]) return bad(res, "Không tìm thấy nhân viên.", 404);
    const result = await computeMonthForUser(req.params.userId, month);
    res.json({ employee: { id: u.rows[0].id, fullName: u.rows[0].full_name }, result });
  })
);

export default router;
