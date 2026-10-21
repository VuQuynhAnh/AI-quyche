// Ô nhập tiền: gõ tới đâu tự thêm dấu chấm hàng nghìn ("100.000") kèm hậu tố
// "đ" cho dễ đọc. Giá trị trả ra cho form vẫn là chuỗi chữ số thuần ("100000")
// để gửi thẳng lên API.
const MAX_DIGITS = 10; // tới 9.999.999.999 đ — khớp giới hạn parseMoney ở backend (1e9)

export default function MoneyInput({ value, onChange, required = false, disabled = false, placeholder = "0", size }) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const shown = digits === "" ? "" : Number(digits).toLocaleString("vi-VN");

  function handleChange(e) {
    const next = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
    onChange(next);
  }

  return (
    <div className={`input-group money-input ${size === "sm" ? "input-group-sm" : ""}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="form-control text-end"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={shown}
        onChange={handleChange}
      />
      <span className="input-group-text">đ</span>
    </div>
  );
}
