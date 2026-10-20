import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import { ROLE } from "../../constants/enums.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtMoney } from "../../utils/format.js";

const EMPTY = { fullName: "", email: "", password: "", phoneNumber: "", jobTitle: "", hourlyWage: "", role: ROLE.USER };

// Người của cửa hàng (admin + nhân viên) — nơi duy nhất admin quản lý người:
// thông tin, lương giờ (1 mức duy nhất), tài khoản đăng nhập, thăng làm admin /
// hạ xuống nhân viên, khoá (nghỉ việc) và xoá.
export default function Employees() {
  const { user: me } = useAuth();
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

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
        hourlyWage: Number(form.hourlyWage || 0), role: form.role,
      };
      if (form.id) {
        if (form.password) body.password = form.password;
        body.isActive = form.isActive;
        body.email = form.email;
        await api.patch(`/hr/employees/${form.id}`, body);
        notifySuccess("Đã cập nhật nhân viên.");
      } else {
        await api.post("/hr/employees", { ...body, email: form.email, password: form.password });
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

  async function remove() {
    const ok = await confirm(
      `Xoá hẳn "${form.orig.fullName}" (${form.orig.email})? Không thể hoàn tác.\n\n` +
        `Nếu người này đã có chấm công/lương, hãy tắt "Đang làm việc" thay vì xoá.`,
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

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div className="text-muted small">Đổi lương giờ chỉ ảnh hưởng các bảng lương chưa chốt.</div>
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
                <th className="text-end">Lương giờ</th>
                <th>Trạng thái</th>
                <th className="pe-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className={e.isActive ? "" : "text-muted"}>
                  <td className="ps-3">
                    <div className="fw-semibold">
                      {e.fullName}
                      {e.role === ROLE.ADMIN && <span className="badge text-bg-primary ms-2 fw-normal">Admin</span>}
                    </div>
                    <div className="small text-muted">{e.email}</div>
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
        {!loading && employees.length === 0 && <p className="text-muted p-3 mb-0">Chưa có nhân viên nào.</p>}
      </div>

      {form && (
        <Modal
          title={form.id ? "Sửa nhân viên" : "Thêm nhân viên"}
          onClose={() => setForm(null)}
          footer={
            <>
              {form.id && !isSelf && (
                <button type="button" className="btn btn-outline-danger me-auto" onClick={remove}>Xoá</button>
              )}
              <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>Huỷ</button>
              <button type="submit" form="emp-form" className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </>
          }
        >
          <form id="emp-form" onSubmit={save} className="row g-2">
            <div className="col-12">
              <label className="form-label small mb-1">Họ tên</label>
              <input className="form-control" required value={form.fullName} onChange={set("fullName")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Email đăng nhập</label>
              <input type="email" className="form-control" required value={form.email} onChange={set("email")} />
              {emailChanged && <div className="form-text text-warning-emphasis">Người này sẽ phải đăng nhập bằng email mới.</div>}
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Vai trò</label>
              <select className="form-select" value={form.role} onChange={set("role")} disabled={isSelf}>
                <option value={ROLE.USER}>Nhân viên</option>
                <option value={ROLE.ADMIN}>Admin (vào được trang quản trị cửa hàng)</option>
              </select>
              {isSelf && <div className="form-text">Không thể tự đổi vai trò của chính mình.</div>}
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">{form.id ? "Đặt lại mật khẩu (để trống nếu không đổi)" : "Mật khẩu"}</label>
              <input type="text" autoComplete="new-password" className="form-control" required={!form.id} minLength={form.id && !form.password ? 0 : 6} value={form.password} onChange={set("password")} placeholder="Tối thiểu 6 ký tự" />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Số điện thoại</label>
              <input className="form-control" value={form.phoneNumber} onChange={set("phoneNumber")} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Chức danh</label>
              <input className="form-control" value={form.jobTitle} onChange={set("jobTitle")} />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label small mb-1">Lương mỗi giờ (đ)</label>
              <input type="number" min="0" step="500" className="form-control" required value={form.hourlyWage} onChange={set("hourlyWage")} />
            </div>
            {wageChanged && (
              <div className="col-12 form-text mt-0">
                Mức lương mới áp dụng cho các tháng chưa chốt lương (bảng lương nháp cần bấm "Tính lại"). Bảng lương đã chốt giữ nguyên.
              </div>
            )}
            {form.id && (
              <div className="col-12">
                <div className="form-check form-switch mt-1">
                  <input className="form-check-input" type="checkbox" id="emp-active" disabled={isSelf} checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="emp-active">Đang làm việc (tắt = nghỉ việc, không đăng nhập được)</label>
                </div>
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
