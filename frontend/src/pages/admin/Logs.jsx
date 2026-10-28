import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tooltip as BsTooltip } from "bootstrap";
import { api } from "../../api/client.js";
import { CONVERSATION_STATUS, MESSAGE_SENDER } from "../../constants/enums.js";
import { fmtDateTime } from "../../utils/format.js";

// Trang admin xem lại lịch sử hỏi đáp của toàn bộ nhân viên — hữu ích để kiểm
// tra chất lượng câu trả lời AI, và đặc biệt là XỬ LÝ các hội thoại "flagged"
// (câu hỏi khó do nhân viên tự đánh dấu, hoặc bị hệ thống tự động chuyển vì
// trùng chủ đề tài liệu nhạy cảm — xem rag.service.js / conversation.model.js).
// Dữ liệu hội thoại lấy từ MongoDB nên dùng "_id" thay vì "id".
//
// BỐ CỤC: ở màn hình máy tính (>= lg), trang này dùng bố cục "danh sách +
// chi tiết" 2 cột giống hộp thư/app nhắn tin (Gmail, WhatsApp Web, Intercom)
// — danh sách hội thoại cố định bên trái, nội dung + khung trả lời bên phải.
// Ở điện thoại/máy tính bảng, 2 phần này xếp chồng lên nhau như thiết kế cũ
// (chọn 1 hội thoại trong danh sách, nội dung hiện ngay bên dưới).
//
// LƯU Ý — mô hình "1 nhân viên = 1 đoạn chat liên tục":
//  - Mỗi đoạn chat trong danh sách có thể đã bị chính nhân viên xoá mềm
//    (isDeleted = true) — vẫn hiển thị ở đây kèm nhãn "Đã xoá" để admin đối
//    soát, nhưng nhân viên đã bắt đầu 1 đoạn chat MỚI khác rồi.
//  - Tin nhắn cũng có thể bị xoá mềm từng cái lẻ — vẫn hiển thị nội dung
//    (đã thống nhất: admin cần xem được để phục vụ kiểm tra) nhưng có nhãn mờ
//    "(đã bị nhân viên xoá)".
//  - API trả tin nhắn theo TRANG (mới nhất trước), giống bên client — bấm
//    "Tải tin nhắn cũ hơn" để xem thêm.
// "desc" giải thích rõ TIÊU CHÍ để 1 hội thoại được coi là ở trạng thái đó —
// hiển thị dưới dạng tooltip (thuộc tính title, giống cách trang này đã dùng
// cho badge "Đã xoá" ở renderList) tại chú giải trạng thái đầu trang, và tại
// từng badge trạng thái riêng lẻ (trong danh sách + ở khung chi tiết) để admin
// rê chuột vào bất kỳ đâu cũng xem lại được, không chỉ ở phần chú giải.
const STATUS_BADGE = {
  [CONVERSATION_STATUS.NORMAL]: {
    text: "Bình thường",
    cls: "bg-secondary",
    dot: "bg-secondary",
    desc:
      'Trạng thái mặc định của mọi hội thoại mới. Chatbot tự trả lời được câu hỏi của nhân viên bằng dữ liệu quy chế không nhạy cảm — không có gì bất thường, admin không cần làm gì.',
  },
  [CONVERSATION_STATUS.FLAGGED]: {
    text: "Cần trả lời",
    cls: "bg-warning text-dark",
    dot: "bg-warning",
    desc:
      'Cần admin trả lời trực tiếp. Hội thoại tự chuyển sang trạng thái này khi: (1) câu hỏi trùng chủ đề 1 quy chế đã đánh dấu "nhạy cảm" nên chatbot không tự trả lời mà chuyển cho admin (tự động), hoặc (2) chính nhân viên bấm nút đánh dấu "câu hỏi khó, cần admin hỗ trợ".',
  },
  [CONVERSATION_STATUS.RESOLVED]: {
    text: "Đã trả lời",
    cls: "bg-success",
    dot: "bg-success",
    desc:
      'Admin đã gửi ít nhất 1 câu trả lời trực tiếp cho hội thoại này — tự chuyển từ "Cần trả lời" ngay sau khi admin bấm Gửi ở khung trả lời.',
  },
};
// Thứ tự hiển thị cố định ở phần chú giải (khác thứ tự khai báo ở trên, vốn
// ưu tiên "flagged" lên đầu vì đó là trạng thái quan trọng nhất khi code thao
// tác dữ liệu) — ở đây muốn đi từ trạng thái "bình thường" trước để dễ hiểu.
const STATUS_LEGEND_ORDER = [CONVERSATION_STATUS.NORMAL, CONVERSATION_STATUS.FLAGGED, CONVERSATION_STATUS.RESOLVED];

