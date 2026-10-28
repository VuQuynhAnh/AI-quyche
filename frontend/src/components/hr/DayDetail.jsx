import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "./Modal.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import {
  CLOCKING_ACTION, CLOCKING_HISTORY_STATUS, CLOCKING_METHOD, CLOCKING_SOURCE,
} from "../../constants/enums.js";
import { fmtDateLong, fmtMinutes, fmtTime, vnDateKey } from "../../utils/format.js";
import TimeInput from "./TimeInput.jsx";
import ClockLocationModal from "./ClockLocationModal.jsx";
import HelpTip from "../HelpTip.jsx";

// Chi tiết 1 ngày của 1 nhân viên (admin): giờ vào, giờ ra và bảng lịch sử
// chấm công (mỗi dòng = 1 lần ghi nhận: trạng thái sau lần đó, hình thức,
// nội dung giờ vào/ra). Lịch sử KHÔNG sửa/xoá được; nút "Chỉnh sửa" đặt lại giờ vào
// và/hoặc giờ ra — lần cũ được giữ (đánh dấu đã thay), lần mới ghi "Admin chỉnh".
// Tháng đã chốt lương: không chỉnh sửa được.
export default function DayDetail({ employeeId, fullName, date, onClose, onChanged }) {
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [locationRow, setLocationRow] = useState(null); // dòng lịch sử đang xem vị trí
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

  // Bỏ trống CẢ 2 ô (khi ngày đó đã có lần chấm) = xoá giờ chấm để nhân viên chấm lại từ đầu
  const isReset = Boolean(editing && !editing.checkInTime && !editing.checkOutTime && (firstIn || lastOut));
  const changed =
    editing &&
    (isReset ||
      (editing.checkInTime && editing.checkInTime !== hhmm(firstIn?.clockTime)) ||
      (editing.checkOutTime && editing.checkOutTime !== hhmm(lastOut?.clockTime)));

  // Xoá chấm công cả ngày: huỷ mọi lần chấm còn hiệu lực để nhân viên chấm lại từ đầu
  async function resetDay() {
    const ok = await confirm(
      `Xoá chấm công ngày ${date.split("-").reverse().join("/")} của ${fullName}?\n\n` +
        "Nhân viên sẽ chấm công lại từ đầu (check-in rồi check-out). Các lần chấm cũ vẫn được giữ trong lịch sử với trạng thái đã huỷ.",
      { confirmText: "Xoá chấm công", danger: true }
    );
    if (!ok) return;
    setSaving(true);
    try {
      setData(await api.post("/hr/clockings/day-edit", { employeeId, date, reset: true }));
      notifySuccess("Đã xoá chấm công — nhân viên có thể chấm công lại.");
      setEditing(null);
      onChanged?.();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (isReset) return resetDay();
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
                <HelpTip>
                  Sửa một hoặc cả hai giờ. Bỏ trống cả 2 ô (bấm vào ô → "Bỏ trống") để xoá giờ chấm, cho nhân viên chấm lại
                  từ đầu. Lần chấm gốc vẫn được giữ trong lịch sử.
                </HelpTip>
                <div className="ms-auto d-flex gap-2">
                  {(firstIn || lastOut) && !isReset && (
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={resetDay} disabled={saving}>
                      Xoá chấm công
                    </button>
                  )}
                  <button type="button" className="btn btn-light btn-sm" onClick={() => setEditing(null)}>Huỷ</button>
                  <button type="submit" className={`btn btn-sm ${isReset ? "btn-danger" : "btn-primary"}`} disabled={!changed || saving}>
                    {isReset ? "Xoá chấm công" : "Lưu"}
                  </button>
                </div>
              </div>
              {isReset && (
                <div className="small text-danger mt-2">
                  Đã bỏ trống cả giờ vào và giờ ra — lưu lại sẽ xoá giờ chấm ngày này để nhân viên chấm công lại từ đầu.
                </div>
              )}
            </form>
          )}

          {data.histories.length === 0 && <p className="text-muted small mt-2">Chưa có lần chấm công nào.</p>}
          {/* Điện thoại: mỗi lần ghi nhận 1 khối (bảng 4 cột bị ép chữ gãy dòng) */}
          {data.histories.length > 0 && (
            <ul className="list-group list-group-flush mt-2 d-sm-none">
              {buildChangeLog(data.histories, clocking).map((row) => (
                <li key={row.key} className={`list-group-item px-0 ${row.isReset ? "list-group-item-danger px-2" : ""}`}>
                  <div className="d-flex justify-content-between gap-2">
                    <span className="fw-semibold">{row.status}</span>
                    <span className="small text-muted text-nowrap">{fmtLogTime(row.createdAt)}</span>
                  </div>
                  <div className="small text-muted">
                    {row.method}
                    {row.byName && ` · ${row.byName}`}
                    {row.location && (
                      <>
                        {" · "}
                        <button type="button" className="btn btn-link btn-sm p-0 align-baseline small" onClick={() => setLocationRow(row)}>
                          Vị trí{row.location.isOutOfRange && <span className="text-danger"> (ngoài phạm vi)</span>}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="small mt-1">{row.content}</div>
                </li>
              ))}
            </ul>
          )}
          {data.histories.length > 0 && (
            <div className="table-responsive mt-2 d-none d-sm-block">
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
                    <tr key={row.key} className={row.isReset ? "table-danger" : ""}>
                      <td className="text-nowrap">{fmtLogTime(row.createdAt)}</td>
                      <td>{row.status}</td>
                      <td>
                        {row.method}
                        {row.byName && <div className="small text-muted">{row.byName}</div>}
                        {row.location && (
                          <div className="small">
                            <button type="button" className="btn btn-link btn-sm p-0 align-baseline small" onClick={() => setLocationRow(row)}>
                              Vị trí{row.location.isOutOfRange && <span className="text-danger"> (ngoài phạm vi)</span>}
                            </button>
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

      {locationRow && (
        <ClockLocationModal
          title={`Vị trí ${locationRow.status.toLowerCase()} — ${fmtLogTime(locationRow.createdAt)}`}
          point={locationRow.location}
          store={data?.storeLocation || null}
          onClose={() => setLocationRow(null)}
        />
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
  // 1) Các lần ghi nhận (nhân viên chấm / admin thêm-sửa). Dòng admin tạo trong
  //    cùng 1 lần "Lưu" có cùng created_at nên gộp lại.
  const events = [];
  for (const h of histories) {
    const last = events[events.length - 1];
    const sameBatch =
      last && last.kind === "record" && h.source === CLOCKING_SOURCE.ADMIN && last.source === CLOCKING_SOURCE.ADMIN &&
      new Date(last.at).getTime() === new Date(h.createdAt).getTime();
    if (sameBatch) last.items.push(h);
    else events.push({ kind: "record", source: h.source, at: h.createdAt, items: [h] });
  }

  // 2) "Xoá chấm công": các lần bị huỷ mà KHÔNG có lần nào thay thế (sửa giờ thì
  //    luôn có lần mới trỏ về lần cũ). Huỷ cùng 1 thao tác -> cùng voidedAt.
  const replacedIds = new Set(histories.map((h) => h.replacedHistoryId).filter(Boolean));
  const resets = new Map();
  for (const h of histories) {
    if (h.status !== CLOCKING_HISTORY_STATUS.VOIDED || replacedIds.has(h.id) || !h.voidedAt) continue;
    const key = new Date(h.voidedAt).getTime();
    if (!resets.has(key)) resets.set(key, { kind: "reset", at: h.voidedAt, byName: h.voidedByName, items: [] });
    resets.get(key).items.push(h);
  }
  events.push(...resets.values());
  events.sort((a, b) => new Date(a.at) - new Date(b.at));

  // 3) Phát lại theo thời gian, giữ giờ vào/ra hiện hành sau mỗi thao tác
  const state = { in: null, out: null };
  const rows = events.map((g) => {
    if (g.kind === "reset") {
      const before = [state.in && `giờ vào ${fmtTime(state.in)}`, state.out && `giờ ra ${fmtTime(state.out)}`].filter(Boolean);
      state.in = null;
      state.out = null;
      return {
        key: `reset-${g.items[0].id}`,
        createdAt: g.at,
        status: "Xoá chấm công",
        method: "Điều chỉnh",
        byName: g.byName || "Admin",
        location: null,
        content: `Đã xoá ${before.length ? before.join(" và ") : "giờ chấm"} — nhân viên chấm công lại từ đầu.`,
        isReset: true,
      };
    }

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
    const action = changedIn && changedOut ? "giờ vào và ra" : changedIn ? "giờ vào" : "giờ ra";
    const isEdit = g.items.some((h) => h.replacedHistoryId);
    return {
      key: first.id,
      createdAt: g.at,
      status: byAdmin
        ? `${isEdit ? "Sửa" : "Thêm"} ${action}`
        : first.actionType === CLOCKING_ACTION.CHECK_IN ? "Chấm công vào" : "Chấm công ra",
      method: byAdmin
        ? (isEdit ? "Điều chỉnh" : "Thủ công")
        : first.method === CLOCKING_METHOD.WIFI ? "Chấm công Wi-Fi" : "Chấm công QR",
      byName: byAdmin ? first.createdByName || "Admin" : null,
      location: !byAdmin && first.latitude != null ? first : null,
      content: parts.join(". "),
    };
  });
  return rows.reverse();
}
