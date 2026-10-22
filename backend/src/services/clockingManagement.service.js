// QUẢN LÝ CHẤM CÔNG (admin cửa hàng): bảng công tháng, chi tiết 1 ngày, sửa
// giờ vào/ra. Tháng đã chốt lương thì không sửa được (xem timesheet.service).
import { CLOCKING_ACTION, CLOCKING_SOURCE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { assertUuid, TIME_RE } from "../utils/validators.js";
import { addDays, isValidDateKey, isValidMonthKey, monthDateRange, vnDayStart, vnMonthKey } from "../utils/vnTime.js";
import { hasAttendance } from "./payrollCalculator.js";
import { serializeClocking, serializeClockingHistory } from "./serializers.js";

const MINUTE_MS = 60 * 1000;
const MAX_OVERVIEW_DAYS = 31;

export function createClockingManagementService({
  transaction,
  employeeRepository,
  clockingRepository,
  timesheetService,
}) {
  async function findEmployeeOrThrow(actor, employeeId) {
    assertUuid(employeeId, "employeeId không hợp lệ.");
    const employee = await employeeRepository.findInStore(employeeId, actor.storeId);
    if (!employee) throw AppError.notFound("Không tìm thấy nhân viên.");
    return employee;
  }

  // Bảng công theo khoảng ngày (tuần/tháng): mỗi nhân viên 1 dòng, mỗi ngày số
  // phút làm + cờ muộn/sớm/thiếu check-out. Truyền `month` (YYYY-MM) hoặc
  // `from` + `to` (YYYY-MM-DD, tối đa 31 ngày); không truyền gì = tháng hiện tại.
  async function getOverview(actor, { month, from, to } = {}) {
    let firstDate;
    let lastDate;
    if (from || to) {
      if (!isValidDateKey(from) || !isValidDateKey(to)) throw AppError.badRequest("Ngày không hợp lệ (YYYY-MM-DD).");
      if (from > to) throw AppError.badRequest("Ngày bắt đầu phải trước ngày kết thúc.");
      if (addDays(from, MAX_OVERVIEW_DAYS - 1) < to) {
        throw AppError.badRequest(`Chỉ xem tối đa ${MAX_OVERVIEW_DAYS} ngày một lần.`);
      }
      [firstDate, lastDate] = [from, to];
    } else {
      const monthKey = month || vnMonthKey(new Date());
      if (!isValidMonthKey(monthKey)) throw AppError.badRequest("Tháng không hợp lệ (YYYY-MM).");
      ({ firstDate, lastDate } = monthDateRange(monthKey));
    }

    const dates = [];
    for (let d = firstDate; d <= lastDate; d = addDays(d, 1)) dates.push(d);
    // Khoảng ngày có thể vắt qua 2 tháng (tuần cuối/đầu tháng) — mỗi tháng chốt lương riêng
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];

    const [employees, clockings, lockFlags] = await Promise.all([
      employeeRepository.listForPeriod({ storeId: actor.storeId, firstDate, lastDate }),
      clockingRepository.listByStoreAndPeriod({ storeId: actor.storeId, firstDate, lastDate }),
      Promise.all(months.map((m) => timesheetService.isMonthFinalized(actor.storeId, m))),
    ]);

    return {
      from: firstDate,
      to: lastDate,
      dates,
      lockedMonths: months.filter((_, i) => lockFlags[i]),
      rows: employees.map((e) => {
        const days = clockings.filter((c) => c.employee_id === e.id && hasAttendance(c)).map(serializeClocking);
        const sum = (field) => days.reduce((s, d) => s + d[field], 0);
        return {
          employeeId: e.id,
          fullName: e.full_name,
          jobTitle: e.job_title,
          isActive: e.is_active,
          totals: {
            workedMinutes: sum("workedMinutes"),
            lateMinutes: sum("lateMinutes"),
            earlyLeaveMinutes: sum("earlyLeaveMinutes"),
          },
          days,
        };
      }),
    };
  }

  // Chi tiết 1 ngày: tổng hợp + toàn bộ lịch sử (kể cả lần đã bị thay) kèm vị trí
  async function getDayDetail(actor, { employeeId, date } = {}) {
    const employee = await findEmployeeOrThrow(actor, employeeId);
    if (!isValidDateKey(date)) throw AppError.badRequest("Ngày không hợp lệ (YYYY-MM-DD).");

    const [clocking, locked] = await Promise.all([
      clockingRepository.findByEmployeeAndDate(employee.id, date),
      timesheetService.isMonthFinalized(actor.storeId, date.slice(0, 7)),
    ]);
    // Hiển thị dạng nhật ký thay đổi (theo thời điểm ghi nhận), không theo giờ chấm
    const histories = clocking ? await clockingRepository.listHistoryLog(clocking.id) : [];

    return {
      date,
      locked,
      clocking: clocking ? serializeClocking(clocking) : null,
      histories: histories.map((h) => serializeClockingHistory(h)),
    };
  }

  // Lịch sử KHÔNG thể sửa/xoá. "Chỉnh sửa" = đặt lại giờ vào và/hoặc giờ ra của
  // 1 ngày: lần cũ bị huỷ (giữ nguyên giờ gốc + vị trí gốc), 1 lần mới
  // source = admin được thêm và trỏ về lần cũ.
  async function editDay(actor, { employeeId, date, checkInTime, checkOutTime } = {}) {
    const employee = await findEmployeeOrThrow(actor, employeeId);
    if (!isValidDateKey(date)) throw AppError.badRequest("Ngày không hợp lệ (YYYY-MM-DD).");
    for (const t of [checkInTime, checkOutTime]) {
      if (t != null && t !== "" && !TIME_RE.test(t)) throw AppError.badRequest("Giờ phải dạng HH:MM.");
    }

    const dayStart = vnDayStart(date).getTime();
    const toDate = (hm) => {
      const [h, m] = hm.split(":").map(Number);
      return new Date(dayStart + (h * 60 + m) * MINUTE_MS);
    };
    const sameMinute = (a, b) => Math.floor(new Date(a).getTime() / MINUTE_MS) === Math.floor(new Date(b).getTime() / MINUTE_MS);

    await transaction.run(async (tx) => {
      await timesheetService.assertMonthEditable(actor.storeId, date.slice(0, 7), tx);
      const clocking = await timesheetService.lockDailyClocking(
        { storeId: actor.storeId, employeeId: employee.id, workDate: date },
        tx
      );
      const histories = await clockingRepository.listHistories(clocking.id, {}, tx);
      const currentIn = histories.find((h) => h.action_type === CLOCKING_ACTION.CHECK_IN) || null;
      const currentOut = histories.filter((h) => h.action_type === CLOCKING_ACTION.CHECK_OUT).pop() || null;

      const changes = []; // { actionType, clockTime, replaces }
      if (checkInTime) {
        const at = toDate(checkInTime);
        if (!currentIn || !sameMinute(currentIn.clock_time, at)) {
          changes.push({ actionType: CLOCKING_ACTION.CHECK_IN, clockTime: at, replaces: currentIn });
        }
      }
      if (checkOutTime) {
        const at = toDate(checkOutTime);
        if (!currentOut || !sameMinute(currentOut.clock_time, at)) {
          changes.push({ actionType: CLOCKING_ACTION.CHECK_OUT, clockTime: at, replaces: currentOut });
        }
      }
      if (!changes.length) throw AppError.badRequest("Không có thay đổi.");
      if (changes.some((c) => c.clockTime.getTime() > Date.now() + MINUTE_MS)) {
        throw AppError.badRequest("Không thể đặt giờ trong tương lai.");
      }

      const finalIn = changes.find((c) => c.actionType === CLOCKING_ACTION.CHECK_IN)?.clockTime
        ?? (currentIn ? new Date(currentIn.clock_time) : null);
      const finalOut = changes.find((c) => c.actionType === CLOCKING_ACTION.CHECK_OUT)?.clockTime
        ?? (currentOut ? new Date(currentOut.clock_time) : null);
      if (finalIn && finalOut && finalOut.getTime() <= finalIn.getTime()) {
        throw AppError.badRequest("Giờ ra phải sau giờ vào.");
      }

      for (const change of changes) {
        if (change.replaces) await clockingRepository.voidHistory(change.replaces.id, tx);
        await clockingRepository.createHistory(
          {
            clockingId: clocking.id,
            actionType: change.actionType,
            clockTime: change.clockTime,
            source: CLOCKING_SOURCE.ADMIN,
            replacedHistoryId: change.replaces?.id ?? null,
            createdByAccountId: actor.id,
          },
          tx
        );
      }
      await timesheetService.recalculateClocking(clocking, tx);
    });

    return getDayDetail(actor, { employeeId, date });
  }

  return { getOverview, getDayDetail, editDay };
}
