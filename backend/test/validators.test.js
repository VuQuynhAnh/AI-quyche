// Kiểm tra định dạng dùng chung ở tầng service — lỗi luôn là AppError 400.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/utils/AppError.js";
import { assertPassword, normalizeEmail, optionalText, parseMoney, requiredText } from "../src/utils/validators.js";

const isBadRequest = (err) => err instanceof AppError && err.status === 400;

describe("validators", () => {
  it("email được trim + viết thường; sai định dạng -> 400", () => {
    assert.equal(normalizeEmail("  Lan@SmartClocking.VN "), "lan@smartclocking.vn");
    assert.throws(() => normalizeEmail("lan@"), isBadRequest);
  });

  it("tiền: số >= 0 và không quá 1 tỉ; rỗng/âm/không phải số -> 400", () => {
    assert.equal(parseMoney("30000", "x"), 30000);
    assert.equal(parseMoney(0, "x"), 0);
    for (const bad of ["", null, -1, "abc", 1e9 + 1]) {
      assert.throws(() => parseMoney(bad, "Lương giờ không hợp lệ."), isBadRequest);
    }
  });

  it("chuỗi bắt buộc được trim và cắt theo độ dài tối đa; rỗng -> 400", () => {
    assert.equal(requiredText("  Cửa hàng A  ", "x"), "Cửa hàng A");
    assert.equal(requiredText("abcdef", "x", 3), "abc");
    assert.throws(() => requiredText("   ", "Thiếu tên."), isBadRequest);
  });

  it("chuỗi tuỳ chọn: rỗng -> null", () => {
    assert.equal(optionalText("   "), null);
    assert.equal(optionalText(" 0901 "), "0901");
  });

  it("mật khẩu tối thiểu 6 ký tự", () => {
    assert.doesNotThrow(() => assertPassword("123456"));
    assert.throws(() => assertPassword("12345"), isBadRequest);
  });
});
