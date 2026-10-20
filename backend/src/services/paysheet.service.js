// BẢNG LƯƠNG THÁNG của cửa hàng (admin):
//
//   Tạo ──▶ draft ──(Tính lại)──▶ draft ──(Chốt)──▶ finalized
//             │                                        │
//             └──────────(Huỷ)──▶ cancelled ◀──(Huỷ)───┘
//
//  - Mỗi cửa hàng chỉ có 1 bảng lương CHƯA HUỶ cho mỗi tháng (unique index DB).
//  - draft: số liệu tính theo chấm công + lương giờ + tiền phạt tại lần tính
//    gần nhất; có thay đổi sau đó thì bảng được đánh dấu "cần tính lại".
//  - finalized: đóng băng — đổi lương/thiết lập về sau KHÔNG ảnh hưởng, và
//    chấm công của tháng đó bị khoá. Chỉ chốt được tháng đã kết thúc.
//  - cancelled: giữ lại để tra cứu; tháng đó được tạo bảng lương mới.
//
// Tháng chưa có bảng lương: nhân viên xem lương "tạm tính" (getEmployeeSalary).
import { PAYSHEET_STATUS } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { assertUuid, optionalText } from "../utils/validators.js";
import { isMonthEnded, isValidMonthKey, monthDateRange, vnDateKey, vnMonthKey } from "../utils/vnTime.js";
import { calculateEmployeePay } from "./payrollCalculator.js";
import { serializePaysheet, serializePaysheetDetail } from "./serializers.js";

const PG_UNIQUE_VIOLATION = "23505";

// Chống "CSV injection": ô bắt đầu bằng = + - @ bị Excel hiểu là công thức
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function resolveMonth(month) {
  const m = month || vnMonthKey(new Date());
  if (!isValidMonthKey(m)) throw AppError.badRequest("Tháng không hợp lệ (YYYY-MM).");
  return m;
}

const groupByEmployee = (clockings) => {
  const map = new Map();
  for (const c of clockings) {
    if (!map.has(c.employee_id)) map.set(c.employee_id, []);
    map.get(c.employee_id).push(c);
  }
  return map;
};

