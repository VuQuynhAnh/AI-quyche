import { addMonths, monthLabel, vnMonthKey } from "../../utils/format.js";

// Thanh chọn tháng: < Tháng 10/2026 > (không cho đi quá tháng hiện tại)
export default function MonthNav({ month, onChange, className = "" }) {
  const current = vnMonthKey();
  return (
    <div className={`d-inline-flex align-items-center gap-2 ${className}`}>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onChange(addMonths(month, -1))} aria-label="Tháng trước">
        ‹
      </button>
      <span className="fw-semibold text-center" style={{ minWidth: 118 }}>
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={month >= current}
        aria-label="Tháng sau"
      >
        ›
      </button>
    </div>
  );
}
