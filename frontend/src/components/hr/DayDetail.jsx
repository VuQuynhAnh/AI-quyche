import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "./Modal.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtDateLong, fmtMinutes, fmtTime, vnDateKey } from "../../utils/format.js";

// Chi tiết 1 ngày của 1 nhân viên (admin): giờ vào, giờ ra và lịch sử các lần
// chấm công theo thứ tự thời gian. Lịch sử KHÔNG sửa/xoá được; nút "Chỉnh sửa"
// đặt lại giờ vào và/hoặc giờ ra — các lần chỉnh được ghi là "Đã thay đổi bởi
// admin" (giờ gốc vẫn được giữ). Tháng đã qua: không chỉnh sửa được.
export default function DayDetail({ userId, fullName, date, onClose, onChanged }) {
  const { notifySuccess, notifyError } = useNotification();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // {checkIn, checkOut}
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/hr/attendance/day?userId=${userId}&date=${date}`));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [userId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const valid = data ? data.events.filter((e) => e.status === "valid") : [];
  const firstIn = valid.find((e) => e.type === "in");
  const lastOut = [...valid].reverse().find((e) => e.type === "out");
  const hhmm = (iso) => (iso ? fmtTime(iso) : "");

  function startEdit() {
    setEditing({ checkIn: hhmm(firstIn?.occurred_at), checkOut: hhmm(lastOut?.occurred_at) });
  }

  const changed =
    editing &&
    ((editing.checkIn && editing.checkIn !== hhmm(firstIn?.occurred_at)) ||
      (editing.checkOut && editing.checkOut !== hhmm(lastOut?.occurred_at)));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/hr/attendance/day-edit", {
        userId, date, checkIn: editing.checkIn || null, checkOut: editing.checkOut || null,
      });
      notifySuccess("Đã lưu chỉnh sửa.");
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const locked = data?.locked;
  const day = data?.day;
  // Chỉ hiện giờ ĐƯỢC GHI NHẬN, theo thứ tự thời gian (giờ gốc đã bị thay vẫn
  // lưu trong CSDL nhưng không hiện ở đây)
  const history = [...valid].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const isToday = date === vnDateKey();

  return (
    <Modal title={`${fullName} — ${fmtDateLong(date)}`} onClose={onClose} width={520}>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {!data && !error && <p className="text-muted">Đang tải...</p>}

      {data && (
        <>
          <div className="row g-2 mb-1 small">
            <Box label="Giờ vào" value={firstIn ? fmtTime(firstIn.occurred_at) : "—"} />
            <Box label="Giờ ra" value={lastOut ? fmtTime(lastOut.occurred_at) : isToday && firstIn ? "Đang làm" : "—"} />
            <Box label="Giờ làm" value={day ? fmtMinutes(day.workedMinutes) : "—"} />
          </div>
          {day && (day.lateMinutes > 0 || day.earlyMinutes > 0) && (
            <div className="small text-warning mb-1">
              {day.lateMinutes > 0 && <>Muộn {day.lateMinutes} phút. </>}
              {day.earlyMinutes > 0 && <>Về sớm {day.earlyMinutes} phút.</>}
            </div>
          )}

          {!editing && (
            <div className="d-flex justify-content-between align-items-center mt-3 mb-1">
              <h3 className="h6 mb-0">Lịch sử chấm công</h3>
              {locked ? (
                <span className="badge text-bg-secondary">Tháng đã khoá</span>
              ) : (
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={startEdit}>
                  Chỉnh sửa
                </button>
              )}
            </div>
          )}

          {editing && (
            <form onSubmit={save} className="border rounded p-3 mt-3 bg-light">
              <div className="fw-semibold small mb-2">Chỉnh sửa giờ vào / giờ ra</div>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small mb-1">Giờ vào</label>
                  <input type="time" className="form-control" value={editing.checkIn} onChange={(e) => setEditing({ ...editing, checkIn: e.target.value })} />
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1">Giờ ra</label>
                  <input type="time" className="form-control" value={editing.checkOut} onChange={(e) => setEditing({ ...editing, checkOut: e.target.value })} />
                </div>
                <div className="col-12 form-text mt-1">Có thể sửa một hoặc cả hai. Lần chấm gốc vẫn được giữ trong lịch sử.</div>
                <div className="col-12 d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(null)}>Đóng</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!changed || saving}>
                    {saving ? "Đang lưu..." : "Lưu"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {history.length === 0 && <p className="text-muted small mt-2">Chưa có lần chấm công nào.</p>}
          {history.map((ev) => (
            <div key={ev.id} className="event-row">
              <span className={`event-badge ${ev.type}`}>{ev.type === "in" ? "VÀO" : "RA"}</span>
              <span className="fw-semibold">{fmtTime(ev.occurred_at)}</span>
              <span className="ms-auto small text-muted text-end">
                {ev.method === "admin" ? (
                  <span className="badge text-bg-info">Đã thay đổi bởi admin</span>
                ) : (
                  ev.lat != null && (
                    <a href={`https://www.google.com/maps?q=${ev.lat},${ev.lng}`} target="_blank" rel="noreferrer">
                      Vị trí{ev.out_of_range && <span className="text-danger"> (ngoài phạm vi)</span>}
                    </a>
                  )
                )}
              </span>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

function Box({ label, value }) {
  return (
    <div className="col-4">
      <div className="border rounded p-2 h-100">
        <div className="text-muted">{label}</div>
        <div className="fw-bold">{value}</div>
      </div>
    </div>
  );
}
