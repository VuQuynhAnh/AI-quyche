// Thiết lập cửa hàng lưu dạng chuỗi (key-value); đổi qua lại theo kiểu khai báo
// trong SETTING_DEFINITIONS.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SETTING_DATA_TYPE } from "../src/constants/enums.js";
import { parseSettingValue, serializeSettingValue } from "../src/utils/settingValue.js";

const { NUMBER, INTEGER, BOOLEAN, TIME, STRING } = SETTING_DATA_TYPE;

describe("parseSettingValue — chuỗi trong DB -> giá trị", () => {
  it("số: chuỗi số hợp lệ -> số, chuỗi rác -> null", () => {
    assert.equal(parseSettingValue(NUMBER, "21.0285"), 21.0285);
    assert.equal(parseSettingValue(INTEGER, "100"), 100);
    assert.equal(parseSettingValue(NUMBER, "abc"), null);
  });

  it("boolean: chỉ đúng chuỗi 'true' mới là true", () => {
    assert.equal(parseSettingValue(BOOLEAN, "true"), true);
    assert.equal(parseSettingValue(BOOLEAN, "TRUE"), false);
    assert.equal(parseSettingValue(BOOLEAN, "false"), false);
  });

  it("giờ: cắt về 'HH:MM'", () => {
    assert.equal(parseSettingValue(TIME, "08:00:00"), "08:00");
  });

  it("chưa có giá trị -> null", () => {
    assert.equal(parseSettingValue(STRING, null), null);
    assert.equal(parseSettingValue(NUMBER, undefined), null);
  });
});

describe("serializeSettingValue — giá trị -> chuỗi lưu DB", () => {
  it("số nguyên bị cắt phần thập phân, số thực giữ nguyên", () => {
    assert.equal(serializeSettingValue(INTEGER, 150.9), "150");
    assert.equal(serializeSettingValue(NUMBER, "1500.5"), "1500.5");
  });

  it("boolean nhận true hoặc 'true'; còn lại là 'false'", () => {
    assert.equal(serializeSettingValue(BOOLEAN, true), "true");
    assert.equal(serializeSettingValue(BOOLEAN, "true"), "true");
    assert.equal(serializeSettingValue(BOOLEAN, 0), "false");
  });

  it("rỗng hoặc null -> null (dùng giá trị mặc định)", () => {
    assert.equal(serializeSettingValue(STRING, ""), null);
    assert.equal(serializeSettingValue(NUMBER, null), null);
  });

  it("đi vòng parse(serialize(x)) giữ nguyên giá trị", () => {
    for (const [type, value] of [[NUMBER, 105.8542], [INTEGER, 200], [BOOLEAN, true], [TIME, "17:30"], [STRING, "abc"]]) {
      assert.equal(parseSettingValue(type, serializeSettingValue(type, value)), value);
    }
  });
});
