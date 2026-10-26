// TRA CỨU LƯƠNG/CÔNG CÁ NHÂN qua chatbot (lương tháng này, đi muộn, về sớm,
// số ngày công...).
//
// Nguyên tắc thiết kế:
//  1. MỌI con số do CODE tính (paysheet.service.js, cùng nguồn với màn Lịch sử
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
import { PAYSHEET_STATUS } from "../constants/enums.js";
import { vnMonthKey, vnDateKey, prevMonthKey } from "../utils/vnTime.js";

const HR_KEYWORDS =
  /(lương|tiền công|chấm công|ngày công|giờ làm|đi muộn|đi trễ|đến muộn|về sớm|đi sớm|tiền phạt|bị phạt|phạt|check[\s-]?in|check[\s-]?out|đi làm)/i;

// Có ý nói về BẢN THÂN, mốc thời gian cụ thể, hoặc hỏi NGÀY / SỐ LƯỢNG của
// chính mình ("chấm công những ngày nào", "đi muộn mấy lần") — nhân viên hỏi
// chatbot thì các câu này luôn là về dữ liệu của chính họ
const SELF_REF = new RegExp(
  [
    "\\btôi\\b", "\\bem\\b", "\\bmình\\b", "của tôi", "của em", "của mình",
    "tháng này", "tháng trước", "tháng vừa rồi", "tháng \\d{1,2}", "hôm nay", "hôm qua", "tuần này",
    "ngày nào", "những ngày", "các ngày", "bao nhiêu ngày", "mấy ngày", "bao nhiêu lần", "mấy lần",
    "bao nhiêu giờ", "mấy giờ", "bao nhiêu phút", "mấy phút", "được bao nhiêu",
  ].join("|"),
  "i"
);

// Chủ đề KHÔNG nằm trong dữ liệu chấm công — để luồng cũ (tài liệu nhạy cảm →
// chuyển admin) xử lý
const EXCLUDE = /(hợp đồng|kỷ luật|sa thải|bảo hiểm|thuế|thưởng|của (giám đốc|sếp|trưởng))/i;

// Câu hỏi có nhắc tới tháng cụ thể không ("tháng này", "tháng trước", "tháng 9"...)
export function mentionsMonth(question) {
  return /tháng\s*(này|trước|vừa rồi|qua|\d{1,2})/i.test(String(question || ""));
}

// Câu hỏi NỐI TIẾP câu trước (không tự đứng một mình được): ngắn, hoặc có từ nối
const FOLLOW_UP = /(chi tiết|cụ thể|từng ngày|liệt kê|còn\b|thế còn|vậy còn|thế thì|vậy thì|được không|thì sao|tại sao|vì sao|ngày nào|những ngày|hôm nào|tuần này|tuần trước|giải thích)/i;
export function isFollowUpQuestion(question) {
  const q = String(question || "").trim();
  return q.length <= 60 || FOLLOW_UP.test(q);
}

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
const dmy = (dateKey) => dateKey.split("-").reverse().join("/");
const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const weekday = (dateKey) => WEEKDAYS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
const hhmm = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }) : null;

// "Thứ hai 06/10: vào 07:55, ra 17:05, làm 9 giờ; đi muộn 5 phút"
function describeDay(d, todayKey) {
  const parts = [`${weekday(d.workDate)} ${dmy(d.workDate)}: `];
  const inTime = hhmm(d.checkInTime);
  const outTime = hhmm(d.checkOutTime);
  parts.push(inTime ? `vào ${inTime}` : "thiếu check-in");
  if (outTime) parts.push(`, ra ${outTime}`);
  else parts.push(d.workDate === todayKey ? ", đang làm (chưa check-out)" : ", thiếu check-out");
  if (inTime && outTime) parts.push(`, làm ${hm(d.workedMinutes)}`);
  const notes = [];
  if (d.lateMinutes > 0) notes.push(`đi muộn ${d.lateMinutes} phút`);
  if (d.earlyLeaveMinutes > 0) notes.push(`về sớm ${d.earlyLeaveMinutes} phút`);
  if (notes.length) parts.push(`; ${notes.join(", ")}`);
  return parts.join("");
}
const monthLabel = (mk) => `tháng ${Number(mk.slice(5, 7))}/${mk.slice(0, 4)}`;

const STATUS_TEXT = {
  [PAYSHEET_STATUS.FINALIZED]: "ĐÃ CHỐT (không thay đổi nữa)",
  [PAYSHEET_STATUS.DRAFT]: "BẢNG LƯƠNG NHÁP (cửa hàng chưa chốt, có thể còn điều chỉnh)",
};
const ESTIMATE_TEXT = "TẠM TÍNH đến thời điểm hiện tại (cửa hàng chưa lập bảng lương tháng này)";

