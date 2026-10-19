// API chấm công cho NHÂN VIÊN (dùng trên điện thoại):
//  - GET  /api/attendance/stall/:id   : (công khai) tên gian hàng cho trang QR
//  - GET  /api/attendance/me/today    : trạng thái hôm nay + lần chấm tiếp theo
//  - POST /api/attendance/check       : chấm công vào/ra (cần GPS + QR gian hàng)
//  - GET  /api/attendance/me/month    : lịch sử cả tháng theo ngày + lương tạm tính
//  - GET  /api/attendance/me/day      : các lần chấm công của 1 ngày
// Thời điểm chấm công luôn do SERVER ghi (không nhận giờ từ client).
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { query } from "../config/db.js";
import {
  distanceMeters,
  isValidDateKey,
  isValidMonthKey,
  vnMonthKey,
} from "../services/payroll.service.js";
import {
  computeMonthForUser,
  getDayEvents,
  getTodayState,
} from "../services/attendance.service.js";

const router = Router();
const MIN_GAP_MS = 20 * 1000; // chặn bấm đúp liên tiếp

// Trang QR: chỉ trả tên gian hàng (không lộ thông tin nhạy cảm) để hiển thị
// "Bạn đang ở gian hàng X" trước khi đăng nhập.
router.get(
  "/stall/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "Không tìm thấy gian hàng." });
    const r = await query(`SELECT id, name, address FROM stalls WHERE id = $1 AND is_active = true`, [id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Không tìm thấy gian hàng." });
    res.json({ stall: r.rows[0] });
  })
);

router.use(requireAuth);

async function loadMe(userId) {
  const r = await query(
    `SELECT u.id, u.full_name, u.is_active, u.stall_id,
            s.name AS stall_name, s.lat, s.lng, s.radius_m, s.is_active AS stall_active,
            s.shift_start, s.shift_end, s.penalty_per_minute
     FROM users u LEFT JOIN stalls s ON s.id = u.stall_id
     WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0];
}

router.get(
  "/me/today",
  asyncHandler(async (req, res) => {
    const me = await loadMe(req.user.id);
    if (!me) return res.status(404).json({ error: "Không tìm thấy tài khoản." });
    const state = await getTodayState(req.user.id);
    res.json({
      ...state,
      stall: me.stall_id
        ? {
            id: me.stall_id,
            name: me.stall_name,
            shiftStart: String(me.shift_start).slice(0, 5),
            shiftEnd: String(me.shift_end).slice(0, 5),
          }
        : null,
    });
  })
);

router.post(
  "/check",
  asyncHandler(async (req, res) => {
    const { type, stallId, lat, lng, accuracy, deviceId } = req.body || {};

    const la = Number(lat);
    const ln = Number(lng);
    if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln) ||
        Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return res.status(400).json({ error: "Cần bật định vị (GPS) để chấm công." });
    }
    if (!stallId) {
      return res.status(400).json({ error: "Hãy quét QR tại gian hàng để chấm công." });
    }

    const me = await loadMe(req.user.id);
    if (!me || !me.is_active) return res.status(403).json({ error: "Tài khoản đã bị vô hiệu hoá." });
    if (!me.stall_id) return res.status(403).json({ error: "Bạn chưa được gán gian hàng. Liên hệ quản trị viên." });
    if (me.stall_id !== stallId) {
      return res.status(403).json({ error: "QR này không phải gian hàng của bạn." });
    }
    if (!me.stall_active) return res.status(403).json({ error: "Gian hàng đang tạm ngưng." });

    const state = await getTodayState(req.user.id);
    if (type && type !== state.nextType) {
      return res.status(409).json({
        error: state.nextType === "out"
          ? "Bạn đã check-in rồi. Hãy tải lại trang để check-out."
          : "Bạn chưa check-in. Hãy tải lại trang.",
        nextType: state.nextType,
      });
    }

    const last = state.events[state.events.length - 1];
    if (last && Date.now() - new Date(last.occurred_at).getTime() < MIN_GAP_MS) {
      return res.status(429).json({ error: "Bạn vừa chấm công xong, vui lòng đợi vài giây." });
    }

    let distance = null;
    let outOfRange = false;
    if (me.lat != null && me.lng != null) {
      distance = Math.round(distanceMeters(la, ln, me.lat, me.lng));
      outOfRange = distance > me.radius_m;
    }

    const acc = Number(accuracy);
    const ins = await query(
      `INSERT INTO attendance_events
         (user_id, stall_id, type, lat, lng, accuracy_m, distance_m, out_of_range, device_id, method, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'self',$1)
       RETURNING id, type, occurred_at, distance_m, out_of_range`,
      [
        req.user.id, me.stall_id, state.nextType, la, ln,
        Number.isFinite(acc) ? acc : null, distance, outOfRange,
        typeof deviceId === "string" ? deviceId.slice(0, 100) : null,
      ]
    );

    res.status(201).json({
      event: ins.rows[0],
      nextType: state.nextType === "in" ? "out" : "in",
    });
  })
);

router.get(
  "/me/month",
  asyncHandler(async (req, res) => {
    const month = req.query.month || vnMonthKey(new Date());
    if (!isValidMonthKey(month)) return res.status(400).json({ error: "Tháng không hợp lệ (YYYY-MM)." });
    const result = await computeMonthForUser(req.user.id, month);
    res.json({ result });
  })
);

router.get(
  "/me/day",
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    if (!isValidDateKey(date)) return res.status(400).json({ error: "Ngày không hợp lệ (YYYY-MM-DD)." });
    // Gồm cả các lần đã bị huỷ/thay thế để nhân viên thấy đầy đủ lịch sử thay đổi
    const events = await getDayEvents(req.user.id, date, { includeVoided: true });
    // Nhân viên không cần thấy toạ độ chi tiết, chỉ cần giờ/loại/nguồn/trạng thái
    res.json({
      date,
      events: events.map((e) => ({
        id: e.id, type: e.type, occurred_at: e.occurred_at, method: e.method, status: e.status,
        replaces_event_id: e.replaces_event_id,
        note: e.method === "admin" ? e.note : null, out_of_range: e.out_of_range,
      })),
    });
  })
);

export default router;
