import test from "node:test";
import assert from "node:assert/strict";
import {
  vnDateKey, vnMonthKey, vnMonthRange, isMonthLocked, computeDay, computeMonth,
  rateForDate, distanceMeters, prevMonthKey, daysInMonth,
} from "../src/services/payroll.service.js";

// Giờ VN -> ISO UTC (VN = UTC+7)
const vn = (d, hm) => new Date(`${d}T${hm}:00+07:00`).toISOString();
const shift = { start: "08:00", end: "17:00" };
const ev = (type, d, hm, extra = {}) => ({ type, occurred_at: vn(d, hm), ...extra });

test("ngày/tháng tính theo giờ VN, không theo UTC", () => {
  // 23:30 giờ VN ngày 31/10 = 16:30 UTC cùng ngày; 00:30 VN ngày 1/11 = 17:30 UTC 31/10
  assert.equal(vnDateKey("2026-10-31T17:30:00Z"), "2026-11-01");
  assert.equal(vnMonthKey("2026-10-31T17:30:00Z"), "2026-11");
  assert.equal(vnMonthKey("2026-10-31T16:30:00Z"), "2026-10");
});

test("khoá tháng: cứng từ 00:00 ngày 1 giờ VN", () => {
  assert.equal(isMonthLocked("2026-10", new Date("2026-10-31T16:59:59Z")), false); // 23:59:59 VN 31/10
  assert.equal(isMonthLocked("2026-10", new Date("2026-10-31T17:00:00Z")), true); // 00:00 VN 1/11
  assert.equal(isMonthLocked("2026-11", new Date("2026-11-15T00:00:00Z")), false);
});

test("khoảng tháng, tháng trước, số ngày", () => {
  const r = vnMonthRange("2026-10");
  assert.equal(r.start.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(r.end.toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(prevMonthKey("2026-01"), "2025-12");
  assert.equal(daysInMonth("2026-02"), 28);
});

test("đi đúng giờ, đủ ca: 9 tiếng, không phạt", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [ev("in", "2026-10-05", "08:00"), ev("out", "2026-10-05", "17:00")],
    shift, hourlyRate: 30000, penaltyPerMinute: 1000,
  });
  assert.equal(d.workedMinutes, 540);
  assert.equal(d.lateMinutes, 0);
  assert.equal(d.earlyMinutes, 0);
  assert.equal(d.gross, 270000);
  assert.equal(d.penalty, 0);
});

test("muộn 15 phút + về sớm 30 phút: trừ giờ và phạt thêm", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [ev("in", "2026-10-05", "08:15"), ev("out", "2026-10-05", "16:30")],
    shift, hourlyRate: 60000, penaltyPerMinute: 1000,
  });
  assert.equal(d.lateMinutes, 15);
  assert.equal(d.earlyMinutes, 30);
  assert.equal(d.workedMinutes, 495); // 8h15
  assert.equal(d.gross, 495000);
  assert.equal(d.penalty, 45000);
  assert.equal(d.net, 450000);
});

test("đến sớm / về muộn không được tính thêm", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [ev("in", "2026-10-05", "07:30"), ev("out", "2026-10-05", "18:00")],
    shift, hourlyRate: 60000, penaltyPerMinute: 1000,
  });
  assert.equal(d.workedMinutes, 540);
  assert.equal(d.lateMinutes, 0);
  assert.equal(d.earlyMinutes, 0);
});

test("làm tròn xuống phút khi muộn: 08:00:59 vẫn là muộn 0 phút", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [
      { type: "in", occurred_at: "2026-10-05T08:00:59+07:00" },
      ev("out", "2026-10-05", "17:00"),
    ],
    shift, hourlyRate: 60000, penaltyPerMinute: 1000,
  });
  assert.equal(d.lateMinutes, 0);
});

