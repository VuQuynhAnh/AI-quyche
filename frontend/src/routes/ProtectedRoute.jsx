import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Chặn truy cập nếu chưa đăng nhập, hoặc role không nằm trong danh sách cho phép.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Sai quyền -> đưa về trang chủ của đúng vai trò (admin: /admin, nhân viên: /work)
    return <Navigate to={user.role === "admin" ? "/admin" : "/work"} replace />;
  }

  return children;
}
