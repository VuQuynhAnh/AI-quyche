// Logic tính công & lương — TOÀN BỘ là hàm thuần (không đụng DB).
//
// Quy ước:
//  - Múi giờ nghiệp vụ cố định Asia/Ho_Chi_Minh — xem utils/vnTime.js.
//  - Số phút làm = phần thời gian làm việc nằm TRONG khung ca. Đến sớm hơn giờ
//    vào ca không được tính thêm; về muộn hơn giờ tan ca cũng không.
//  - Đi muộn = (giờ check-in đầu tiên − giờ vào ca), về sớm = (giờ tan ca −
//    giờ check-out cuối cùng), làm tròn XUỐNG phút.
//  - Lần check-in không có check-out tương ứng: không tính phút nào cho đoạn đó
//    và gắn cờ thiếu check-out để admin sửa.
//  - Lương ngày = lương giờ × phút làm / 60; phạt ngày = (muộn + sớm) × tiền
//    phạt mỗi phút. Làm tròn đến đồng ở MỖI NGÀY để tổng tháng = tổng các ngày.
//  - Lương thực nhận cả tháng không âm: net = max(0, gross − penalty).
import { CLOCKING_ACTION } from "../constants/enums.js";
import { vnDayStart, timeToMinutes } from "../utils/vnTime.js";

const MINUTE_MS = 60 * 1000;

// Tổng hợp 1 ngày chấm công từ các lần bấm HỢP LỆ của ngày đó.
// histories: [{ action_type, clock_time, is_out_of_range }]
export function summarizeClockingDay({ workDate, shiftStartTime, shiftEndTime, histories }) {
  const dayStart = vnDayStart(workDate).getTime();
  const shiftStart = dayStart + timeToMinutes(shiftStartTime) * MINUTE_MS;
  const shiftEnd = dayStart + timeToMinutes(shiftEndTime) * MINUTE_MS;
  const shiftMinutes = Math.round((shiftEnd - shiftStart) / MINUTE_MS);

  const sorted = histories
    .map((h) => ({ ...h, t: new Date(h.clock_time).getTime() }))
    .sort((a, b) => a.t - b.t);

  let open = null;
  let workedMs = 0;
  let firstIn = null;
  let lastOut = null;

  for (const h of sorted) {
    if (h.action_type === CLOCKING_ACTION.CHECK_IN) {
      if (!open) open = h; // check-in trùng liên tiếp: giữ lần đầu
      if (!firstIn) firstIn = h;
    } else if (open) {
      const from = Math.max(open.t, shiftStart);
      const to = Math.min(h.t, shiftEnd);
      if (to > from) workedMs += to - from;
      lastOut = h;
      open = null;
    }
  }

  const isMissingCheckOut = open !== null;
  const lateMinutes = firstIn
    ? Math.min(shiftMinutes, Math.max(0, Math.floor((firstIn.t - shiftStart) / MINUTE_MS)))
    : 0;
  const earlyLeaveMinutes =
    lastOut && !isMissingCheckOut
      ? Math.min(shiftMinutes - lateMinutes, Math.max(0, Math.floor((shiftEnd - lastOut.t) / MINUTE_MS)))
      : 0;

  return {
    checkInTime: firstIn ? new Date(firstIn.t) : null,
    checkOutTime: lastOut ? new Date(lastOut.t) : null,
    workedMinutes: Math.floor(workedMs / MINUTE_MS),
    lateMinutes,
    earlyLeaveMinutes,
    isMissingCheckOut,
    isOutOfRange: sorted.some((h) => h.is_out_of_range),
  };
}

// Ngày có ít nhất 1 lần chấm công còn hiệu lực
export const hasAttendance = (clocking) => clocking.check_in_time != null || clocking.check_out_time != null;

// Tính lương tháng của 1 nhân viên từ các dòng clocking trong tháng.
// todayKey: ngày hôm nay — hôm nay chưa check-out là "đang làm", chưa tính thiếu.
export function calculateEmployeePay({ clockings, hourlyWage, penaltyAmountPerMinute, todayKey }) {
  const wage = Number(hourlyWage) || 0;
  const penaltyRate = Number(penaltyAmountPerMinute) || 0;

  const dailyBreakdown = clockings
    .filter(hasAttendance)
    .sort((a, b) => (a.work_date < b.work_date ? -1 : 1))
    .map((c) => {
      const grossSalary = Math.round((wage * c.worked_minutes) / 60);
      const penaltyAmount = Math.round((c.late_minutes + c.early_leave_minutes) * penaltyRate);
      return {
        workDate: c.work_date,
        checkInTime: c.check_in_time,
        checkOutTime: c.check_out_time,
        workedMinutes: c.worked_minutes,
        lateMinutes: c.late_minutes,
        earlyLeaveMinutes: c.early_leave_minutes,
        isMissingCheckOut: c.is_missing_check_out,
        isOutOfRange: c.is_out_of_range,
        grossSalary,
        penaltyAmount,
        netSalary: grossSalary - penaltyAmount,
      };
    });

  const sum = (field) => dailyBreakdown.reduce((s, d) => s + d[field], 0);
  const grossSalary = sum("grossSalary");
  const penaltyAmount = sum("penaltyAmount");

  return {
    hourlyWage: wage,
    workedDays: dailyBreakdown.length,
    workedMinutes: sum("workedMinutes"),
    lateMinutes: sum("lateMinutes"),
    earlyLeaveMinutes: sum("earlyLeaveMinutes"),
    missingCheckOutDays: dailyBreakdown.filter((d) => d.isMissingCheckOut && d.workDate !== todayKey).length,
    grossSalary,
    penaltyAmount,
    netSalary: Math.max(0, grossSalary - penaltyAmount),
    dailyBreakdown,
  };
}
