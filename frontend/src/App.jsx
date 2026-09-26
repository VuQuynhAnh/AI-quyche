// Toàn bộ sơ đồ điều hướng (routing) của ứng dụng.
// Lưu ý về phạm vi trang CLIENT (nhân viên): chỉ có /login, /register, /chat —
// KHÔNG có trang nào khác dành cho nhân viên, đúng theo yêu cầu thiết kế: phía
// client chỉ làm 3 việc là đăng nhập, đăng ký và hỏi đáp. Mọi chức năng quản
// trị (văn bản, người dùng, lịch sử hỏi đáp, thống kê) đều nằm dưới /admin và
// được ProtectedRoute chặn nếu tài khoản không có role 'admin'.
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import Documents from "./pages/admin/Documents.jsx";
import Logs from "./pages/admin/Logs.jsx";
import Users from "./pages/admin/Users.jsx";
import Chat from "./pages/client/Chat.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Trang client: nhân viên hỏi đáp */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute allowedRoles={["employee", "admin"]}>
            <Chat />
          </ProtectedRoute>
        }
      />

      {/* Trang admin: quản lý văn bản, người dùng, lịch sử hỏi đáp + thống kê.
          Toàn bộ nhánh này chỉ dành cho role 'admin' (chặn ở ProtectedRoute). */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="logs" element={<Logs />} />
        <Route path="users" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
