import test from "node:test";
import assert from "node:assert/strict";
import {
  isPersonalDataQuestion, parseMonthFromQuestion, buildFactsText, fallbackAnswer,
} from "../src/services/personalData.service.js";
import { computeMonth } from "../src/services/payroll.service.js";

test("nhận diện câu hỏi dữ liệu cá nhân", () => {
  const yes = [
    "Lương tháng này của tôi là bao nhiêu?",
    "tháng trước em đi muộn mấy lần",
    "Hôm nay mình đã check-in chưa?",
    "tháng 9 tôi bị phạt bao nhiêu tiền",
    "Tôi về sớm bao nhiêu phút tháng này",
  ];
  const no = [
    "Quy định phạt đi muộn là gì?",              // chính sách chung, không tự xưng
    "Tôi được nghỉ phép bao nhiêu ngày một năm?", // không phải chấm công/lương
    "Hợp đồng lương của tôi ghi bao nhiêu?",      // thuộc luồng tài liệu nhạy cảm
    "Tôi bị kỷ luật phạt thế nào?",
    "Thưởng tết của tôi năm nay?",
  ];
  for (const q of yes) assert.equal(isPersonalDataQuestion(q), true, q);
  for (const q of no) assert.equal(isPersonalDataQuestion(q), false, q);
});

test("đọc tháng trong câu hỏi", () => {
  const now = new Date("2026-10-19T03:00:00Z"); // 10/2026 giờ VN
  assert.equal(parseMonthFromQuestion("lương tháng này", now).monthKey, "2026-10");
  assert.equal(parseMonthFromQuestion("lương tháng trước", now).monthKey, "2026-09");
  assert.equal(parseMonthFromQuestion("lương tháng 9", now).monthKey, "2026-09");
  assert.equal(parseMonthFromQuestion("lương tháng 11", now).monthKey, "2025-11"); // chưa tới -> năm trước
  assert.equal(parseMonthFromQuestion("lương tháng 3/2026", now).monthKey, "2026-03");
  assert.equal(parseMonthFromQuestion("lương tháng 12/2026", now).future, true);
});

test("bản tin số liệu có đủ con số và đánh dấu tạm tính/đã chốt", () => {
  const vn = (d, h) => new Date(`${d}T${h}:00+07:00`).toISOString();
  const result = computeMonth({
    monthKey: "2026-10",
    events: [
      { type: "in", occurred_at: vn("2026-10-05", "08:15") },
      { type: "out", occurred_at: vn("2026-10-05", "16:30") },
    ],
    shift: { start: "08:00", end: "17:00" },
    rates: [{ hourly_rate: 60000, effective_from: "2000-01-01" }],
    penaltyPerMinute: 1000,
  });
  const now = new Date("2026-10-19T03:00:00Z");
  const text = buildFactsText({ ...result, locked: false }, "2026-10", now);
  assert.match(text, /TẠM TÍNH/);
  assert.match(text, /Tổng đi muộn: 15 phút/);
  assert.match(text, /Tổng về sớm: 30 phút/);
  assert.match(text, /45\.000 đồng/); // phạt
  assert.match(text, /450\.000 đồng/); // thực nhận
  assert.match(text, /05\/10 \(15 phút\)/);
  assert.match(buildFactsText({ ...result, locked: true }, "2026-10", now), /ĐÃ CHỐT/);
  assert.match(fallbackAnswer({ text }), /Tổng đi muộn/);
});

test("tháng không có dữ liệu", () => {
  const result = computeMonth({
    monthKey: "2026-08", events: [], shift: { start: "08:00", end: "17:00" }, rates: [], penaltyPerMinute: 0,
  });
  assert.match(buildFactsText({ ...result, locked: true }, "2026-08"), /Chưa có dữ liệu chấm công/);
});