function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12" y2="8.01" />
    </svg>
  );
}

// Nút "i" mở tooltip Bootstrap (hiện khi rê chuột hoặc focus bằng bàn phím)
function InfoTip({ text, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const tip = new BsTooltip(ref.current, { title: text, placement: "bottom" });
    return () => tip.dispose();
  }, [text]);
  return (
    <button ref={ref} type="button" className="btn btn-link p-0 lh-1 link-secondary" aria-label={label}>
      <InfoIcon />
    </button>
  );
}

// Chú giải 3 trạng thái hội thoại + số lượng, đặt cố định ở đầu trang. Icon "i"
// cạnh mỗi trạng thái mở tooltip giải thích tiêu chí (STATUS_BADGE[key].desc).
function StatusLegend({ counts }) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
      <span className="small text-muted fw-medium">Trạng thái hội thoại:</span>
      {STATUS_LEGEND_ORDER.map((key) => {
        const s = STATUS_BADGE[key];
        return (
          <span key={key} className="badge rounded-pill bg-light text-body border fw-medium d-inline-flex align-items-center gap-2">
            <span className={`rounded-circle ${s.dot} dot-8`} aria-hidden="true" />
            {s.text}
            <span className="badge rounded-pill bg-white text-body-secondary border">{counts[key] || 0}</span>
            <InfoTip text={s.desc} label={`Vì sao 1 hội thoại được coi là "${s.text}"?`} />
          </span>
        );
      })}
    </div>
  );
}

