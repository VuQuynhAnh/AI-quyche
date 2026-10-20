// Kiểm tra quyền truy cập ở MỌI request có token (gắn 1 lần cho /api trong
// app.js). JWT còn hạn vài ngày, nên chỉ kiểm tra lúc đăng nhập là chưa đủ:
// tài khoản bị khoá, cửa hàng bị tạm ngưng hoặc hết hạn SAU khi đăng nhập vẫn
// phải bị chặn ngay.
// Token thiếu/sai không xử lý ở đây — để requireAuth của từng router trả 401.
import { ROLE } from "../constants/enums.js";
import { STORE_LOCKED_CODE, storeLockReason } from "../services/storePlan.service.js";

export function createAccountAccessGuard({ accountRepository, tokenService }) {
  return async function accountAccessGuard(req, res, next) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return next();

    let payload;
    try {
      payload = tokenService.verify(header.slice(7));
    } catch {
      return next();
    }

    try {
      const state = await accountRepository.findAccessState(payload.id);
      if (!state || !state.is_active) {
        return res.status(401).json({ error: "Tài khoản không còn hoạt động. Vui lòng đăng nhập lại." });
      }
      if (state.role !== ROLE.SUPERADMIN) {
        const reason = storeLockReason({ isActive: state.store_is_active, expiryDate: state.store_expiry_date });
        if (reason) return res.status(403).json({ error: reason, code: STORE_LOCKED_CODE });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
