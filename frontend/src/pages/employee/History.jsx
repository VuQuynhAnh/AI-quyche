import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client.js";
import MonthNav from "../../components/hr/MonthNav.jsx";
import {
  CLOCKING_ACTION, CLOCKING_ACTION_LABEL, CLOCKING_HISTORY_STATUS, CLOCKING_SOURCE, PAYSHEET_STATUS,
} from "../../constants/enums.js";
import {
  daysInMonth, firstWeekdayMonFirst, fmtDateLong, fmtMinutes, fmtMoney, fmtTime, vnDateKey, vnMonthKey,
} from "../../utils/format.js";

// Nguồn số lương hiển thị: bảng lương của cửa hàng (nháp/đã chốt) hoặc tạm tính
const SALARY_SOURCE_LABEL = {
  [PAYSHEET_STATUS.FINALIZED]: "Lương đã chốt",
  [PAYSHEET_STATUS.DRAFT]: "Lương theo bảng lương nháp (chưa chốt)",
};
const ESTIMATE_LABEL = "Lương tạm tính (tới hiện tại)";

// Màu ô lịch theo tình trạng ngày (dùng chung cho chú thích)
const DAY_COLOR = {
  ok: "bg-success-subtle border-success-subtle",
  warn: "bg-warning-subtle border-warning-subtle",
  bad: "bg-danger-subtle border-danger-subtle",
  working: "bg-primary-subtle border-primary-subtle",
};
const EVENT_BADGE = { [CLOCKING_ACTION.CHECK_IN]: "text-bg-success", [CLOCKING_ACTION.CHECK_OUT]: "text-bg-warning" };

