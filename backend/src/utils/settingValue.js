// Đổi giá trị thiết lập <-> chuỗi lưu trong store_setting.value theo kiểu dữ
// liệu khai báo ở SETTING_DEFINITIONS (constants/enums.js). null = không có giá trị.
import { SETTING_DATA_TYPE } from "../constants/enums.js";

export function parseSettingValue(type, raw) {
  if (raw == null) return null;
  switch (type) {
    case SETTING_DATA_TYPE.NUMBER:
    case SETTING_DATA_TYPE.INTEGER: {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case SETTING_DATA_TYPE.BOOLEAN:
      return raw === "true";
    case SETTING_DATA_TYPE.TIME:
      return String(raw).slice(0, 5);
    default:
      return String(raw);
  }
}

export function serializeSettingValue(type, value) {
  if (value == null || value === "") return null;
  switch (type) {
    case SETTING_DATA_TYPE.NUMBER:
      return String(Number(value));
    case SETTING_DATA_TYPE.INTEGER:
      return String(Math.trunc(Number(value)));
    case SETTING_DATA_TYPE.BOOLEAN:
      return value === true || value === "true" ? "true" : "false";
    case SETTING_DATA_TYPE.TIME:
      return String(value).slice(0, 5);
    default:
      return String(value);
  }
}
