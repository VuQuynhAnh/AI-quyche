// CHẤM CÔNG phía NHÂN VIÊN (dùng trên điện thoại): xem cửa hàng qua QR,
// trạng thái hôm nay, check-in/check-out, lịch sử tháng/ngày.
// Thời điểm chấm công luôn do SERVER ghi (không nhận giờ từ client).
import { CLOCKING_SOURCE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { distanceMeters } from "../utils/geo.js";
import { isUuid } from "../utils/validators.js";
import { isValidDateKey, isValidMonthKey, vnDateKey, vnMonthKey } from "../utils/vnTime.js";
import { serializeClocking, serializeClockingHistory, serializeSetting } from "./serializers.js";

const MIN_GAP_MS = 20 * 1000; // chặn bấm đúp liên tiếp

export function createClockingService({
  transaction,
  storeRepository,
  employeeRepository,
  clockingRepository,
  timesheetService,
  paysheetService,
}) {
  async function findMyEmployee(user) {
    const employee = await employeeRepository.findByAccountId(user.id);
    if (!employee) throw AppError.notFound("Không tìm thấy hồ sơ nhân viên của tài khoản.");
    return employee;
  }

  // Trang QR (công khai): chỉ trả tên + địa chỉ cửa hàng đang hoạt động
  async function getPublicStore(storeId) {
    const store = isUuid(storeId) ? await storeRepository.findById(storeId) : null;
    if (!store || !store.is_active) throw AppError.notFound("Không tìm thấy cửa hàng.");
    return { store: { id: store.id, name: store.name, address: store.address } };
  }

  async function getToday(user) {
    const employee = await findMyEmployee(user);
    const workDate = vnDateKey(new Date());
    const [store, setting, clocking] = await Promise.all([
      storeRepository.findById(employee.store_id),
      timesheetService.getSetting(employee.store_id),
      clockingRepository.findByEmployeeAndDate(employee.id, workDate),
    ]);
    const histories = clocking ? await clockingRepository.listHistories(clocking.id) : [];

    return {
      date: workDate,
      nextActionType: timesheetService.nextActionType(histories),
      histories: histories.map((h) => serializeClockingHistory(h, { withLocation: false })),
      store: { id: store.id, name: store.name, ...serializeSetting(setting) },
    };
  }

  async function check(user, { actionType, storeId, latitude, longitude, accuracy, deviceIdentifier } = {}) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw AppError.badRequest("Cần bật định vị (GPS) để chấm công.");
    }
    if (!storeId) throw AppError.badRequest("Hãy quét QR tại cửa hàng để chấm công.");

    const employee = await findMyEmployee(user);
    if (!employee.is_active) throw AppError.forbidden("Tài khoản đã bị vô hiệu hoá.");
    if (employee.store_id !== storeId) throw AppError.forbidden("QR này không phải cửa hàng của bạn.");
    const store = await storeRepository.findById(storeId);
    if (!store?.is_active) throw AppError.forbidden("Cửa hàng đang tạm ngưng.");

    const workDate = vnDateKey(new Date());
    return transaction.run(async (tx) => {
      await timesheetService.assertMonthEditable(storeId, workDate.slice(0, 7), tx);
      const clocking = await timesheetService.lockDailyClocking({ storeId, employeeId: employee.id, workDate }, tx);
      const histories = await clockingRepository.listHistories(clocking.id, {}, tx);
      const next = timesheetService.nextActionType(histories);

      if (actionType && actionType !== next) {
        throw AppError.conflict("Trạng thái chấm công đã thay đổi. Hãy tải lại trang.", {
          details: { nextActionType: next },
        });
      }
      const last = histories[histories.length - 1];
      if (last && Date.now() - new Date(last.clock_time).getTime() < MIN_GAP_MS) {
        throw new AppError(429, "Bạn vừa chấm công xong, vui lòng đợi vài giây.");
      }

      // Khoảng cách tới cửa hàng — chỉ gắn cờ cho admin xem, không chặn chấm công
      const setting = await timesheetService.getSetting(storeId, tx);
      let distance = null;
      if (setting.latitude != null && setting.longitude != null) {
        distance = Math.round(distanceMeters(lat, lng, setting.latitude, setting.longitude));
      }

      const acc = Number(accuracy);
      const history = await clockingRepository.createHistory(
        {
          clockingId: clocking.id,
          actionType: next,
          source: CLOCKING_SOURCE.EMPLOYEE,
          latitude: lat,
          longitude: lng,
          gpsAccuracyMeters: Number.isFinite(acc) ? acc : null,
          distanceToStoreMeters: distance,
          isOutOfRange: distance != null && distance > setting.check_in_radius_meters,
          deviceIdentifier: typeof deviceIdentifier === "string" ? deviceIdentifier.slice(0, 100) : null,
          createdByAccountId: user.id,
        },
        tx
      );
      await timesheetService.recalculateClocking(clocking, tx);

      return {
        history: serializeClockingHistory(history, { withLocation: false }),
        nextActionType: timesheetService.nextActionType([...histories, history]),
      };
    });
  }

  // Lịch sử + lương của 1 tháng
  async function getMonth(user, monthParam) {
    const month = monthParam || vnMonthKey(new Date());
    if (!isValidMonthKey(month)) throw AppError.badRequest("Tháng không hợp lệ (YYYY-MM).");
    const employee = await findMyEmployee(user);
    return paysheetService.getEmployeeSalary(employee, month);
  }

  // Các lần chấm công của 1 ngày (gồm cả lần đã bị admin thay để thấy đủ lịch sử)
  async function getDay(user, date) {
    if (!isValidDateKey(date)) throw AppError.badRequest("Ngày không hợp lệ (YYYY-MM-DD).");
    const employee = await findMyEmployee(user);
    const clocking = await clockingRepository.findByEmployeeAndDate(employee.id, date);
    const histories = clocking ? await clockingRepository.listHistories(clocking.id, { includeVoided: true }) : [];
    return {
      date,
      clocking: clocking ? serializeClocking(clocking) : null,
      histories: histories.map((h) => serializeClockingHistory(h, { withLocation: false })),
    };
  }

  return { getPublicStore, getToday, check, getMonth, getDay };
}
