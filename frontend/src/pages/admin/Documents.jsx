import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";

const STATUS_LABEL = {
  ready: { text: "Sẵn sàng", cls: "bg-success" },
  processing: { text: "Đang xử lý", cls: "bg-warning text-dark" },
  failed: { text: "Lỗi", cls: "bg-danger" },
};

// Icon SVG đơn giản (không dùng emoji), cùng phong cách đường nét mảnh với
// các icon đã có ở AdminLayout.jsx / Chat.jsx.
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// Nút "..." mở popover tuỳ chọn quy chế — giống hệt icon dùng cho popover
// tuỳ chọn tin nhắn ở Chat.jsx.
function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Icon thùng rác — cùng hình với TrashIcon ở Chat.jsx (mục "Xoá tin nhắn").
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

export default function Documents() {
  // confirm(...)/notifySuccess(...)/notifyError(...) thay cho window.confirm()
  // và "listError" (khối alert-danger rời rạc trước đây cho các lỗi Xem/Tải
  // xuống/Xoá) — xem context/NotificationContext.jsx. Lỗi VALIDATION của form
  // "Thêm quy chế mới" (state "error" bên dưới) vẫn hiện ngay trong popup vì
  // đó là phản hồi tại chỗ, ngay cạnh nút bấm — không cần popup riêng.
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [isSensitive, setIsSensitive] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Form "Thêm quy chế mới" giờ nằm trong popup (modal) mở bằng nút ở đầu
  // trang, thay vì chiếm cố định 1 cột bên trái như trước — đỡ chật khi danh
  // sách quy chế dài, và dồn trọng tâm trang vào danh sách.
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Modal "xem trước" nội dung quy chế — { title, content } khi đang mở, null
  // khi đóng. previewLoading dùng để hiện trạng thái đang tải TRONG modal
  // (modal mở ngay khi bấm "Xem", không đợi có dữ liệu mới mở, để cảm giác
  // phản hồi nhanh hơn).
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Popover tuỳ chọn (Xem / Tải xuống / Xoá) cho từng quy chế — chỉ hiện nút
  // "..." khi rê chuột vào thẻ quy chế (giống popover tuỳ chọn tin nhắn ở
  // trang Chat.jsx): toạ độ "fixed" được TÍNH SẴN bằng JS lúc bấm (dựa trên vị
  // trí nút "..."), render qua Portal thẳng ra <body>, tự lật lên trên nếu
  // không đủ chỗ hiện xuống dưới. Dùng lại ĐÚNG các class
  // .msg-context-menu/.msg-context-menu-item đã có trong custom.css (định
  // nghĩa cho popover tin nhắn) để 2 nơi có giao diện giống hệt nhau.
  const [docMenu, setDocMenu] = useState(null); // { id, status, left, top, openUp }

  async function loadDocuments() {
    const data = await api.get("/documents");
    setDocuments(data.documents);
  }

  useEffect(() => {
    loadDocuments();
    // Tự động làm mới danh sách mỗi 4 giây để cập nhật trạng thái xử lý (processing -> ready)
    const interval = setInterval(loadDocuments, 4000);
    return () => clearInterval(interval);
  }, []);

  // Đóng popover tuỳ chọn quy chế khi bấm ra ngoài, cuộn trang, đổi kích
  // thước cửa sổ, hoặc nhấn Esc — vì toạ độ đã tính sẵn sẽ không còn đúng nếu
  // bố cục thay đổi. Giống hệt effect tương ứng ở Chat.jsx (openMessageMenu).
  useEffect(() => {
    if (!docMenu) return;

    function handleDocMouseDown(e) {
      if (e.target.closest(".doc-menu-trigger") || e.target.closest(".msg-context-menu")) {
        return;
      }
      setDocMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setDocMenu(null);
    }
    function handleReposition() {
      setDocMenu(null);
    }

    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
    };
  }, [docMenu]);

  // Mở popover tuỳ chọn cho 1 quy chế — xem giải thích cách tính toạ độ ở
  // openMessageMenu (Chat.jsx). menuWidth phải khớp với "width" khai báo cho
  // .msg-context-menu trong custom.css (220px) để tính toạ độ "left" đúng.
  function openDocMenu(e, doc) {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const estimatedHeight = 3 * 40 + 12; // 3 mục: Xem / Tải xuống / Xoá
    const openUp = rect.bottom + estimatedHeight + 8 > window.innerHeight;
    setDocMenu({
      id: doc.id,
      status: doc.status,
      left: Math.min(Math.max(rect.right - menuWidth, 8), window.innerWidth - menuWidth - 8),
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      openUp,
    });
  }

  function closeDocMenu() {
    setDocMenu(null);
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      setError("Vui lòng chọn 1 file (PDF, DOCX hoặc TXT).");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name);
      formData.append("category", category);
      formData.append("isSensitive", String(isSensitive));
      await api.postForm("/documents", formData);
      setTitle("");
      setCategory("");
      setIsSensitive(false);
      setFile(null);
      e.target.reset();
      setShowUploadModal(false); // tải lên xong thì tự đóng popup, về lại danh sách
      await loadDocuments();
      notifySuccess("Đã tải lên quy chế mới.");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    const ok = await confirm("Xoá quy chế này? Toàn bộ dữ liệu tìm kiếm liên quan sẽ bị xoá.", {
      confirmText: "Xoá",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/documents/${id}`);
      await loadDocuments();
      notifySuccess("Đã xoá quy chế.");
    } catch (err) {
      notifyError(err.message);
    }
  }

  // Xem trước nội dung quy chế NGAY TRONG TRANG (không tải file về máy) — gọi
  // route mới "/doc-files/:id/preview", trả về text đã trích xuất sẵn (ghép
  // lại từ các chunk đã tách khi xử lý quy chế). Nhờ đọc từ chunk đã lưu sẵn
  // trong DB thay vì đọc file gốc trên đĩa, cách này xem được CẢ quy chế seed
  // thẳng vào DB (không qua form upload, không có file gốc trên đĩa).
  async function handlePreview(doc) {
    setPreviewLoading(true);
    setPreview({ title: doc.title, content: "" });
    try {
      const data = await api.get(`/doc-files/${doc.id}/preview`);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      notifyError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreview(null);
  }

  // Tải file GỐC đã tải lên về máy — dùng chung route "/doc-files/:id/download"
  // với tính năng "tải nguồn trích dẫn" bên trang chat của nhân viên (xem
  // documentFiles.routes.js). Quy chế seed thẳng vào DB (không qua form upload
  // này) sẽ không có file gốc trên đĩa nên sẽ báo lỗi rõ ràng thay vì im lặng —
  // khác với "Xem" ở trên (luôn xem được vì chỉ cần nội dung đã trích xuất).
  async function handleDownload(doc) {
    try {
      await api.downloadFile(`/doc-files/${doc.id}/download`, doc.title);
    } catch (err) {
      notifyError(err.message);
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
        <h2 className="h6 mb-0">Danh sách quy chế ({documents.length})</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1 flex-shrink-0"
          onClick={() => setShowUploadModal(true)}
        >
          <PlusIcon />
          Thêm quy chế mới
        </button>
      </div>

      <div className="row row-cols-1 row-cols-xl-2 g-2">
        {documents.map((doc) => {
          const status = STATUS_LABEL[doc.status] || STATUS_LABEL.processing;
          return (
            <div key={doc.id} className="col">
              {/* Class "doc-card" (thêm bên cạnh "card") chỉ để CSS biết khi
                  nào cần hiện nút "..." — xem ".doc-card:hover .doc-menu-trigger"
                  trong custom.css. */}
              <div className="card doc-card h-100">
                <div className="card-body d-flex justify-content-between align-items-start gap-3">
                  <div className="text-truncate">
                    <div className="fw-semibold text-truncate">{doc.title}</div>
                    <div className="text-muted small">
                      {doc.category || "Chưa phân loại"} · {doc.chunk_count} đoạn
                    </div>
                    <span className={`badge mt-1 ${status.cls}`}>{status.text}</span>
                    {doc.is_sensitive && <span className="badge mt-1 ms-1 bg-dark">Nhạy cảm</span>}
                  </div>
                  <button
                    type="button"
                    className={`doc-menu-trigger flex-shrink-0 ${docMenu?.id === doc.id ? "is-open" : ""}`}
                    title="Tuỳ chọn quy chế"
                    onClick={(e) => openDocMenu(e, doc)}
                  >
                    <KebabIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {documents.length === 0 && (
        <p className="text-muted">
          Chưa có quy chế nào. Bấm "Thêm quy chế mới" ở trên để tải lên file đầu tiên.
        </p>
      )}

      {/* Popover tuỳ chọn quy chế (Xem / Tải xuống / Xoá) — render qua Portal
          thẳng vào <body>, dùng lại đúng class .msg-context-menu/-item của
          popover tin nhắn ở Chat.jsx nên giao diện giống hệt. */}
      {docMenu &&
        createPortal(
          <div
            className="msg-context-menu"
            style={{
              top: docMenu.top,
              left: docMenu.left,
              transform: docMenu.openUp ? "translateY(-100%)" : "none",
            }}
          >
            <button
              type="button"
              className="msg-context-menu-item"
              disabled={docMenu.status !== "ready"}
              title={
                docMenu.status === "ready"
                  ? "Xem nhanh nội dung quy chế, không cần tải về"
                  : "Quy chế chưa xử lý xong, chưa có nội dung để xem"
              }
              onClick={() => {
                const doc = documents.find((d) => d.id === docMenu.id);
                closeDocMenu();
                if (doc) handlePreview(doc);
              }}
            >
              <EyeIcon />
              Xem
            </button>
            <button
              type="button"
              className="msg-context-menu-item"
              title="Tải file gốc đã tải lên về máy"
              onClick={() => {
                const doc = documents.find((d) => d.id === docMenu.id);
                closeDocMenu();
                if (doc) handleDownload(doc);
              }}
            >
              <DownloadIcon />
              Tải xuống
            </button>
            <button
              type="button"
              className="msg-context-menu-item text-danger"
              onClick={() => {
                const id = docMenu.id;
                closeDocMenu();
                handleDelete(id);
              }}
            >
              <TrashIcon />
              Xoá
            </button>
          </div>,
          document.body
        )}

      {/* Popup "Thêm quy chế mới" — cùng khung modal (Portal + backdrop) với
          modal "xem trước" bên dưới, để 2 popup trên trang này có giao diện
          đồng nhất. Bấm ra ngoài khung nội dung hoặc nút "Đóng" đều đóng popup;
          tải lên thành công cũng tự đóng (xem handleUpload). */}
      {showUploadModal &&
        createPortal(
          <div
            className="doc-preview-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowUploadModal(false);
            }}
          >
            <div className="doc-preview-modal">
              <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                <h2 className="h6 mb-0">Thêm quy chế mới</h2>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Đóng"
                  onClick={() => setShowUploadModal(false)}
                />
              </div>
              <div className="doc-preview-body">
                <form onSubmit={handleUpload}>
                  <div className="mb-3">
                    <label className="form-label">Tiêu đề</label>
                    <input
                      className="form-control"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="VD: Quy chế nghỉ phép"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Danh mục</label>
                    <input
                      className="form-control"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="VD: Nhân sự"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">File (PDF, DOCX, TXT)</label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf,.docx,.txt,.md"
                      onChange={(e) => setFile(e.target.files[0])}
                    />
                  </div>

                  {/* Tài liệu nhạy cảm: vẫn được nạp vào hệ thống để admin tìm kiếm nội bộ,
                      nhưng chatbot sẽ KHÔNG dùng nội dung này để tự trả lời nhân viên —
                      thay vào đó sẽ hướng dẫn liên hệ trực tiếp admin (xem README, mục
                      "Tài liệu nhạy cảm"). */}
                  <div className="form-check mb-3">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="isSensitive"
                      checked={isSensitive}
                      onChange={(e) => setIsSensitive(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="isSensitive">
                      Tài liệu nhạy cảm (VD: lương thưởng cá nhân, kỷ luật, dữ liệu khách hàng...)
                      <br />
                      <span className="text-muted small">
                        Chatbot sẽ không tự trả lời dựa trên tài liệu này — câu hỏi liên quan sẽ được
                        chuyển cho quản trị viên.
                      </span>
                    </label>
                  </div>

                  {error && <div className="alert alert-danger py-2">{error}</div>}

                  <button className="btn btn-primary" type="submit" disabled={uploading}>
                    {uploading ? "Đang tải lên..." : "Tải lên"}
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal "xem trước" — render qua Portal thẳng vào <body>, phủ toàn màn
          hình, để không bị ảnh hưởng bởi bố cục/overflow của trang. Bấm ra
          ngoài khung nội dung (lớp phủ nền) hoặc nút "Đóng" đều đóng modal. */}
      {preview &&
        createPortal(
          <div
            className="doc-preview-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) closePreview();
            }}
          >
            <div className="doc-preview-modal">
              <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                <h2 className="h6 mb-0">{preview.title}</h2>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={closePreview} />
              </div>
              <div className="doc-preview-body">
                {previewLoading ? (
                  <p className="text-muted mb-0">Đang tải nội dung...</p>
                ) : (
                  <pre className="doc-preview-content">{preview.content}</pre>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