// Lịch sử chấm công theo tháng: lưới lịch (màu theo tình trạng ngày) + tổng
// kết tháng. Bấm vào 1 ngày để xem từng lần chấm công của ngày đó.
export default function History() {
  const [month, setMonth] = useState(vnMonthKey());
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // workDate

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError("");
    api
      .get(`/clocking/me/month?month=${month}`)
      .then((d) => !cancelled && setResult(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const dayMap = useMemo(() => new Map((result?.days || []).map((d) => [d.workDate, d])), [result]);
  const total = daysInMonth(month);
  const lead = firstWeekdayMonFirst(month);
  const todayKey = vnDateKey();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ empty: true, key: `e${i}` });
  for (let d = 1; d <= total; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    cells.push({ key, day: d, info: dayMap.get(key) });
  }

  function cls(info) {
    if (!info) return "";
    // Hôm nay đã check-in nhưng chưa check-out = đang làm, chưa phải lỗi
    if (info.isMissingCheckOut) return DAY_COLOR[info.workDate === todayKey ? "working" : "bad"];
    if (info.lateMinutes > 0 || info.earlyLeaveMinutes > 0) return DAY_COLOR.warn;
    return DAY_COLOR.ok;
  }

  const salary = result?.salary;

  return (
    <div>
      <div className="text-center mb-3">
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {result && (
        <>
          <div className="row g-2 mb-3">
            <Stat label="Ngày công" value={salary.workedDays} />
            <Stat label="Giờ làm" value={fmtMinutes(salary.workedMinutes)} />
            <Stat label="Đi muộn" value={fmtMinutes(salary.lateMinutes)} />
            <Stat label="Về sớm" value={fmtMinutes(salary.earlyLeaveMinutes)} />
          </div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body d-flex justify-content-between align-items-center">
              <div>
                <div className="text-muted small">{SALARY_SOURCE_LABEL[result.paysheetStatus] || ESTIMATE_LABEL}</div>
                <div className="fs-4 fw-bold">{fmtMoney(salary.netSalary)}</div>
              </div>
              <div className="text-end small text-muted">
                <div>Lương giờ: {fmtMoney(salary.hourlyWage)}</div>
                <div>Gộp: {fmtMoney(salary.grossSalary)}</div>
                <div>Phạt: −{fmtMoney(salary.penaltyAmount)}</div>
              </div>
            </div>
          </div>

          <div className="cal-grid mb-1">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((n) => (
              <div key={n} className="text-center small text-muted">
                {n}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((c) =>
              c.empty ? (
                <div key={c.key} />
              ) : (
                <button
                  key={c.key}
                  type="button"
                  className={`cal-cell ${cls(c.info)} ${c.key === todayKey ? "border-primary border-2" : ""}`}
                  onClick={() => setSelected(c.key)}
                >
                  <span>{c.day}</span>
                  {c.info && (
                    <span className="small fw-semibold">
                      {c.info.isMissingCheckOut ? (c.key === todayKey ? "…" : "!") : (c.info.workedMinutes / 60).toFixed(1)}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
          <div className="small text-muted mt-2 d-flex flex-wrap gap-3">
            <span><LegendDot color={DAY_COLOR.ok} />Đủ giờ</span>
            <span><LegendDot color={DAY_COLOR.warn} />Muộn/về sớm</span>
            <span><LegendDot color={DAY_COLOR.bad} />! Thiếu check-out</span>
            <span>Số trong ô = giờ làm</span>
          </div>
        </>
      )}

      {selected && <DaySheet workDate={selected} info={dayMap.get(selected)} onClose={() => setSelected(null)} />}
    </div>
  );
}

function LegendDot({ color }) {
  return <i className={`d-inline-block rounded-1 border me-1 align-middle ${color}`} style={{ width: 10, height: 10 }} />;
}

function Stat({ label, value }) {
  return (
    <div className="col-6">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body py-2">
          <div className="text-muted small">{label}</div>
          <div className="fs-5 fw-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

// Chi tiết từng lần chấm công của 1 ngày — offcanvas trượt từ dưới lên
function DaySheet({ workDate, info, onClose }) {
  const [histories, setHistories] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/clocking/me/day?date=${workDate}`)
      .then((d) => !cancelled && setHistories(d.histories.filter((h) => h.status === CLOCKING_HISTORY_STATUS.VALID)))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [workDate]);

  return (
    <>
      <div className="offcanvas-backdrop fade show" onMouseDown={onClose} />
      <div
        className="offcanvas offcanvas-bottom show rounded-top-4"
        style={{ height: "auto", maxHeight: "80dvh", maxWidth: 560, marginInline: "auto" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="offcanvas-header pb-2">
          <h2 className="offcanvas-title h6">{fmtDateLong(workDate)}</h2>
          <button type="button" className="btn-close" aria-label="Đóng" onClick={onClose} />
        </div>
        <div className="offcanvas-body pt-0" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>

        {info && (
          <div className="small text-muted mb-2">
            Làm {fmtMinutes(info.workedMinutes)}
            {info.lateMinutes > 0 && <> · muộn {info.lateMinutes} phút</>}
            {info.earlyLeaveMinutes > 0 && <> · về sớm {info.earlyLeaveMinutes} phút</>}
            {" · "}
            {fmtMoney(info.netSalary)}
            {info.isMissingCheckOut && workDate !== vnDateKey() && (
              <div className="text-danger mt-1">Thiếu check-out — hãy báo quản trị viên để chỉnh.</div>
            )}
          </div>
        )}

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {histories && histories.length === 0 && <p className="text-muted mb-0">Không có lần chấm công nào trong ngày này.</p>}
        {histories?.map((h) => (
          <div key={h.id} className="d-flex align-items-center gap-2 py-2 border-bottom">
            <span className={`badge ${EVENT_BADGE[h.actionType]}`}>{CLOCKING_ACTION_LABEL[h.actionType]}</span>
            <span className="fw-semibold">{fmtTime(h.clockTime)}</span>
            {h.source === CLOCKING_SOURCE.ADMIN && <span className="ms-auto small text-muted">Đã thay đổi bởi admin</span>}
          </div>
        ))}
        </div>
      </div>
    </>
  );
}
