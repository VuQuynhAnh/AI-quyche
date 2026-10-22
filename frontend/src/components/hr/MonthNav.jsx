import { addMonths, vnMonthKey } from "../../utils/format.js";
import PeriodNav from "./PeriodNav.jsx";

// Thanh chọn tháng: [ ‹  Th. 10 2026  › ] (không cho đi quá tháng hiện tại)
export default function MonthNav({ month, onChange, className }) {
  const [y, m] = month.split("-").map(Number);
  return (
    <PeriodNav
      className={className}
      label={`Th. ${m} ${y}`}
      onPrev={() => onChange(addMonths(month, -1))}
      onNext={() => onChange(addMonths(month, 1))}
      nextDisabled={month >= vnMonthKey()}
      prevLabel="Tháng trước"
      nextLabel="Tháng sau"
    />
  );
}
