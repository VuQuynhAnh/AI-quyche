import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// Layout dùng chung cho các trang admin.
//   - Màn hình NHỎ (< lg / 992px, điện thoại + máy tính bảng): thanh tab nằm
//     ngang, cố định dưới cùng — giữ đúng trải nghiệm mobile như trước.
//   - Màn hình LỚN (>= lg, máy tính): sidebar cố định bên trái với logo, icon
//     + nhãn cho từng mục, trạng thái đang chọn rõ ràng, và khu vực người
//     dùng/đăng xuất ghim ở cuối — đúng bố cục quen thuộc của các trang quản
//     trị/nhắn tin trên desktop (Gmail, Slack, Messenger...). Đây là màn hình
//     được ưu tiên đầu tư thiết kế nhất theo yêu cầu, nhưng mobile vẫn dùng
//     tốt bình thường.
// Menu chia 3 nhóm: "Chấm công & lương" là phần chính (màn mặc định khi vào
// /admin), "Trợ lý AI" giữ nguyên toàn bộ tính năng cũ (tổng quan, hội thoại,
// quy chế). Người của cửa hàng (kể cả thăng/hạ admin) quản lý ở "Nhân viên".
const NAV_GROUPS = [
  {
    title: "Chấm công & lương",
    items: [
      { to: "/admin/clockings", label: "Chấm công", icon: ClockIcon },
      { to: "/admin/employees", label: "Nhân viên", icon: UsersIcon },
      { to: "/admin/paysheets", label: "Bảng lương", icon: MoneyIcon },
      { to: "/admin/setting", label: "Thiết lập cửa hàng", icon: StoreIcon },
    ],
  },
  {
    title: "Trợ lý AI",
    items: [
      { to: "/admin/ai", label: "Tổng quan AI", icon: DashboardIcon },
      { to: "/admin/logs", label: "Hội thoại", icon: ChatIcon },
      { to: "/admin/documents", label: "Quy chế", icon: DocumentIcon },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const PAGE_TITLES = Object.fromEntries(NAV_ITEMS.map((i) => [i.to, i.label]));

// Trang nhiều cột dữ liệu: dùng hết chiều ngang, không giới hạn 1240px
const FULL_WIDTH_PAGES = new Set(["/admin/clockings"]);

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const pageTitle = PAGE_TITLES[location.pathname] || "Trang quản trị";

  return (
    <div className="admin-shell d-flex">
      {/* Sidebar — CHỈ hiện ở màn hình máy tính (>= lg) */}
      <aside className="admin-sidebar bg-dark d-none d-lg-flex flex-column">
        <div className="d-flex align-items-center gap-2 px-3 py-3">
          <img src="/logo.svg" alt="" className="rounded-3 flex-shrink-0" width={36} height={36} />
          <div className="fw-bold text-white">Trang quản trị</div>
        </div>

        <nav className="nav nav-pills flex-column flex-nowrap gap-1 px-2 flex-grow-1 overflow-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="d-flex flex-column gap-1">
              <div className="small text-uppercase text-white-50 px-2 pt-3 pb-1 admin-sidebar-label">
                {group.title}
              </div>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `nav-link d-flex align-items-center gap-2 ${isActive ? "active fw-semibold" : "text-white-50"}`
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-top border-secondary px-3 py-3">
          <div className="text-white small text-truncate mb-2" title={user?.fullName}>
            {user?.fullName}
          </div>
          {/* Admin cũng chấm công như nhân viên */}
          <NavLink to="/work" className="btn btn-light btn-sm w-100 mb-2">
            Chấm công của tôi
          </NavLink>
          <button className="btn btn-outline-light btn-sm w-100" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="admin-content with-bottom-tabs flex-grow-1 min-w-0">
        {/* Thanh tiêu đề trên cùng — hiện ở MỌI kích thước màn hình; nút đăng
            xuất chỉ hiện ở đây trên mobile/tablet (desktop đã có ở sidebar). */}
        <div className="sticky-top d-flex justify-content-between align-items-center px-3 px-lg-4 py-3 border-bottom bg-white">
          <div className="d-flex align-items-center gap-2">
            <img src="/logo.svg" alt="" className="rounded-3 d-lg-none" width={30} height={30} />
            <h1 className="h5 mb-0">{pageTitle}</h1>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted small d-none d-sm-inline">Xin chào, {user?.fullName}</span>
            <NavLink to="/work" className="btn btn-primary btn-sm d-lg-none text-nowrap">Chấm công</NavLink>
            <button className="btn btn-outline-secondary btn-sm d-lg-none" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        <div className={`admin-page-wrap p-3 p-lg-4 ${FULL_WIDTH_PAGES.has(location.pathname) ? "mw-100" : ""}`}>
          <Outlet />
        </div>
      </div>

      {/* Thanh tab dưới cùng — CHỈ hiện ở điện thoại/máy tính bảng (< lg) */}
      <nav className="bottom-tabs fixed-bottom bg-white border-top d-flex d-lg-none flex-nowrap overflow-x-auto">
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `nav-link text-center text-nowrap flex-fill px-3 ${isActive ? "text-primary fw-semibold" : "text-body-secondary"}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// Icon SVG đơn giản (không dùng emoji/thư viện ngoài) cho từng mục trong
// sidebar — phong cách đường nét mảnh, đồng bộ với icon dùng ở trang Chat.
function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12v8h14v-8" />
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}
