// Tính công & lương (hàm thuần). Mốc giờ dựng tường minh theo +07:00 để kết
// quả không phụ thuộc múi giờ của máy chạy test.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLOCKING_ACTION } from "../src/constants/enums.js";
import { calculateEmployeePay, summarizeClockingDay } from "../src/services/payrollCalculator.js";

const WORK_DATE = "2026-09-15";
const at = (time) => new Date(`${WORK_DATE}T${time}+07:00`);
const checkIn = (time, extra = {}) => ({ action_type: CLOCKING_ACTION.CHECK_IN, clock_time: at(time), ...extra });
const checkOut = (time, extra = {}) => ({ action_type: CLOCKING_ACTION.CHECK_OUT, clock_time: at(time), ...extra });

// Ca chuẩn 08:00–17:00 = 540 phút
const summarize = (histories) =>
  summarizeClockingDay({ workDate: WORK_DATE, shiftStartTime: "08:00", shiftEndTime: "17:00", histories });

describe("summarizeClockingDay — tổng hợp 1 ngày chấm công", () => {
  it("đúng giờ vào và ra: đủ 540 phút, không muộn, không sớm", () => {
    const day = summarize([checkIn("08:00:00"), checkOut("17:00:00")]);
    assert.equal(day.workedMinutes, 540);
    assert.equal(day.lateMinutes, 0);
    assert.equal(day.earlyLeaveMinutes, 0);
    assert.equal(day.isMissingCheckOut, false);
    assert.deepEqual(day.checkInTime, at("08:00:00"));
    assert.deepEqual(day.checkOutTime, at("17:00:00"));
  });

  it("đến sớm và về muộn không được tính thêm giờ ngoài ca (PAY-BR-001)", () => {
    const day = summarize([checkIn("07:30:00"), checkOut("18:00:00")]);
    assert.equal(day.workedMinutes, 540);
    assert.equal(day.lateMinutes, 0);
    assert.equal(day.earlyLeaveMinutes, 0);
  });

  it("đi muộn tính theo phút, làm tròn xuống (PAY-BR-002)", () => {
    const day = summarize([checkIn("08:15:59"), checkOut("17:00:00")]);
    assert.equal(day.lateMinutes, 15);
    assert.equal(day.workedMinutes, 524); // 8 giờ 44 phút 01 giây
  });

  it("về sớm tính theo phút, làm tròn xuống (PAY-BR-002)", () => {
    const day = summarize([checkIn("08:00:00"), checkOut("16:30:30")]);
    assert.equal(day.earlyLeaveMinutes, 29);
    assert.equal(day.workedMinutes, 510);
  });

  it("có check-in mà không có check-out: 0 phút làm, gắn cờ thiếu check-out (PAY-BR-005)", () => {
    const day = summarize([checkIn("08:00:00")]);
    assert.equal(day.workedMinutes, 0);
    assert.equal(day.isMissingCheckOut, true);
    assert.equal(day.earlyLeaveMinutes, 0);
    assert.equal(day.checkOutTime, null);
  });

  it("quên check-in nhưng có check-out: giữ giờ ra để tính về sớm, giờ làm = 0", () => {
    const day = summarize([checkOut("16:00:00")]);
    assert.equal(day.workedMinutes, 0);
    assert.equal(day.checkInTime, null);
    assert.equal(day.earlyLeaveMinutes, 60);
    assert.equal(day.isMissingCheckOut, false);
  });

  it("bấm check-out nhiều lần: lần cuối cùng là giờ ra", () => {
    const day = summarize([checkIn("08:00:00"), checkOut("12:00:00"), checkOut("17:00:00")]);
    assert.deepEqual(day.checkOutTime, at("17:00:00"));
    assert.equal(day.workedMinutes, 540);
  });

  it("check-out trước check-in không được tính là giờ ra của ngày", () => {
    const day = summarize([checkOut("07:00:00"), checkIn("08:00:00")]);
    assert.equal(day.checkOutTime, null);
    assert.equal(day.isMissingCheckOut, true);
    assert.equal(day.workedMinutes, 0);
  });

  it("thứ tự lịch sử truyền vào không ảnh hưởng kết quả (tự sắp theo giờ chấm)", () => {
    const day = summarize([checkOut("17:00:00"), checkIn("08:10:00")]);
    assert.equal(day.lateMinutes, 10);
    assert.equal(day.workedMinutes, 530);
  });

  it("vào sau giờ tan ca: phút muộn không vượt quá độ dài ca, không có phút làm", () => {
    const day = summarize([checkIn("18:00:00"), checkOut("19:00:00")]);
    assert.equal(day.lateMinutes, 540);
    assert.equal(day.earlyLeaveMinutes, 0);
    assert.equal(day.workedMinutes, 0);
  });

  it("vào muộn và ra sớm cùng ngày: giờ làm = ca − muộn − sớm", () => {
    // check-out 09:00 nằm trước check-in nên bị bỏ qua; giờ ra là 13:00
    const day = summarize([checkIn("12:00:00"), checkOut("09:00:00"), checkOut("13:00:00")]);
    assert.equal(day.lateMinutes, 240);
    assert.equal(day.earlyLeaveMinutes, 240);
    assert.equal(day.workedMinutes, 540 - 240 - 240);
  });

  it("chỉ cần 1 lần chấm ngoài phạm vi là ngày bị gắn cờ ngoài phạm vi (CLK-BR-008)", () => {
    const day = summarize([checkIn("08:00:00", { is_out_of_range: true }), checkOut("17:00:00")]);
    assert.equal(day.isOutOfRange, true);
    assert.equal(summarize([checkIn("08:00:00"), checkOut("17:00:00")]).isOutOfRange, false);
  });

  it("ngày không có lần chấm nào: mọi chỉ số bằng 0", () => {
    const day = summarize([]);
    assert.deepEqual(
      { ...day },
      {
        checkInTime: null,
        checkOutTime: null,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        isMissingCheckOut: false,
        isOutOfRange: false,
      }
    );
  });
});

