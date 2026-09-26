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
    <div className="chart-card">
      <div className="chart-card-title">{title}</div>
      {caption && <div className="chart-card-caption">{caption}</div>}

      {items.length === 0 ? (
        <p className="text-muted small mb-0 mt-2">{emptyText}</p>
      ) : (
        <>
          <div className="ranked-bar-list">
            {items.map((item, i) => (
              <div className="ranked-bar-row" key={i}>
                <div className="ranked-bar-label text-truncate" title={item.label}>
                  {item.label}
                </div>
                <div className="ranked-bar-track">
                  <div
                    className="ranked-bar-fill"
                    style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color }}
                    title={`${item.label}: ${item.value} lần`}
                  />
                </div>
                <div className="ranked-bar-value">{item.value}</div>
              </div>
            ))}
          </div>

          <details className="chart-table-toggle">
            <summary>Xem dạng bảng</summary>
            <table className="table table-sm mt-2 mb-0">
              <thead>
                <tr>
                  <th>Câu hỏi</th>
                  <th className="text-end">Số lần hỏi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.label}</td>
                    <td className="text-end">{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
