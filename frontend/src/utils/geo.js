// Lấy vị trí hiện tại qua GPS của trình duyệt (cần HTTPS — Vercel đã có sẵn,
// và localhost cũng được phép). Trả về Promise<{lat, lng, accuracy}> hoặc ném
// Error với thông báo tiếng Việt dễ hiểu cho nhân viên.
export function getCurrentPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Thiết bị/trình duyệt không hỗ trợ định vị."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Bạn chưa cho phép truy cập vị trí. Hãy bật quyền Vị trí cho trang này trong cài đặt trình duyệt rồi thử lại."));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Không lấy được vị trí (quá thời gian chờ). Hãy ra chỗ thoáng, bật GPS rồi thử lại."));
        } else {
          reject(new Error("Không xác định được vị trí. Hãy bật GPS rồi thử lại."));
        }
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}
