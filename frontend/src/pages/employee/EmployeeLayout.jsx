import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ROLE } from "../../constants/enums.js";
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
    <div className="min-vh-100 bg-body-tertiary">
      <div className="emp-topbar bg-primary bg-gradient text-white px-3 pb-2 d-flex justify-content-between align-items-center">
        <div className="min-w-0">
          <div className="fw-bold text-truncate">{user?.fullName}</div>
          <div className="small opacity-75">Chấm công</div>
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          {/* Admin cửa hàng vừa chấm công vừa quản trị */}
          {user?.role === ROLE.ADMIN && (
            <NavLink to="/admin" className="btn btn-sm btn-outline-light">Quản trị</NavLink>
          )}
          <button type="button" className="btn btn-sm btn-outline-light" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </div>

      <div className="emp-content p-3">
        <Outlet />
      </div>

      <nav className="bottom-tabs fixed-bottom bg-white border-top d-flex">
        <NavLink to="/work" end className={({ isActive }) => `nav-link text-center flex-fill py-3 ${isActive ? "text-primary fw-semibold" : "text-body-secondary"}`}>
          Chấm công
        </NavLink>
        <NavLink to="/work/history" className={({ isActive }) => `nav-link text-center flex-fill py-3 ${isActive ? "text-primary fw-semibold" : "text-body-secondary"}`}>
          Lịch sử
        </NavLink>
      </nav>

      <ChatPopup />
    </div>
  );
}
