// QUẢN LÝ NHÂN VIÊN (admin cửa hàng) — nơi DUY NHẤT admin quản lý người của
// cửa hàng: thông tin cơ bản, lương giờ, tài khoản đăng nhập (email, mật khẩu,
// khoá/mở), thăng làm admin / hạ xuống nhân viên, và xoá.
// Mỗi nhân viên chỉ có 1 mức lương giờ — đổi lương chỉ ảnh hưởng các bảng
// lương CHƯA chốt (bảng nháp sẽ hiện "cần tính lại"); bảng đã chốt giữ nguyên.
//
// Bảo vệ để cửa hàng không tự khoá mình ra ngoài:
//  1. Không tự đổi vai trò / tự khoá / tự xoá CHÍNH tài khoản đang đăng nhập.
//  2. Cửa hàng luôn còn ít nhất 1 admin đang hoạt động.
import { ROLE, STORE_ROLES } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import {
  assertPassword, assertUuid, normalizeEmail, optionalText, parseMoney, requiredText,
} from "../utils/validators.js";
import { serializeEmployee } from "./serializers.js";

const sameId = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function createEmployeeService({
  transaction, accountRepository, employeeRepository, passwordHasher, storePlanService,
}) {
  async function findOrThrow(actor, employeeId) {
    assertUuid(employeeId);
    const current = await employeeRepository.findInStore(employeeId, actor.storeId);
    if (!current) throw AppError.notFound("Không tìm thấy nhân viên.");
    return current;
  }

  // target đang là admin hoạt động và sắp không còn là admin hoạt động nữa
  async function assertNotLastAdmin(actor, target, message) {
    if (target.role === ROLE.ADMIN && target.is_active && (await accountRepository.countActiveAdmins(actor.storeId)) <= 1) {
      throw AppError.badRequest(message);
    }
  }

  // Cả admin và nhân viên của cửa hàng
  async function list(actor) {
    return { employees: (await employeeRepository.listInStore(actor.storeId)).map(serializeEmployee) };
  }

  async function create(actor, body = {}) {
    const fullName = requiredText(body.fullName, "Thiếu họ tên.");
    const email = normalizeEmail(body.email);
    assertPassword(body.password);
    const role = body.role ?? ROLE.USER;
    if (!STORE_ROLES.includes(role)) throw AppError.badRequest("Vai trò không hợp lệ.");
    const hourlyWage = parseMoney(body.hourlyWage ?? 0, "Lương giờ không hợp lệ.");
    if (await accountRepository.existsByEmail(email)) throw AppError.conflict("Email đã được sử dụng.");
    await storePlanService.assertSeatAvailable(actor.storeId);

    const passwordHash = await passwordHasher.hash(body.password);
    const employeeId = await transaction.run(async (tx) => {
      const account = await accountRepository.create(
        { storeId: actor.storeId, fullName, email, passwordHash, role },
        tx
      );
      const employee = await employeeRepository.create(
        {
          accountId: account.id,
          phoneNumber: optionalText(body.phoneNumber, 30),
          jobTitle: optionalText(body.jobTitle, 100),
          hourlyWage,
        },
        tx
      );
      return employee.id;
    });

    return { employee: serializeEmployee(await employeeRepository.findInStore(employeeId, actor.storeId)) };
  }

  async function update(actor, employeeId, body = {}) {
    const current = await findOrThrow(actor, employeeId);
    const isSelf = sameId(current.account_id, actor.id);

    const accountFields = {};
    const employeeFields = {};
    if (body.fullName !== undefined) accountFields.full_name = requiredText(body.fullName, "Họ tên không được trống.");

    // Email là tên đăng nhập: đổi xong người đó phải đăng nhập bằng email mới
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (email !== current.email) {
        if (await accountRepository.existsByEmail(email)) throw AppError.conflict("Email đã được sử dụng.");
        accountFields.email = email;
      }
    }

    // Thăng làm admin / hạ xuống nhân viên
    if (body.role !== undefined && body.role !== current.role) {
      if (!STORE_ROLES.includes(body.role)) throw AppError.badRequest("Vai trò không hợp lệ.");
      if (isSelf) throw AppError.badRequest("Không thể tự đổi vai trò của chính mình. Hãy nhờ 1 admin khác.");
      if (body.role === ROLE.USER) {
        await assertNotLastAdmin(actor, current, "Không thể hạ quyền — cửa hàng cần giữ lại ít nhất 1 admin.");
      }
      accountFields.role = body.role;
    }

    if (body.isActive !== undefined && Boolean(body.isActive) !== current.is_active) {
      accountFields.is_active = Boolean(body.isActive);
      if (!accountFields.is_active) {
        if (isSelf) throw AppError.badRequest("Không thể tự khoá chính tài khoản đang đăng nhập.");
        await assertNotLastAdmin(actor, current, "Không thể khoá — cửa hàng cần giữ lại ít nhất 1 admin đang hoạt động.");
      } else {
        // Mở lại tài khoản đã khoá cũng chiếm 1 chỗ trong gói
        await storePlanService.assertSeatAvailable(actor.storeId);
      }
    }
    if (body.password) {
      assertPassword(body.password);
      accountFields.password_hash = await passwordHasher.hash(body.password);
    }
    if (body.phoneNumber !== undefined) employeeFields.phone_number = optionalText(body.phoneNumber, 30);
    if (body.jobTitle !== undefined) employeeFields.job_title = optionalText(body.jobTitle, 100);
    if (body.hourlyWage !== undefined) employeeFields.hourly_wage = parseMoney(body.hourlyWage, "Lương giờ không hợp lệ.");

    await transaction.run(async (tx) => {
      await accountRepository.update(current.account_id, accountFields, tx);
      await employeeRepository.update(current.id, employeeFields, tx);
    });
    return { employee: serializeEmployee(await employeeRepository.findInStore(employeeId, actor.storeId)) };
  }

  // Xoá hẳn — chỉ khi chưa có chấm công/lương (có rồi thì khoá tài khoản)
  async function remove(actor, employeeId) {
    const current = await findOrThrow(actor, employeeId);
    if (sameId(current.account_id, actor.id)) throw AppError.badRequest("Không thể tự xoá chính tài khoản đang đăng nhập.");
    await assertNotLastAdmin(actor, current, "Không thể xoá — cửa hàng cần giữ lại ít nhất 1 admin.");
    // Xoá tài khoản kéo theo (CASCADE) chấm công + chi tiết bảng lương của người đó
    if (await accountRepository.hasWorkRecords(current.account_id)) {
      throw AppError.conflict("Nhân viên đã có dữ liệu chấm công/lương — hãy khoá tài khoản (nghỉ việc) thay vì xoá.");
    }
    await accountRepository.deleteById(current.account_id);
  }

  return { list, create, update, remove };
}
