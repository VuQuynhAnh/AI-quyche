// WI-FI CỬA HÀNG cho chấm công bằng Wi-Fi (tuỳ chọn, bên cạnh QR — chỉ khi
// cửa hàng bật SETTING_KEY.WIFI_CLOCKING_ENABLED):
//  - Admin cửa hàng đăng nhập -> IP công cộng lúc đó được coi là Wi-Fi cửa hàng;
//    IP khác lần trước thì thêm 1 dòng mới vào store_network. Luôn ghi (kể cả
//    khi chưa bật) để bật lên là dùng được ngay.
//  - Nhân viên có IP trùng dòng mới nhất -> được chấm công bằng Wi-Fi.
// Trình duyệt không đọc được tên Wi-Fi (SSID) nên dùng IP công cộng thay thế:
// cùng mạng Wi-Fi thì ra Internet qua cùng 1 IP của router.
// Lưu ý: admin đăng nhập ở nơi khác (nhà, 4G) thì IP đó thành "Wi-Fi cửa hàng"
// cho tới lần đăng nhập sau — chấp nhận được vì đây chỉ là cách chấm công phụ,
// QR + GPS vẫn dùng như bình thường.
import { ROLE } from "../constants/enums.js";
import { isSameNetwork, normalizeIp } from "../utils/network.js";

export function createStoreNetworkService({ storeNetworkRepository }) {
  // Gọi sau khi đăng nhập thành công. Không ném lỗi: không được làm hỏng đăng nhập.
  async function recordAdminLogin(user, ip) {
    const ipAddress = normalizeIp(ip);
    if (user.role !== ROLE.ADMIN || !user.storeId || !ipAddress) return;
    try {
      const latest = await storeNetworkRepository.findLatest(user.storeId);
      if (latest?.ip_address === ipAddress) return;
      await storeNetworkRepository.create({ storeId: user.storeId, ipAddress, detectedByAccountId: user.id });
    } catch (err) {
      console.error("[store-network] Không lưu được IP Wi-Fi cửa hàng:", err.message);
    }
  }

  async function isOnStoreNetwork(storeId, ip) {
    const latest = await storeNetworkRepository.findLatest(storeId);
    return Boolean(latest) && isSameNetwork(latest.ip_address, ip);
  }

  // Cho màn Thiết lập cửa hàng (admin)
  async function getCurrent(storeId) {
    const latest = await storeNetworkRepository.findLatest(storeId);
    return latest
      ? { ipAddress: latest.ip_address, detectedAt: latest.created_at, detectedByName: latest.detected_by_name ?? null }
      : null;
  }

  return { recordAdminLogin, isOnStoreNetwork, getCurrent };
}
