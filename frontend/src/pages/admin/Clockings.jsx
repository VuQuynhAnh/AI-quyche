import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client.js";
import DayDetail from "../../components/hr/DayDetail.jsx";
import MonthNav from "../../components/hr/MonthNav.jsx";
import { fmtMinutes, vnDateKey, vnMonthKey } from "../../utils/format.js";

// Bảng công tháng của cửa hàng: mỗi nhân viên 1 dòng, mỗi ngày 1 ô (số giờ làm).
// Bấm vào ô để xem từng lần chấm công + vị trí, và chỉnh sửa (nếu tháng chưa chốt lương).
export default function Clockings() {
  const [month, setMonth] = useState(vnMonthKey());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null); // { employeeId, fullName, date }
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    api
      .get(`/hr/clockings/overview?month=${month}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [month, reloadKey]);

  const days = useMemo(() => Array.from({ length: data?.daysInMonth || 0 }, (_, i) => i + 1), [data]);
  const dow = (d) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = CN
  };

  const todayKey = vnDateKey();
  function cellClass(info) {
    if (!info) return "";
    if (info.isMissingCheckOut) return info.workDate === todayKey ? "working" : "bad";
    if (info.lateMinutes > 0 || info.earlyLeaveMinutes > 0) return "warn";
    return "ok";
  }

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <MonthNav month={month} onChange={setMonth} />
        {data?.locked && <span className="badge text-bg-secondary">Đã chốt lương — không sửa được</span>}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!data && !error && <p className="text-muted">Đang tải...</p>}

      {data && (
        <div className="card">
          <div className="table-responsive" style={{ maxHeight: "calc(100dvh - 260px)" }}>
            <table className="att-table w-100">
              <thead>
                <tr>
                  <th className="att-name">Nhân viên</th>
                  {days.map((d) => (
                    <th key={d} className={dow(d) === 0 ? "text-danger" : ""}>
                      <div>{d}</div>
                      <div style={{ fontSize: "0.62rem", fontWeight: 400 }}>{["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dow(d)]}</div>
                    </th>
                  ))}
                  <th style={{ minWidth: 64 }}>Tổng giờ</th>
                  <th style={{ minWidth: 56 }}>Muộn/sớm</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const byDate = new Map(r.days.map((d) => [d.workDate, d]));
                  return (
                    <tr key={r.employeeId}>
                      <td className="att-name">
                        <div className={`fw-semibold ${r.isActive ? "" : "text-muted"}`}>{r.fullName}</div>
                        <div className="text-muted" style={{ fontSize: "0.7rem" }}>{r.jobTitle || "—"}</div>
                      </td>
                      {days.map((d) => {
                        const key = `${month}-${String(d).padStart(2, "0")}`;
                        const info = byDate.get(key);
                        return (
                          <td
                            key={d}
                            className={`att-cell ${cellClass(info)}`}
                            title={info ? `Muộn ${info.lateMinutes}p · Sớm ${info.earlyLeaveMinutes}p` : "Không có công"}
                            onClick={() => setDetail({ employeeId: r.employeeId, fullName: r.fullName, date: key })}
                          >
                            {info ? (info.isMissingCheckOut ? (key === todayKey ? "…" : "!") : (info.workedMinutes / 60).toFixed(1)) : <span className="text-muted">·</span>}
                          </td>
                        );
                      })}
                      <td className="fw-semibold">{fmtMinutes(r.totals.workedMinutes)}</td>
                      <td className={r.totals.lateMinutes + r.totals.earlyLeaveMinutes > 0 ? "text-warning fw-semibold" : "text-muted"}>
                        {r.totals.lateMinutes + r.totals.earlyLeaveMinutes}p
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && <p className="text-muted p-3 mb-0">Chưa có nhân viên nào.</p>}
        </div>
      )}

      {data && (
        <div className="small text-muted mt-2 d-flex flex-wrap gap-3">
          <span><i className="legend-dot" style={{ background: "#e7f7ec" }} />Đủ giờ</span>
          <span><i className="legend-dot" style={{ background: "#fff5db" }} />Muộn / về sớm</span>
          <span><i className="legend-dot" style={{ background: "#fde8e8" }} />! Thiếu check-out</span>
          <span><i className="legend-dot" style={{ background: "#e8f0fe" }} />… Đang làm hôm nay</span>
          <span>Số trong ô = giờ làm trong ca. Bấm vào ô để xem chi tiết và vị trí.</span>
        </div>
      )}

      {detail && (
        <DayDetail
          {...detail}
          onClose={() => setDetail(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
