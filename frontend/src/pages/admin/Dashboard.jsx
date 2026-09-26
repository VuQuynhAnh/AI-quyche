// Trang tổng quan cho admin: 1 hàng số liệu tổng (KPI) + 4 biểu đồ, dữ liệu
// lấy từ GET /admin/stats (PostgreSQL + MongoDB gộp lại ở backend) và
// GET /admin/stats/top-topics.
//
// 4 biểu đồ được chọn để trả lời đúng 4 câu hỏi admin hay cần biết nhất:
//   1. Câu trả lời của chatbot có TỐT không?    -> tỷ lệ nhân viên đánh giá
//      "hữu ích" so với "không hữu ích" (đánh giá THẬT từ người dùng, khác
//      với việc chỉ xem có bị gắn cờ hay không — chatbot có thể trả lời
//      "được" về mặt kỹ thuật nhưng vẫn không hữu ích với nhân viên)
//   2. Hội thoại đang ở trạng thái nào?        -> "sức khoẻ" của trợ lý AI:
//      bao nhiêu % chatbot tự trả lời được (normal/resolved) so với đang cần
//      admin xử lý (flagged)
//   3. Bao nhiêu % câu hỏi cần admin hỗ trợ?    -> "totalEscalations" (cộng
//      dồn CẢ lịch sử, không chỉ đoạn chat đang "flagged" ngay lúc này) chia
//      cho "totalQuestions" — thước đo NGƯỢC với biểu đồ (1): (1) đo chất
//      lượng câu trả lời chatbot ĐÃ gửi, còn đây đo tỷ lệ chatbot phải NHỜ
//      ĐẾN admin ngay từ đầu
//   4. Vấn đề nào được hỏi nhiều nhất?          -> đếm số lần MỖI quy chế được
//      chatbot TRUY XUẤT để trả lời (không gộp theo trùng khớp chữ câu hỏi,
//      vì nhiều cách hỏi khác nhau có thể cùng cần tới 1 quy chế) — gợi ý quy
//      chế nào đang được quan tâm nhiều nhất, cần rà soát/làm rõ thêm
//
// Về màu sắc: biểu đồ (1) dùng bảng màu TRẠNG THÁI cố định (good/critical) vì
// đây đúng nghĩa là 1 thang "tốt -> có vấn đề". Biểu đồ (2) và (3) dùng màu
// PHÂN LOẠI (categorical) vì các trạng thái ở đó là những NHÓM khác nhau,
// không phải 1 thang tốt-xấu duy nhất (VD: "normal" và "resolved" đều là kết
// quả tốt nhưng khác ý nghĩa, gộp chung 1 màu "tốt" sẽ mất khả năng phân biệt
// 2 nhóm này trên biểu đồ).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import StackedBarChart from "../../components/charts/StackedBarChart.jsx";
import RankedBarChart from "../../components/charts/RankedBarChart.jsx";

const CONV_STATUS_LABEL = { normal: "Bình thường (chatbot tự trả lời)", flagged: "Cần admin trả lời", resolved: "Admin đã trả lời" };

