// Trả lời câu hỏi về DỮ LIỆU CÁ NHÂN của nhân viên (lương tháng này, đi muộn,
// về sớm, số ngày công...) cho chatbot.
//
// Nguyên tắc thiết kế:
//  1. MỌI con số do CODE tính (payroll.service.js, cùng nguồn với màn Lịch sử
//     và bảng lương của admin) — AI chỉ diễn đạt lại bằng lời, không được tự
//     tính. Nếu Gemini lỗi/quá tải, vẫn trả lời được bằng câu mẫu dựng từ
//     chính các số liệu này (fallbackAnswer).
//  2. Nhân viên được tra cứu LUÔN lấy từ JWT (req.user.id), không bao giờ từ
//     nội dung câu hỏi — hỏi "lương của bạn Lan" không thể xem dữ liệu người khác.
//  3. Chỉ gửi cho Gemini các con số/ngày của CHÍNH người hỏi (không gửi email,
//     SĐT, toạ độ GPS).
//  4. Chỉ kích hoạt khi câu hỏi vừa nói về chấm công/lương VÀ có ý tự xưng
//     ("tôi", "của em", "tháng này"...), để câu hỏi chính sách chung ("quy định
//     phạt đi muộn là gì?") vẫn đi đường RAG tài liệu như cũ.
import { computeMonthForUser } from "./attendance.service.js";
import { vnMonthKey, vnDateKey, prevMonthKey } from "./payroll.service.js";

const HR_KEYWORDS =
  /(lương|tiền công|chấm công|ngày công|giờ làm|đi muộn|đi trễ|đến muộn|về sớm|đi sớm|tiền phạt|bị phạt|phạt|check[\s-]?in|check[\s-]?out|đi làm)/i;

// Có ý nói về BẢN THÂN hoặc mốc thời gian cụ thể của mình
const SELF_REF = /(\btôi\b|\bem\b|\bmình\b|của tôi|của em|của mình|tháng này|tháng trước|tháng vừa rồi|tháng \d{1,2}|hôm nay|hôm qua|tuần này)/i;

// Chủ đề KHÔNG nằm trong dữ liệu chấm công — để luồng cũ (tài liệu nhạy cảm →
// chuyển admin) xử lý
const EXCLUDE = /(hợp đồng|kỷ luật|sa thải|bảo hiểm|thuế|thưởng|của (giám đốc|sếp|trưởng))/i;

export function isPersonalDataQuestion(question) {
  const q = String(question || "");
  return HR_KEYWORDS.test(q) && SELF_REF.test(q) && !EXCLUDE.test(q);
}

// Tháng người hỏi nhắc tới: "tháng trước", "tháng 9", "tháng 9/2026"; mặc định tháng này.
// Trả về { monthKey, future } — future=true nếu hỏi tháng chưa tới.
export function parseMonthFromQuestion(question, now = new Date()) {
  const q = String(question || "").toLowerCase();
  const current = vnMonthKey(now);
  let monthKey = current;

  if (/tháng (trước|vừa rồi|qua)/.test(q)) {
    monthKey = prevMonthKey(current);
  } else {
    const m = q.match(/tháng\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{4}))?/);
    if (m) {
      const mm = Number(m[1]);
      if (mm >= 1 && mm <= 12) {
        const curYear = Number(current.slice(0, 4));
        const curMonth = Number(current.slice(5, 7));
        let year = m[2] ? Number(m[2]) : mm > curMonth ? curYear - 1 : curYear;
        monthKey = `${year}-${String(mm).padStart(2, "0")}`;
      }
    }
  }
  return { monthKey, future: monthKey > current };
}

