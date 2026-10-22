// So sánh IP để biết 2 thiết bị có cùng 1 mạng Wi-Fi (cùng IP công cộng) không.
//  - IPv4: cả mạng ra Internet qua 1 IP của router -> so nguyên địa chỉ.
//  - IPv6: mỗi thiết bị có địa chỉ riêng trong cùng dải /64 của router -> so
//    4 nhóm đầu (prefix /64).
import net from "net";

// "::ffff:1.2.3.4" (IPv4 viết dạng IPv6, hay gặp trên Node) -> "1.2.3.4"
export function normalizeIp(ip) {
  if (!ip) return null;
  const value = String(ip).trim().toLowerCase().replace(/%.*$/, ""); // bỏ zone id "%eth0"
  if (value.startsWith("::ffff:") && net.isIPv4(value.slice(7))) return value.slice(7);
  return net.isIP(value) ? value : null;
}

// "2001:db8::1" -> ["2001","0db8","0000",...] (đủ 8 nhóm)
function expandIpv6(ip) {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return groups.map((g) => g.padStart(4, "0"));
}

function networkKey(ip) {
  const value = normalizeIp(ip);
  if (!value) return null;
  return net.isIPv4(value) ? value : expandIpv6(value).slice(0, 4).join(":");
}

export function isSameNetwork(a, b) {
  const ka = networkKey(a);
  return ka !== null && ka === networkKey(b);
}
