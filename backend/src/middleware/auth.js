import { verifyToken } from "../utils/jwt.js";

// Kiểm tra người dùng đã đăng nhập (có JWT hợp lệ trong header Authorization)
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Thiếu token xác thực." });
  }

  try {
    req.user = verifyToken(token); // { id, email, role, fullName }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn." });
  }
}

// Kiểm tra người dùng có role trong danh sách cho phép, dùng sau requireAuth
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Bạn không có quyền truy cập chức năng này." });
    }
    next();
  };
}
