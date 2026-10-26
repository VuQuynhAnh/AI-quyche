// CHẤM CÔNG phía NHÂN VIÊN (dùng trên điện thoại): xem cửa hàng qua QR,
// trạng thái hôm nay, check-in/check-out, lịch sử tháng/ngày.
// Thời điểm chấm công luôn do SERVER ghi (không nhận giờ từ client).
import { CLOCKING_ACTION, CLOCKING_METHOD, CLOCKING_SOURCE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { distanceMeters } from "../utils/geo.js";
import { normalizeIp } from "../utils/network.js";
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
  storeNetworkService,
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
      // Tổng hợp hôm nay: giờ vào/ra, giờ làm, phút muộn/về sớm (để nhân viên tự xem)
      clocking: clocking ? serializeClocking(clocking) : null,
      store: { id: store.id, name: store.name, ...serializeSetting(setting) },
    };
  }

  // Chỉ gọi khi cửa hàng bật chấm công Wi-Fi: IP hiện tại có trùng Wi-Fi cửa
  // hàng không -> trùng thì giao diện hiện thêm nút "Chấm bằng Wi-Fi"
  // usable = dùng được nút Wi-Fi: cửa hàng bật + đúng Wi-Fi cửa hàng + điện
  // thoại đang ở gần cửa hàng (GPS). Không gửi GPS thì không xác nhận được -> false.
  async function checkWifi(user, { ip, latitude, longitude, accuracy } = {}) {
    const employee = await findMyEmployee(user);
    const setting = await timesheetService.getSetting(employee.store_id);
    if (!setting.wifi_clocking_enabled) return { enabled: false, onStoreWifi: false, nearStore: false, usable: false };
    const onStoreWifi = await storeNetworkService.isOnStoreNetwork(employee.store_id, ip);
    const lat = Number(latitude);
    const lng = Number(longitude);
    const hasGps = latitude != null && longitude != null && latitude !== "" && longitude !== "" &&
      Number.isFinite(lat) && Number.isFinite(lng);
    const near = hasGps ? nearStoreForWifi(setting, { lat, lng, accuracy }) : null;
    return {
      enabled: true,
      onStoreWifi,
      nearStore: Boolean(near?.ok),
      distanceMeters: near?.distance ?? null,
      maxDistanceMeters: setting.wifi_max_distance_meters,
      usable: onStoreWifi && Boolean(near?.ok),
    };
  }

  // GPS lúc bấm phải cách vị trí cửa hàng tối đa wifi_max_distance_meters. Trừ
  // hao sai số GPS (tối đa 100m) để trong nhà sóng GPS yếu không bị chặn oan.
  const MAX_GPS_TOLERANCE_METERS = 100;
  // { ok, distance } — cửa hàng chưa đặt vị trí thì ok = false
  function nearStoreForWifi(setting, { lat, lng, accuracy }) {
    if (setting.latitude == null || setting.longitude == null) return { ok: false, distance: null };
    const distance = Math.round(distanceMeters(lat, lng, setting.latitude, setting.longitude));
    const acc = Number(accuracy);
    const tolerance = Number.isFinite(acc) && acc > 0 ? Math.min(acc, MAX_GPS_TOLERANCE_METERS) : 0;
    return { ok: distance - tolerance <= setting.wifi_max_distance_meters, distance };
  }

  async function assertNearStoreForWifi(storeId, { lat, lng, accuracy }) {
    const setting = await timesheetService.getSetting(storeId);
    if (setting.latitude == null || setting.longitude == null) {
      throw AppError.forbidden("Cửa hàng chưa đặt vị trí nên chưa chấm công bằng Wi-Fi được. Hãy quét QR để chấm công.");
    }
    const maxDistance = setting.wifi_max_distance_meters;
    const { ok, distance } = nearStoreForWifi(setting, { lat, lng, accuracy });
    if (!ok) {
      throw AppError.forbidden(
        `Bạn đang cách cửa hàng khoảng ${distance} m — chấm công bằng Wi-Fi chỉ được trong phạm vi ${maxDistance} m. ` +
          "Hãy tới cửa hàng hoặc quét QR để chấm công."
      );
    }
  }

  // method = "wifi": không cần QR, nhưng cửa hàng phải bật chấm công Wi-Fi và IP
  // lúc bấm phải trùng Wi-Fi cửa hàng (kiểm tra lại ở đây, không tin giao diện)
  async function check(user, { actionType, method, storeId: qrStoreId, latitude, longitude, accuracy, deviceIdentifier } = {}, { ip } = {}) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw AppError.badRequest("Cần bật định vị (GPS) để chấm công.");
    }
    const byWifi = method === CLOCKING_METHOD.WIFI;
    if (!byWifi && !qrStoreId) throw AppError.badRequest("Hãy quét QR tại cửa hàng để chấm công.");

    const employee = await findMyEmployee(user);
    if (!employee.is_active) throw AppError.forbidden("Tài khoản đã bị vô hiệu hoá.");
    const storeId = byWifi ? employee.store_id : qrStoreId;
    if (employee.store_id !== storeId) throw AppError.forbidden("QR này không phải cửa hàng của bạn.");
    if (byWifi) {
      const { enabled, onStoreWifi } = await checkWifi(user, { ip });
      if (!enabled) throw AppError.forbidden("Cửa hàng chưa bật chấm công bằng Wi-Fi. Hãy quét QR để chấm công.");
      if (!onStoreWifi) {
        throw AppError.forbidden("Bạn không kết nối Wi-Fi cửa hàng. Hãy kết nối lại hoặc quét QR để chấm công.");
      }
      // Trùng IP chưa đủ: "Wi-Fi cửa hàng" là mạng lúc admin đăng nhập, có thể ở
      // nơi khác (nhà, quán cà phê). Điện thoại phải ở gần cửa hàng thật (GPS).
      await assertNearStoreForWifi(employee.store_id, { lat, lng, accuracy });
    }
    const store = await storeRepository.findById(storeId);
    if (!store?.is_active) throw AppError.forbidden("Cửa hàng đang tạm ngưng.");

    const workDate = vnDateKey(new Date());
    return transaction.run(async (tx) => {
      await timesheetService.assertMonthEditable(storeId, workDate.slice(0, 7), tx);
      const clocking = await timesheetService.lockDailyClocking({ storeId, employeeId: employee.id, workDate }, tx);
      const histories = await clockingRepository.listHistories(clocking.id, {}, tx);
      const next = timesheetService.nextActionType(histories);
      // Nhân viên tự chọn: check-in chỉ 1 lần/ngày; check-out thì luôn được — kể
      // cả khi chưa check-in (quên check-in) — ngày đó thành "thiếu check-in"
      // để admin sửa. Không gửi actionType thì dùng lần tiếp theo mặc định.
      const action = actionType || next;
      if (![CLOCKING_ACTION.CHECK_IN, CLOCKING_ACTION.CHECK_OUT].includes(action)) {
        throw AppError.badRequest("Loại chấm công không hợp lệ.");
      }
      if (action === CLOCKING_ACTION.CHECK_IN && histories.some((h) => h.action_type === CLOCKING_ACTION.CHECK_IN)) {
        throw AppError.conflict("Hôm nay bạn đã check-in rồi — chỉ có thể check-out.", {
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
          actionType: action,
          source: CLOCKING_SOURCE.EMPLOYEE,
          latitude: lat,
          longitude: lng,
          gpsAccuracyMeters: Number.isFinite(acc) ? acc : null,
          distanceToStoreMeters: distance,
          isOutOfRange: distance != null && distance > setting.check_in_radius_meters,
          deviceIdentifier: typeof deviceIdentifier === "string" ? deviceIdentifier.slice(0, 100) : null,
          method: byWifi ? CLOCKING_METHOD.WIFI : CLOCKING_METHOD.QR,
          clientIp: normalizeIp(ip),
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

  return { getPublicStore, getToday, checkWifi, check, getMonth, getDay };
}