export function createPaysheetService({
  transaction,
  paysheetRepository,
  employeeRepository,
  clockingRepository,
  timesheetService,
}) {
  // Tính lương mọi nhân viên của cửa hàng trong tháng theo dữ liệu HIỆN TẠI
  async function calculateMonth(storeId, payMonth, executor) {
    const { firstDate, lastDate } = monthDateRange(payMonth);
    // Chạy lần lượt (không Promise.all): trong transaction, mọi query dùng chung 1 kết nối
    const setting = await timesheetService.getSetting(storeId, executor);
    const employees = await employeeRepository.listForPeriod({ storeId, firstDate, lastDate }, executor);
    const clockings = await clockingRepository.listByStoreAndPeriod({ storeId, firstDate, lastDate }, executor);
    const clockingsByEmployee = groupByEmployee(clockings);
    const todayKey = vnDateKey(new Date());
    const penaltyAmountPerMinute = Number(setting.penalty_amount_per_minute);

    const details = employees.map((e) => ({
      employeeId: e.id,
      ...calculateEmployeePay({
        clockings: clockingsByEmployee.get(e.id) || [],
        hourlyWage: e.hourly_wage,
        penaltyAmountPerMinute,
        todayKey,
      }),
    }));

    const sum = (field) => details.reduce((s, d) => s + d[field], 0);
    return {
      details,
      totals: {
        penaltyAmountPerMinute,
        employeeCount: details.length,
        totalWorkedMinutes: sum("workedMinutes"),
        totalGrossSalary: sum("grossSalary"),
        totalPenaltyAmount: sum("penaltyAmount"),
        totalNetSalary: sum("netSalary"),
      },
    };
  }

  // Ghi lại toàn bộ chi tiết + tổng của 1 bảng lương (trong transaction)
  async function writeCalculation(paysheet, tx) {
    const { details, totals } = await calculateMonth(paysheet.store_id, paysheet.pay_month, tx);
    await paysheetRepository.deleteDetails(paysheet.id, tx);
    for (const detail of details) {
      await paysheetRepository.insertDetail(paysheet.id, detail, tx);
    }
    await paysheetRepository.updateTotals(paysheet.id, totals, tx);
  }

  // Bảng nháp đã cũ: có sửa chấm công / lương giờ / thiết lập sau lần tính gần nhất
  async function isOutdated(paysheet) {
    if (paysheet.status !== PAYSHEET_STATUS.DRAFT) return false;
    const { firstDate, lastDate } = monthDateRange(paysheet.pay_month);
    const [latestClocking, latestWageOrSetting] = await Promise.all([
      clockingRepository.findLatestUpdateInPeriod({ storeId: paysheet.store_id, firstDate, lastDate }),
      paysheetRepository.findLatestWageOrSettingChange(paysheet.store_id),
    ]);
    const calculatedAt = new Date(paysheet.calculated_at).getTime();
    return [latestClocking, latestWageOrSetting].some((t) => t && new Date(t).getTime() > calculatedAt);
  }

  // Lấy bảng lương đang thao tác, khoá dòng và kiểm tra thuộc cửa hàng
  async function lockPaysheet(actor, id, tx) {
    assertUuid(id);
    const paysheet = await paysheetRepository.lockById(id, tx);
    if (!paysheet || paysheet.store_id !== actor.storeId) throw AppError.notFound("Không tìm thấy bảng lương.");
    return paysheet;
  }

  function assertDraft(paysheet) {
    if (paysheet.status !== PAYSHEET_STATUS.DRAFT) {
      throw AppError.conflict("Chỉ thao tác được với bảng lương đang ở trạng thái nháp.");
    }
  }

  // Màn bảng lương của 1 tháng: bảng đang dùng (nếu có) + chi tiết + các bảng đã huỷ
  async function getMonth(actor, monthParam) {
    const month = resolveMonth(monthParam);
    const paysheets = await paysheetRepository.listByMonth(actor.storeId, month);
    const active = paysheets.find((p) => p.status !== PAYSHEET_STATUS.CANCELLED) || null;
    const details = active ? await paysheetRepository.listDetails(active.id) : [];

    return {
      month,
      isMonthEnded: isMonthEnded(month),
      paysheet: active ? { ...serializePaysheet(active), isOutdated: await isOutdated(active) } : null,
      details: details.map(serializePaysheetDetail),
      cancelledPaysheets: paysheets.filter((p) => p.status === PAYSHEET_STATUS.CANCELLED).map(serializePaysheet),
    };
  }

  async function create(actor, { payMonth } = {}) {
    const month = resolveMonth(payMonth);
    if (month > vnMonthKey(new Date())) throw AppError.badRequest("Không thể tạo bảng lương cho tháng chưa tới.");

    try {
      await transaction.run(async (tx) => {
        const setting = await timesheetService.getSetting(actor.storeId, tx);
        const paysheet = await paysheetRepository.create(
          {
            storeId: actor.storeId,
            payMonth: month,
            penaltyAmountPerMinute: setting.penalty_amount_per_minute,
            createdByAccountId: actor.id,
          },
          tx
        );
        await writeCalculation(paysheet, tx);
      });
    } catch (err) {
      if (err.code === PG_UNIQUE_VIOLATION) {
        throw AppError.conflict("Tháng này đã có bảng lương. Hãy huỷ bảng lương hiện tại trước khi tạo mới.");
      }
      throw err;
    }
    return getMonth(actor, month);
  }

  async function recalculate(actor, id) {
    const month = await transaction.run(async (tx) => {
      const paysheet = await lockPaysheet(actor, id, tx);
      assertDraft(paysheet);
      await writeCalculation(paysheet, tx);
      return paysheet.pay_month;
    });
    return getMonth(actor, month);
  }

  // Chốt: tính lại lần cuối rồi đóng băng
  async function finalize(actor, id) {
    const month = await transaction.run(async (tx) => {
      const paysheet = await lockPaysheet(actor, id, tx);
      assertDraft(paysheet);
      if (!isMonthEnded(paysheet.pay_month)) {
        throw AppError.badRequest("Chỉ chốt được bảng lương của tháng đã kết thúc.");
      }
      await writeCalculation(paysheet, tx);
      await paysheetRepository.markFinalized(paysheet.id, actor.id, tx);
      return paysheet.pay_month;
    });
    return getMonth(actor, month);
  }

  // Huỷ bảng nháp hoặc bảng đã chốt — tháng được mở khoá chấm công và tạo bảng mới được
  async function cancel(actor, id, { reason } = {}) {
    const month = await transaction.run(async (tx) => {
      const paysheet = await lockPaysheet(actor, id, tx);
      if (paysheet.status === PAYSHEET_STATUS.CANCELLED) throw AppError.conflict("Bảng lương đã được huỷ trước đó.");
      await paysheetRepository.markCancelled(paysheet.id, actor.id, optionalText(reason, 500), tx);
      return paysheet.pay_month;
    });
    return getMonth(actor, month);
  }

  // Trả về { filename, content } — router lo việc gửi file
  async function exportCsv(actor, id) {
    assertUuid(id);
    const paysheet = await paysheetRepository.findInStore(id, actor.storeId);
    if (!paysheet) throw AppError.notFound("Không tìm thấy bảng lương.");
    const details = await paysheetRepository.listDetails(paysheet.id);

    const header = ["Nhân viên", "Chức danh", "Lương giờ", "Số ngày công", "Giờ làm", "Phút muộn", "Phút về sớm", "Lương gộp", "Tiền phạt", "Thực nhận"];
    const lines = [header.map(csvCell).join(",")];
    for (const d of details.map(serializePaysheetDetail)) {
      lines.push([
        d.fullName, d.jobTitle || "", d.hourlyWage, d.workedDays, (d.workedMinutes / 60).toFixed(2),
        d.lateMinutes, d.earlyLeaveMinutes, d.grossSalary, d.penaltyAmount, d.netSalary,
      ].map(csvCell).join(","));
    }
    // BOM ở đầu để Excel nhận đúng UTF-8
    return { filename: `bang-luong-${paysheet.pay_month}.csv`, content: "﻿" + lines.join("\r\n") };
  }

  // Lương tháng của 1 nhân viên (màn nhân viên + chatbot):
  //  - Tháng có bảng lương (nháp/đã chốt) -> lấy từ bảng lương
  //  - Chưa có -> tạm tính từ chấm công với lương giờ & tiền phạt hiện tại
  // employee: dòng từ employeeRepository (có store_id, hourly_wage)
  async function getEmployeeSalary(employee, monthKey) {
    const paysheet = await paysheetRepository.findActiveByMonth(employee.store_id, monthKey);
    const detail = paysheet ? await paysheetRepository.findDetail(paysheet.id, employee.id) : null;

    if (paysheet && detail) {
      const d = serializePaysheetDetail(detail);
      return {
        month: monthKey,
        paysheetStatus: paysheet.status,
        penaltyAmountPerMinute: Number(paysheet.penalty_amount_per_minute),
        salary: { ...d, dailyBreakdown: undefined },
        days: d.dailyBreakdown,
      };
    }

    const { firstDate, lastDate } = monthDateRange(monthKey);
    const [setting, clockings] = await Promise.all([
      timesheetService.getSetting(employee.store_id),
      clockingRepository.listByEmployeeAndPeriod({ employeeId: employee.id, firstDate, lastDate }),
    ]);
    const { dailyBreakdown, ...salary } = calculateEmployeePay({
      clockings,
      hourlyWage: employee.hourly_wage,
      penaltyAmountPerMinute: setting.penalty_amount_per_minute,
      todayKey: vnDateKey(new Date()),
    });
    return {
      month: monthKey,
      paysheetStatus: null, // null = tạm tính
      penaltyAmountPerMinute: Number(setting.penalty_amount_per_minute),
      salary,
      days: dailyBreakdown,
    };
  }

  return { getMonth, create, recalculate, finalize, cancel, exportCsv, getEmployeeSalary };
}
