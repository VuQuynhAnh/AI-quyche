import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";

// Trang chat của nhân viên — thiết kế theo mô hình "1 nhân viên = 1 đoạn chat
// liên tục" (giống Messenger/Zalo), KHÔNG phải nhiều hội thoại tách rời:
//  - Mở trang lên là thấy ngay các tin nhắn gần nhất của đoạn chat đang có.
//  - Kéo lên tới đầu danh sách sẽ tự động tải thêm tin nhắn CŨ HƠN (phân
//    trang kiểu "infinite scroll", xem loadOlderMessages()).
//  - Rê chuột (hoặc chạm) vào 1 tin nhắn sẽ hiện nút "..." mở popover với 2
//    lựa chọn: "Sửa & hỏi lại" (chỉ với tin nhắn của chính mình — điền lại
//    câu hỏi cũ vào ô nhập để sửa rồi gửi) và "Xoá tin nhắn" (xoá mềm, ẩn tin
//    đó khỏi khung chat, đoạn chat vẫn tiếp tục bình thường).
//  - Có thể xoá cả đoạn chat (xoá mềm — dữ liệu vẫn còn cho admin xem — rồi tự
//    động bắt đầu 1 đoạn chat trắng mới).
// Toàn bộ API thao tác trên "đoạn chat đang hoạt động" của chính người đang
// đăng nhập — phía client không cần tự quản lý/truyền conversationId.

// "desc" giải thích cho CHÍNH NHÂN VIÊN vì sao đoạn chat đang ở trạng thái đó —
// hiển thị qua Tooltip (component tự thiết kế, xem bên dưới) khi rê chuột/
// chạm vào icon "i" cạnh chip trạng thái, thay cho dải màu chiếm hết chiều
// rộng như thiết kế cũ. Không cần mục "normal" vì trạng thái đó không hiện
// chip nào cả (xem "statusBadge" bên dưới).
const STATUS_BADGE = {
  flagged: {
    text: "Đang chờ admin trả lời",
    desc: "Câu hỏi này cần quản trị viên hỗ trợ trực tiếp — do liên quan tài liệu nhạy cảm (tự động), hoặc do bạn đã bấm \"Cần admin hỗ trợ\". Quản trị viên sẽ trả lời ngay trong đoạn chat này.",
  },
  resolved: {
    text: "Admin đã trả lời",
    desc: "Quản trị viên đã gửi câu trả lời trực tiếp cho câu hỏi cần hỗ trợ ở trên.",
  },
};

// Icon dạng SVG đơn giản (không dùng emoji) cho nút "..." và các mục trong
// popover tuỳ chọn tin nhắn — phong cách gần giống Messenger/Telegram.
function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// Icon tài liệu — dùng ở mục "Nguồn trích dẫn" trong popover tin nhắn, cùng
// phong cách với DocumentIcon bên trang quản trị (AdminLayout.jsx).
function DocumentIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Icon cờ báo hiệu — dùng ở nút gọn "Cần admin hỗ trợ" (thay cho nút cảnh báo
// to bản, đầy chữ trước đây).
function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// 2 icon đánh giá "hữu ích"/"không hữu ích" cho câu trả lời của chatbot —
// cùng phong cách đường nét mảnh với các icon khác trong file này.
function ThumbsUpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 22H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3M14 9V5a3 3 0 0 0-6 0v4l-2 4v8a1 1 0 0 0 1 1h9.28a2 2 0 0 0 2-1.7l1.38-9A2 2 0 0 0 18.7 9z" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3M10 15v4a3 3 0 0 0 6 0v-4l2-4V3a1 1 0 0 0-1-1H7.72a2 2 0 0 0-2 1.7l-1.38 9A2 2 0 0 0 6.3 15z" />
    </svg>
  );
}

// Icon "i" tròn nhỏ — dấu hiệu bằng mắt là "còn có thêm giải thích khi rê
// chuột/chạm vào đây", giống hệt icon dùng cho chú giải trạng thái ở trang
// quản trị (StatusLegend trong Logs.jsx).
function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12" y2="8.01" />
    </svg>
  );
}

