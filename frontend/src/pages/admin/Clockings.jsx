import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import DayDetail from "../../components/hr/DayDetail.jsx";
import MonthNav from "../../components/hr/MonthNav.jsx";
import { WeekNav } from "../../components/hr/PeriodNav.jsx";
import { addDays, fmtDayMonth, fmtMinutes, fmtTime, vnDateKey, vnMonthKey, weekStart } from "../../utils/format.js";

// Màu ô theo tình trạng ngày (dùng chung cho chú thích)
const DAY_COLOR = {
  ok: "bg-success-subtle",
  warn: "bg-warning-subtle",
  bad: "bg-danger-subtle",
  working: "bg-primary-subtle",
};

const DOW_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dowOf = (dateKey) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = CN
};

// Bảng công của cửa hàng theo TUẦN (mặc định) hoặc THÁNG: mỗi nhân viên 1 dòng,
// mỗi ngày 1 ô (số giờ làm; xem theo tuần thì thêm giờ vào–ra). Bấm vào ô để
// xem từng lần chấm công + vị trí, và chỉnh sửa (nếu tháng chưa chốt lương).
export default function Clockings() {
  const todayKey = vnDateKey();
  const [view, setView] = useState("week"); // "week" | "month"
  const [week, setWeek] = useState(weekStart(todayKey)); // Thứ Hai của tuần đang xem
  const [month, setMonth] = useState(vnMonthKey());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null); // { employeeId, fullName, date }
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    const query = view === "week" ? `from=${week}&to=${addDays(week, 6)}` : `month=${month}`;
    api
      .get(`/hr/clockings/overview?${query}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [view, week, month, reloadKey]);

  // Đổi chế độ xem: giữ mốc thời gian gần nhất với khoảng đang xem
  function switchView(next) {
    if (next === view) return;
    if (next === "month") {
      const weekEnd = addDays(week, 6);
      setMonth((weekEnd < todayKey ? weekEnd : todayKey).slice(0, 7));
    } else {
      setWeek(weekStart(month === vnMonthKey() ? todayKey : `${month}-01`));
    }
    setData(null);
    setView(next);
  }

  const isWeek = view === "week";
  const lockedMonths = data?.lockedMonths || [];
  const fmtMonth = (m) => `${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;

  function cellClass(info) {
    if (!info) return "";
    if (info.isMissingCheckOut) return DAY_COLOR[info.workDate === todayKey ? "working" : "bad"];
    if (info.lateMinutes > 0 || info.earlyLeaveMinutes > 0) return DAY_COLOR.warn;
    return DAY_COLOR.ok;
  }

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <div className="d-inline-flex border rounded-3 bg-white p-1 gap-1" role="group" aria-label="Chế độ xem">
            {[["week", "Tuần"], ["month", "Tháng"]].map(([key, text]) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm border-0 px-3 ${view === key ? "btn-primary" : "text-body-secondary"}`}
                onClick={() => switchView(key)}
              >
                {text}
              </button>
            ))}
          </div>
          {isWeek ? <WeekNav week={week} onChange={setWeek} /> : <MonthNav month={month} onChange={setMonth} />}
        </div>
        <div className="d-flex flex-wrap align-items-center gap-3 small text-muted">
          {lockedMonths.length > 0 && (
            <span className="badge text-bg-secondary">
              Tháng {lockedMonths.map(fmtMonth).join(", ")} đã chốt lương — không sửa được
            </span>
          )}
          <span><LegendDot color={DAY_COLOR.ok} />Đủ giờ</span>
          <span><LegendDot color={DAY_COLOR.warn} />Muộn / về sớm</span>
          <span><LegendDot color={DAY_COLOR.bad} />! Thiếu check-out</span>
          <span><LegendDot color={DAY_COLOR.working} />… Đang làm hôm nay</span>
          <span title="Số trong ô = giờ làm trong ca. Bấm vào ô để xem chi tiết và vị trí.">ⓘ Bấm ô để xem chi tiết</span>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {data && (
        <div className="card">
          <div className="table-responsive" style={{ maxHeight: "calc(100dvh - 260px)" }}>
            <table className="att-table w-100">
              <thead>
                <tr>
                  <th className="att-name">Nhân viên</th>
                  {data.dates.map((key) => (
                    <th
                      key={key}
                      className={`${dowOf(key) === 0 ? "text-danger" : ""} ${key === todayKey ? "text-primary" : ""}`}
                      style={isWeek ? { minWidth: 96 } : undefined}
                    >
                      {/* Tuần: "T2" + "20/10"; tháng: "20" + "T2" */}
                      <div>{isWeek ? DOW_LABEL[dowOf(key)] : Number(key.slice(8))}</div>
                      <div style={{ fontSize: "0.62rem", fontWeight: 400 }}>{isWeek ? fmtDayMonth(key) : DOW_LABEL[dowOf(key)]}</div>
                    </th>
                  ))}
                  {/* 2 cột tổng được ghim bên phải khi cuộn ngang (xem .att-total, .att-late) */}
                  <th className="att-total">Tổng giờ</th>
                  <th className="att-late">Muộn/sớm</th>
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
                      {data.dates.map((key) => {
                        const info = byDate.get(key);
                        return (
                          // Màu tô ở khối bên trong (không tô cả ô) để giữa các ngày luôn có khoảng hở
                          <td
                            key={key}
                            className="att-day"
                            title={info ? `Muộn ${info.lateMinutes}p · Sớm ${info.earlyLeaveMinutes}p` : "Không có công"}
                            onClick={() => setDetail({ employeeId: r.employeeId, fullName: r.fullName, date: key })}
                          >
                            <div className={`att-cell ${isWeek ? "att-cell-week" : ""} ${cellClass(info)}`}>
                              {info ? (info.isMissingCheckOut ? (key === todayKey ? "…" : "!") : (info.workedMinutes / 60).toFixed(1)) : <span className="text-muted">·</span>}
                              {isWeek && info && (
                                <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                                  {fmtTime(info.checkInTime)}–{info.checkOutTime ? fmtTime(info.checkOutTime) : "--:--"}
                                </div>
                              )}
                              {isWeek && info && info.lateMinutes + info.earlyLeaveMinutes > 0 && (
                                <div className="text-warning-emphasis" style={{ fontSize: "0.68rem" }}>
                                  {[info.lateMinutes > 0 && `Muộn ${info.lateMinutes}p`, info.earlyLeaveMinutes > 0 && `Sớm ${info.earlyLeaveMinutes}p`]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="att-total fw-semibold">{fmtMinutes(r.totals.workedMinutes)}</td>
                      <td className={`att-late ${r.totals.lateMinutes + r.totals.earlyLeaveMinutes > 0 ? "text-warning fw-semibold" : "text-muted"}`}>
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

function LegendDot({ color }) {
  return <i className={`d-inline-block rounded-1 border me-1 align-middle ${color}`} style={{ width: 10, height: 10 }} />;
}

