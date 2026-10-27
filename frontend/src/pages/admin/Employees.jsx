import { useEffect, useRef, useState } from "react";
import { api, assetUrl } from "../../api/client.js";
import { resizeImageToSquare } from "../../utils/image.js";
import Modal from "../../components/hr/Modal.jsx";
import MoneyInput from "../../components/hr/MoneyInput.jsx";
import DateInput from "../../components/hr/DateInput.jsx";
import HelpTip from "../../components/HelpTip.jsx";
import { ROLE } from "../../constants/enums.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtDate, fmtMoney } from "../../utils/format.js";

const EMPTY = { fullName: "", email: "", password: "", phoneNumber: "", jobTitle: "", hourlyWage: "", role: ROLE.USER, startWorkDate: "" };

// Người của cửa hàng (admin + nhân viên) — nơi duy nhất admin quản lý người:
// thông tin, lương giờ (1 mức duy nhất), tài khoản đăng nhập, thăng làm admin /
// hạ xuống nhân viên, cho nghỉ việc / nhận lại, và xoá. Chỉ xoá được người
// ĐÃ NGHỈ (phải bấm "Cho nghỉ việc" trước) để tránh xoá nhầm người đang làm.
export default function Employees() {
  const { user: me } = useAuth();
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showActive, setShowActive] = useState(true); // bộ lọc: Đang làm (mặc định) / Đã nghỉ
  const avatarInputRef = useRef(null);

  async function load() {
    try {
      setEmployees((await api.get("/hr/employees")).employees);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function openEdit(emp) {
    setForm({
      id: emp.id, fullName: emp.fullName, email: emp.email, password: "", phoneNumber: emp.phoneNumber || "",
      jobTitle: emp.jobTitle || "", hourlyWage: String(emp.hourlyWage ?? 0), originalWage: emp.hourlyWage ?? 0,
      startWorkDate: emp.startWorkDate || "",
      isActive: emp.isActive, role: emp.role, orig: emp,
    });
  }

  async function save(e) {
    e.preventDefault();
    if (form.id) {
      const notes = [];
      if (form.role !== form.orig.role) {
        notes.push(form.role === ROLE.ADMIN
          ? "• Thăng làm admin: người này sẽ vào được trang quản trị, xem và sửa chấm công, lương của cả cửa hàng."
          : "• Hạ xuống nhân viên: người này sẽ không vào được trang quản trị nữa.");
      }
      if (form.email.trim().toLowerCase() !== form.orig.email) {
        notes.push(`• Đổi email đăng nhập: ${form.orig.email} → ${form.email.trim()}. Lần đăng nhập sau phải dùng email mới.`);
      }
      if (notes.length) {
        const ok = await confirm(`Lưu thay đổi cho "${form.orig.fullName}"?\n\n${notes.join("\n")}`, {
          confirmText: "Lưu", danger: form.role !== form.orig.role,
        });
        if (!ok) return;
      }
    }
    setSaving(true);
    try {
      const body = {
        fullName: form.fullName, phoneNumber: form.phoneNumber, jobTitle: form.jobTitle,
        hourlyWage: Number(form.hourlyWage || 0), role: form.role, startWorkDate: form.startWorkDate || null,
      };
      if (form.id) {
        if (form.password) body.password = form.password;
        body.email = form.email;
        await api.patch(`/hr/employees/${form.id}`, body);
        notifySuccess("Đã cập nhật nhân viên.");
      } else {
        const { employee } = await api.post("/hr/employees", { ...body, email: form.email, password: form.password });
        // Ảnh chọn trước khi tạo: tải lên ngay sau khi có id nhân viên
        if (form.pendingAvatar) await uploadAvatar(employee.id, form.pendingAvatar);
        notifySuccess("Đã tạo tài khoản nhân viên.");
      }
      setForm(null);
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- Ảnh đại diện ----------
  function uploadAvatar(employeeId, blob) {
    const fd = new FormData();
    fd.append("avatar", blob, "avatar.jpg");
    return api.postForm(`/hr/employees/${employeeId}/avatar`, fd);
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // chọn lại cùng 1 file vẫn nhận
    if (!file) return;
    try {
      const blob = await resizeImageToSquare(file);
      if (!form.id) {
        // Nhân viên mới: giữ ảnh tạm, tải lên sau khi bấm Lưu
        if (form.pendingAvatarUrl) URL.revokeObjectURL(form.pendingAvatarUrl);
        setForm((f) => ({ ...f, pendingAvatar: blob, pendingAvatarUrl: URL.createObjectURL(blob) }));
        return;
      }
      const { employee } = await uploadAvatar(form.id, blob);
      setForm((f) => ({ ...f, orig: { ...f.orig, avatarUrl: employee.avatarUrl } }));
      notifySuccess("Đã cập nhật ảnh đại diện.");
      await load();
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function deleteAvatar() {
    if (!form.id) {
      if (form.pendingAvatarUrl) URL.revokeObjectURL(form.pendingAvatarUrl);
      setForm((f) => ({ ...f, pendingAvatar: null, pendingAvatarUrl: null }));
      return;
    }
    const ok = await confirm("Xoá ảnh đại diện của nhân viên này?", { confirmText: "Xoá ảnh", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/hr/employees/${form.id}/avatar`);
      setForm((f) => ({ ...f, orig: { ...f.orig, avatarUrl: null } }));
      notifySuccess("Đã xoá ảnh đại diện.");
      await load();
    } catch (err) {
      notifyError(err.message);
    }
  }

  // Cho nghỉ việc (khoá đăng nhập) hoặc nhận lại người đã nghỉ
  async function setWorking(isActive) {
    const name = form.orig.fullName;
    const ok = await confirm(
      isActive
        ? `Nhận lại "${name}"? Người này sẽ đăng nhập và chấm công được trở lại.`
        : `Cho "${name}" nghỉ việc?\n\nNgười này sẽ không đăng nhập, chấm công được nữa. Dữ liệu chấm công và lương cũ vẫn được giữ.`,
      { confirmText: isActive ? "Nhận lại" : "Cho nghỉ việc", danger: !isActive }
    );
    if (!ok) return;
    try {
      await api.patch(`/hr/employees/${form.id}`, { isActive });
      notifySuccess(isActive ? `Đã nhận lại "${name}".` : `Đã cho "${name}" nghỉ việc.`);
      setForm(null);
      await load();
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function remove() {
    const ok = await confirm(
      `Xoá hẳn "${form.orig.fullName}" (${form.orig.email})? Không thể hoàn tác.\n\n` +
        "Chỉ xoá được khi người này chưa có dữ liệu chấm công/lương — nếu đã có, cứ để ở danh sách Đã nghỉ.",
      { confirmText: "Xoá", danger: true }
    );
    if (!ok) return;
    try {
      await api.delete(`/hr/employees/${form.id}`);
      notifySuccess("Đã xoá.");
      setForm(null);
      await load();
    } catch (err) {
      notifyError(err.message);
    }
  }

  const wageChanged = form?.id && Number(form.hourlyWage) !== Number(form.originalWage);
  const isSelf = form?.id && form.orig.accountId === me?.id;
  const emailChanged = form?.id && form.email.trim().toLowerCase() !== form.orig.email;
  const readOnly = Boolean(form?.id && !form.orig.isActive);
  const activeCount = employees.filter((e) => e.isActive).length;
  const shownEmployees = employees.filter((e) => e.isActive === showActive);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Lọc theo trạng thái">
          <button type="button" className={`btn ${showActive ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setShowActive(true)}>
            Đang làm ({activeCount})
          </button>
          <button type="button" className={`btn ${!showActive ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setShowActive(false)}>
            Đã nghỉ ({employees.length - activeCount})
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY })}>
          + Thêm nhân viên
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th className="ps-3">Họ tên</th>
                <th>Chức danh</th>
                <th>SĐT</th>
                <th className="text-end">
                  Lương giờ<HelpTip>Đổi lương giờ chỉ ảnh hưởng các bảng lương chưa chốt.</HelpTip>
                </th>
                <th>Trạng thái</th>
                <th className="pe-3" />
              </tr>
            </thead>
            <tbody>
              {shownEmployees.map((e) => (
                <tr key={e.id} className={e.isActive ? "" : "text-muted"}>
                  <td className="ps-3">
                    <div className="d-flex align-items-center gap-2">
                      <Avatar name={e.fullName} src={assetUrl(e.avatarUrl)} size={36} />
                      <div className="min-w-0">
                        <div className="fw-semibold">
                          {e.fullName}
                          {e.role === ROLE.ADMIN && <span className="badge text-bg-primary ms-2 fw-normal">Admin</span>}
                        </div>
                        <div className="small text-muted">{e.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.jobTitle || "—"}</td>
                  <td>{e.phoneNumber || "—"}</td>
                  <td className="text-end">{fmtMoney(e.hourlyWage ?? 0)}</td>
                  <td>{e.isActive ? <span className="badge text-bg-success">Đang làm</span> : <span className="badge text-bg-secondary">Đã nghỉ</span>}</td>
                  <td className="pe-3 text-end">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(e)}>Sửa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && shownEmployees.length === 0 && (
          <p className="text-muted p-3 mb-0">{showActive ? "Chưa có nhân viên nào đang làm." : "Không có ai đã nghỉ việc."}</p>
        )}
      </div>

      {form && (
        <Modal
          title={form.id ? "Hồ sơ nhân viên" : "Thêm nhân viên"}
          onClose={() => setForm(null)}
          width={820}
          footer={
            <>
              {/* Đang làm: chỉ cho nghỉ việc. Đã nghỉ: nhận lại hoặc xoá hẳn. */}
              {form.id && !isSelf && form.orig.isActive && (
                <button type="button" className="btn btn-outline-danger me-auto" onClick={() => setWorking(false)}>Cho nghỉ việc</button>
              )}
              {form.id && !isSelf && !form.orig.isActive && (
                <div className="me-auto d-flex gap-2">
                  <button type="button" className="btn btn-outline-success" onClick={() => setWorking(true)}>Nhận lại</button>
                  <button type="button" className="btn btn-outline-danger" onClick={remove}>Xoá</button>
                </div>
              )}
              <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>{readOnly ? "Đóng" : "Huỷ"}</button>
              {!readOnly && (
                <button type="submit" form="emp-form" className="btn btn-primary" disabled={saving}>Lưu</button>
              )}
            </>
          }
        >
          {/* Người đã nghỉ: chỉ xem — phải "Nhận lại" trước rồi mới sửa được */}
          <form id="emp-form" onSubmit={save}>
          <fieldset disabled={readOnly} className="row g-3">
            {/* Cột trái: thẻ hồ sơ (avatar, họ tên, chức danh, vai trò, trạng thái) */}
            <aside className="col-sm-4">
              <div className="bg-body-tertiary border rounded-3 px-3 py-4 d-flex flex-column align-items-center text-center gap-2">
                <div className="position-relative d-inline-block mb-1">
                  <Avatar name={form.fullName} src={form.pendingAvatarUrl || assetUrl(form.orig?.avatarUrl)} size={96} className="shadow" />
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn btn-primary rounded-circle position-absolute bottom-0 end-0 p-0 d-flex align-items-center justify-content-center border border-2 border-white shadow-sm square-32"
                      title="Đổi ảnh đại diện"
                      aria-label="Đổi ảnh đại diện"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                  )}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickAvatar} />
                {!readOnly && (form.pendingAvatarUrl || form.orig?.avatarUrl) && (
                  <button type="button" className="btn btn-link btn-sm text-danger p-0" onClick={deleteAvatar}>Xoá ảnh</button>
                )}
                <input
                  className="form-control text-center fw-bold emp-profile-input"
                  required
                  placeholder="Họ và tên"
                  aria-label="Họ tên"
                  value={form.fullName}
                  onChange={set("fullName")}
                />
                <input
                  className="form-control form-control-sm text-center text-body-secondary emp-profile-input"
                  placeholder="Chức danh (VD: Thu ngân)"
                  aria-label="Chức danh"
                  value={form.jobTitle}
                  onChange={set("jobTitle")}
                />
                <div className="d-flex flex-wrap justify-content-center gap-1 mt-2">
                  {form.role === ROLE.ADMIN && <span className="badge text-bg-primary">Admin</span>}
                  {form.id &&
                    (form.orig.isActive
                      ? <span className="badge text-bg-success">Đang làm</span>
                      : <span className="badge text-bg-secondary">Đã nghỉ</span>)}
                </div>
                {form.startWorkDate && (
                  <div className="small text-muted mt-2">Bắt đầu làm từ {fmtDate(form.startWorkDate)}</div>
                )}
                {form.id && form.orig.createdAt && (
                  <div className="small text-muted fs-xs">
                    Tạo tài khoản {fmtDate(form.orig.createdAt)}
                  </div>
                )}
              </div>
            </aside>

            {/* Cột phải: thông tin chia theo nhóm */}
            <div className="col-sm-8">
              {form.id && !form.orig.isActive && (
                <div className="alert alert-secondary small py-2 mb-3">Người này đã nghỉ việc — không đăng nhập, chấm công được. Bấm <strong>Nhận lại</strong> nếu muốn sửa thông tin.</div>
              )}

              <section>
                <h3 className={SECTION_TITLE}>Liên hệ</h3>
                <div className="row g-2">
                  <div className="col-sm-6">
                    <label className="form-label small mb-1">Số điện thoại</label>
                    <input type="tel" className="form-control" value={form.phoneNumber} onChange={set("phoneNumber")} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1">Email đăng nhập</label>
                    <input type="email" className="form-control" required value={form.email} onChange={set("email")} />
                  </div>
                  {emailChanged && <div className="col-12 form-text mt-0 text-warning-emphasis">Người này sẽ phải đăng nhập bằng email mới.</div>}
                </div>
              </section>

              <section className="border-top pt-3 mt-3">
                <h3 className={SECTION_TITLE}>Công việc & lương</h3>
                <div className="row g-2">
                  <div className="col-sm-6">
                    <label className="form-label small mb-1">
                      Vai trò<HelpTip>Admin vào được trang quản trị và vẫn chấm công, nhận lương như nhân viên.</HelpTip>
                    </label>
                    <select className="form-select" value={form.role} onChange={set("role")} disabled={isSelf}>
                      <option value={ROLE.USER}>Nhân viên</option>
                      <option value={ROLE.ADMIN}>Admin cửa hàng</option>
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1">
                      Lương mỗi giờ
                      <HelpTip>Mức lương mới áp dụng cho các tháng chưa chốt lương (bảng nháp cần bấm "Tính lại"). Bảng lương đã chốt giữ nguyên.</HelpTip>
                    </label>
                    <MoneyInput required value={form.hourlyWage} onChange={(v) => setForm((f) => ({ ...f, hourlyWage: v }))} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1">
                      Ngày bắt đầu làm{!form.id && <HelpTip>Để trống = hôm nay.</HelpTip>}
                    </label>
                    <DateInput required={!!form.id} value={form.startWorkDate} onChange={(v) => setForm((f) => ({ ...f, startWorkDate: v }))} />
                  </div>
                  {isSelf && <div className="col-12 form-text mt-0">Không thể tự đổi vai trò của chính mình.</div>}
                  {wageChanged && (
                    <div className="col-12 form-text mt-0 text-warning-emphasis">Bảng lương nháp cần bấm "Tính lại" để dùng mức lương mới.</div>
                  )}
                </div>
              </section>

              <section className="border-top pt-3 mt-3">
                <h3 className={SECTION_TITLE}>Tài khoản đăng nhập</h3>
                <label className="form-label small mb-1">{form.id ? "Đặt lại mật khẩu" : "Mật khẩu"}</label>
                <input
                  type="text"
                  autoComplete="new-password"
                  className="form-control"
                  required={!form.id}
                  minLength={form.id && !form.password ? 0 : 6}
                  value={form.password}
                  onChange={set("password")}
                  placeholder={form.id ? "Để trống nếu không đổi" : "Tối thiểu 6 ký tự"}
                />
              </section>
            </div>
          </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Tiêu đề nhóm thông tin trong hồ sơ
const SECTION_TITLE = "small fw-bold text-uppercase text-body-secondary mb-2";

// Avatar chữ cái đầu (chưa có ảnh đại diện): chữ đầu của họ + tên gọi, màu nền
// cố định theo tên để mỗi người 1 màu.
const AVATAR_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#db2777", "#ca8a04", "#4f46e5"];

function Avatar({ name, src, size = 40, className = "" }) {
  if (src) {
    return <img className={`avatar rounded-circle flex-shrink-0 object-fit-cover ${className}`} src={src} alt="" style={{ "--avatar-size": `${size}px` }} />;
  }
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const initials = words.length === 0
    ? "?"
    : (words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0]).toUpperCase();
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`avatar d-inline-flex align-items-center justify-content-center flex-shrink-0 rounded-circle text-white fw-bold user-select-none ${className}`}
      style={{ "--avatar-size": `${size}px`, "--avatar-color": AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
