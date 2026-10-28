// THIẾT LẬP CỬA HÀNG (admin): giờ ca, tiền phạt mỗi phút muộn/về sớm, vị trí
// và bán kính chấm công (tuỳ chọn chặn chấm QR ngoài bán kính), bật/tắt chấm
// công bằng Wi-Fi. Giờ ca được chụp vào
// từng ngày chấm công nên đổi giờ ca không làm sai các ngày đã qua; tiền phạt
// mới áp dụng cho các bảng lương chưa chốt khi tính lại.
// Lưu dạng key-value (store_setting) — danh sách key ở SETTING_KEY (constants/enums.js).
import { SETTING_KEY } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { TIME_RE, parseMoney } from "../utils/validators.js";
import { serializeSetting, serializeStore } from "./serializers.js";

// Kiểm tra & chuẩn hoá body (tên trường camelCase) thành { <SETTING_KEY>: giá_trị }
function parseSettingBody(b) {
  const v = {};
  for (const [field, key] of [["shiftStartTime", SETTING_KEY.SHIFT_START_TIME], ["shiftEndTime", SETTING_KEY.SHIFT_END_TIME]]) {
    if (b[field] !== undefined) {
      if (!TIME_RE.test(b[field])) throw AppError.badRequest("Giờ ca phải dạng HH:MM.");
      v[key] = b[field];
    }
  }
  if (b.penaltyAmountPerMinute !== undefined) {
    v[SETTING_KEY.PENALTY_AMOUNT_PER_MINUTE] = parseMoney(b.penaltyAmountPerMinute, "Tiền phạt mỗi phút không hợp lệ.");
  }
  if (b.checkInRadiusMeters !== undefined) {
    const r = Number(b.checkInRadiusMeters);
    if (!Number.isInteger(r) || r < 10 || r > 5000) throw AppError.badRequest("Bán kính phải từ 10 đến 5000 mét.");
    v[SETTING_KEY.CHECK_IN_RADIUS_METERS] = r;
  }
  if (b.latitude !== undefined || b.longitude !== undefined) {
    const hasValue = (x) => x !== null && x !== "" && x !== undefined;
    if (hasValue(b.latitude) !== hasValue(b.longitude)) {
      throw AppError.badRequest("Cần nhập đủ cả vĩ độ và kinh độ (hoặc để trống cả hai).");
    }
    if (hasValue(b.latitude)) {
      const lat = Number(b.latitude);
      const lng = Number(b.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw AppError.badRequest("Toạ độ không hợp lệ.");
      }
      v[SETTING_KEY.LATITUDE] = lat;
      v[SETTING_KEY.LONGITUDE] = lng;
    } else {
      v[SETTING_KEY.LATITUDE] = null;
      v[SETTING_KEY.LONGITUDE] = null;
    }
  }
  if (b.checkInRadiusEnforced !== undefined) {
    if (typeof b.checkInRadiusEnforced !== "boolean") {
      throw AppError.badRequest("Giá trị bật/tắt chặn chấm công ngoài bán kính không hợp lệ.");
    }
    v[SETTING_KEY.CHECK_IN_RADIUS_ENFORCED] = b.checkInRadiusEnforced;
  }
  if (b.wifiClockingEnabled !== undefined) {
    if (typeof b.wifiClockingEnabled !== "boolean") throw AppError.badRequest("Giá trị bật/tắt chấm công Wi-Fi không hợp lệ.");
    v[SETTING_KEY.WIFI_CLOCKING_ENABLED] = b.wifiClockingEnabled;
  }
  if (b.wifiMaxDistanceMeters !== undefined) {
    const d = Number(b.wifiMaxDistanceMeters);
    if (!Number.isInteger(d) || d < 20 || d > 5000) {
      throw AppError.badRequest("Khoảng cách chấm công Wi-Fi phải từ 20 đến 5000 mét.");
    }
    v[SETTING_KEY.WIFI_MAX_DISTANCE_METERS] = d;
  }
  return v;
}

export function createStoreSettingService({ storeRepository, storeNetworkService }) {
  async function get(actor) {
    const [store, setting, wifiNetwork] = await Promise.all([
      storeRepository.findById(actor.storeId),
      storeRepository.findSetting(actor.storeId),
      storeNetworkService.getCurrent(actor.storeId),
    ]);
    if (!store) throw AppError.notFound("Không tìm thấy cửa hàng.");
    // wifiNetwork: IP Wi-Fi cửa hàng ghi từ lần admin đăng nhập gần nhất (null = chưa có)
    return { store: serializeStore(store), setting: serializeSetting(setting), wifiNetwork };
  }

  async function update(actor, body = {}) {
    const fields = parseSettingBody(body);
    if (!Object.keys(fields).length) throw AppError.badRequest("Không có thay đổi.");

    const current = await storeRepository.findSetting(actor.storeId);
    const start = fields[SETTING_KEY.SHIFT_START_TIME] ?? current[SETTING_KEY.SHIFT_START_TIME];
    const end = fields[SETTING_KEY.SHIFT_END_TIME] ?? current[SETTING_KEY.SHIFT_END_TIME];
    if (end <= start) throw AppError.badRequest("Giờ kết thúc ca phải sau giờ bắt đầu.");

    // Chấm bằng Wi-Fi cần biết vị trí cửa hàng để kiểm tra khoảng cách
    const pick = (key) => (key in fields ? fields[key] : current[key]);
    if (pick(SETTING_KEY.WIFI_CLOCKING_ENABLED) && pick(SETTING_KEY.LATITUDE) == null) {
      throw AppError.badRequest("Cần đặt vị trí cửa hàng (vĩ độ, kinh độ) trước khi bật chấm công bằng Wi-Fi.");
    }
    // Chặn chấm ngoài bán kính cũng cần vị trí — gồm cả trường hợp xoá vị trí khi đang bật
    if (pick(SETTING_KEY.CHECK_IN_RADIUS_ENFORCED) && pick(SETTING_KEY.LATITUDE) == null) {
      throw AppError.badRequest("Cần đặt vị trí cửa hàng (vĩ độ, kinh độ) trước khi bật chặn chấm công ngoài bán kính.");
    }

    await storeRepository.updateSetting(actor.storeId, fields);
    return get(actor);
  }

  return { get, update };
}
