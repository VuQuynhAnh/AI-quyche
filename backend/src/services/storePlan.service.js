// GÓI SỬ DỤNG CỦA CỬA HÀNG (do superadmin đặt): hạn dùng, bật/tắt và số tài
// khoản đang hoạt động tối đa. Dùng chung cho đăng nhập, kiểm tra mỗi request
// (middleware/accountAccess.js) và các chỗ tạo / mở lại tài khoản.
import { AppError } from "../utils/AppError.js";

export const STORE_LOCKED_CODE = "STORE_LOCKED";

// Ngày hôm nay theo giờ Việt Nam, dạng 'YYYY-MM-DD'
export function vnToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const dmy = (dateKey) => dateKey.split("-").reverse().join("/");

// Lý do cửa hàng không dùng được (null = dùng bình thường).
// expiryDate: 'YYYY-MM-DD' (cột DATE được đọc ra dạng chuỗi — xem config/db.js).
export function storeLockReason({ isActive, expiryDate }, now = new Date()) {
  if (!isActive) return "Cửa hàng của bạn đang tạm ngưng hoạt động. Vui lòng liên hệ nhà cung cấp.";
  if (expiryDate && expiryDate < vnToday(now)) {
    return `Cửa hàng của bạn đã hết hạn sử dụng từ ngày ${dmy(expiryDate)}. Vui lòng liên hệ nhà cung cấp để gia hạn.`;
  }
  return null;
}

export function assertStoreUsable(store, now = new Date()) {
  const reason = storeLockReason(store, now);
  if (reason) throw AppError.forbidden(reason, { code: STORE_LOCKED_CODE });
}

export function createStorePlanService({ storeRepository, accountRepository }) {
  // Gọi TRƯỚC khi tạo tài khoản mới / mở lại tài khoản đã khoá của cửa hàng
  async function assertSeatAvailable(storeId, executor) {
    const store = await storeRepository.findById(storeId, executor);
    if (!store || store.max_employee_count == null) return;
    const used = await accountRepository.countActiveInStore(storeId, executor);
    if (used >= store.max_employee_count) {
      throw AppError.conflict(
        `Cửa hàng đã dùng hết ${store.max_employee_count} tài khoản theo gói. ` +
          "Hãy khoá bớt tài khoản không dùng hoặc liên hệ nhà cung cấp để nâng gói."
      );
    }
  }

  return { assertSeatAvailable };
}
