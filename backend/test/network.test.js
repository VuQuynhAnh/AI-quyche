// So IP để nhận biết "đang dùng Wi-Fi cửa hàng": IPv4 so nguyên địa chỉ
// (cả mạng ra Internet qua 1 IP router), IPv6 so prefix /64.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSameNetwork, normalizeIp } from "../src/utils/network.js";

describe("normalizeIp", () => {
  it("bỏ tiền tố IPv4-mapped mà Node hay trả về", () => {
    assert.equal(normalizeIp("::ffff:203.0.113.5"), "203.0.113.5");
  });

  it("bỏ zone id, viết thường IPv6", () => {
    assert.equal(normalizeIp("FE80::1%eth0"), "fe80::1");
  });

  it("chuỗi không phải IP hoặc rỗng -> null", () => {
    assert.equal(normalizeIp("not-an-ip"), null);
    assert.equal(normalizeIp(""), null);
    assert.equal(normalizeIp(undefined), null);
  });
});

describe("isSameNetwork", () => {
  it("IPv4: chỉ trùng khi cùng đúng 1 địa chỉ công cộng", () => {
    assert.equal(isSameNetwork("203.0.113.5", "::ffff:203.0.113.5"), true);
    assert.equal(isSameNetwork("203.0.113.5", "203.0.113.6"), false);
  });

  it("IPv6: cùng prefix /64 là cùng mạng, dù địa chỉ thiết bị khác nhau", () => {
    assert.equal(isSameNetwork("2001:db8:1:2::10", "2001:db8:1:2:abcd::1"), true);
    assert.equal(isSameNetwork("2001:db8:1:2::10", "2001:db8:1:3::10"), false);
  });

  it("IPv4 và IPv6 không bao giờ là cùng mạng; thiếu IP thì không trùng", () => {
    assert.equal(isSameNetwork("203.0.113.5", "2001:db8::1"), false);
    assert.equal(isSameNetwork(null, null), false);
    assert.equal(isSameNetwork("203.0.113.5", null), false);
  });
});
