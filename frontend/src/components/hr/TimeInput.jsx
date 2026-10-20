// Ô chọn giờ dạng 24h, gọn như 1 ô nhập: [ 07 : 55 ]. Thay cho
// <input type="time"> của trình duyệt — ô đó hiện SA/CH (AM/PM) theo ngôn ngữ
// máy, không ép 24h được. Bên trong là 2 <select> (giờ 00–23, phút 00–59) đã
// bỏ khung/mũi tên (xem .time-input trong custom.css).
// value / onChange: chuỗi "HH:MM", hoặc "" khi chưa chọn (chỉ khi không required).
const pad = (n) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

export default function TimeInput({ value, onChange, required = false, disabled = false, label }) {
  const [hour = "", minute = ""] = value ? value.split(":") : [];

  // Chọn 1 phần khi phần kia còn trống -> phần kia lấy "00"
  function change(nextHour, nextMinute) {
    if (!nextHour && !nextMinute) return onChange("");
    onChange(`${nextHour || "00"}:${nextMinute || "00"}`);
  }

  return (
    <span className={`time-input ${value ? "" : "is-empty"} ${disabled ? "is-disabled" : ""}`}>
      <select
        aria-label={label ? `${label} — giờ` : "Giờ"}
        required={required}
        disabled={disabled}
        value={hour}
        onChange={(e) => change(e.target.value, e.target.value ? minute : "")}
      >
        {(!required || !hour) && <option value="">--</option>}
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="time-input-sep">:</span>
      <select
        aria-label={label ? `${label} — phút` : "Phút"}
        required={required}
        disabled={disabled}
        value={minute}
        onChange={(e) => change(e.target.value ? hour : "", e.target.value)}
      >
        {(!required || !minute) && <option value="">--</option>}
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </span>
  );
}