// Dựng "bản tin số liệu" của 1 tháng từ kết quả paysheetService.getEmployeeSalary
// — văn bản thuần, vừa đưa cho Gemini làm dữ liệu, vừa dùng làm câu trả lời dự phòng.
export function buildFactsText(result, now = new Date()) {
  const { salary: t, days } = result;
  const todayKey = vnDateKey(now);
  const lines = [];
  lines.push(`Kỳ lương: ${monthLabel(result.month)} — ${STATUS_TEXT[result.paysheetStatus] || ESTIMATE_TEXT}`);
  lines.push(
    `Lương giờ: ${vnd(t.hourlyWage)}; phạt ${vnd(result.penaltyAmountPerMinute)} mỗi phút đi muộn hoặc về sớm.`
  );

  if (days.length === 0) {
    lines.push("Chưa có dữ liệu chấm công nào trong tháng này.");
    return lines.join("\n");
  }

  const lateDays = days.filter((d) => d.lateMinutes > 0);
  const earlyDays = days.filter((d) => d.earlyLeaveMinutes > 0);
  const missing = days.filter((d) => d.isMissingCheckOut && d.workDate !== todayKey);

  lines.push(`Số ngày có chấm công: ${t.workedDays}`);
  lines.push(`Tổng thời gian làm việc trong ca: ${hm(t.workedMinutes)}`);
  lines.push(`Tổng đi muộn: ${t.lateMinutes} phút (${lateDays.length} ngày)`);
  lines.push(`Tổng về sớm: ${t.earlyLeaveMinutes} phút (${earlyDays.length} ngày)`);
  lines.push(`Lương theo giờ làm (trước phạt): ${vnd(t.grossSalary)}`);
  lines.push(`Tiền phạt đi muộn/về sớm: ${vnd(t.penaltyAmount)}`);
  lines.push(`Lương thực nhận: ${vnd(t.netSalary)}`);

  // Chi tiết từng ngày (cả tháng, tối đa 31 dòng) — để trả lời "chấm công những ngày nào"
  lines.push("Chi tiết từng ngày có chấm công:");
  for (const d of days) lines.push(`- ${describeDay(d, todayKey)}`);

  const list = (arr, f) => arr.slice(0, 15).map(f).join("; ") + (arr.length > 15 ? "; ..." : "");
  if (lateDays.length) lines.push(`Các ngày đi muộn: ${list(lateDays, (d) => `${dmy(d.workDate)} (${d.lateMinutes} phút)`)}`);
  if (earlyDays.length) lines.push(`Các ngày về sớm: ${list(earlyDays, (d) => `${dmy(d.workDate)} (${d.earlyLeaveMinutes} phút)`)}`);
  if (missing.length) lines.push(`Các ngày thiếu check-out (cần báo admin chỉnh): ${list(missing, (d) => dmy(d.workDate))}`);
  const missingIn = days.filter((d) => !d.checkInTime && d.checkOutTime);
  if (missingIn.length) lines.push(`Các ngày thiếu check-in (cần báo admin chỉnh): ${list(missingIn, (d) => dmy(d.workDate))}`);

  const today = days.find((d) => d.workDate === todayKey);
  if (today) {
    lines.push(
      today.isMissingCheckOut
        ? `Hôm nay (${dmy(todayKey)}): đã check-in, chưa check-out.`
        : `Hôm nay (${dmy(todayKey)}): làm ${hm(today.workedMinutes)}, đi muộn ${today.lateMinutes} phút, về sớm ${today.earlyLeaveMinutes} phút.`
    );
  }
  return lines.join("\n");
}

// Câu trả lời dự phòng khi Gemini lỗi — vẫn đầy đủ số liệu, không cần AI
export function fallbackAnswer(facts) {
  return (
    "Hệ thống AI đang bận nên mình gửi bạn số liệu thô từ hệ thống chấm công:\n\n" + facts.text
  );
}

export function sourceFooter(facts) {
  const status = facts.result?.paysheetStatus;
  const note = status === PAYSHEET_STATUS.FINALIZED ? "" : status === PAYSHEET_STATUS.DRAFT ? ", bảng lương nháp" : ", tạm tính";
  return `\n\n(Số liệu từ hệ thống chấm công — ${monthLabel(facts.monthKey)}${facts.result ? note : ""})`;
}

export function createSalaryInquiryService({ employeeRepository, paysheetService }) {
  // Lấy số liệu của nhân viên đang đăng nhập + dựng bản tin. accountId lấy từ JWT.
  // contextQuestion: câu hỏi trước đó (câu hỏi nối tiếp không nhắc tháng thì
  // dùng tháng của câu trước — "tháng 9 tôi đi muộn mấy lần?" -> "chi tiết từng ngày?")
  async function loadPersonalFacts(accountId, question, now = new Date(), { contextQuestion } = {}) {
    const monthSource = mentionsMonth(question) || !contextQuestion ? question : contextQuestion;
    const { monthKey, future } = parseMonthFromQuestion(monthSource, now);
    if (future) {
      return { monthKey, text: `Người dùng hỏi ${monthLabel(monthKey)} nhưng tháng này chưa tới nên chưa có dữ liệu.`, future: true };
    }
    const employee = await employeeRepository.findByAccountId(accountId);
    if (!employee) {
      return { monthKey, text: "Tài khoản này chưa có hồ sơ nhân viên nên chưa có dữ liệu chấm công.", future: false };
    }
    const result = await paysheetService.getEmployeeSalary(employee, monthKey);
    return { monthKey, text: buildFactsText(result, now), result, future: false };
  }

  return { isPersonalDataQuestion, isFollowUpQuestion, loadPersonalFacts, fallbackAnswer, sourceFooter };
}