export default function Logs() {
  const [allConversations, setAllConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null); // { title, status, isDeleted, userName, userEmail, messages, hasMore }
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyWarning, setReplyWarning] = useState("");
  const [error, setError] = useState("");

  const scrollRef = useRef(null);
  // Ghi lại "phải làm gì với vị trí cuộn" sau khi conversation.messages đổi,
  // xử lý trong useLayoutEffect bên dưới (chạy NGAY sau khi DOM cập nhật,
  // trước khi trình duyệt vẽ lại — tránh giật/nhấp nháy vị trí cuộn). Giống
  // đúng cơ chế đã dùng ở trang chat của nhân viên (Chat.jsx):
  //   'bottom'   : cuộn xuống cuối — khi mở 1 hội thoại hoặc vừa gửi trả lời
  //   {prevScrollHeight, prevScrollTop} : giữ nguyên vị trí đang xem, dùng khi
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
  }, [conversation?.messages]);

  async function loadLists() {
    const all = await api.get("/admin/conversations");
    setAllConversations(all.conversations);
  }

  useEffect(() => {
    loadLists();
  }, []);

  async function openConversation(id) {
    setError("");
    setReplyWarning("");
    setSelectedId(id);
    setReplyText("");
    // Điện thoại/tablet: chi tiết thay chỗ danh sách -> đưa về đầu trang
    if (window.matchMedia("(max-width: 991.98px)").matches) window.scrollTo(0, 0);
    try {
      const data = await api.get(`/admin/conversations/${id}/messages`);
      pendingScrollAction.current = "bottom";
      setConversation(data);
    } catch (err) {
      setError(err.message);
    }
  }

  // Tải thêm tin nhắn CŨ HƠN của đoạn chat đang xem (dùng cursor "before" là
  // createdAt của tin nhắn cũ nhất đang hiển thị) — giữ nguyên phần đã tải,
  // chỉ nối thêm vào đầu danh sách.
  async function loadOlderMessages() {
    if (!conversation?.hasMore || loadingOlder || conversation.messages.length === 0) return;
    const oldest = conversation.messages[0];
    const container = scrollRef.current;
    setLoadingOlder(true);
    setError("");
    try {
      const data = await api.get(
        `/admin/conversations/${selectedId}/messages?before=${encodeURIComponent(oldest.createdAt)}&limit=20`
      );
      pendingScrollAction.current = container
        ? { prevScrollHeight: container.scrollHeight, prevScrollTop: container.scrollTop }
        : null;
      setConversation((prev) => ({
        ...prev,
        messages: [...data.messages, ...prev.messages],
        hasMore: data.hasMore,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !selectedId) return;
    setSendingReply(true);
    setError("");
    setReplyWarning("");
    try {
      const data = await api.post(`/admin/conversations/${selectedId}/reply`, { message: replyText });
      // API trả lời không trả lại nguyên danh sách tin nhắn (chỉ trạng thái mới
      // nhất) — tự thêm tin nhắn admin vừa gửi vào cuối danh sách đang xem.
      pendingScrollAction.current = "bottom";
      setConversation((prev) => ({
        ...prev,
        status: data.status,
        messages: [
          ...prev.messages,
          { _id: `local-${Date.now()}`, role: MESSAGE_SENDER.ADMIN, content: replyText, createdAt: new Date().toISOString() },
        ],
      }));
      if (data.warning) setReplyWarning(data.warning);
      setReplyText("");
      loadLists(); // hội thoại chuyển từ CONVERSATION_STATUS.FLAGGED sang CONVERSATION_STATUS.RESOLVED nên cần làm mới cả 2 danh sách
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingReply(false);
    }
  }

  function renderList(list, emptyText) {
    return (
      <div className="list-group">
        {list.map((c) => {
          const badge = STATUS_BADGE[c.status] || STATUS_BADGE[CONVERSATION_STATUS.NORMAL];
          return (
            <button
              key={c._id}
              onClick={() => openConversation(c._id)}
              className={`list-group-item list-group-item-action ${selectedId === c._id ? "active" : ""}`}
            >
              <div className="fw-semibold text-truncate">
                {c.title}
                {c.isDeleted && (
                  <span className="badge bg-secondary ms-2" title={`Nhân viên đã xoá lúc ${fmtDateTime(c.deletedAt)}`}>
                    Đã xoá
                  </span>
                )}
              </div>
              {/* Tóm tắt (do Gemini sinh khi hội thoại được gắn cờ CONVERSATION_STATUS.FLAGGED) —
                  giúp admin lướt danh sách là nắm nhanh được nội dung, không
                  cần mở từng hội thoại ra đọc lại toàn bộ tin nhắn. Chỉ hiện
                  khi ĐANG cần trả lời và đã có tóm tắt (sinh nền, có thể mất
                  vài giây hoặc lỗi nếu chưa cấu hình GEMINI_API_KEY). */}
              {c.status === CONVERSATION_STATUS.FLAGGED && c.summary && (
                <div
                  className={`small text-truncate fst-italic ${selectedId === c._id ? "text-white-50" : "text-muted"}`}
                  title={c.summary}
                >
                  {c.summary}
                </div>
              )}
              <div className="d-flex justify-content-between align-items-center">
                <span className={selectedId === c._id ? "small" : "text-muted small"}>
                  {c.userName || "Ẩn danh"} · {fmtDateTime(c.createdAt)}
                </span>
                <span className={`badge ${badge.cls}`} title={badge.desc}>
                {badge.text}
              </span>
              </div>
            </button>
          );
        })}
        {list.length === 0 && <p className="text-muted">{emptyText}</p>}
      </div>
    );
  }

  const statusBadge = conversation ? STATUS_BADGE[conversation.status] || STATUS_BADGE[CONVERSATION_STATUS.NORMAL] : null;

  // Đếm số hội thoại theo từng trạng thái để hiển thị ở phần chú giải — đếm
  // trên "allConversations" (đã có đủ mọi trạng thái, không riêng CONVERSATION_STATUS.FLAGGED)
  // nên không cần gọi thêm API. Hội thoại chưa có "status" (dữ liệu cũ, nếu
  // có) coi như CONVERSATION_STATUS.NORMAL — khớp với default trong conversation.model.js.
  const statusCounts = STATUS_LEGEND_ORDER.reduce((acc, key) => {
    acc[key] = allConversations.filter((c) => (c.status || CONVERSATION_STATUS.NORMAL) === key).length;
    return acc;
  }, {});

  // CHỈ 1 danh sách duy nhất (không tách riêng "Cần admin trả lời" / "Tất cả
  // hội thoại" như trước) — sắp xếp theo 2 tiêu chí:
  //   1. Hội thoại ĐANG CONVERSATION_STATUS.FLAGGED (cần trả lời) luôn lên ĐẦU danh sách, và
  //      trong nhóm này, hội thoại chờ LÂU HƠN (flaggedAt cũ hơn) lên trước —
  //      admin xử lý đúng thứ tự "ai chờ lâu nhất trước", không bị hội thoại
  //      mới gắn cờ chen ngang lên trên.
  //   2. Các hội thoại còn lại (không đang chờ) sắp theo thời gian MỚI NHẤT
  //      lên trước, giống thứ tự quen thuộc của 1 hộp thư/app nhắn tin.
  const sortedConversations = [...allConversations].sort((a, b) => {
    const aWaiting = a.status === CONVERSATION_STATUS.FLAGGED;
    const bWaiting = b.status === CONVERSATION_STATUS.FLAGGED;
    if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
    if (aWaiting) return new Date(a.flaggedAt) - new Date(b.flaggedAt);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <div className="logs-page-wrap">
      <StatusLegend counts={statusCounts} />

      <div className="logs-page d-flex flex-column flex-lg-row gap-4">
      {/* Cột danh sách — cố định bên trái + tự cuộn riêng ở màn hình máy tính.
          1 danh sách DUY NHẤT (xem sortedConversations phía trên) — hội thoại
          đang cần trả lời luôn ở trên, chờ lâu nhất trước; số lượng theo từng
          trạng thái đã có ở chú giải đầu trang nên không cần lặp lại ở đây. */}
      {/* Điện thoại/tablet: đang mở 1 hội thoại thì ẩn danh sách (xem từng màn,
          có nút quay lại) — xếp chồng thì phải cuộn qua cả danh sách mới thấy */}
      <div className={`logs-list-col flex-column gap-4 ${selectedId ? "d-none d-lg-flex" : "d-flex"}`}>
        <div>
          <h2 className="h6 mb-3">Hội thoại ({allConversations.length})</h2>
          {renderList(sortedConversations, "Chưa có hội thoại nào.")}
        </div>
      </div>

      {/* Cột chi tiết — nội dung hội thoại + khung trả lời, chiếm phần còn lại */}
      {/* Vẫn hiện khi có lỗi (VD tải danh sách lỗi) để điện thoại thấy được thông báo */}
      <div className={`logs-detail-col flex-grow-1 min-w-0 ${selectedId || error ? "" : "d-none d-lg-block"}`}>
        {selectedId && (
          <button
            type="button"
            className="btn btn-link px-0 mb-2 d-lg-none"
            onClick={() => {
              setSelectedId(null);
              setConversation(null);
            }}
          >
            ← Danh sách hội thoại
          </button>
        )}
        {error && <div className="alert alert-danger">{error}</div>}

        {conversation ? (
          <div className="card h-100">
            <div className="card-body d-flex flex-column h-100">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <h2 className="h6 mb-1">
                    {conversation.title}
                    {conversation.isDeleted && <span className="badge bg-secondary ms-2">Đã xoá</span>}
                  </h2>
                  <div className="text-muted small">
                    {conversation.userName} ({conversation.userEmail})
                  </div>
                  {conversation.isDeleted && (
                    <div className="text-muted small fst-italic">
                      Nhân viên đã xoá đoạn chat này và đã bắt đầu 1 đoạn chat mới.
                    </div>
                  )}
                  {conversation.status === CONVERSATION_STATUS.FLAGGED && conversation.summary && (
                    <div className="text-muted small fst-italic mt-1">Tóm tắt: {conversation.summary}</div>
                  )}
                </div>
                <span className={`badge ${statusBadge.cls}`} title={statusBadge.desc}>
                  {statusBadge.text}
                </span>
              </div>

              {conversation.hasMore && (
                <div className="text-center mb-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                  >
                    Tải tin nhắn cũ hơn
                  </button>
                </div>
              )}

              <div className="logs-messages flex-grow-1 d-flex flex-column gap-2 mb-3" ref={scrollRef}>
                {conversation.messages.map((m) => (
                  // Nhìn từ màn hình ADMIN: "phía bên kia" (căn TRÁI, có avatar)
                  // giờ CHỈ còn tin nhắn của NHÂN VIÊN (role "user"). Tin nhắn của
                  // AI và của admin cùng nằm "phía mình" (căn PHẢI, cùng kiểu bo
                  // góc) — vì cả 2 đều là câu trả lời TỚI nhân viên, chỉ khác nhau
                  // ở màu nền (AI: xanh nhạt + nhãn "Trợ lý AI", admin: xanh đậm +
                  // nhãn "Bạn") — không cần dùng "align-self" ở đây để tránh lỗi
                  // co hẹp bề rộng dòng tin nhắn (xem "chat-bubble" trong CSS).
                  <div
                    key={m._id}
                    className={`d-flex align-items-end gap-2 ${m.role === MESSAGE_SENDER.USER ? "" : "justify-content-end"}`}
                  >
                    {m.role === MESSAGE_SENDER.USER && (
                      <div
                        className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0 bg-secondary mini-avatar"
                      >
                        {conversation.userName?.trim()?.charAt(0)?.toUpperCase() || "NV"}
                      </div>
                    )}
                    <div
                      className={`chat-bubble p-2 px-3 ${
                        m.role === MESSAGE_SENDER.ADMIN
                          ? "user bg-primary text-white"
                          : m.role === MESSAGE_SENDER.USER
                          ? "assistant bg-white border"
                          : "user bg-primary-subtle border border-primary-subtle"
                      } ${m.isDeleted ? "opacity-50" : ""}`}
                    >
                      {m.role === MESSAGE_SENDER.ADMIN && <div className="fw-semibold small mb-1">Bạn (quản trị viên)</div>}
                      {m.role === MESSAGE_SENDER.ASSISTANT && <div className="fw-semibold small mb-1">Trợ lý AI</div>}
                      {m.content}
                      {m.isDeleted && (
                        <div className="small fst-italic mt-1">
                          (đã bị nhân viên xoá{m.deletedAt ? ` lúc ${fmtDateTime(m.deletedAt)}` : ""})
                        </div>
                      )}
                      {m.createdAt && (
                        <div className={`mt-1 lh-1 ${m.role === MESSAGE_SENDER.ADMIN ? "text-white-50" : "text-muted"} fs-xs`}>
                          {fmtDateTime(m.createdAt)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {conversation.messages.length === 0 && (
                  <p className="text-muted text-center">Chưa có tin nhắn nào.</p>
                )}
              </div>

              {replyWarning && <div className="alert alert-warning py-2">{replyWarning}</div>}

              {/* Khung trả lời trực tiếp — dùng cho các hội thoại CONVERSATION_STATUS.FLAGGED mà chatbot
                  không tự trả lời được (câu hỏi khó hoặc liên quan tài liệu nhạy cảm).
                  Vẫn cho phép trả lời cả khi hội thoại đã CONVERSATION_STATUS.RESOLVED để bổ sung thêm,
                  hoặc kể cả khi đã bị nhân viên xoá (để giữ đầy đủ hồ sơ — nhưng khi
                  đó API sẽ trả về cảnh báo vì nhân viên sẽ không thấy được). */}
              <form onSubmit={handleReply} className="d-flex gap-2">
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Nhập câu trả lời trực tiếp cho nhân viên..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button className="btn btn-primary" type="submit" disabled={sendingReply || !replyText.trim()}>
                  Gửi
                </button>
              </form>
            </div>
          </div>
        ) : (
          // Trạng thái "chưa chọn hội thoại nào" — chỉ hiện ở màn hình máy
          // tính (bố cục 2 cột), vì ở điện thoại không có cột chi tiết trống
          // nào để hiển thị placeholder cả (danh sách chiếm toàn màn hình).
          <div
            className="h-100 bg-white border border-2 rounded-3 d-none d-lg-flex flex-column align-items-center justify-content-center text-muted drop-zone"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <p className="mt-3 mb-0">Chọn 1 hội thoại bên trái để xem chi tiết</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