// 2 icon đánh giá "hữu ích"/"không hữu ích" — CÙNG hình dùng ở nút đánh giá
// bên trang chat của nhân viên (Chat.jsx), để 2 nơi nhận ra nhau bằng mắt.
function ThumbsUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 22H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3M14 9V5a3 3 0 0 0-6 0v4l-2 4v8a1 1 0 0 0 1 1h9.28a2 2 0 0 0 2-1.7l1.38-9A2 2 0 0 0 18.7 9z" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3M10 15v4a3 3 0 0 0 6 0v-4l2-4V3a1 1 0 0 0-1-1H7.72a2 2 0 0 0-2 1.7l-1.38 9A2 2 0 0 0 6.3 15z" />
    </svg>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [topTopics, setTopTopics] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/admin/stats"), api.get("/admin/stats/top-topics?limit=8")])
      .then(([statsData, topData]) => {
        setStats(statsData);
        setTopTopics(topData.topTopics);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!stats) return <p className="text-muted">Đang tải...</p>;

  // Không còn vẽ biểu đồ riêng cho trạng thái xử lý quy chế (đã thay bằng
  // biểu đồ "Đánh giá câu trả lời của chatbot" — xem bên dưới), nên chỉ cần
  // TỔNG số quy chế cho ô số liệu ở đầu trang.
  const totalDocuments = stats.documentsByStatus.reduce((sum, d) => sum + d.count, 0);

  const normalCount = stats.conversationsByStatus.find((c) => c.status === "normal")?.count || 0;
  const flaggedCount = stats.conversationsByStatus.find((c) => c.status === "flagged")?.count || 0;
  const resolvedCount = stats.conversationsByStatus.find((c) => c.status === "resolved")?.count || 0;

  // "totalEscalations" cộng dồn qua LỊCH SỬ (1 đoạn chat có thể cần hỗ trợ
  // nhiều lần), nên về lý thuyết có thể vượt "totalQuestions" nếu nhân viên
  // tự bấm "Cần admin hỗ trợ" nhiều lần mà không hỏi thêm câu nào mới — chặn
  // ở 0 để thanh biểu đồ không bị âm trong trường hợp hiếm này.
  const escalatedQuestionCount = Math.min(stats.totalEscalations, stats.totalQuestions);
  const autoAnsweredQuestionCount = Math.max(stats.totalQuestions - escalatedQuestionCount, 0);

  const helpfulCount = stats.feedbackBreakdown.find((f) => f.feedback === "helpful")?.count || 0;
  const unhelpfulCount = stats.feedbackBreakdown.find((f) => f.feedback === "unhelpful")?.count || 0;

  const tiles = [
    { label: "Tổng quy chế", value: totalDocuments },
    { label: "Tổng hội thoại", value: stats.totalConversations },
    { label: "Tổng câu hỏi", value: stats.totalQuestions },
    { label: "Cần admin trả lời", value: stats.needsReviewCount },
  ];

  return (
    <div>
      {stats.needsReviewCount > 0 && (
        <div className="alert alert-warning d-flex justify-content-between align-items-center">
          <span>
            Có <strong>{stats.needsReviewCount}</strong> hội thoại đang cần admin trả lời trực tiếp.
          </span>
          <Link to="/admin/logs" className="btn btn-warning btn-sm text-nowrap">
            Xem ngay
          </Link>
        </div>
      )}

      {/* Hàng số liệu tổng (KPI row) — mỗi ô 1 con số duy nhất, chi tiết theo
          từng trạng thái đã chuyển hết xuống 4 biểu đồ bên dưới để tránh lặp
          lại thông tin. */}
      <div className="row g-3 mb-4">
        {tiles.map((t) => (
          <div key={t.label} className="col-6 col-lg-3">
            <div className="card h-100">
              <div className="card-body">
                <div className="fs-3 fw-bold">{t.value}</div>
                <div className="text-muted">{t.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <StackedBarChart
            title="Đánh giá câu trả lời của chatbot"
            caption="Trong số câu trả lời ĐÃ được nhân viên đánh giá (bấm hữu ích/không hữu ích ở trang chat) — bao nhiêu được cho là hữu ích"
            segments={[
              { key: "helpful", label: "Hữu ích", value: helpfulCount, color: "var(--status-good)", icon: <ThumbsUpIcon /> },
              { key: "unhelpful", label: "Không hữu ích", value: unhelpfulCount, color: "var(--status-critical)", icon: <ThumbsDownIcon /> },
            ]}
            emptyText="Chưa có câu trả lời nào được nhân viên đánh giá."
          />
        </div>

        <div className="col-12 col-lg-6">
          <StackedBarChart
            title="Trạng thái hội thoại"
            caption="Bao nhiêu hội thoại chatbot tự xử lý được so với cần admin can thiệp"
            segments={[
              { key: "normal", label: CONV_STATUS_LABEL.normal, value: normalCount, color: "var(--series-1)" },
              { key: "flagged", label: CONV_STATUS_LABEL.flagged, value: flaggedCount, color: "var(--series-2)" },
              { key: "resolved", label: CONV_STATUS_LABEL.resolved, value: resolvedCount, color: "var(--series-3)" },
            ]}
            emptyText="Chưa có hội thoại nào."
          />
        </div>

        <div className="col-12 col-lg-6">
          <StackedBarChart
            title="Tỷ lệ câu hỏi cần admin hỗ trợ"
            caption="Số lần cần gọi admin hỗ trợ (cộng dồn cả lịch sử) trên tổng số câu hỏi đã hỏi"
            segments={[
              { key: "escalated", label: "Cần admin hỗ trợ", value: escalatedQuestionCount, color: "var(--status-critical)" },
              { key: "auto-answered", label: "Chatbot tự trả lời", value: autoAnsweredQuestionCount, color: "var(--status-good)" },
            ]}
            emptyText="Chưa có câu hỏi nào."
          />
        </div>

        <div className="col-12 col-lg-6">
          <RankedBarChart
            title="Vấn đề được hỏi nhiều nhất"
            caption="Top 8 quy chế — tính bằng số lần chatbot truy xuất được từ quy chế đó để trả lời"
            items={topTopics.map((t) => ({ label: t.title, value: t.count }))}
            emptyText="Chưa có dữ liệu truy xuất nào."
          />
        </div>
      </div>
    </div>
  );
}
