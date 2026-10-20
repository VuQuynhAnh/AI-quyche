import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "./Modal.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import {
  CLOCKING_ACTION, CLOCKING_ACTION_LABEL, CLOCKING_HISTORY_STATUS, CLOCKING_SOURCE,
} from "../../constants/enums.js";
import { fmtDateLong, fmtMinutes, fmtTime, vnDateKey } from "../../utils/format.js";

// Chi tiết 1 ngày của 1 nhân viên (admin): giờ vào, giờ ra và lịch sử các lần
// chấm công. Lịch sử KHÔNG sửa/xoá được; nút "Chỉnh sửa" đặt lại giờ vào
// và/hoặc giờ ra — lần cũ được giữ (đánh dấu đã thay), lần mới ghi "Admin chỉnh".
// Tháng đã chốt lương: không chỉnh sửa được.
export default function DayDetail({ employeeId, fullName, date, onClose, onChanged }) {
  const { notifySuccess, notifyError } = useNotification();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { checkInTime, checkOutTime }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/hr/clockings/day?employeeId=${employeeId}&date=${date}`));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [employeeId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const clocking = data?.clocking;
  const valid = data ? data.histories.filter((h) => h.status === CLOCKING_HISTORY_STATUS.VALID) : [];
  const firstIn = valid.find((h) => h.actionType === CLOCKING_ACTION.CHECK_IN);
  const lastOut = [...valid].reverse().find((h) => h.actionType === CLOCKING_ACTION.CHECK_OUT);
  const hhmm = (iso) => (iso ? fmtTime(iso) : "");

  function startEdit() {
    setEditing({ checkInTime: hhmm(firstIn?.clockTime), checkOutTime: hhmm(lastOut?.clockTime) });
  }

  const changed =
    editing &&
    ((editing.checkInTime && editing.checkInTime !== hhmm(firstIn?.clockTime)) ||
      (editing.checkOutTime && editing.checkOutTime !== hhmm(lastOut?.clockTime)));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      setData(
        await api.post("/hr/clockings/day-edit", {
          employeeId,
          date,
          checkInTime: editing.checkInTime || null,
          checkOutTime: editing.checkOutTime || null,
        })
      );
      notifySuccess("Đã lưu chỉnh sửa.");
      setEditing(null);
      onChanged?.();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isToday = date === vnDateKey();

  return (
    <Modal title={`${fullName} — ${fmtDateLong(date)}`} onClose={onClose} width={520}>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {!data && !error && <p className="text-muted">Đang tải...</p>}

      {data && (
        <>
          <div className="row g-2 mb-1 small">
            <Box label="Giờ vào" value={firstIn ? fmtTime(firstIn.clockTime) : "—"} />
            <Box label="Giờ ra" value={lastOut ? fmtTime(lastOut.clockTime) : isToday && firstIn ? "Đang làm" : "—"} />
            <Box label="Giờ làm" value={clocking ? fmtMinutes(clocking.workedMinutes) : "—"} />
          </div>
          {clocking && (
            <div className="small text-muted mb-1">
              Ca {clocking.shiftStartTime}–{clocking.shiftEndTime}
              {clocking.lateMinutes > 0 && <span className="text-warning"> · Muộn {clocking.lateMinutes} phút</span>}
              {clocking.earlyLeaveMinutes > 0 && <span className="text-warning"> · Về sớm {clocking.earlyLeaveMinutes} phút</span>}
            </div>
          )}

          {!editing && (
            <div className="d-flex justify-content-between align-items-center mt-3 mb-1">
              <h3 className="h6 mb-0">Lịch sử chấm công</h3>
              {data.locked ? (
                <span className="badge text-bg-secondary">Đã chốt lương</span>
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
                  <input type="time" className="form-control" value={editing.checkInTime} onChange={(e) => setEditing({ ...editing, checkInTime: e.target.value })} />
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1">Giờ ra</label>
                  <input type="time" className="form-control" value={editing.checkOutTime} onChange={(e) => setEditing({ ...editing, checkOutTime: e.target.value })} />
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

          {data.histories.length === 0 && <p className="text-muted small mt-2">Chưa có lần chấm công nào.</p>}
          {data.histories.map((h) => {
            const voided = h.status === CLOCKING_HISTORY_STATUS.VOIDED;
            return (
              <div key={h.id} className={`event-row ${voided ? "opacity-50" : ""}`}>
                <span className={`event-badge ${h.actionType}`}>{CLOCKING_ACTION_LABEL[h.actionType]}</span>
                <span className={`fw-semibold ${voided ? "text-decoration-line-through" : ""}`}>{fmtTime(h.clockTime)}</span>
                <span className="ms-auto small text-muted text-end">
                  {voided ? (
                    <span className="badge text-bg-light border">Đã được thay</span>
                  ) : h.source === CLOCKING_SOURCE.ADMIN ? (
                    <span className="badge text-bg-info">Admin chỉnh</span>
                  ) : (
                    h.latitude != null && (
                      <a href={`https://www.google.com/maps?q=${h.latitude},${h.longitude}`} target="_blank" rel="noreferrer">
                        Vị trí{h.isOutOfRange && <span className="text-danger"> (ngoài phạm vi)</span>}
                      </a>
                    )
                  )}
                </span>
              </div>
            );
          })}
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
