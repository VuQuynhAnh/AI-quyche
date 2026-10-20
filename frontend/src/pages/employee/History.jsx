import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client.js";
import MonthNav from "../../components/hr/MonthNav.jsx";
import {
  CLOCKING_ACTION_LABEL, CLOCKING_HISTORY_STATUS, CLOCKING_SOURCE, PAYSHEET_STATUS,
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
    if (info.isMissingCheckOut) return info.workDate === todayKey ? "working" : "bad";
    if (info.lateMinutes > 0 || info.earlyLeaveMinutes > 0) return "warn";
    return "ok";
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
              <div key={n} className="cal-dow">
                {n}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((c) =>
              c.empty ? (
                <div key={c.key} className="cal-cell empty" />
              ) : (
                <button
                  key={c.key}
                  type="button"
                  className={`cal-cell ${cls(c.info)} ${c.key === todayKey ? "today" : ""}`}
                  onClick={() => setSelected(c.key)}
                >
                  <span>{c.day}</span>
                  {c.info && (
                    <span className="cal-hours">
                      {c.info.isMissingCheckOut ? (c.key === todayKey ? "…" : "!") : (c.info.workedMinutes / 60).toFixed(1)}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
          <div className="small text-muted mt-2 d-flex flex-wrap gap-3">
            <span><i className="legend-dot" style={{ background: "#e7f7ec" }} />Đủ giờ</span>
            <span><i className="legend-dot" style={{ background: "#fff5db" }} />Muộn/về sớm</span>
            <span><i className="legend-dot" style={{ background: "#fde8e8" }} />! Thiếu check-out</span>
            <span>Số trong ô = giờ làm</span>
          </div>
        </>
      )}

      {selected && <DaySheet workDate={selected} info={dayMap.get(selected)} onClose={() => setSelected(null)} />}
    </div>
  );
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

// Chi tiết từng lần chấm công của 1 ngày
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
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{fmtDateLong(workDate)}</h2>
          <button type="button" className="btn-close" aria-label="Đóng" onClick={onClose} />
        </div>

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
          <div key={h.id} className="event-row">
            <span className={`event-badge ${h.actionType}`}>{CLOCKING_ACTION_LABEL[h.actionType]}</span>
            <span className="fw-semibold">{fmtTime(h.clockTime)}</span>
            {h.source === CLOCKING_SOURCE.ADMIN && <span className="ms-auto small text-muted">Đã thay đổi bởi admin</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
