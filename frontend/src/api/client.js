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

async function request(path, { method = "GET", body, isFormData = false } = {}) {
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
    throw new Error(data.error || `Lỗi ${res.status}`);
  }

  return data;
}

// Tải file (VD: file gốc của 1 tài liệu trích dẫn) về máy nhân viên. Không
// dùng fetch()/JSON như request() ở trên vì phản hồi là dữ liệu nhị phân —
// đọc thành Blob rồi tự tạo 1 thẻ <a download> ẩn để trình duyệt tải xuống,
// đồng thời vẫn gắn kèm JWT token qua header (thẻ <a href="..."> thường không
// làm được việc này nếu route yêu cầu xác thực).
async function downloadFile(path, fallbackFilename) {
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

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  postForm: (path, formData) => request(path, { method: "POST", body: formData, isFormData: true }),
  delete: (path) => request(path, { method: "DELETE" }),
  downloadFile,
};
