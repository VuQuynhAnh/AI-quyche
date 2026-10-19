import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChatPanel } from "../pages/client/Chat.jsx";

// Nút chat nổi + cửa sổ chat của nhân viên. Dùng lại NGUYÊN khung chat cũ
// (ChatPanel) nên giữ đủ tính năng: nguồn trích dẫn, đánh giá, "cần admin hỗ
// trợ", xoá tin... Chỉ khác là không còn là màn hình chính.
export default function ChatPopup() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {!open && (
        <button type="button" className="chat-fab" onClick={() => setOpen(true)} aria-label="Mở trợ lý AI">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span className="chat-fab-label">Hỏi AI</span>
        </button>
      )}
      {open && (
        <div className="chat-popup" role="dialog" aria-label="Trợ lý AI">
          <ChatPanel embedded onClose={() => setOpen(false)} onExpand={() => navigate("/chat")} />
        </div>
      )}
    </>
  );
}
