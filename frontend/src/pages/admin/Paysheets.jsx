import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import MonthNav from "../../components/hr/MonthNav.jsx";
import HelpTip from "../../components/HelpTip.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { PAYSHEET_STATUS, PAYSHEET_STATUS_LABEL } from "../../constants/enums.js";
import { addMonths, fmtDate, fmtDateLong, fmtDateTime, fmtMinutes, fmtMoney, fmtTime, monthLabel, vnMonthKey } from "../../utils/format.js";
import { downloadPayslipCsv, printPayslip } from "../../utils/payslip.js";

// Bảng lương tháng của cửa hàng:
//   Tạo bảng lương ──▶ Nháp ──(Tính lại)──▶ Nháp ──(Chốt)──▶ Đã chốt
//                        └───────(Huỷ)──▶ Đã huỷ ◀──(Huỷ)───────┘
// Mỗi tháng chỉ có 1 bảng lương chưa huỷ. Bảng đã chốt: số liệu đóng băng và
// chấm công tháng đó bị khoá; huỷ bảng đã chốt để mở khoá và lập lại.
export default function Paysheets() {
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [month, setMonth] = useState(vnMonthKey());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [cancelling, setCancelling] = useState(null); // { reason }

  useEffect(() => {
    let cancelled = false;
    setError("");
    setData(null);
    api
      .get(`/hr/paysheets?month=${month}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [month]);

  async function run(action, successMessage) {
    setBusy(true);
    try {
      setData(await action());
      notifySuccess(successMessage);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const paysheet = data?.paysheet;

  const createPaysheet = () =>
    run(() => api.post("/hr/paysheets", { payMonth: month }), `Đã tạo bảng lương ${monthLabel(month).toLowerCase()}.`);

  const recalculate = () =>
    run(() => api.post(`/hr/paysheets/${paysheet.id}/recalculate`), "Đã tính lại bảng lương.");

  async function finalize() {
    const ok = await confirm(
      `Chốt bảng lương ${monthLabel(month).toLowerCase()}? Sau khi chốt, số liệu không đổi nữa và chấm công tháng này bị khoá.`,
      { confirmText: "Chốt lương" }
    );
    if (ok) await run(() => api.post(`/hr/paysheets/${paysheet.id}/finalize`), "Đã chốt bảng lương.");
  }

  async function submitCancel(e) {
    e.preventDefault();
    await run(() => api.post(`/hr/paysheets/${paysheet.id}/cancel`, { reason: cancelling.reason }), "Đã huỷ bảng lương.");
    setCancelling(null);
  }

  async function exportCsv() {
    try {
      await api.downloadFile(`/hr/paysheets/${paysheet.id}/export`, `bang-luong-${month}.csv`);
    } catch (e) {
      notifyError(e.message);
    }
  }

  const statusInfo = paysheet ? PAYSHEET_STATUS_LABEL[paysheet.status] : null;
  const isDraft = paysheet?.status === PAYSHEET_STATUS.DRAFT;
  // Ngày sớm nhất chốt được lương của tháng đang xem (ngày 1 tháng sau)
  const finalizableFrom = fmtDate(`${addMonths(month, 1)}-01`);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <MonthNav month={month} onChange={setMonth} />
          {statusInfo && <span className={`badge ${statusInfo.cls}`}>{statusInfo.text}</span>}
        </div>
        {paysheet && (
          <div className="d-flex flex-wrap gap-2">
            {isDraft && (
              <>
                <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy} onClick={recalculate}>Tính lại</button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={busy || !data.isMonthEnded}
                  onClick={finalize}
                >
                  Chốt lương
                </button>
              </>
            )}
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={exportCsv}>Xuất CSV</button>
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => setCancelling({ reason: "" })}>
              Huỷ bảng lương
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {data && !paysheet && (
        <div className="card">
          <div className="card-body text-center py-5">
            <p className="mb-1">
              Chưa có bảng lương {monthLabel(month).toLowerCase()}.
              <HelpTip>Bảng lương được tính từ chấm công, lương giờ và tiền phạt hiện tại của cửa hàng.</HelpTip>
            </p>
            {!data.isMonthEnded && (
              <p className="text-muted small">
                Tháng chưa kết thúc: có thể tạo bảng lương nháp để xem trước, chốt lương được từ ngày {finalizableFrom}.
              </p>
            )}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={createPaysheet}>
              Tạo bảng lương
            </button>
          </div>
        </div>
      )}

      {paysheet && (
        <>
          {isDraft && !data.isMonthEnded && (
            <div className="alert alert-info py-2">
              <strong>{monthLabel(month)} chưa kết thúc</strong> nên chưa chốt lương được — chốt được từ ngày{" "}
              <strong>{finalizableFrom}</strong>. Nhân viên vẫn chấm công bình thường; khi chốt, hệ thống tự tính lại
              lần cuối với đủ dữ liệu cả tháng.
            </div>
          )}
          {paysheet.isOutdated && (
            <div className="alert alert-warning d-flex justify-content-between align-items-center py-2">
              <span>Có thay đổi chấm công, lương giờ hoặc thiết lập sau lần tính gần nhất.</span>
              <button type="button" className="btn btn-warning btn-sm" disabled={busy} onClick={recalculate}>Tính lại ngay</button>
            </div>
          )}

          <div className="row g-2 mb-3">
            <Stat label="Nhân viên" value={paysheet.employeeCount} />
            <Stat label="Tổng giờ làm" value={fmtMinutes(paysheet.totalWorkedMinutes)} />
            <Stat label="Tổng tiền phạt" value={fmtMoney(paysheet.totalPenaltyAmount)} />
            <Stat label="Tổng thực nhận" value={fmtMoney(paysheet.totalNetSalary)} strong />
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th className="ps-3">Nhân viên</th>
                    <th className="text-end">Lương giờ</th>
                    <th className="text-end">Ngày công</th>
                    <th className="text-end">Giờ làm</th>
                    <th className="text-end">Muộn/sớm</th>
                    <th className="text-end">Lương gộp</th>
                    <th className="text-end">Phạt</th>
                    <th className="text-end pe-3">
                      Thực nhận
                      <HelpTip>
                        Lương ngày = lương giờ × giờ làm trong ca − (phút muộn + phút về sớm) × tiền phạt mỗi phút. Thực nhận
                        cả tháng không âm. Bấm vào 1 dòng để xem từng ngày.
                      </HelpTip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.details.map((d) => (
                    <tr key={d.id} className="cursor-pointer" onClick={() => setDetail(d)}>
                      <td className="ps-3">
                        <span className="fw-semibold">{d.fullName}</span>
                        {d.missingCheckOutDays > 0 && (
                          <span className="badge text-bg-danger ms-2" title="Số ngày thiếu check-out">{d.missingCheckOutDays} ngày thiếu ra</span>
                        )}
                        <div className="small text-muted">{d.jobTitle || "—"}</div>
                      </td>
                      <td className="text-end">{fmtMoney(d.hourlyWage)}</td>
                      <td className="text-end">{d.workedDays}</td>
                      <td className="text-end">{fmtMinutes(d.workedMinutes)}</td>
                      <td className="text-end">{d.lateMinutes + d.earlyLeaveMinutes}p</td>
                      <td className="text-end">{fmtMoney(d.grossSalary)}</td>
                      <td className="text-end text-danger">{d.penaltyAmount > 0 ? `−${fmtMoney(d.penaltyAmount)}` : ""}</td>
                      <td className="text-end fw-bold pe-3">{fmtMoney(d.netSalary)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.details.length > 0 && (
                  <tfoot>
                    <tr className="fw-bold">
                      <td className="ps-3" colSpan={5}>Tổng cộng</td>
                      <td className="text-end">{fmtMoney(paysheet.totalGrossSalary)}</td>
                      <td className="text-end text-danger">{paysheet.totalPenaltyAmount > 0 ? `−${fmtMoney(paysheet.totalPenaltyAmount)}` : ""}</td>
                      <td className="text-end pe-3">{fmtMoney(paysheet.totalNetSalary)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {data.details.length === 0 && <p className="text-muted p-3 mb-0">Không có nhân viên nào.</p>}
          </div>

          <div className="small text-muted mt-2">
            Tạo bởi {paysheet.createdByName || "—"} lúc {fmtDateTime(paysheet.createdAt)} · Tính gần nhất {fmtDateTime(paysheet.calculatedAt)} · Phạt {fmtMoney(paysheet.penaltyAmountPerMinute)}/phút
            {paysheet.finalizedAt && <> · Chốt bởi {paysheet.finalizedByName || "—"} lúc {fmtDateTime(paysheet.finalizedAt)}</>}
          </div>
        </>
      )}

      {data?.cancelledPaysheets.length > 0 && (
        <div className="mt-4">
          <h2 className="h6">Bảng lương đã huỷ của tháng này</h2>
          <ul className="list-group">
            {data.cancelledPaysheets.map((p) => (
              <li key={p.id} className="list-group-item small">
                Huỷ bởi <strong>{p.cancelledByName || "—"}</strong> lúc {fmtDateTime(p.cancelledAt)}
                {p.finalizedAt && " (đã từng chốt)"} · thực nhận {fmtMoney(p.totalNetSalary)}
                {p.cancelReason && <div className="text-muted">Lý do: {p.cancelReason}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cancelling && (
        <Modal
          title="Huỷ bảng lương"
          onClose={() => setCancelling(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setCancelling(null)}>Đóng</button>
              <button type="submit" form="cancel-form" className="btn btn-danger" disabled={busy}>Huỷ bảng lương</button>
            </>
          }
        >
          <form id="cancel-form" onSubmit={submitCancel}>
            <p className="small">
              {paysheet?.status === PAYSHEET_STATUS.FINALIZED
                ? "Bảng lương này đã chốt. Huỷ sẽ mở khoá chấm công của tháng để chỉnh sửa và lập bảng lương mới."
                : "Huỷ bảng lương nháp này. Bạn có thể tạo bảng lương mới cho tháng ngay sau đó."}
            </p>
            <label className="form-label small mb-1">Lý do (tuỳ chọn)</label>
            <textarea className="form-control" rows={2} maxLength={500} value={cancelling.reason} onChange={(e) => setCancelling({ reason: e.target.value })} />
          </form>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`${detail.fullName} — ${monthLabel(month)}`}
          onClose={() => setDetail(null)}
          width={760}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => downloadPayslipCsv(detail, { month, statusLabel: statusInfo?.text })}>
                Xuất file
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => printPayslip(detail, { month, statusLabel: statusInfo?.text }) || notifyError("Trình duyệt đã chặn cửa sổ in — hãy cho phép pop-up rồi thử lại.")}
              >
                In / PDF
              </button>
            </>
          }
        >
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
                {detail.dailyBreakdown.map((d) => (
                  <tr key={d.workDate}>
                    <td className="text-nowrap">{fmtDateLong(d.workDate).replace(/^[^,]+, /, "")}</td>
                    <td>{fmtTime(d.checkInTime)}</td>
                    <td>{d.isMissingCheckOut ? <span className="text-danger">thiếu</span> : fmtTime(d.checkOutTime)}</td>
                    <td className="text-end">{fmtMinutes(d.workedMinutes)}</td>
                    {/* Ô bằng 0 để trống cho dễ nhìn ra ngày có đi muộn / về sớm / bị phạt */}
                    <td className="text-end">{d.lateMinutes > 0 ? `${d.lateMinutes}p` : ""}</td>
                    <td className="text-end">{d.earlyLeaveMinutes > 0 ? `${d.earlyLeaveMinutes}p` : ""}</td>
                    <td className="text-end">{fmtMoney(d.grossSalary)}</td>
                    <td className="text-end text-danger">{d.penaltyAmount > 0 ? `−${fmtMoney(d.penaltyAmount)}` : ""}</td>
                    <td className="text-end">{fmtMoney(d.netSalary)}</td>
                  </tr>
                ))}
                {detail.dailyBreakdown.length === 0 && (
                  <tr><td colSpan={9} className="text-muted">Không có ngày công.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="small text-muted">Lương giờ đã dùng: {fmtMoney(detail.hourlyWage)}.</div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="col-6 col-md-3">
      <div className="card h-100">
        <div className="card-body py-2">
          <div className="text-muted small">{label}</div>
          <div className={`fs-5 ${strong ? "fw-bold" : "fw-semibold"}`}>{value}</div>
        </div>
      </div>
    </div>
  );
}
