// TÀI KHOẢN CỦA CỬA HÀNG (admin cửa hàng tự quản lý): xem danh sách, tạo tài
// khoản admin/user, nâng/hạ quyền, xoá. Mọi tài khoản của cửa hàng đều có hồ
// sơ nhân viên (employee) để đổi role qua lại không mất dữ liệu.
//
// Bảo vệ để cửa hàng không tự khoá mình ra ngoài:
//  1. Không tự đổi role / tự xoá CHÍNH tài khoản đang đăng nhập.
//  2. Cửa hàng luôn còn ít nhất 1 admin đang hoạt động.
import { ROLE, STORE_ROLES } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { assertPassword, assertUuid, normalizeEmail, requiredText } from "../utils/validators.js";
import { serializeAccount } from "./serializers.js";

const sameId = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function createStoreAccountService({ transaction, accountRepository, employeeRepository, passwordHasher }) {
  async function findTargetOrThrow(actor, targetId) {
    assertUuid(targetId);
    const target = await accountRepository.findInStore(targetId, actor.storeId);
    if (!target) throw AppError.notFound("Không tìm thấy tài khoản.");
    return target;
  }

  async function assertNotLastAdmin(actor, target, message) {
    if (target.role === ROLE.ADMIN && target.is_active && (await accountRepository.countActiveAdmins(actor.storeId)) <= 1) {
      throw AppError.badRequest(message);
    }
  }

  async function list(actor) {
    return { accounts: (await accountRepository.listByStore(actor.storeId)).map(serializeAccount) };
  }

  async function create(actor, { fullName, email, password, role } = {}) {
    if (!STORE_ROLES.includes(role)) throw AppError.badRequest("Vai trò không hợp lệ.");
    const name = requiredText(fullName, "Thiếu họ tên.");
    const normalizedEmail = normalizeEmail(email);
    assertPassword(password);
    if (await accountRepository.existsByEmail(normalizedEmail)) throw AppError.conflict("Email đã được sử dụng.");

    const passwordHash = await passwordHasher.hash(password);
    const account = await transaction.run(async (tx) => {
      const created = await accountRepository.create(
        { storeId: actor.storeId, fullName: name, email: normalizedEmail, passwordHash, role },
        tx
      );
      await employeeRepository.create({ accountId: created.id, phoneNumber: null, jobTitle: null, hourlyWage: 0 }, tx);
      return created;
    });
    return { account: serializeAccount(account) };
  }

  async function changeRole(actor, targetId, role) {
    if (!STORE_ROLES.includes(role)) throw AppError.badRequest("Vai trò không hợp lệ.");
    if (sameId(targetId, actor.id)) {
      throw AppError.badRequest("Không thể tự đổi vai trò của chính tài khoản đang đăng nhập.");
    }
    const target = await findTargetOrThrow(actor, targetId);
    if (role === ROLE.USER) {
      await assertNotLastAdmin(actor, target, "Không thể hạ quyền — cửa hàng cần giữ lại ít nhất 1 quản trị viên.");
    }
    await accountRepository.update(target.id, { role });
    return { account: serializeAccount({ ...target, role }) };
  }

  async function remove(actor, targetId) {
    if (sameId(targetId, actor.id)) throw AppError.badRequest("Không thể tự xoá chính tài khoản đang đăng nhập.");
    const target = await findTargetOrThrow(actor, targetId);
    await assertNotLastAdmin(actor, target, "Không thể xoá — cửa hàng cần giữ lại ít nhất 1 quản trị viên.");
    // Xoá tài khoản kéo theo (CASCADE) chấm công + chi tiết bảng lương của người đó
    if (await accountRepository.hasWorkRecords(target.id)) {
      throw AppError.conflict("Tài khoản đã có dữ liệu chấm công/lương — hãy cho nghỉ việc (vô hiệu hoá) thay vì xoá.");
    }
    await accountRepository.deleteById(target.id);
  }

  return { list, create, changeRole, remove };
}
