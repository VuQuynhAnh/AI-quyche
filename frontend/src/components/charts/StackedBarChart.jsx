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
  const pct = (v) => (total > 0 ? ((v / total) * 100).toFixed(0) : 0);

  return (
    <ChartCard title={title} caption={caption}>
      {total === 0 ? (
        <p className="text-muted small mb-0 mt-2">{emptyText}</p>
      ) : (
        <>
          {/* Thanh xếp chồng của Bootstrap (.progress-stacked); khe 2px giữa các phần = viền màu nền */}
          <div
            className="progress-stacked rounded-pill"
            style={{ height: 22 }}
            role="img"
            aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
          >
            {visibleSegments.map((s, i) => {
              const percent = (s.value / total) * 100;
              return (
                <div
                  key={s.key}
                  className="progress"
                  style={{
                    width: `${percent}%`,
                    height: 22,
                    minWidth: 2,
                    borderRight: i < visibleSegments.length - 1 ? "2px solid var(--bs-body-bg)" : "none",
                  }}
                  title={`${s.label}: ${s.value} (${percent.toFixed(0)}%)`}
                >
                  <div className="progress-bar fw-semibold" style={{ backgroundColor: s.color, fontSize: "0.68rem" }}>
                    {percent >= 15 && `${percent.toFixed(0)}%`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="d-flex flex-wrap column-gap-3 row-gap-2 mt-3 small">
            {segments.map((s) => (
              <div key={s.key} className="d-flex align-items-center gap-2">
                {s.icon ? (
                  <span className="d-inline-flex flex-shrink-0" style={{ color: s.color }}>
                    {s.icon}
                  </span>
                ) : (
                  <span className="rounded-circle flex-shrink-0" style={{ width: 10, height: 10, backgroundColor: s.color }} />
                )}
                <span>{s.label}</span>
                <span className="text-muted">
                  {s.value} ({pct(s.value)}%)
                </span>
              </div>
            ))}
          </div>

          {/* "Bảng số liệu" — đọc được kể cả khi không phân biệt được màu sắc */}
          <DataTable
            head={["Trạng thái", "Số lượng", "Tỷ lệ"]}
            rows={segments.map((s) => [s.label, s.value, `${pct(s.value)}%`])}
          />
        </>
      )}
    </ChartCard>
  );
}

// Khung chung của mọi biểu đồ trang Dashboard
export function ChartCard({ title, caption, children }) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="fw-semibold">{title}</div>
        {caption && <div className="small text-body-secondary mb-3">{caption}</div>}
        {children}
      </div>
    </div>
  );
}

// "Xem dạng bảng": cột đầu là nhãn, các cột sau là số (căn phải)
export function DataTable({ head, rows }) {
  return (
    <details className="mt-3">
      <summary className="small link-primary" role="button">Xem dạng bảng</summary>
      <table className="table table-sm small mt-2 mb-0">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i ? "text-end" : ""}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (
                <td key={i} className={i ? "text-end" : ""}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
