import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import MonthNav from "../../components/hr/MonthNav.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtDateLong, fmtMinutes, fmtMoney, fmtTime, vnMonthKey } from "../../utils/format.js";

// Bảng lương tháng. Tháng đang chạy: tính trực tiếp (tạm tính). Tháng đã qua:
// số liệu đã được CHỐT, đổi lương giờ/ca/phạt về sau không làm đổi bảng này.
export default function Payroll() {
  const { notifyError } = useNotification();
  const [month, setMonth] = useState(vnMonthKey());
  const [stallId, setStallId] = useState("");
  const [stalls, setStalls] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.get("/hr/stalls").then((d) => setStalls(d.stalls)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setData(null);
    api
      .get(`/hr/payroll?month=${month}${stallId ? `&stallId=${stallId}` : ""}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [month, stallId]);

  async function exportCsv() {
    try {
      await api.downloadFile(`/hr/payroll/export?month=${month}${stallId ? `&stallId=${stallId}` : ""}`, `bang-luong-${month}.csv`);
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function openDetail(row) {
    try {
      const d = await api.get(`/hr/payroll/${row.userId}?month=${month}`);
      setDetail({ row, result: d.result });
    } catch (e) {
      notifyError(e.message);
    }
  }

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <MonthNav month={month} onChange={setMonth} />
          {data && (
            <span className={`badge ${data.locked ? "text-bg-secondary" : "text-bg-warning"}`}>
              {data.locked ? "Đã chốt" : "Tạm tính"}
            </span>
          )}
        </div>
        <div className="d-flex gap-2">
          <select className="form-select form-select-sm" style={{ maxWidth: 220 }} value={stallId} onChange={(e) => setStallId(e.target.value)}>
            <option value="">Tất cả gian hàng</option>
            {stalls.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="btn btn-outline-primary btn-sm text-nowrap" onClick={exportCsv} disabled={!data}>
            Xuất CSV
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!data && !error && <p className="text-muted">Đang tải...</p>}

      {data && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th className="ps-3">Nhân viên</th>
                  <th>Gian hàng</th>
                  <th className="text-end">Ngày công</th>
                  <th className="text-end">Giờ làm</th>
                  <th className="text-end">Muộn/sớm</th>
                  <th className="text-end">Lương gộp</th>
                  <th className="text-end">Phạt</th>
                  <th className="text-end pe-3">Thực nhận</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.userId} style={{ cursor: "pointer" }} onClick={() => openDetail(r)}>
                    <td className="ps-3">
                      <span className="fw-semibold">{r.fullName}</span>
                      {r.missingCheckoutDays > 0 && (
                        <span className="badge text-bg-danger ms-2" title="Số ngày thiếu check-out">{r.missingCheckoutDays} ngày thiếu out</span>
                      )}
                    </td>
                    <td>{r.stallName || "—"}</td>
                    <td className="text-end">{r.daysWorked}</td>
                    <td className="text-end">{fmtMinutes(r.workedMinutes)}</td>
                    <td className="text-end">{r.lateMinutes + r.earlyMinutes}p</td>
                    <td className="text-end">{fmtMoney(r.gross)}</td>
                    <td className="text-end text-danger">−{fmtMoney(r.penalty)}</td>
                    <td className="text-end fw-bold pe-3">{fmtMoney(r.net)}</td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="fw-bold">
                    <td className="ps-3" colSpan={5}>Tổng cộng</td>
                    <td className="text-end">{fmtMoney(data.totals.gross)}</td>
                    <td className="text-end text-danger">−{fmtMoney(data.totals.penalty)}</td>
                    <td className="text-end pe-3">{fmtMoney(data.totals.net)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {data.rows.length === 0 && <p className="text-muted p-3 mb-0">Không có dữ liệu.</p>}
        </div>
      )}

      <p className="small text-muted mt-2">
        Lương ngày = lương giờ × số giờ làm trong ca − (phút muộn + phút về sớm) × tiền phạt mỗi phút. Thực nhận cả tháng không âm. Bấm vào 1 dòng để xem từng ngày.
      </p>

      {detail && (
        <Modal title={`${detail.row.fullName} — ${month}`} onClose={() => setDetail(null)} width={720}>
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Ngày</th><th>Vào</th><th>Ra</th><th className="text-end">Giờ làm</th>
                  <th className="text-end">Muộn</th><th className="text-end">Sớm</th>
                  <th className="text-end">Gộp</th><th className="text-end">Phạt</th><th className="text-end">Thực nhận</th>
                </tr>
              </thead>
              <tbody>
                {detail.result.days.map((d) => (
                  <tr key={d.date}>
                    <td className="text-nowrap">{fmtDateLong(d.date).replace(/^[^,]+, /, "")}</td>
                    <td>{fmtTime(d.firstIn)}</td>
                    <td>{d.missingCheckout ? <span className="text-danger">thiếu</span> : fmtTime(d.lastOut)}</td>
                    <td className="text-end">{fmtMinutes(d.workedMinutes)}</td>
                    <td className="text-end">{d.lateMinutes}p</td>
                    <td className="text-end">{d.earlyMinutes}p</td>
                    <td className="text-end">{fmtMoney(d.gross)}</td>
                    <td className="text-end text-danger">−{fmtMoney(d.penalty)}</td>
                    <td className="text-end">{fmtMoney(d.net)}</td>
                  </tr>
                ))}
                {detail.result.days.length === 0 && (
                  <tr><td colSpan={9} className="text-muted">Không có ngày công.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="small text-muted">
            Cấu hình đã dùng: ca {detail.result.config.shift.start}–{detail.result.config.shift.end}, phạt {fmtMoney(detail.result.config.penaltyPerMinute)}/phút.
          </div>
        </Modal>
      )}
    </div>
  );
}