// Dòng clocking đã tổng hợp (giống bảng clocking trong DB)
const clockingRow = (workDate, overrides = {}) => ({
  work_date: workDate,
  check_in_time: new Date(`${workDate}T08:00:00+07:00`),
  check_out_time: new Date(`${workDate}T17:00:00+07:00`),
  worked_minutes: 540,
  late_minutes: 0,
  early_leave_minutes: 0,
  is_missing_check_out: false,
  is_out_of_range: false,
  ...overrides,
});

describe("calculateEmployeePay — lương tháng của 1 nhân viên", () => {
  it("lương ngày = lương giờ × phút làm / 60; phạt = (muộn + sớm) × phạt/phút (PAY-BR-003)", () => {
    const pay = calculateEmployeePay({
      clockings: [clockingRow("2026-09-01", { worked_minutes: 480, late_minutes: 10, early_leave_minutes: 5 })],
      hourlyWage: 30000,
      penaltyAmountPerMinute: 1000,
      todayKey: "2026-10-01",
    });
    assert.equal(pay.grossSalary, 240000);
    assert.equal(pay.penaltyAmount, 15000);
    assert.equal(pay.netSalary, 225000);
    assert.equal(pay.dailyBreakdown[0].netSalary, 225000);
  });

  it("làm tròn đến đồng ở TỪNG NGÀY, nên tổng tháng = tổng các ngày (PAY-BR-003)", () => {
    // 25.000đ/giờ × 1 phút = 416,67đ -> 417đ mỗi ngày; 2 ngày = 834đ (không phải 833đ)
    const pay = calculateEmployeePay({
      clockings: [clockingRow("2026-09-01", { worked_minutes: 1 }), clockingRow("2026-09-02", { worked_minutes: 1 })],
      hourlyWage: 25000,
      penaltyAmountPerMinute: 0,
      todayKey: "2026-10-01",
    });
    assert.deepEqual(pay.dailyBreakdown.map((d) => d.grossSalary), [417, 417]);
    assert.equal(pay.grossSalary, 834);
  });

  it("thực nhận cả tháng không âm; lương từng ngày được phép âm (PAY-BR-004)", () => {
    const pay = calculateEmployeePay({
      clockings: [clockingRow("2026-09-01", { worked_minutes: 2, late_minutes: 60 })],
      hourlyWage: 30000,
      penaltyAmountPerMinute: 1000,
      todayKey: "2026-10-01",
    });
    assert.equal(pay.grossSalary, 1000);
    assert.equal(pay.penaltyAmount, 60000);
    assert.equal(pay.dailyBreakdown[0].netSalary, -59000);
    assert.equal(pay.netSalary, 0);
  });

  it("ngày không có lần chấm nào không tính là ngày công", () => {
    const pay = calculateEmployeePay({
      clockings: [
        clockingRow("2026-09-01"),
        clockingRow("2026-09-02", { check_in_time: null, check_out_time: null, worked_minutes: 0 }),
      ],
      hourlyWage: 30000,
      penaltyAmountPerMinute: 0,
      todayKey: "2026-10-01",
    });
    assert.equal(pay.workedDays, 1);
  });

  it("hôm nay chưa check-out là đang làm, chưa tính vào số ngày thiếu check-out", () => {
    const missing = { check_out_time: null, worked_minutes: 0, is_missing_check_out: true };
    const pay = calculateEmployeePay({
      clockings: [clockingRow("2026-09-14", missing), clockingRow("2026-09-15", missing)],
      hourlyWage: 30000,
      penaltyAmountPerMinute: 0,
      todayKey: "2026-09-15",
    });
    assert.equal(pay.missingCheckOutDays, 1);
  });

  it("chi tiết theo ngày được sắp theo ngày làm việc", () => {
    const pay = calculateEmployeePay({
      clockings: [clockingRow("2026-09-03"), clockingRow("2026-09-01"), clockingRow("2026-09-02")],
      hourlyWage: 30000,
      penaltyAmountPerMinute: 0,
      todayKey: "2026-10-01",
    });
    assert.deepEqual(pay.dailyBreakdown.map((d) => d.workDate), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("lương giờ và mức phạt dạng chuỗi NUMERIC từ DB được đổi sang số", () => {
    const pay = calculateEmployeePay({
      clockings: [clockingRow("2026-09-01", { late_minutes: 1 })],
      hourlyWage: "30000.00",
      penaltyAmountPerMinute: "500.00",
      todayKey: "2026-10-01",
    });
    assert.equal(pay.hourlyWage, 30000);
    assert.equal(pay.grossSalary, 270000);
    assert.equal(pay.penaltyAmount, 500);
  });
});
