// Lấy vị trí hiện tại qua GPS của trình duyệt (cần HTTPS — Vercel đã có sẵn,
// và localhost cũng được phép). Trả về Promise<{lat, lng, accuracy}> hoặc ném
// Error với thông báo tiếng Việt dễ hiểu cho nhân viên. accuracy = sai số (mét).

const TIMEOUT_MESSAGE = "Không lấy được vị trí (quá thời gian chờ). Hãy ra chỗ thoáng, bật GPS rồi thử lại.";

function toGeoError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    return new Error("Bạn chưa cho phép truy cập vị trí. Hãy bật quyền Vị trí cho trang này trong cài đặt trình duyệt rồi thử lại.");
  }
  if (err.code === err.TIMEOUT) return new Error(TIMEOUT_MESSAGE);
  return new Error("Không xác định được vị trí. Hãy bật GPS rồi thử lại.");
}

const toPosition = (pos) => ({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });

// Lấy vị trí CHÍNH XÁC NHẤT trong một khoảng ngắn: lần đọc GPS đầu tiên thường
// kém (chưa bắt đủ vệ tinh, hoặc trình duyệt tạm đoán theo Wi-Fi/IP) và tốt dần
// sau vài giây. Đọc liên tục, giữ lần có sai số nhỏ nhất; dừng sớm khi sai số
// ≤ goodEnoughMeters, hết maxWaitMs thì trả về lần tốt nhất đã có.
// Lưu ý: máy tính không có GPS thì dù chờ bao lâu sai số vẫn lớn (vài trăm m tới
// vài km) — nơi gọi nên hiện sai số để người dùng biết.
export function getBestPosition({ maxWaitMs = 8000, goodEnoughMeters = 25 } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Thiết bị/trình duyệt không hỗ trợ định vị."));
      return;
    }
    let best = null;
    let watchId = null;
    let timer = null;
    let done = false;
    const finish = (settle) => {
      if (done) return;
      done = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      settle();
    };

    timer = setTimeout(() => finish(() => (best ? resolve(best) : reject(new Error(TIMEOUT_MESSAGE)))), maxWaitMs);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const position = toPosition(pos);
        if (!best || position.accuracy < best.accuracy) best = position;
        if (position.accuracy <= goodEnoughMeters) finish(() => resolve(best));
      },
      // Lỗi giữa chừng mà đã có 1 lần đọc thì vẫn dùng lần đó
      (err) => finish(() => (best ? resolve(best) : reject(toGeoError(err)))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
    );
  });
}
