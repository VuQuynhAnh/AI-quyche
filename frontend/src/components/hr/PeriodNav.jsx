import { addDays, vnDateKey, weekStart } from "../../utils/format.js";

// Khung chuyển kỳ dùng chung: [ ‹  Tuần 4 - Th. 10 2026  › ] — 2 mũi tên nằm
// trong cùng 1 khung viền với nhãn. Không cho đi quá kỳ hiện tại (nextDisabled).
export default function PeriodNav({ label, title, onPrev, onNext, nextDisabled, prevLabel, nextLabel, className = "" }) {
  return (
    <div className={`d-inline-flex align-items-center border rounded-3 bg-white ${className}`} title={title}>
      <button type="button" className="btn btn-sm border-0 text-body-secondary px-2" onClick={onPrev} aria-label={prevLabel}>
        ‹
      </button>
      <span className="px-1 text-center text-nowrap" style={{ minWidth: 150 }}>
        {label}
      </span>
      <button
        type="button"
        className="btn btn-sm border-0 text-body-secondary px-2"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
      >
        ›
      </button>
    </div>
  );
}

// Nhãn tuần "Tuần 4 - Th. 10 2026": tuần (Thứ Hai → Chủ Nhật) thuộc tháng chứa
// ngày Thứ Năm của nó (tháng chiếm đa số ngày), số tuần = Thứ Năm rơi vào tuần
// thứ mấy của tháng đó.
export function weekLabel(monday) {
  const thursday = addDays(monday, 3);
  const [y, m, d] = thursday.split("-").map(Number);
  return `Tuần ${Math.ceil(d / 7)} - Th. ${m} ${y}`;
}

// Thanh chọn tuần; `week` là ngày Thứ Hai 'YYYY-MM-DD'
export function WeekNav({ week, onChange, className }) {
  const end = addDays(week, 6);
  const fmt = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
  return (
    <PeriodNav
      className={className}
      label={weekLabel(week)}
      title={`${fmt(week)} – ${fmt(end)}`}
      onPrev={() => onChange(addDays(week, -7))}
      onNext={() => onChange(addDays(week, 7))}
      nextDisabled={week >= weekStart(vnDateKey())}
      prevLabel="Tuần trước"
      nextLabel="Tuần sau"
    />
  );
}
