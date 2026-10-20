// LÕI CHẤM CÔNG: tạo dòng chấm công theo ngày, tổng hợp lại từ lịch sử bấm,
// và kiểm tra tháng đã bị khoá (đã chốt lương) chưa. Dùng chung cho chấm công
// của nhân viên (clocking.service) và chỉnh sửa của admin (clockingManagement.service).
import { CLOCKING_ACTION, PAYSHEET_STATUS } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { summarizeClockingDay } from "./payrollCalculator.js";

export function createTimesheetService({ storeRepository, clockingRepository, paysheetRepository }) {
  async function getSetting(storeId, executor) {
    const setting = await storeRepository.findSetting(storeId, executor);
    if (!setting) throw AppError.notFound("Cửa hàng chưa có thiết lập.");
    return setting;
  }

  // Tháng đã có bảng lương ĐÃ CHỐT -> khoá chấm công của tháng đó
  async function isMonthFinalized(storeId, monthKey, executor) {
    const paysheet = await paysheetRepository.findActiveByMonth(storeId, monthKey, executor);
    return paysheet?.status === PAYSHEET_STATUS.FINALIZED;
  }

  async function assertMonthEditable(storeId, monthKey, executor) {
    if (await isMonthFinalized(storeId, monthKey, executor)) {
      throw AppError.forbidden("Bảng lương tháng này đã chốt, không thể chỉnh sửa chấm công.", {
        code: "MONTH_LOCKED",
      });
    }
  }

  // Lấy (hoặc tạo) dòng chấm công của nhân viên trong ngày, KHOÁ dòng đó trong
  // transaction để các lần bấm đồng thời được xử lý lần lượt. Dòng mới chụp lại
  // giờ ca hiện tại của cửa hàng.
  async function lockDailyClocking({ storeId, employeeId, workDate }, tx) {
    const setting = await getSetting(storeId, tx);
    const clocking = await clockingRepository.findOrCreate(
      {
        storeId,
        employeeId,
        workDate,
        shiftStartTime: setting.shift_start_time,
        shiftEndTime: setting.shift_end_time,
      },
      tx
    );
    return clockingRepository.lockById(clocking.id, tx);
  }

  // Tổng hợp lại giờ vào/ra, phút làm, muộn/sớm của 1 ngày từ lịch sử hợp lệ
  async function recalculateClocking(clocking, executor) {
    const histories = await clockingRepository.listHistories(clocking.id, {}, executor);
    const summary = summarizeClockingDay({
      workDate: clocking.work_date,
      shiftStartTime: clocking.shift_start_time,
      shiftEndTime: clocking.shift_end_time,
      histories,
    });
    await clockingRepository.updateSummary(clocking.id, summary, executor);
    return summary;
  }

  // Lần bấm tiếp theo là check-in hay check-out (theo lần hợp lệ cuối cùng)
  function nextActionType(validHistories) {
    const last = validHistories[validHistories.length - 1];
    return last?.action_type === CLOCKING_ACTION.CHECK_IN ? CLOCKING_ACTION.CHECK_OUT : CLOCKING_ACTION.CHECK_IN;
  }

  return {
    getSetting,
    isMonthFinalized,
    assertMonthEditable,
    lockDailyClocking,
    recalculateClocking,
    nextActionType,
  };
}
