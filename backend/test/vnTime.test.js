// Ngày/tháng nghiệp vụ theo giờ Việt Nam (UTC+7). Server chạy UTC nên ranh
// giới ngày lệch 7 tiếng so với giờ máy chủ — các test dưới đây khoá điều đó.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  daysInMonth,
  isMonthEnded,
  isValidDateKey,
  isValidMonthKey,
  monthDateRange,
  prevMonthKey,
  timeToMinutes,
  vnDateKey,
  vnDayStart,
  vnMonthKey,
  vnMonthRange,
} from "../src/utils/vnTime.js";

describe("vnDateKey / vnMonthKey — ngày làm việc theo giờ VN", () => {
  it("16:59 UTC vẫn là cùng ngày, 17:00 UTC đã sang ngày hôm sau ở VN", () => {
    assert.equal(vnDateKey(new Date("2026-09-15T16:59:59Z")), "2026-09-15");
    assert.equal(vnDateKey(new Date("2026-09-15T17:00:00Z")), "2026-09-16");
  });

  it("đêm cuối tháng theo giờ UTC đã là tháng sau ở VN", () => {
    assert.equal(vnMonthKey(new Date("2026-09-30T18:00:00Z")), "2026-10");
    assert.equal(vnMonthKey(new Date("2026-12-31T17:00:00Z")), "2027-01");
  });
});

describe("vnDayStart / vnMonthRange — mốc UTC của 00:00 giờ VN", () => {
  it("00:00 giờ VN ngày 15 = 17:00 UTC ngày 14", () => {
    assert.equal(vnDayStart("2026-09-15").toISOString(), "2026-09-14T17:00:00.000Z");
  });

  it("khoảng [start, end) của tháng theo giờ VN", () => {
    const { start, end } = vnMonthRange("2026-12");
    assert.equal(start.toISOString(), "2026-11-30T17:00:00.000Z");
    assert.equal(end.toISOString(), "2026-12-31T17:00:00.000Z");
  });
});

describe("kiểm tra định dạng", () => {
  it("tháng hợp lệ dạng YYYY-MM, tháng 01–12", () => {
    assert.equal(isValidMonthKey("2026-09"), true);
    assert.equal(isValidMonthKey("2026-13"), false);
    assert.equal(isValidMonthKey("2026-9"), false);
    assert.equal(isValidMonthKey(202609), false);
  });

  it("ngày phải có thật trên lịch (kể cả năm nhuận)", () => {
    assert.equal(isValidDateKey("2028-02-29"), true);
    assert.equal(isValidDateKey("2026-02-29"), false);
    assert.equal(isValidDateKey("2026-04-31"), false);
    assert.equal(isValidDateKey("2026-9-1"), false);
    assert.equal(isValidDateKey(null), false);
  });
});

describe("tính toán trên khoá ngày/tháng dạng chuỗi", () => {
  it("số ngày trong tháng, kể cả tháng 2 năm nhuận", () => {
    assert.equal(daysInMonth("2026-02"), 28);
    assert.equal(daysInMonth("2028-02"), 29);
    assert.equal(daysInMonth("2026-12"), 31);
  });

  it("ngày đầu / cuối của tháng", () => {
    assert.deepEqual(monthDateRange("2026-02"), { firstDate: "2026-02-01", lastDate: "2026-02-28" });
  });

  it("cộng/trừ ngày qua ranh giới tháng và năm", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  });

  it("tháng liền trước của tháng 1 là tháng 12 năm trước", () => {
    assert.equal(prevMonthKey("2026-01"), "2025-12");
    assert.equal(prevMonthKey("2026-10"), "2026-09");
  });

  it("tháng chỉ kết thúc từ 00:00 ngày 1 tháng sau theo giờ VN (PAY-BR-008)", () => {
    // 23:59 ngày 30/9 giờ VN: tháng 9 chưa kết thúc
    assert.equal(isMonthEnded("2026-09", new Date("2026-09-30T16:59:00Z")), false);
    // 00:00 ngày 1/10 giờ VN
    assert.equal(isMonthEnded("2026-09", new Date("2026-09-30T17:00:00Z")), true);
  });

  it("giờ 'HH:MM' hoặc 'HH:MM:SS' đổi sang số phút từ 00:00", () => {
    assert.equal(timeToMinutes("08:30"), 510);
    assert.equal(timeToMinutes("17:00:00"), 1020);
  });
});
