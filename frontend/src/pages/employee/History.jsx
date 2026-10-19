import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client.js";
import MonthNav from "../../components/hr/MonthNav.jsx";
import {
  daysInMonth, firstWeekdayMonFirst, fmtDateLong, fmtMinutes, fmtMoney, fmtTime, vnDateKey, vnMonthKey,
} from "../../utils/format.js";

// Lịch sử chấm công theo tháng: lưới lịch (màu theo tình trạng ngày) + tổng
// kết tháng. Bấm vào 1 ngày để xem từng lần chấm công của ngày đó.
export default function History() {
  const [month, setMonth] = useState(vnMonthKey());
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // dateKey

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError("");
    api
      .get(`/attendance/me/month?month=${month}`)
      .then((d) => !cancelled && setResult(d.result))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const dayMap = useMemo(() => new Map((result?.days || []).map((d) => [d.date, d])), [result]);
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
    if (info.missingCheckout) return info.date === todayKey ? "working" : "bad";
    if (info.lateMinutes > 0 || info.earlyMinutes > 0) return "warn";
    return "ok";
  }

  return (
    <div>
      <div className="text-center mb-3">
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!result && !error && <p className="text-muted text-center">Đang tải...</p>}

      {result && (
        <>
          <div className="row g-2 mb-3">
            <Stat label="Ngày công" value={result.totals.daysWorked} />
            <Stat label="Giờ làm" value={fmtMinutes(result.totals.workedMinutes)} />
            <Stat label="Đi muộn" value={fmtMinutes(result.totals.lateMinutes)} />
            <Stat label="Về sớm" value={fmtMinutes(result.totals.earlyMinutes)} />
          </div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body d-flex justify-content-between align-items-center">
              <div>
                <div className="text-muted small">
                  {result.locked ? "Lương đã chốt" : "Lương tạm tính (tới hiện tại)"}
                </div>
                <div className="fs-4 fw-bold">{fmtMoney(result.totals.net)}</div>
              </div>
              <div className="text-end small text-muted">
                <div>Gộp: {fmtMoney(result.totals.gross)}</div>
                <div>Phạt: −{fmtMoney(result.totals.penalty)}</div>
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
                      {c.info.missingCheckout ? (c.key === todayKey ? "…" : "!") : (c.info.workedMinutes / 60).toFixed(1)}
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

      {selected && <DaySheet dateKey={selected} info={dayMap.get(selected)} onClose={() => setSelected(null)} />}
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
function DaySheet({ dateKey, info, onClose }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/attendance/me/day?date=${dateKey}`)
      .then((d) => !cancelled && setEvents(d.events))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{fmtDateLong(dateKey)}</h2>
          <button type="button" className="btn-close" aria-label="Đóng" onClick={onClose} />
        </div>

        {info && (
          <div className="small text-muted mb-2">
            Làm {fmtMinutes(info.workedMinutes)}
            {info.lateMinutes > 0 && <> · muộn {info.lateMinutes} phút</>}
            {info.earlyMinutes > 0 && <> · về sớm {info.earlyMinutes} phút</>}
            {" · "}
            {fmtMoney(info.net)}
            {info.missingCheckout && dateKey !== vnDateKey() && (
              <div className="text-danger mt-1">Thiếu check-out — hãy báo quản trị viên để chỉnh.</div>
            )}
          </div>
        )}

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {!events && !error && <p className="text-muted">Đang tải...</p>}
        {events && events.filter((e) => e.status === "valid").length === 0 && <p className="text-muted mb-0">Không có lần chấm công nào trong ngày này.</p>}
        {events &&
          events
            .filter((e) => e.status === "valid")
            .map((e) => (
              <div key={e.id} className="event-row">
                <span className={`event-badge ${e.type}`}>{e.type === "in" ? "VÀO" : "RA"}</span>
                <span className="fw-semibold">{fmtTime(e.occurred_at)}</span>
                {e.method === "admin" && (
                  <span className="ms-auto small text-muted">Đã thay đổi bởi admin</span>
                )}
              </div>
            ))}
      </div>
    </div>
  );
}
