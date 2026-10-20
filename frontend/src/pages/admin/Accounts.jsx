import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { ROLE, ROLE_LABEL } from "../../constants/enums.js";

// Tài khoản của cửa hàng (admin + nhân viên): xem danh sách, tạo tài khoản
// (chọn vai trò), nâng/hạ quyền và xoá. Cửa hàng tự quản lý — superadmin không
// can thiệp. Backend chặn: tự đổi quyền/tự xoá chính mình, hạ/xoá admin cuối cùng.
const ROLE_BADGE_CLASS = {
  [ROLE.ADMIN]: "bg-primary",
  [ROLE.USER]: "bg-secondary",
};

const EMPTY_FORM = { fullName: "", email: "", password: "", role: ROLE.USER };

export default function Accounts() {
  const { user: currentUser } = useAuth();
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setAccounts((await api.get("/admin/accounts")).accounts);
  }

  useEffect(() => {
    load().catch((err) => notifyError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/admin/accounts", form);
      notifySuccess(`Đã tạo tài khoản "${form.fullName}".`);
      setForm(null);
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleRole(account) {
    const nextRole = account.role === ROLE.ADMIN ? ROLE.USER : ROLE.ADMIN;
    const ok = await confirm(
      nextRole === ROLE.ADMIN
        ? `Cấp quyền quản trị viên cho "${account.fullName}"?`
        : `Hạ "${account.fullName}" xuống nhân viên? Tài khoản này sẽ không còn vào được trang quản trị.`,
      { confirmText: nextRole === ROLE.ADMIN ? "Cấp quyền" : "Hạ quyền", danger: nextRole !== ROLE.ADMIN }
    );
    if (!ok) return;

    setBusyId(account.id);
    try {
      await api.patch(`/admin/accounts/${account.id}/role`, { role: nextRole });
      await load();
      notifySuccess(`Đã đổi "${account.fullName}" thành ${ROLE_LABEL[nextRole].toLowerCase()}.`);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(account) {
    const ok = await confirm(`Xoá tài khoản "${account.fullName}" (${account.email})? Không thể hoàn tác.`, {
      confirmText: "Xoá",
      danger: true,
    });
    if (!ok) return;

    setBusyId(account.id);
    try {
      await api.delete(`/admin/accounts/${account.id}`);
      await load();
      notifySuccess(`Đã xoá tài khoản "${account.fullName}".`);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const adminCount = accounts.filter((a) => a.role === ROLE.ADMIN).length;
  const tiles = [
    { label: "Tổng tài khoản", value: accounts.length },
    { label: ROLE_LABEL[ROLE.ADMIN], value: adminCount },
    { label: ROLE_LABEL[ROLE.USER], value: accounts.length - adminCount },
  ];

  return (
    <div>
      <div className="row g-3 mb-4">
        {tiles.map((t) => (
          <div key={t.label} className="col-12 col-sm-4">
            <div className="card h-100">
              <div className="card-body">
                <div className="fs-3 fw-bold">{t.value}</div>
                <div className="text-muted">{t.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h6 mb-0">Danh sách tài khoản ({accounts.length})</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm(form ? null : { ...EMPTY_FORM })}>
          {form ? "Đóng" : "+ Thêm tài khoản"}
        </button>
      </div>

      {form && (
        <form onSubmit={handleCreate} className="card mb-3">
          <div className="card-body">
            <h3 className="h6 mb-1">Tạo tài khoản mới</h3>
            <p className="small text-muted mb-3">Nhân viên tạo ở đây có lương giờ 0đ — cập nhật lương ở mục "Nhân viên".</p>
            <div className="row g-2 align-items-end">
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Họ tên</label>
                <input className="form-control" required value={form.fullName} onChange={set("fullName")} placeholder="Nguyễn Văn A" />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Email</label>
                <input type="email" className="form-control" required value={form.email} onChange={set("email")} placeholder="ban@congty.vn" />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Mật khẩu</label>
                <input type="password" className="form-control" required minLength={6} value={form.password} onChange={set("password")} placeholder="Tối thiểu 6 ký tự" />
              </div>
              <div className="col-8 col-md-2">
                <label className="form-label small mb-1">Vai trò</label>
                <select className="form-select" value={form.role} onChange={set("role")}>
                  <option value={ROLE.USER}>{ROLE_LABEL[ROLE.USER]}</option>
                  <option value={ROLE.ADMIN}>{ROLE_LABEL[ROLE.ADMIN]}</option>
                </select>
              </div>
              <div className="col-4 col-md-1">
                <button className="btn btn-primary w-100" type="submit" disabled={creating}>
                  {creating ? "..." : "Tạo"}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th className="ps-3" style={{ width: "30%" }}>Họ tên</th>
                <th style={{ width: "26%" }}>Email</th>
                <th style={{ width: "14%" }}>Vai trò</th>
                <th style={{ width: "14%" }}>Ngày tạo</th>
                <th className="pe-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const isSelf = a.id === currentUser?.id;
                return (
                  <tr key={a.id} className={a.isActive ? "" : "text-muted"}>
                    <td className="ps-3">
                      <div className="d-flex align-items-center gap-2">
                        <div className={`msg-avatar ${a.role === ROLE.ADMIN ? "admin" : "user"}`}>
                          {a.fullName?.trim()?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <span className="fw-semibold">{a.fullName}</span>
                        {!a.isActive && <span className="badge text-bg-light border">Đã nghỉ</span>}
                      </div>
                    </td>
                    <td>{a.email}</td>
                    <td><span className={`badge ${ROLE_BADGE_CLASS[a.role]}`}>{ROLE_LABEL[a.role]}</span></td>
                    <td className="text-muted small">{new Date(a.createdAt).toLocaleDateString("vi-VN")}</td>
                    <td className="pe-3">
                      {isSelf ? (
                        <span className="text-muted small fst-italic">Tài khoản của bạn</span>
                      ) : (
                        <div className="d-flex flex-column flex-sm-row gap-1">
                          <button type="button" className="btn btn-outline-secondary btn-sm text-nowrap" disabled={busyId === a.id} onClick={() => handleToggleRole(a)}>
                            {a.role === ROLE.ADMIN ? "Hạ xuống nhân viên" : "Thăng làm admin"}
                          </button>
                          <button type="button" className="btn btn-outline-danger btn-sm" disabled={busyId === a.id} onClick={() => handleDelete(a)}>
                            Xoá
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {accounts.length === 0 && <p className="text-muted p-3 mb-0">Chưa có tài khoản nào.</p>}
      </div>
    </div>
  );
}
