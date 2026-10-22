import { ChartCard, DataTable } from "./StackedBarChart.jsx";

// Biểu đồ CỘT NGANG xếp hạng — dùng cho "so sánh độ lớn" (magnitude), ở đây
// là số lần mỗi câu hỏi được hỏi. Tất cả các thanh dùng CHUNG 1 màu (không tô
// màu riêng từng câu hỏi) vì đây là 1 phép đo DUY NHẤT (số lần hỏi) lặp lại
// cho nhiều câu hỏi khác nhau, không phải nhiều "chuỗi dữ liệu" (series) cần
// phân biệt — tô mỗi thanh 1 màu riêng sẽ khiến người xem tưởng nhầm màu sắc
// mang ý nghĩa (identity) trong khi thực ra độ dài thanh đã nói lên tất cả.
// Vì chỉ có 1 màu duy nhất, KHÔNG cần chú thích (legend) — tiêu đề biểu đồ đã
// đủ nói lên đang xem gì.
export default function RankedBarChart({ title, caption, items, color = "var(--series-1)", emptyText = "Chưa có dữ liệu." }) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ChartCard title={title} caption={caption}>
      {items.length === 0 ? (
        <p className="text-muted small mb-0 mt-2">{emptyText}</p>
      ) : (
        <>
          <div className="vstack gap-2">
            {items.map((item, i) => (
              <div className="d-flex align-items-center gap-2 small" key={i}>
                {/* Nhãn cố định 42% chiều rộng, thanh co giãn, số căn phải thẳng cột */}
                <div className="text-truncate flex-shrink-0" style={{ width: "42%" }} title={item.label}>
                  {item.label}
                </div>
                <div className="progress flex-grow-1 min-w-0" style={{ height: 18 }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${(item.value / max) * 100}%`, minWidth: 4, backgroundColor: color }}
                    title={`${item.label}: ${item.value} lần`}
                  />
                </div>
                <div className="text-end text-body-secondary" style={{ minWidth: "1.5em", fontVariantNumeric: "tabular-nums" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <DataTable head={["Câu hỏi", "Số lần hỏi"]} rows={items.map((item) => [item.label, item.value])} />
        </>
      )}
    </ChartCard>
  );
}
