// Biểu đồ CỘT XẾP CHỒNG (stacked bar) 1 hàng ngang — dùng cho dữ liệu "phần
// trong tổng thể" (part-to-whole) như trạng thái văn bản, trạng thái hội
// thoại... Cố tình KHÔNG dùng biểu đồ tròn/donut: vẽ donut bằng thuần CSS/SVG
// đòi hỏi tính toán góc cung khá phức tạp, trong khi 1 thanh xếp chồng đơn
// giản hơn nhiều mà vẫn truyền tải đúng ý "tỷ lệ giữa các phần" — đây cũng là
// khuyến nghị chung khi làm biểu đồ phần-trong-tổng (ưu tiên bar/stacked bar
// hơn donut).
//
// Vài quyết định thiết kế đáng chú ý (để học viên đọc code hiểu vì sao):
//  - Mỗi ô màu (segment) có 1 viền phải 2px MÀU NỀN (không phải màu đen) để
//    tạo khoảng cách trực quan giữa các phần — không dùng border thường vì
//    border sẽ vẽ thêm "mực" không phải dữ liệu.
//  - Chỉ hiện số/phần trăm NGAY TRÊN thanh nếu phần đó đủ rộng (>= 15%) để
//    chữ không bị vỡ dòng/tràn ra ngoài — phần hẹp hơn vẫn có đầy đủ số liệu
//    ở phần chú thích (legend) bên dưới, và trong bảng số liệu (xem toggle
//    "Xem dạng bảng") — không bao giờ có số liệu nào bị "giấu" hoàn toàn.
//  - Dùng thuộc tính "title" (tooltip có sẵn của trình duyệt) trên từng ô màu
//    thay vì tự dựng 1 tooltip nổi bằng JS — đơn giản, đủ dùng cho 1 trang
//    quản trị nội bộ quy mô nhỏ như dự án demo này.
export default function StackedBarChart({ title, caption, segments, emptyText = "Chưa có dữ liệu." }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visibleSegments = segments.filter((s) => s.value > 0);

  return (
    <div className="chart-card">
      <div className="chart-card-title">{title}</div>
      {caption && <div className="chart-card-caption">{caption}</div>}

      {total === 0 ? (
        <p className="text-muted small mb-0 mt-2">{emptyText}</p>
      ) : (
        <>
          <div className="stacked-bar" role="img" aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
            {visibleSegments.map((s, i) => {
              const percent = (s.value / total) * 100;
              return (
                <div
                  key={s.key}
                  className="stacked-bar-segment"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: s.color,
                    borderRight: i < visibleSegments.length - 1 ? "2px solid var(--chart-surface)" : "none",
                  }}
                  title={`${s.label}: ${s.value} (${percent.toFixed(0)}%)`}
                >
                  {percent >= 15 && <span className="stacked-bar-segment-label">{percent.toFixed(0)}%</span>}
                </div>
              );
            })}
          </div>

          <div className="chart-legend">
            {segments.map((s) => (
              <div key={s.key} className="chart-legend-item">
                {s.icon ? (
                  <span className="chart-legend-icon" style={{ color: s.color }}>
                    {s.icon}
                  </span>
                ) : (
                  <span className="chart-legend-dot" style={{ backgroundColor: s.color }} />
                )}
                <span>{s.label}</span>
                <span className="text-muted">
                  {s.value} ({total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>

          {/* "Bảng số liệu" — bản tương đương WCAG-clean của biểu đồ, đảm bảo
              số liệu luôn đọc được kể cả khi không phân biệt được màu sắc. */}
          <details className="chart-table-toggle">
            <summary>Xem dạng bảng</summary>
            <table className="table table-sm mt-2 mb-0">
              <thead>
                <tr>
                  <th>Trạng thái</th>
                  <th className="text-end">Số lượng</th>
                  <th className="text-end">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td className="text-end">{s.value}</td>
                    <td className="text-end">{total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%</td>
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
