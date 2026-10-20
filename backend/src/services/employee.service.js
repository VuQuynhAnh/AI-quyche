// QUẢN LÝ NHÂN VIÊN (admin cửa hàng): thông tin cơ bản và lương giờ.
// Mỗi nhân viên chỉ có 1 mức lương giờ — đổi lương chỉ ảnh hưởng các bảng
// lương CHƯA chốt (bảng nháp sẽ hiện "cần tính lại"); bảng đã chốt giữ nguyên.
import { ROLE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import {
  assertPassword, assertUuid, normalizeEmail, optionalText, parseMoney, requiredText,
} from "../utils/validators.js";
import { serializeEmployee } from "./serializers.js";

export function createEmployeeService({ transaction, accountRepository, employeeRepository, passwordHasher }) {
  async function list(actor) {
    return { employees: (await employeeRepository.listUsersInStore(actor.storeId)).map(serializeEmployee) };
  }

  async function create(actor, body = {}) {
    const fullName = requiredText(body.fullName, "Thiếu họ tên.");
    const email = normalizeEmail(body.email);
    assertPassword(body.password);
    const hourlyWage = parseMoney(body.hourlyWage ?? 0, "Lương giờ không hợp lệ.");
    if (await accountRepository.existsByEmail(email)) throw AppError.conflict("Email đã được sử dụng.");

    const passwordHash = await passwordHasher.hash(body.password);
    const employeeId = await transaction.run(async (tx) => {
      const account = await accountRepository.create(
        { storeId: actor.storeId, fullName, email, passwordHash, role: ROLE.USER },
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
    assertUuid(employeeId);
    const current = await employeeRepository.findInStore(employeeId, actor.storeId);
    if (!current || current.role !== ROLE.USER) throw AppError.notFound("Không tìm thấy nhân viên.");

    const accountFields = {};
    const employeeFields = {};
    if (body.fullName !== undefined) accountFields.full_name = requiredText(body.fullName, "Họ tên không được trống.");
    if (body.isActive !== undefined) accountFields.is_active = Boolean(body.isActive);
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

  return { list, create, update };
}
