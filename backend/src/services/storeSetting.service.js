// THIẾT LẬP CỬA HÀNG (admin): giờ ca, tiền phạt mỗi phút muộn/về sớm, vị trí
// và bán kính chấm công. Giờ ca được chụp vào từng ngày chấm công nên đổi giờ
// ca không làm sai các ngày đã qua; tiền phạt mới áp dụng cho các bảng lương
// chưa chốt khi tính lại.
import { AppError } from "../utils/AppError.js";
import { TIME_RE, parseMoney } from "../utils/validators.js";
import { serializeSetting, serializeStore } from "./serializers.js";

const hhmm = (t) => String(t).slice(0, 5);

// Kiểm tra & chuẩn hoá thành { tên_cột: giá_trị }
function parseSettingBody(b) {
  const v = {};
  for (const [key, col] of [["shiftStartTime", "shift_start_time"], ["shiftEndTime", "shift_end_time"]]) {
    if (b[key] !== undefined) {
      if (!TIME_RE.test(b[key])) throw AppError.badRequest("Giờ ca phải dạng HH:MM.");
      v[col] = b[key];
    }
  }
  if (b.penaltyAmountPerMinute !== undefined) {
    v.penalty_amount_per_minute = parseMoney(b.penaltyAmountPerMinute, "Tiền phạt mỗi phút không hợp lệ.");
  }
  if (b.checkInRadiusMeters !== undefined) {
    const r = Number(b.checkInRadiusMeters);
    if (!Number.isInteger(r) || r < 10 || r > 5000) throw AppError.badRequest("Bán kính phải từ 10 đến 5000 mét.");
    v.check_in_radius_meters = r;
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
      v.latitude = lat;
      v.longitude = lng;
    } else {
      v.latitude = null;
      v.longitude = null;
    }
  }
  return v;
}

export function createStoreSettingService({ storeRepository }) {
  async function get(actor) {
    const [store, setting] = await Promise.all([
      storeRepository.findById(actor.storeId),
      storeRepository.findSetting(actor.storeId),
    ]);
    if (!store || !setting) throw AppError.notFound("Không tìm thấy cửa hàng.");
    return { store: serializeStore(store), setting: serializeSetting(setting) };
  }

  async function update(actor, body = {}) {
    const fields = parseSettingBody(body);
    if (!Object.keys(fields).length) throw AppError.badRequest("Không có thay đổi.");

    const current = await storeRepository.findSetting(actor.storeId);
    const start = fields.shift_start_time ?? hhmm(current.shift_start_time);
    const end = fields.shift_end_time ?? hhmm(current.shift_end_time);
    if (end <= start) throw AppError.badRequest("Giờ kết thúc ca phải sau giờ bắt đầu.");

    await storeRepository.updateSetting(actor.storeId, fields);
    return get(actor);
  }

  return { get, update };
}