test("nghỉ giữa ca (out rồi in lại): chỉ tính các đoạn đang ở trong ca", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [
      ev("in", "2026-10-05", "08:00"), ev("out", "2026-10-05", "12:00"),
      ev("in", "2026-10-05", "13:00"), ev("out", "2026-10-05", "17:00"),
    ],
    shift, hourlyRate: 60000, penaltyPerMinute: 1000,
  });
  assert.equal(d.workedMinutes, 480);
  assert.equal(d.lateMinutes, 0);
  assert.equal(d.earlyMinutes, 0);
});

test("quên check-out: không tính đoạn đó, gắn cờ, không phạt về sớm", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [ev("in", "2026-10-05", "08:00")],
    shift, hourlyRate: 60000, penaltyPerMinute: 1000,
  });
  assert.equal(d.missingCheckout, true);
  assert.equal(d.workedMinutes, 0);
  assert.equal(d.earlyMinutes, 0);
  assert.equal(d.gross, 0);
});

test("check-in trùng liên tiếp: lấy lần đầu", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [ev("in", "2026-10-05", "08:00"), ev("in", "2026-10-05", "08:05"), ev("out", "2026-10-05", "17:00")],
    shift, hourlyRate: 60000, penaltyPerMinute: 0,
  });
  assert.equal(d.workedMinutes, 540);
});

test("muộn + sớm không vượt quá độ dài ca", () => {
  const d = computeDay({
    dateKey: "2026-10-05",
    events: [ev("in", "2026-10-05", "16:50"), ev("out", "2026-10-05", "16:55")],
    shift, hourlyRate: 60000, penaltyPerMinute: 1000,
  });
  assert.equal(d.lateMinutes + d.earlyMinutes <= 540, true);
});

test("lịch sử lương giờ: ngày trước ngày đổi dùng mức cũ", () => {
  const rates = [
    { hourly_rate: "25000", effective_from: "2000-01-01" },
    { hourly_rate: "30000", effective_from: "2026-10-15" },
  ];
  assert.equal(rateForDate(rates, "2026-10-14"), 25000);
  assert.equal(rateForDate(rates, "2026-10-15"), 30000);
  assert.equal(rateForDate([], "2026-10-15"), 0);
});

test("cả tháng: cộng đúng, lương âm bị chặn về 0, bỏ ngày không có công", () => {
  const events = [
    ev("in", "2026-10-05", "08:00"), ev("out", "2026-10-05", "17:00"),
    ev("in", "2026-10-06", "08:30"), ev("out", "2026-10-06", "17:00"),
  ];
  const m = computeMonth({
    monthKey: "2026-10", events, shift,
    rates: [{ hourly_rate: 20000, effective_from: "2000-01-01" }],
    penaltyPerMinute: 500,
  });
  assert.equal(m.days.length, 2);
  assert.equal(m.totals.workedMinutes, 540 + 510);
  assert.equal(m.totals.lateMinutes, 30);
  assert.equal(m.totals.gross, 180000 + 170000);
  assert.equal(m.totals.penalty, 15000);
  assert.equal(m.totals.net, 335000);

  const neg = computeMonth({
    monthKey: "2026-10",
    events: [ev("in", "2026-10-05", "08:00"), ev("out", "2026-10-05", "08:10")],
    shift, rates: [{ hourly_rate: 1000, effective_from: "2000-01-01" }], penaltyPerMinute: 10000,
  });
  assert.equal(neg.totals.net, 0);
});

test("sự kiện lúc 00:30 VN ngày 1 thuộc tháng mới, không lọt vào tháng cũ", () => {
  const m = computeMonth({
    monthKey: "2026-10",
    events: [{ type: "in", occurred_at: "2026-10-31T17:30:00Z" }],
    shift, rates: [], penaltyPerMinute: 0,
  });
  assert.equal(m.days.length, 0);
});

test("khoảng cách haversine ~ 111m cho 0.001 độ vĩ", () => {
  const d = distanceMeters(21.0, 105.8, 21.001, 105.8);
  assert.ok(d > 110 && d < 112);
});
