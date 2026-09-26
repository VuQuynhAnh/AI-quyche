import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";

// Trang admin quản lý tài khoản (admin + nhân viên): xem danh sách, TẠO tài
// khoản mới (chọn được vai trò — đây là cách chính thức để tạo thêm admin,
// thay cho việc trước đây phải chỉnh trực tiếp trong DB hoặc script seed),
// thăng/hạ quyền 1 tài khoản đã có, và xoá tài khoản. Toàn bộ thao tác gọi
// tới admin.routes.js — chỉ admin mới gọi được (chặn ở middleware backend).
const ROLE_LABEL = {
  admin: { text: "Quản trị viên", cls: "bg-primary" },
  employee: { text: "Nhân viên", cls: "bg-secondary" },
};

export default function Users() {
  const { user: currentUser } = useAuth();
  // confirm(...)/notifySuccess(...)/notifyError(...) thay cho window.confirm()
  // và các khối <div className="alert-danger"> rải rác trước đây — xem
  // context/NotificationContext.jsx.
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [users, setUsers] = useState([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [creating, setCreating] = useState(false);

  const [busyId, setBusyId] = useState(null); // id đang xử lý thăng/hạ quyền hoặc xoá

  async function loadUsers() {
    const data = await api.get("/admin/users");
    setUsers(data.users);
  }

  useEffect(() => {
    loadUsers().catch((err) => notifyError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (password.length < 6) {
      notifyError("Mật khẩu cần tối thiểu 6 ký tự.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/admin/users", { fullName, email, password, role });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("employee");
      setShowAddForm(false);
      await loadUsers();
      notifySuccess(`Đã tạo tài khoản "${fullName}".`);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleRole(u) {
    const nextRole = u.role === "admin" ? "employee" : "admin";
    const confirmMsg =
      nextRole === "admin"
        ? `Cấp quyền quản trị viên cho "${u.full_name}"?`
        : `Hạ "${u.full_name}" xuống nhân viên? Tài khoản này sẽ không còn vào được trang quản trị.`;
    const ok = await confirm(confirmMsg, {
      confirmText: nextRole === "admin" ? "Cấp quyền" : "Hạ quyền",
      danger: nextRole !== "admin",
    });
    if (!ok) return;

    setBusyId(u.id);
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role: nextRole });
      await loadUsers();
      notifySuccess(
        nextRole === "admin"
          ? `Đã cấp quyền quản trị viên cho "${u.full_name}".`
          : `Đã hạ "${u.full_name}" xuống nhân viên.`
      );
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u) {
    const ok = await confirm(`Xoá tài khoản "${u.full_name}" (${u.email})? Không thể hoàn tác.`, {
      confirmText: "Xoá",
      danger: true,
    });
    if (!ok) return;

    setBusyId(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      await loadUsers();
      notifySuccess(`Đã xoá tài khoản "${u.full_name}".`);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // Số liệu tổng (KPI) ở đầu trang — dùng LUÔN dữ liệu "users" đã có sẵn
  // (không gọi thêm API), cùng phong cách ô số liệu với trang Tổng quan
  // (Dashboard.jsx) để 2 trang đồng nhất, và để trang này dùng hết chiều rộng
  // màn hình thay vì chỉ có 1 bảng hẹp giữa nhiều khoảng trắng.
  const adminCount = users.filter((u) => u.role === "admin").length;
  const employeeCount = users.length - adminCount;
  const tiles = [
    { label: "Tổng người dùng", value: users.length },
    { label: "Quản trị viên", value: adminCount },
    { label: "Nhân viên", value: employeeCount },
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
        <h2 className="h6 mb-0">Danh sách người dùng ({users.length})</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddForm((v) => !v)}
        >
          {showAddForm ? "Đóng" : "+ Thêm người dùng"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreate} className="card mb-3">
          <div className="card-body">
            <h3 className="h6 mb-3">Tạo tài khoản mới</h3>
            <div className="row g-2 align-items-end">
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Họ tên</label>
                <input
                  className="form-control"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Email</label>
                <input
                  type="email"
                  className="form-control"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@congty.vn"
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Mật khẩu</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>
              <div className="col-8 col-md-2">
                <label className="form-label small mb-1">Vai trò</label>
                <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="employee">Nhân viên</option>
                  <option value="admin">Quản trị viên</option>
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
                <th className="ps-3" style={{ width: "30%" }}>
                  Họ tên
                </th>
                <th style={{ width: "26%" }}>Email</th>
                <th style={{ width: "14%" }}>Vai trò</th>
                <th style={{ width: "14%" }}>Ngày tạo</th>
                <th className="pe-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleInfo = ROLE_LABEL[u.role] || ROLE_LABEL.employee;
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id}>
                    <td className="ps-3">
                      {/* Avatar tròn nhỏ theo tên — cùng class .msg-avatar dùng ở
                          Chat.jsx/Logs.jsx, đổi màu theo vai trò để nhận diện
                          nhanh admin/nhân viên ngay trong danh sách. */}
                      <div className="d-flex align-items-center gap-2">
                        <div className={`msg-avatar ${u.role === "admin" ? "admin" : "user"}`}>
                          {u.full_name?.trim()?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <span className="fw-semibold">{u.full_name}</span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${roleInfo.cls}`}>{roleInfo.text}</span>
                    </td>
                    <td className="text-muted small">{new Date(u.created_at).toLocaleDateString("vi-VN")}</td>
                    <td className="pe-3">
                      {isSelf ? (
                        <span className="text-muted small fst-italic">Tài khoản của bạn</span>
                      ) : (
                        <div className="d-flex flex-column flex-sm-row gap-1">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm text-nowrap"
                            disabled={busyId === u.id}
                            onClick={() => handleToggleRole(u)}
                          >
                            {u.role === "admin" ? "Hạ xuống nhân viên" : "Thăng làm admin"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            disabled={busyId === u.id}
                            onClick={() => handleDelete(u)}
                          >
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
        {users.length === 0 && <p className="text-muted p-3 mb-0">Chưa có người dùng nào.</p>}
      </div>
    </div>
  );
}
