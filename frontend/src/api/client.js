// Wrapper nhỏ quanh fetch() để tự động gắn JWT token và xử lý lỗi chung.
//
// - Khi chạy dev (npm run dev): VITE_API_URL không đặt -> BASE_URL = "/api",
//   được vite.config.js proxy sang http://localhost:4000.
// - Khi build production (npm run build) và deploy lên Vercel/Netlify:
//   frontend và backend nằm ở 2 domain khác nhau nên không còn proxy dev nữa
//   -> cần đặt biến môi trường VITE_API_URL (VD: https://ai-quyche.onrender.com)
//   lúc build, để gọi thẳng tới backend đã deploy.
const BASE_URL = `${import.meta.env.VITE_API_URL || ""}/api`;

function getToken() {
  return localStorage.getItem("token");
}

// Đếm số request đang chạy để hiện lớp phủ "đang tải" toàn màn hình
// (components/GlobalLoading.jsx) — chặn người dùng thao tác khác trong lúc
// tải trang / lưu. Request chạy ngầm (polling, gửi câu hỏi chat...) truyền
// { silent: true } để không che màn hình.
let pendingCount = 0;
const loadingListeners = new Set();

export function subscribeLoading(listener) {
  loadingListeners.add(listener);
  listener(pendingCount);
  return () => loadingListeners.delete(listener);
}

async function track(silent, run) {
  if (silent) return run();
  pendingCount += 1;
  loadingListeners.forEach((l) => l(pendingCount));
  try {
    return await run();
  } finally {
    pendingCount -= 1;
    loadingListeners.forEach((l) => l(pendingCount));
  }
}

function request(path, { silent = false, ...options } = {}) {
  return track(silent, () => send(path, options));
}

async function send(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Cửa hàng bị tạm ngưng / hết hạn hoặc tài khoản bị khoá trong lúc đang
    // dùng: đăng xuất và về trang đăng nhập (đăng nhập lại sẽ hiện lý do)
    if (token && (data.code === "STORE_LOCKED" || res.status === 401)) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    throw new Error(data.error || `Lỗi ${res.status}`);
  }

  return data;
}

// Tải file (VD: file gốc của 1 tài liệu trích dẫn) về máy nhân viên. Không
// dùng fetch()/JSON như request() ở trên vì phản hồi là dữ liệu nhị phân —
// đọc thành Blob rồi tự tạo 1 thẻ <a download> ẩn để trình duyệt tải xuống,
// đồng thời vẫn gắn kèm JWT token qua header (thẻ <a href="..."> thường không
// làm được việc này nếu route yêu cầu xác thực).
function downloadFile(path, fallbackFilename) {
  return track(false, () => saveDownload(path, fallbackFilename));
}

async function saveDownload(path, fallbackFilename) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Lỗi ${res.status}`);
  }

  const blob = await res.blob();

  // Server (res.download() bên backend) có gắn kèm header Content-Disposition
  // với tên file gốc — ưu tiên dùng tên đó, nếu không có mới dùng tên dự phòng.
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = (match && decodeURIComponent(match[1])) || fallbackFilename || "tai-lieu";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// opts: { silent: true } -> không hiện lớp phủ "đang tải" toàn màn hình
export const api = {
  get: (path, opts) => request(path, { ...opts }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  postForm: (path, formData, opts) => request(path, { ...opts, method: "POST", body: formData, isFormData: true }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  downloadFile,
};