const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")} đồng`;
const hm = (min) => {
  const n = Math.round(min);
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h === 0 ? `${m} phút` : m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
};
const dmy = (dateKey) => `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
const monthLabel = (mk) => `tháng ${Number(mk.slice(5, 7))}/${mk.slice(0, 4)}`;

// Dựng "bản tin số liệu" của 1 tháng từ kết quả computeMonth — văn bản thuần,
// vừa đưa cho Gemini làm dữ liệu, vừa dùng làm câu trả lời dự phòng.
export function buildFactsText(result, monthKey, now = new Date()) {
  const t = result.totals;
  const status = result.locked
    ? "ĐÃ CHỐT (không thay đổi nữa)"
    : "TẠM TÍNH đến thời điểm hiện tại (còn thay đổi khi có thêm ngày công)";
  const todayKey = vnDateKey(now);
  const lines = [];
  lines.push(`Kỳ lương: ${monthLabel(monthKey)} — ${status}`);
  lines.push(
    `Cấu hình ca: ${result.config.shift.start} đến ${result.config.shift.end}; phạt ${vnd(result.config.penaltyPerMinute)} mỗi phút đi muộn hoặc về sớm.`
  );

  if (result.days.length === 0) {
    lines.push("Chưa có dữ liệu chấm công nào trong tháng này.");
    return lines.join("\n");
  }

  const lateDays = result.days.filter((d) => d.lateMinutes > 0);
  const earlyDays = result.days.filter((d) => d.earlyMinutes > 0);
  const missing = result.days.filter((d) => d.missingCheckout && d.date !== todayKey);

  lines.push(`Số ngày có chấm công: ${t.daysWorked}`);
  lines.push(`Tổng thời gian làm việc trong ca: ${hm(t.workedMinutes)}`);
  lines.push(`Tổng đi muộn: ${t.lateMinutes} phút (${lateDays.length} ngày)`);
  lines.push(`Tổng về sớm: ${t.earlyMinutes} phút (${earlyDays.length} ngày)`);
  lines.push(`Lương theo giờ làm (trước phạt): ${vnd(t.gross)}`);
  lines.push(`Tiền phạt đi muộn/về sớm: ${vnd(t.penalty)}`);
  lines.push(`Lương thực nhận: ${vnd(t.net)}`);

  const list = (arr, f) => arr.slice(0, 15).map(f).join("; ") + (arr.length > 15 ? "; ..." : "");
  if (lateDays.length) lines.push(`Các ngày đi muộn: ${list(lateDays, (d) => `${dmy(d.date)} (${d.lateMinutes} phút)`)}`);
  if (earlyDays.length) lines.push(`Các ngày về sớm: ${list(earlyDays, (d) => `${dmy(d.date)} (${d.earlyMinutes} phút)`)}`);
  if (missing.length) lines.push(`Các ngày thiếu check-out (cần báo admin chỉnh): ${list(missing, (d) => dmy(d.date))}`);

  const today = result.days.find((d) => d.date === todayKey);
  if (today) {
    lines.push(
      today.missingCheckout
        ? `Hôm nay (${dmy(todayKey)}): đã check-in, chưa check-out.`
        : `Hôm nay (${dmy(todayKey)}): làm ${hm(today.workedMinutes)}, đi muộn ${today.lateMinutes} phút, về sớm ${today.earlyMinutes} phút.`
    );
  }
  return lines.join("\n");
}

// Lấy số liệu của nhân viên đang đăng nhập + dựng bản tin. userId lấy từ JWT.
export async function loadPersonalFacts(userId, question, now = new Date()) {
  const { monthKey, future } = parseMonthFromQuestion(question, now);
  if (future) {
    return { monthKey, text: `Người dùng hỏi ${monthLabel(monthKey)} nhưng tháng này chưa tới nên chưa có dữ liệu.`, future: true };
  }
  const result = await computeMonthForUser(userId, monthKey, now);
  return { monthKey, text: buildFactsText(result, monthKey, now), result, future: false };
}

// Câu trả lời dự phòng khi Gemini lỗi — vẫn đầy đủ số liệu, không cần AI
export function fallbackAnswer(facts) {
  return (
    "Hệ thống AI đang bận nên mình gửi bạn số liệu thô từ hệ thống chấm công:\n\n" + facts.text
  );
}

export function sourceFooter(facts) {
  return `\n\n(Số liệu từ hệ thống chấm công — ${monthLabel(facts.monthKey)}${facts.result && !facts.result.locked ? ", tạm tính" : ""})`;
}