// Component tooltip tự thiết kế — giống hệt Tooltip ở Logs.jsx (bong bóng chữ
// nền tối, mũi nhọn chỉ lên trigger, hiện/ẩn bằng CSS thuần), dùng lại đúng
// class .ui-tooltip-wrap/.ui-tooltip-bubble trong custom.css. Chip trạng thái
// ở đây chỉ có 1 mình (không phải 1 dãy nhiều chip như bên trang quản trị)
// và thường nằm giữa màn hình chat hẹp, nên căn GIỮA bong bóng theo trigger
// (center=true) thay vì lệch trái, để không bị tràn lố sang 1 bên trên màn
// hình điện thoại.
function Tooltip({ text, children, center }) {
  return (
    <span className={`ui-tooltip-wrap ${center ? "ui-tooltip-wrap-center" : ""}`}>
      {children}
      <span className="ui-tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

// Định dạng giờ gửi hiện dưới mỗi tin nhắn — chỉ "HH:mm" nếu gửi trong hôm
// nay (trường hợp phổ biến nhất), kèm thêm ngày/tháng nếu tin nhắn từ hôm
// trước trở về trước (VD: khi cuộn lên xem lại tin nhắn cũ).
function formatMessageTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("vi-VN")} ${time}`;
}

export default function Chat() {
  const { user, logout } = useAuth();
  // confirm(...)/notifySuccess(...) thay cho window.confirm() ở 2 thao tác
  // xoá (tin nhắn/đoạn chat) — xem context/NotificationContext.jsx. Lỗi tải
  // tin nhắn/gửi câu hỏi vẫn dùng "error" (banner tại chỗ trong khung chat,
  // xem bên dưới) vì đó là 1 phần trạng thái đang hiện của cuộc hội thoại,
  // không phải kết quả 1 hành động rời rạc như xoá.
  const { notifySuccess, notifyError, confirm } = useNotification();
  const navigate = useNavigate();

  const [conversationId, setConversationId] = useState(null);
  const [status, setStatus] = useState(null);

  const [messages, setMessages] = useState([]); // luôn sắp theo thời gian TĂNG DẦN (cũ -> mới)
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [error, setError] = useState("");

  // Popover tuỳ chọn tin nhắn (mở bằng nút "...") — lưu vị trí tính theo toạ
  // độ màn hình (fixed) ngay lúc mở, để render qua Portal ra ngoài khung chat
  // (tránh bị overflow: auto của .chat-messages cắt mất phần popover).
  const [menu, setMenu] = useState(null);
  // Popover "..." ở thanh tiêu đề (xoá đoạn chat / đăng xuất) — vị trí luôn cố
  // định ngay dưới nút bấm nên chỉ cần 1 boolean, không cần tính toạ độ như
  // popover tin nhắn ở trên (không bị khung cuộn nào che khuất).
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  // Ghi lại "phải làm gì với vị trí cuộn" sau khi messages thay đổi, xử lý
  // trong useLayoutEffect bên dưới (chạy NGAY sau khi DOM cập nhật, trước khi
  // trình duyệt vẽ lại màn hình — tránh hiện tượng giật/nhấp nháy vị trí cuộn).
  //   'bottom'   : cuộn xuống cuối (tin nhắn mới / lần tải đầu tiên)
  //   {prevScrollHeight, prevScrollTop} : giữ nguyên vị trí đang xem sau khi
  //                                       tải thêm tin nhắn CŨ HƠN ở phía trên
  const pendingScrollAction = useRef(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const action = pendingScrollAction.current;
    if (!container || !action) return;

    if (action === "bottom") {
      container.scrollTop = container.scrollHeight;
    } else {
      const { prevScrollHeight, prevScrollTop } = action;
      container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
    }
    pendingScrollAction.current = null;
  }, [messages]);

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInitial() {
    setInitialLoading(true);
    setError("");
    try {
      const data = await api.get("/chat/thread");
      setConversationId(data.conversationId);
      setStatus(data.status);
      setHasMore(data.hasMore);
      pendingScrollAction.current = "bottom";
      setMessages(data.messages);
    } catch (err) {
      setError(err.message);
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadOlderMessages() {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    const container = scrollRef.current;
    const oldest = messages[0];

    setLoadingOlder(true);
    try {
      const data = await api.get(
        `/chat/thread?before=${encodeURIComponent(oldest.createdAt)}&limit=20`
      );
      pendingScrollAction.current = {
        prevScrollHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop,
      };
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  }

  // Nhân viên kéo GẦN tới đầu danh sách (không cần chạm hẳn đỉnh) thì tự tải
  // thêm tin nhắn cũ hơn — trải nghiệm giống các app chat thông thường.
  function handleScroll(e) {
    if (e.target.scrollTop < 80) {
      loadOlderMessages();
    }
    if (menu) setMenu(null);
    if (headerMenuOpen) setHeaderMenuOpen(false);
  }

  // Mở popover tuỳ chọn cho 1 tin nhắn — tính sẵn toạ độ (fixed, theo màn
  // hình) dựa trên vị trí nút "..." lúc bấm, và tự lật lên trên nếu không đủ
  // chỗ hiện xuống dưới (gần cuối màn hình).
  function openMessageMenu(e, m) {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const sources = m.sources || [];
    // Ước lượng chiều cao popover để quyết định lật lên trên hay không — chỉ
    // cần TƯƠNG ĐỐI đúng (popover có max-height + tự cuộn riêng nếu quá dài,
    // xem .msg-context-menu trong custom.css, nên sai số nhỏ không ảnh hưởng).
    const actionRows = m.role === "user" ? 2 : 1; // "Sửa & hỏi lại" + "Xoá tin nhắn", hoặc chỉ "Xoá tin nhắn"
    const estimatedHeight =
      actionRows * 40 + 12 + (sources.length > 0 ? 26 + sources.length * 36 : 0);
    const openUp = rect.bottom + estimatedHeight + 8 > window.innerHeight;
    setMenu({
      id: m._id,
      role: m.role,
      content: m.content,
      sources,
      left: Math.min(Math.max(rect.right - menuWidth, 8), window.innerWidth - menuWidth - 8),
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      openUp,
    });
  }

  function closeMenu() {
    setMenu(null);
  }

  // Đóng popover khi bấm ra ngoài, cuộn trang, đổi kích thước cửa sổ, hoặc
  // nhấn Esc — vì toạ độ đã tính sẵn sẽ không còn đúng nếu bố cục thay đổi.
  // Dùng chung 1 effect cho CẢ popover tin nhắn (menu) LẪN popover thanh tiêu
  // đề (headerMenuOpen) vì cả 2 đều cần đúng hành vi này.
  useEffect(() => {
    if (!menu && !headerMenuOpen) return;

    function handleDocMouseDown(e) {
      if (
        e.target.closest(".msg-menu-trigger") ||
        e.target.closest(".msg-context-menu") ||
        e.target.closest(".header-menu-trigger") ||
        e.target.closest(".header-menu-dropdown")
      ) {
        return;
      }
      closeMenu();
      setHeaderMenuOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        closeMenu();
        setHeaderMenuOpen(false);
      }
    }
    function handleReposition() {
      closeMenu();
      setHeaderMenuOpen(false);
    }

    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
    };
  }, [menu, headerMenuOpen]);

  // Điền lại nội dung câu hỏi cũ vào ô nhập để nhân viên sửa rồi gửi lại —
  // giống thao tác "Sửa tin nhắn" ở nhiều app chat, chỉ áp dụng cho tin nhắn
  // CỦA CHÍNH nhân viên (role 'user') vì chỉ có câu hỏi mới "hỏi lại" được.
  function handleAskAgain() {
    if (!menu) return;
    setInput(menu.content);
    closeMenu();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleLogout() {
    setHeaderMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  // Tải file gốc của 1 tài liệu được trích dẫn làm nguồn trả lời — gọi từ mục
  // "Nguồn trích dẫn" trong popover tin nhắn (xem services/documentFiles.routes.js
  // bên backend). Tài liệu nhạy cảm sẽ không bao giờ xuất hiện ở đây vì
  // rag.service.js đã loại chúng khỏi "sources" ngay từ đầu, nhưng backend vẫn
  // tự kiểm tra lại để phòng thủ chắc chắn.
  async function handleDownloadSource(source) {
    try {
      await api.downloadFile(`/doc-files/${source.documentId}/download`, source.title);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setError("");
    const tempUserId = `tmp-${Date.now()}`;
    pendingScrollAction.current = "bottom";
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, _id: tempUserId, createdAt: new Date().toISOString() },
    ]);
    setInput("");
    setSending(true);

    try {
      const data = await api.post("/chat/thread/ask", { question });
      setConversationId(data.conversationId);
      if (data.escalate) setStatus("flagged");
      pendingScrollAction.current = "bottom";
      setMessages((prev) => {
        // Thay ID tạm của câu hỏi vừa gửi bằng ID thật (Mongo) trả về từ server,
        // để nút "..." (sửa/xoá tin nhắn) hiện được NGAY, không cần tải lại trang.
        // Đồng thời cập nhật lại createdAt bằng giờ THẬT lúc lưu vào Mongo (thay
        // vì giờ máy client lúc bấm gửi), để khớp với các tin nhắn tải lại sau này.
        const withRealUserId = prev.map((m) =>
          m._id === tempUserId
            ? { ...m, _id: data.userMessageId || m._id, createdAt: data.userMessageCreatedAt || m.createdAt }
            : m
        );
        return [
          ...withRealUserId,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            _id: data.assistantMessageId || `tmp-${Date.now()}-a`,
            createdAt: data.assistantMessageCreatedAt || new Date().toISOString(),
          },
        ];
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  // Nhân viên tự đánh giá câu hỏi khó / trả lời của chatbot chưa thoả đáng —
  // đưa đoạn chat này vào danh sách "Cần admin trả lời" ở trang quản trị.
  async function handleFlag() {
    // Chỉ chặn khi đoạn chat ĐANG "flagged" (đã có 1 câu hỏi khác chờ admin
    // xử lý, không cần gắn cờ lại). "resolved" vẫn gắn cờ lại được bình
    // thường — đây là 1 đoạn chat liên tục, không phải nhiều đoạn tách rời,
    // nên 1 câu hỏi khó MỚI sau khi admin đã xử lý xong câu hỏi trước đó vẫn
    // cần được chuyển cho admin lần nữa.
    if (status === "flagged") return;
    setFlagging(true);
    try {
      const data = await api.post("/chat/thread/flag", {});
      setStatus(data.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setFlagging(false);
    }
  }

  // Xoá mềm 1 tin nhắn lẻ — chỉ ẩn tin nhắn đó khỏi khung chat, đoạn chat vẫn
  // tiếp tục bình thường (không tạo đoạn chat mới).
  async function handleDeleteMessage(messageId) {
    if (!messageId || String(messageId).startsWith("tmp-")) return;
    const ok = await confirm("Xoá tin nhắn này? Bạn sẽ không thể hoàn tác.", {
      confirmText: "Xoá",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/chat/thread/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
      notifySuccess("Đã xoá tin nhắn.");
    } catch (err) {
      notifyError(err.message);
    }
  }

  // Đánh giá 1 câu trả lời của chatbot là "hữu ích"/"không hữu ích" — tổng
  // hợp lại ở Dashboard admin để đo chất lượng trả lời tự động. Bấm lại ĐÚNG
  // lựa chọn đã chọn (nút đang bật) sẽ huỷ đánh giá — xử lý huỷ này nằm ở
  // BACKEND (xem PATCH .../feedback), nên ở đây chỉ cần lấy đúng giá trị trả
  // về để cập nhật state, không tự đoán trước.
  async function handleFeedback(messageId, feedback) {
    if (!messageId || String(messageId).startsWith("tmp-")) return;
    try {
      const data = await api.patch(`/chat/thread/messages/${messageId}/feedback`, { feedback });
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, feedback: data.feedback } : m))
      );
    } catch (err) {
      notifyError(err.message);
    }
  }

  // Xoá mềm CẢ đoạn chat hiện tại rồi tự động bắt đầu 1 đoạn chat trắng mới.
  async function handleDeleteThread() {
    setHeaderMenuOpen(false);
    const ok = await confirm(
      "Xoá toàn bộ đoạn chat này? Một đoạn chat mới sẽ được tạo để bạn tiếp tục hỏi đáp.",
      { confirmText: "Xoá đoạn chat", danger: true }
    );
    if (!ok) return;

    setDeletingThread(true);
    try {
      const data = await api.delete("/chat/thread");
      setConversationId(data.conversationId);
      setStatus(data.status);
      setMessages([]);
      setHasMore(false);
      notifySuccess("Đã xoá đoạn chat. Bạn có thể bắt đầu hỏi lại.");
    } catch (err) {
      notifyError(err.message);
    } finally {
      setDeletingThread(false);
    }
  }

  const statusBadge = status ? STATUS_BADGE[status] : null;

  return (
    <div className="chat-container d-flex flex-column">
      <div className="chat-header d-flex justify-content-between align-items-center px-3 py-2">
        <div className="d-flex align-items-center gap-2">
          <img src="/logo.svg" alt="" className="brand-icon" />
          <div>
            <div className="fw-bold">Trợ lý Quy chế Nội bộ</div>
            <div className="text-muted small">Xin chào, {user?.fullName}</div>
          </div>
        </div>
        <div className="position-relative">
          <button
            type="button"
            className={`header-menu-trigger ${headerMenuOpen ? "is-open" : ""}`}
            title="Tuỳ chọn"
            onClick={() => setHeaderMenuOpen((v) => !v)}
          >
            <KebabIcon />
          </button>

          {headerMenuOpen && (
            <div className="header-menu-dropdown msg-context-menu">
              <button
                type="button"
                className="msg-context-menu-item text-danger"
                onClick={handleDeleteThread}
                disabled={deletingThread || messages.length === 0}
              >
                <TrashIcon />
                Xoá đoạn chat
              </button>
              <button type="button" className="msg-context-menu-item" onClick={handleLogout}>
                <LogoutIcon />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chip trạng thái đoạn chat — thay cho dải màu chiếm hết chiều rộng
          trước đây, cùng phong cách "chip tròn + icon i mở Tooltip" với chú
          giải trạng thái ở trang quản trị (StatusLegend trong Logs.jsx). */}
      {statusBadge && (
        <div className="px-3 py-2 d-flex justify-content-center">
          <div className={`status-chip status-chip-${status}`}>
            <span className="status-chip-dot" aria-hidden="true" />
            <span className="status-chip-text">{statusBadge.text}</span>
            <Tooltip text={statusBadge.desc} center>
              <button
                type="button"
                className="status-chip-info"
                aria-label={`Vì sao đoạn chat đang ở trạng thái "${statusBadge.text}"?`}
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      <div className="chat-messages flex-grow-1 p-3 d-flex flex-column gap-2" ref={scrollRef} onScroll={handleScroll}>
        {loadingOlder && <div className="text-center text-muted small mb-1">Đang tải tin nhắn cũ hơn...</div>}

        {initialLoading && <p className="text-muted text-center mt-4">Đang tải đoạn chat...</p>}

        {!initialLoading && messages.length === 0 && (
          <p className="text-muted text-center mt-4">
            Hãy đặt câu hỏi về quy chế, chính sách nội bộ — VD: "Tôi được nghỉ phép bao nhiêu ngày một năm?"
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m._id}
            className={`msg-row d-flex align-items-end gap-2 ${m.role === "user" ? "flex-row-reverse align-self-end" : "align-self-start"}`}
          >
            {m.role !== "user" && (
              <div className={`msg-avatar ${m.role === "admin" ? "admin" : "assistant"}`}>
                {m.role === "admin" ? "QT" : "AI"}
              </div>
            )}
            <div
              className={`chat-bubble p-2 px-3 ${m.role === "user"
                  ? "user bg-primary text-white"
                  : m.role === "admin"
                    ? "assistant bg-success text-white"
                    : "assistant bg-white border"
                }`}
            >
              {m.role === "admin" && <div className="fw-semibold small mb-1">Quản trị viên</div>}
              <div className="chat-bubble-content">{m.content}</div>
              {/* KHÔNG hiện lại danh sách nguồn trích dẫn ở đây nữa — nguồn đã
                  có đầy đủ trong popover "..." (mục "Nguồn trích dẫn — bấm để
                  tải" phía dưới), hiện thêm ở đây là lặp thông tin không cần
                  thiết ngay trong bong bóng chat. */}
              {/* Đánh giá "hữu ích"/"không hữu ích" — CHỈ hiện cho câu trả lời
                  THẬT của chatbot (role "assistant", đã có ID thật từ server),
                  không hiện cho tin nhắn của chính nhân viên hay câu trả lời
                  trực tiếp của admin (2 trường hợp đó không phải đối tượng cần
                  đo chất lượng tự động trả lời). Hiện chữ "Hữu ích"/"Không hữu
                  ích" thay vì chỉ icon mũi tên lên/xuống — tránh bị hiểu lầm
                  thành nút "like/dislike" chung của mạng xã hội, đúng ý nghĩa
                  "đánh giá chất lượng câu trả lời" hơn. Bấm lại đúng lựa chọn
                  đang bật sẽ huỷ đánh giá — xem handleFeedback(). */}
              {m.role === "assistant" && !String(m._id).startsWith("tmp-") && (
                <div className="msg-feedback d-flex align-items-center gap-1 mt-1">
                  <button
                    type="button"
                    className={`msg-feedback-btn ${m.feedback === "helpful" ? "active-up" : ""}`}
                    title="Đánh giá câu trả lời này là hữu ích"
                    aria-pressed={m.feedback === "helpful"}
                    onClick={() => handleFeedback(m._id, "helpful")}
                  >
                    <ThumbsUpIcon />
                    Hữu ích
                  </button>
                  <button
                    type="button"
                    className={`msg-feedback-btn ${m.feedback === "unhelpful" ? "active-down" : ""}`}
                    title="Đánh giá câu trả lời này là không hữu ích"
                    aria-pressed={m.feedback === "unhelpful"}
                    onClick={() => handleFeedback(m._id, "unhelpful")}
                  >
                    <ThumbsDownIcon />
                    Không hữu ích
                  </button>
                </div>
              )}
              {m.createdAt && (
                <div className={`chat-bubble-time ${m.role === "user" ? "text-white-50" : "text-muted"}`}>
                  {formatMessageTime(m.createdAt)}
                </div>
              )}
            </div>
            {!String(m._id).startsWith("tmp-") && (
              <button
                type="button"
                className={`msg-menu-trigger ${menu?.id === m._id ? "is-open" : ""}`}
                title="Tuỳ chọn tin nhắn"
                onClick={(e) => openMessageMenu(e, m)}
              >
                <KebabIcon />
              </button>
            )}
          </div>
        ))}
        {sending && (
          <div className="d-flex align-items-end gap-2 align-self-start">
            <div className="msg-avatar assistant">AI</div>
            <div className="chat-bubble assistant bg-white border p-2 px-3 text-muted">
              Đang soạn câu trả lời...
            </div>
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger py-2 mx-3">{error}</div>}

      {/* Nút "cần admin hỗ trợ" — thu gọn thành 1 pill nhỏ căn phải thay vì
          chiếm hẳn 1 hàng ngang toàn bộ chiều rộng với chữ dài như trước, cho
          gọn gàng hơn. Vẫn giữ đủ ý nghĩa qua "title" (tooltip) khi rê chuột. */}
      {conversationId && (!status || status !== "flagged") && (
        <div className="px-3 pb-2 d-flex justify-content-end">
          <button
            type="button"
            className="flag-help-btn"
            onClick={handleFlag}
            disabled={flagging}
            title="Câu hỏi khó hoặc trả lời chưa thoả đáng? Đánh dấu để quản trị viên hỗ trợ trực tiếp"
          >
            <FlagIcon />
            {flagging ? "Đang gửi..." : "Cần admin hỗ trợ"}
          </button>
        </div>
      )}

      <form className="chat-input-bar d-flex gap-2 p-2 border-top bg-white" onSubmit={handleSend}>
        <textarea
          ref={textareaRef}
          className="form-control rounded-pill px-3"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="Nhập câu hỏi..."
        />
        <button className="btn btn-primary rounded-pill px-3" type="submit" disabled={sending || !input.trim()}>
          Gửi
        </button>
      </form>

      {/* Popover tuỳ chọn tin nhắn — render qua Portal thẳng vào <body> với vị
          trí "fixed" đã tính sẵn (xem openMessageMenu), để không bao giờ bị
          overflow: auto của .chat-messages cắt mất. */}
      {menu &&
        createPortal(
          <div
            className="msg-context-menu"
            style={{
              top: menu.top,
              left: menu.left,
              transform: menu.openUp ? "translateY(-100%)" : "none",
            }}
          >
            {menu.role === "user" && (
              <button type="button" className="msg-context-menu-item" onClick={handleAskAgain}>
                <PencilIcon />
                Sửa & hỏi lại
              </button>
            )}
            <button
              type="button"
              className="msg-context-menu-item text-danger"
              onClick={() => {
                const id = menu.id;
                closeMenu();
                handleDeleteMessage(id);
              }}
            >
              <TrashIcon />
              Xoá tin nhắn
            </button>

            {menu.sources?.length > 0 && (
              <>
                <div className="msg-context-menu-divider" />
                <div className="msg-context-menu-label">Nguồn trích dẫn — bấm để tải</div>
                {menu.sources.map((s) => (
                  <button
                    key={s.documentId}
                    type="button"
                    className="msg-context-menu-item"
                    onClick={() => {
                      closeMenu();
                      handleDownloadSource(s);
                    }}
                  >
                    <DocumentIcon />
                    <span className="text-truncate min-w-0 flex-grow-1" title={s.title}>
                      {s.title}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
