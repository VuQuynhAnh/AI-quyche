import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import ChatPopup from "../../components/ChatPopup.jsx";

// Khung giao diện nhân viên (thiết kế cho điện thoại): thanh tiêu đề + thanh
// tab dưới (Chấm công / Lịch sử) + nút chat AI nổi. Chat KHÔNG còn là màn
// hình chính — chỉ mở khi cần hỏi về lương, đi muộn hay quy chế.
export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="emp-shell">
      <div className="emp-topbar px-3 pb-2 d-flex justify-content-between align-items-center">
        <div className="min-w-0">
          <div className="fw-bold text-truncate">{user?.fullName}</div>
          <div className="small" style={{ opacity: 0.85 }}>Chấm công</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-light" onClick={handleLogout}>
          Đăng xuất
        </button>
      </div>

      <div className="emp-content p-3">
        <Outlet />
      </div>

      <nav className="bottom-tabs d-flex flex-row border-top">
        <NavLink to="/work" end className="nav-link text-center flex-fill py-3">
          Chấm công
        </NavLink>
        <NavLink to="/work/history" className="nav-link text-center flex-fill py-3">
          Lịch sử
        </NavLink>
      </nav>

      <ChatPopup />
    </div>
  );
}
