import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Đăng ký tài khoản mới — LUÔN tạo với role 'employee', bất kể body gửi lên
// có trường "role" hay không (cố tình KHÔNG đọc req.body.role). Trước đây route
// này tin theo role do client gửi lên, nghĩa là bất kỳ ai gọi thẳng API (không
// qua giao diện) cũng có thể tự tạo cho mình tài khoản admin — đây là lỗ hổng
// đã được ghi chú trong README và nay đã vá. Tài khoản admin giờ chỉ có thể
// được tạo bởi 1 admin khác qua trang quản trị (POST /admin/users, chỉ admin
// gọi được), hoặc tài khoản admin ĐẦU TIÊN qua script `npm run seed`.
router.post("/register", asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "Thiếu họ tên, email hoặc mật khẩu." });
  }

  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Email đã được sử dụng." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'employee')
     RETURNING id, full_name, email, role`,
    [fullName, email, passwordHash]
  );

  const user = result.rows[0];
  const token = signToken({ id: user.id, email: user.email, role: user.role, fullName: user.full_name });

  res.status(201).json({ token, user });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Thiếu email hoặc mật khẩu." });
  }

  const result = await query("SELECT * FROM users WHERE email = $1", [email]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role, fullName: user.full_name });

  res.json({
    token,
    user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
  });
}));

export default router;
