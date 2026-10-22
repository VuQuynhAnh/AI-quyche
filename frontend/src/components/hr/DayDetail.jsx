import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "./Modal.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import {
  CLOCKING_ACTION, CLOCKING_HISTORY_STATUS, CLOCKING_SOURCE,
} from "../../constants/enums.js";
import { fmtDateLong, fmtMinutes, fmtTime, vnDateKey } from "../../utils/format.js";
import TimeInput from "./TimeInput.jsx";

// Chi tiết 1 ngày của 1 nhân viên (admin): giờ vào, giờ ra và bảng lịch sử
// chấm công (mỗi dòng = 1 lần ghi nhận: trạng thái sau lần đó, hình thức,
// nội dung giờ vào/ra). Lịch sử KHÔNG sửa/xoá được; nút "Chỉnh sửa" đặt lại giờ vào
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
  // data.histories xếp theo thời điểm ghi nhận (nhật ký) — giờ vào/ra phải xét theo giờ chấm
  const valid = data
    ? data.histories
        .filter((h) => h.status === CLOCKING_HISTORY_STATUS.VALID)
        .sort((a, b) => new Date(a.clockTime) - new Date(b.clockTime))
    : [];
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
    <Modal title={`${fullName} — ${fmtDateLong(date)}`} onClose={onClose} width={760}>
      {error && <div className="alert alert-danger py-2">{error}</div>}

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
            <form onSubmit={save} className="border-top pt-3 mt-3">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className="small text-muted">Vào</span>
                <TimeInput label="Giờ vào" value={editing.checkInTime} onChange={(v) => setEditing({ ...editing, checkInTime: v })} />
                <span className="text-muted">→</span>
                <span className="small text-muted">Ra</span>
                <TimeInput label="Giờ ra" value={editing.checkOutTime} onChange={(v) => setEditing({ ...editing, checkOutTime: v })} />
                <div className="ms-auto d-flex gap-2">
                  <button type="button" className="btn btn-light btn-sm" onClick={() => setEditing(null)}>Huỷ</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!changed || saving}>
                    {saving ? "Đang lưu..." : "Lưu"}
                  </button>
                </div>
              </div>
              <div className="form-text mt-1">Sửa một hoặc cả hai giờ. Lần chấm gốc vẫn được giữ trong lịch sử.</div>
            </form>
          )}

          {data.histories.length === 0 && <p className="text-muted small mt-2">Chưa có lần chấm công nào.</p>}
          {data.histories.length > 0 && (
            <div className="table-responsive mt-2">
              <table className="table table-sm table-hover align-middle small mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                    <th>Hình thức</th>
                    <th>Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {buildChangeLog(data.histories, clocking).map((row) => (
                    <tr key={row.key}>
                      <td className="text-nowrap">{fmtLogTime(row.createdAt)}</td>
                      <td>{row.status}</td>
                      <td>
                        {row.method}
                        {row.byName && <div className="small text-muted">{row.byName}</div>}
                        {row.location && (
                          <div className="small">
                            <a href={`https://www.google.com/maps?q=${row.location.latitude},${row.location.longitude}`} target="_blank" rel="noreferrer">
                              Vị trí{row.location.isOutOfRange && <span className="text-danger"> (ngoài phạm vi)</span>}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>{row.content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

// ---------- Lịch sử chấm công dạng bảng ----------
// Phát lại các lần ghi nhận theo thứ tự created_at, giữ trạng thái giờ vào/ra
// hiện hành sau mỗi lần. Các dòng admin tạo trong cùng 1 lần "Lưu" có cùng
// created_at (cùng transaction) nên gộp thành 1 dòng. Kết quả: mới nhất trước.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const vnMinuteOfDay = (iso) => Math.floor((((new Date(iso).getTime() + VN_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60000);
const hmToMinutes = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
// "22/10/2026 10:21"
const fmtLogTime = (iso) => `${fmtDateLong(vnDateKey(new Date(iso))).split(", ")[1]} ${fmtTime(iso)}`;
// 60 -> "1 giờ 0 phút", 15 -> "15 phút"
const fmtDuration = (min) => (min >= 60 ? `${Math.floor(min / 60)} giờ ${min % 60} phút` : `${min} phút`);

function describeIn(iso, clocking) {
  if (!iso) return "Giờ vào: --:--";
  let text = `Giờ vào: ${fmtTime(iso)}`;
  if (clocking) {
    const diff = hmToMinutes(clocking.shiftStartTime) - vnMinuteOfDay(iso);
    if (diff > 0) text += `, làm thêm trước ca: ${fmtDuration(diff)}`;
    else if (diff < 0) text += `, đi muộn: ${fmtDuration(-diff)}`;
  }
  return text;
}

function describeOut(iso, clocking) {
  if (!iso) return "Giờ ra: --:--";
  let text = `Giờ ra: ${fmtTime(iso)}`;
  if (clocking) {
    const diff = vnMinuteOfDay(iso) - hmToMinutes(clocking.shiftEndTime);
    if (diff > 0) text += `, làm thêm sau ca: ${fmtDuration(diff)}`;
    else if (diff < 0) text += `, về sớm: ${fmtDuration(-diff)}`;
  }
  return text;
}

function buildChangeLog(histories, clocking) {
  const groups = [];
  for (const h of histories) {
    const last = groups[groups.length - 1];
    const sameBatch =
      last && h.source === CLOCKING_SOURCE.ADMIN && last.source === CLOCKING_SOURCE.ADMIN &&
      new Date(last.createdAt).getTime() === new Date(h.createdAt).getTime();
    if (sameBatch) last.items.push(h);
    else groups.push({ source: h.source, createdAt: h.createdAt, items: [h] });
  }

  const state = { in: null, out: null };
  const rows = groups.map((g) => {
    const changedIn = g.items.find((h) => h.actionType === CLOCKING_ACTION.CHECK_IN);
    const changedOut = [...g.items].reverse().find((h) => h.actionType === CLOCKING_ACTION.CHECK_OUT);
    if (changedIn) state.in = changedIn.clockTime;
    if (changedOut) state.out = changedOut.clockTime;

    // Chỉ nêu phần thay đổi; phía còn trống thì ghi --:-- cho rõ
    const parts = [];
    if (changedIn || !state.in) parts.push(describeIn(state.in, clocking));
    if (changedOut || !state.out) parts.push(describeOut(state.out, clocking));

    const byAdmin = g.source === CLOCKING_SOURCE.ADMIN;
    const first = g.items[0];
    return {
      key: first.id,
      createdAt: g.createdAt,
      status: state.out ? "Đã chấm công ra" : "Đã chấm công vào",
      method: byAdmin ? (g.items.some((h) => h.replacedHistoryId) ? "Điều chỉnh" : "Thủ công") : "Chấm công QR",
      byName: byAdmin ? first.createdByName || "Admin" : null,
      location: !byAdmin && first.latitude != null ? first : null,
      content: parts.join(". "),
    };
  });
  return rows.reverse();
}
