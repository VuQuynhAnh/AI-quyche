// Trang đăng nhập — dùng chung cho mọi role; sau khi đăng nhập điều hướng theo
// "role" trả về từ backend (superadmin -> /superadmin, admin -> /admin, user -> /work).
// Bên dưới form có danh sách tài khoản mẫu: bấm vào 1 dòng để điền sẵn.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ROLE, ROLE_LABEL, homePathForRole } from "../constants/enums.js";
import { DEMO_ACCOUNT_GROUPS, SHOW_DEMO_ACCOUNTS } from "../constants/demoAccounts.js";

const ROLE_BADGE_CLASS = {
  [ROLE.SUPERADMIN]: "text-bg-dark",
  [ROLE.ADMIN]: "text-bg-primary",
  [ROLE.USER]: "text-bg-secondary",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(homePathForRole(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function pickDemoAccount(account) {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
  }

  return (
    <div className="auth-page container d-flex align-items-center py-4">
      <div className="card border-0 shadow-sm mx-auto" style={{ maxWidth: 440, width: "100%" }}>
        <div className="card-body p-4">
          <img src="/logo.svg" alt="" className="rounded-4 shadow mb-3" width={60} height={60} />
          <h1 className="h4 mb-1">Chấm công & Trợ lý AI</h1>
          <p className="text-muted mb-4">Đăng nhập để tiếp tục</p>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@congty.vn"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Mật khẩu</label>
              <input
                type="password"
                className="form-control"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <div className="alert alert-danger py-2">{error}</div>}

            <button className="btn btn-primary w-100" type="submit" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <p className="text-center text-muted small mt-3 mb-0">
            Tài khoản do quản trị viên cửa hàng cấp cho bạn.
          </p>

          {SHOW_DEMO_ACCOUNTS && (
            <div className="border-top pt-3 mt-4">
              <div className="small fw-semibold mb-1">Tài khoản mẫu</div>
              <div className="small text-muted mb-2">
                Bấm để điền sẵn (có sau khi chạy <code>npm run db:reset</code>).
              </div>
              {DEMO_ACCOUNT_GROUPS.map((group) => (
                <div key={group.title} className="mb-2">
                  <div className="small text-uppercase fw-semibold text-body-secondary my-1" style={{ fontSize: "0.72rem", letterSpacing: "0.04em" }}>{group.title}</div>
                  <div className="list-group list-group-flush">
                    {group.accounts.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        className={`list-group-item list-group-item-action d-flex align-items-center gap-2 py-2 px-2 ${email === account.email ? "active" : ""}`}
                        onClick={() => pickDemoAccount(account)}
                      >
                        <span className={`badge ${ROLE_BADGE_CLASS[account.role]}`} style={{ minWidth: 92 }}>
                          {ROLE_LABEL[account.role]}
                        </span>
                        <span className="min-w-0">
                          <span className="d-block small fw-semibold text-truncate">{account.fullName}</span>
                          <span className="d-block small text-truncate opacity-75">{account.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
