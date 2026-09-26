# Trợ lý AI Quy chế & Văn bản Nội bộ Doanh nghiệp

Dự án demo/giảng dạy: một trợ lý AI (dạng chatbot) giúp nhân viên tra cứu quy chế,
nội quy, chính sách nội bộ công ty. Dùng kỹ thuật **RAG (Retrieval-Augmented
Generation)**: hệ thống tìm các đoạn văn bản nội bộ liên quan nhất tới câu hỏi,
rồi đưa cho mô hình AI (Google Gemini) để sinh câu trả lời có trích dẫn nguồn —
giúp AI không "bịa" thông tin ngoài văn bản công ty.

## Kiến trúc

Dự án dùng **2 loại cơ sở dữ liệu** (polyglot persistence) — mỗi loại cho đúng
việc nó mạnh nhất, xem lý do chi tiết ở mục "So sánh PostgreSQL vs MongoDB" bên dưới:

```
Trình duyệt (React + Bootstrap, mobile-first)
   ├── /login, /register  → nhân viên đăng nhập / tự đăng ký (CHỈ 2 việc này +
   │                         hỏi đáp — phía client không có chức năng nào khác)
   ├── /chat              → nhân viên: 1 đoạn chat LIÊN TỤC duy nhất (giống
   │                         Messenger/Zalo) — mở lên là thấy tin nhắn cũ ngay,
   │                         kéo lên để tải thêm; có thể xoá 1 tin nhắn hoặc cả
   │                         đoạn chat; tự đánh dấu "câu hỏi cần admin trả lời"
   └── /admin             → quản trị viên: upload văn bản, danh sách người
        │                    dùng, thống kê, xem & trả lời trực tiếp hội thoại
        │  (gọi API qua JWT)
        ▼
Backend Node.js (Express)
   ├── auth        : đăng ký / đăng nhập, sinh JWT, phân quyền admin/employee
   ├── documents   : upload PDF/DOCX/TXT (+ cờ "tài liệu nhạy cảm") → trích
   │                 xuất text → tách chunk → tạo embedding (Gemini) → lưu
   │                 PostgreSQL (pgvector)
   ├── chat        : nhận câu hỏi → tạo embedding → nếu khớp TÀI LIỆU NHẠY CẢM
   │                 thì từ chối trả lời + tự chuyển admin; ngược lại tìm chunk
   │                 gần nghĩa nhất trong tài liệu thường (cosine similarity,
   │                 PostgreSQL) → hỏi Gemini kèm ngữ cảnh → trả lời → lưu vào
   │                 đoạn chat (MongoDB) đang hoạt động của nhân viên đó. Nhân
   │                 viên cũng có thể tự đánh dấu hội thoại "cần admin trả lời"
   │                 bất kỳ lúc nào, hoặc xoá tin nhắn/đoạn chat (xoá mềm).
   └── admin       : danh sách user (Postgres), thống kê + câu hỏi hay gặp
                     (Mongo), xem/trả lời trực tiếp bất kỳ đoạn chat nào — kể
                     cả đoạn chat nhân viên đã xoá mềm (Mongo)
        │                              │
        ▼                              ▼
PostgreSQL + pgvector            MongoDB
(users, documents,               (2 collection riêng — xem mục "Mô hình 1 nhân
 document_chunks/embeddings)      viên = 1 đoạn chat" bên dưới:
                                   - conversations: 1 document/nhân viên đang
                                     hoạt động, có "status": normal/flagged/
                                     resolved, và isDeleted khi nhân viên xoá
                                   - messages: từng tin nhắn (role user/
                                     assistant/admin), tách riêng để phân
                                     trang hiệu quả — KHÔNG lồng trong
                                     conversation)
```

## Yêu cầu hệ thống

- Node.js 18+
- PostgreSQL 14+ với extension **pgvector** (`CREATE EXTENSION vector;`)
- MongoDB 6+ (local, Docker, hoặc Atlas — có gói miễn phí)
- 1 API key Google Gemini (miễn phí): https://aistudio.google.com/app/apikey

## Cài đặt

### 1. Cơ sở dữ liệu

```bash
# Cài pgvector (Ubuntu/Debian, thay 16 bằng version Postgres bạn dùng)
sudo apt install postgresql-16-pgvector

# Tạo database
sudo -u postgres psql -c "CREATE DATABASE ai_quyche;"
sudo -u postgres psql -d ai_quyche -c "CREATE EXTENSION vector;"

# Cài & chạy MongoDB (chọn 1 trong các cách sau)
docker run -d -p 27017:27017 --name mongo mongo:7      # cách nhanh nhất nếu có Docker
# hoặc cài mongodb-org theo hướng dẫn chính thức: https://www.mongodb.com/docs/manual/installation/
# hoặc dùng MongoDB Atlas (cloud, có gói free): https://www.mongodb.com/cloud/atlas
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Mở .env, điền GEMINI_API_KEY, thông tin PostgreSQL (PGUSER, PGPASSWORD, ...)
# và MONGODB_URI (mặc định mongodb://localhost:27017/ai_quyche_chat đã dùng được
# luôn nếu chạy Docker/MongoDB local ở trên)

npm install
npm run seed     # tạo bảng Postgres + 2 tài khoản demo (xem bên dưới)
npm run dev      # chạy tại http://localhost:4000
```

Nếu quên bật MongoDB, backend vẫn khởi động bình thường (đăng nhập, quản lý văn
bản, danh sách người dùng vẫn dùng được vì các phần đó chỉ cần PostgreSQL) —
riêng các API liên quan tới hội thoại (`/chat/*`, `/admin/stats*`,
`/admin/conversations*`) sẽ trả lỗi **503** ngay lập tức kèm thông báo rõ ràng
(`requireMongo` middleware, `backend/src/middleware/requireMongo.js`) thay vì
bị "treo" chờ kết nối, cho tới khi MongoDB sẵn sàng và backend được khởi động lại.

Tài khoản demo sau khi `npm run seed`:

| Vai trò   | Email               | Mật khẩu     |
|-----------|---------------------|--------------|
| admin     | admin@congty.vn     | Admin@123    |
| employee  | nhanvien@congty.vn  | NhanVien@123 |

Sau khi backend chạy, đăng nhập bằng tài khoản admin, vào **Trang quản trị → Văn
bản**, upload các file mẫu có sẵn trong `backend/sample-data/` để có dữ liệu demo
ngay mà không cần chuẩn bị văn bản thật — xem chi tiết từng file (và file nào
cần tick "Tài liệu nhạy cảm" khi upload) trong `backend/sample-data/README.md`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # chạy tại http://localhost:5173, tự proxy /api sang backend
```

Mở `http://localhost:5173` trên trình duyệt (hoặc DevTools chế độ mobile để xem
giao diện responsive).

## Giải thích luồng RAG (phần lõi để dạy học viên)

1. **Nạp văn bản** (`backend/src/services/document.service.js`): file được
   trích xuất text thô (`textExtract.service.js`), tách thành các đoạn ~900 ký
   tự có chồng lấn (`chunk.service.js`), mỗi đoạn được chuyển thành 1 vector
   768 chiều bằng model `text-embedding-004` (`embedding.service.js`), rồi lưu
   vào bảng `document_chunks` cùng vector đó.
2. **Trả lời câu hỏi** (`backend/src/services/rag.service.js`): câu hỏi cũng
   được chuyển thành vector; PostgreSQL/pgvector tìm 5 đoạn có vector gần nhất
   (`ORDER BY embedding <=> $1`, khoảng cách cosine); các đoạn này được ghép
   thành "ngữ cảnh" và đưa vào prompt yêu cầu Gemini chỉ trả lời dựa trên ngữ
   cảnh đó, kèm trích dẫn nguồn.

Đây chính là ý tưởng cốt lõi giúp AI trả lời **đúng theo văn bản công ty** thay
vì dựa vào kiến thức chung chung của mô hình.

## Tài liệu nhạy cảm — khi nào chatbot KHÔNG được tự trả lời

Không phải văn bản nội bộ nào cũng nên để chatbot tự do trả lời chung cho mọi
nhân viên (VD: hồ sơ lương thưởng cá nhân, quyết định kỷ luật, dữ liệu khách
hàng...). Khi admin upload văn bản, có thể tick chọn **"Tài liệu nhạy cảm"**
(cột `is_sensitive` trong bảng `documents`). Tài liệu này vẫn được trích xuất,
tách chunk và tạo embedding như bình thường (để admin có thể tìm kiếm nội bộ
sau này), nhưng luồng RAG (`backend/src/services/rag.service.js`) xử lý khác
hẳn:

1. Trước khi tìm câu trả lời, hệ thống kiểm tra xem embedding của câu hỏi có
   khớp cao (cosine similarity ≥ 0.72, xem hằng số `SENSITIVE_MATCH_THRESHOLD`)
   với bất kỳ đoạn nào thuộc tài liệu nhạy cảm hay không.
2. Nếu có, chatbot **từ chối trả lời ngay** (không gửi nội dung nhạy cảm cho
   Gemini) và trả lời hướng dẫn nhân viên liên hệ admin.
3. Hội thoại đó được **tự động gắn trạng thái "flagged"** (`autoEscalated: true`)
   để xuất hiện trong mục "Cần admin trả lời" ở trang quản trị.

Lưu ý: ngưỡng 0.72 là một con số kinh nghiệm (heuristic) đơn giản, không phải
một bộ phân loại hoàn hảo — trong dự án thật nên kiểm thử lại với dữ liệu thực
tế, hoặc cải tiến bằng một bước phân loại chủ đề riêng.

## Mô hình "1 nhân viên = 1 đoạn chat liên tục"

Khác với thiết kế ban đầu (nhiều "hội thoại" tách rời, chọn qua danh sách lịch
sử), hệ thống hiện dùng mô hình giống các app nhắn tin thông thường (Messenger/
Zalo): **mỗi nhân viên chỉ có đúng 1 đoạn chat đang hoạt động tại 1 thời điểm**.
Mở trang `/chat` lên là thấy ngay các tin nhắn gần nhất, không cần chọn hội
thoại nào cả.

**Vì sao tách `Message` thành collection riêng thay vì lồng trong `Conversation`?**
Với 1 đoạn chat liên tục, số tin nhắn có thể lên tới hàng nghìn theo thời gian.
Nhồi tất cả vào 1 mảng lồng trong 1 document MongoDB là "anti-pattern" MongoDB
khuyến cáo tránh (mảng không giới hạn, có thể chạm giới hạn 16MB/document, và
mỗi lần đọc phải tải nguyên mảng dù chỉ cần vài tin nhắn gần nhất). Vì vậy
`backend/src/models/message.model.js` là 1 collection riêng, có index
`{conversationId, createdAt}` để phân trang nhanh bằng cursor.

**Phân trang kiểu "tải thêm khi kéo lên" (infinite scroll ngược):**
`GET /chat/thread` luôn trả về trang MỚI NHẤT (tối đa 20 tin nhắn, xem
`chatThread.service.js#paginateMessages`). Khi nhân viên kéo lên gần đầu khung
chat, phía client gọi lại `GET /chat/thread?before=<createdAt của tin cũ nhất
đang hiển thị>` để lấy thêm 20 tin cũ hơn, nối vào đầu danh sách — không tải
lại toàn bộ lịch sử mỗi lần. Trang quản trị (`admin/Logs.jsx`) dùng lại đúng cơ
chế này (nút "Tải tin nhắn cũ hơn") khi admin xem 1 đoạn chat bất kỳ.

**Xoá mềm (soft delete) — dữ liệu không mất, chỉ ẩn khỏi phía nhân viên:**

| Hành động                     | Ảnh hưởng                                                                 |
|--------------------------------|----------------------------------------------------------------------------|
| Xoá 1 tin nhắn                | Chỉ tin nhắn đó bị đánh dấu `isDeleted = true` và ẩn khỏi khung chat của nhân viên. Đoạn chat tiếp tục bình thường — **không** tạo đoạn chat mới. |
| Xoá cả đoạn chat              | Cả `Conversation` bị đánh dấu `isDeleted = true`, và hệ thống **tự động tạo ngay 1 đoạn chat trắng mới** để nhân viên tiếp tục hỏi đáp (`softDeleteActiveThreadAndCreateNew`). |

Trong cả 2 trường hợp, dữ liệu **không bị xoá thật khỏi MongoDB** — admin ở
trang `/admin/logs` vẫn xem được đầy đủ nội dung đã xoá (kèm nhãn "Đã xoá") để
phục vụ kiểm tra/đối soát nội bộ, kể cả trả lời trực tiếp vào 1 đoạn chat đã bị
nhân viên xoá (khi đó API trả về thêm cảnh báo vì nhân viên sẽ không thấy được
câu trả lời đó nữa).

Ở tầng dữ liệu, `conversation.model.js` có 1 **partial unique index**
(`{userId: 1}` với điều kiện `isDeleted: false`) để đảm bảo 1 nhân viên không
thể có 2 đoạn chat "đang hoạt động" cùng lúc, kể cả khi có 2 request gần như
đồng thời (race condition) — MongoDB sẽ từ chối request thứ 2, và code bắt lỗi
trùng khoá đó để đọc lại đúng bản ghi vừa được tạo.

## Cơ chế "Cần admin trả lời" (hội thoại flagged)

Ngoài trường hợp tự động ở trên, **nhân viên cũng có thể tự đánh giá** một câu
hỏi là khó hoặc câu trả lời của chatbot chưa thoả đáng, và bấm nút "Đánh dấu
cần admin hỗ trợ" ngay trong khung chat. Cả 2 trường hợp đều đưa hội thoại vào
cùng 1 hàng đợi cho admin xử lý. Vòng đời của 1 hội thoại (trường `status` ở
MongoDB, xem `backend/src/models/conversation.model.js`):

| status     | Ý nghĩa                                                             |
|------------|----------------------------------------------------------------------|
| `normal`   | Hội thoại bình thường, chatbot tự trả lời được                      |
| `flagged`  | Cần admin trả lời (tự động phát hiện tài liệu nhạy cảm, hoặc nhân viên tự đánh dấu) |
| `resolved` | Admin đã trả lời trực tiếp trong hội thoại này                       |

Ở **Trang quản trị → Hội thoại**, các hội thoại `flagged` được liệt kê riêng ở
mục "Cần admin trả lời" (nổi bật trên cùng), kèm theo **1 câu tóm tắt** (nếu đã
sinh xong) để admin lướt danh sách là nắm ngay nhân viên đang vướng gì mà không
cần mở từng hội thoại ra đọc lại toàn bộ tin nhắn — xem mục "Tóm tắt hội thoại
tự động" bên dưới. Admin bấm vào để xem toàn bộ nội
dung hội thoại, gõ câu trả lời vào khung bên dưới rồi gửi — tin nhắn được thêm
vào đoạn chat với `role: "admin"` và trạng thái chuyển thành `resolved`. Vì mỗi
nhân viên chỉ có 1 đoạn chat liên tục (xem mục trên), câu trả lời này sẽ xuất
hiện thẳng trong đoạn chat họ đang xem ở lần mở `/chat` tiếp theo (bong bóng
chat màu xanh lá, nhãn "Quản trị viên") — miễn là đoạn chat đó chưa bị chính
nhân viên xoá trong lúc chờ (nếu đã xoá, admin sẽ thấy cảnh báo khi gửi trả lời).

### Tóm tắt hội thoại tự động

Ngay khi 1 hội thoại chuyển sang `flagged` (dù tự động hay do nhân viên tự đánh
dấu), backend gọi NGẦM (không `await`, không làm chậm response trả lời nhân
viên — xem `chatThread.service.js#generateConversationSummaryAsync`) tới cùng
Gemini model đang dùng để chat (`summary.service.js#summarizeConversation`) để
sinh 1-2 câu tóm tắt nội dung, lưu vào `conversation.summary`. Đây là lựa chọn
đơn giản hoá có chủ đích cho bản demo: tóm tắt chỉ sinh **1 lần** tại thời điểm
gắn cờ (dựa trên tối đa 40 tin nhắn gần nhất), không tự cập nhật lại nếu có
thêm tin nhắn sau đó. Nếu gọi Gemini thất bại (VD: chưa cấu hình
`GEMINI_API_KEY`), lỗi được nuốt lại và cột `summary` đơn giản là để trống —
trang quản trị vẫn hoạt động bình thường, chỉ là không có dòng tóm tắt.

**Giới hạn hiện tại (hướng mở rộng cho học viên):** nhân viên phải tự mở lại
hội thoại để biết admin đã trả lời — hệ thống chưa có thông báo real-time
(có thể bổ sung bằng WebSocket/Server-Sent Events, hoặc đơn giản hơn là polling
định kỳ + hiển thị badge "có tin nhắn mới").

## Trang quản trị: Người dùng & Thống kê câu hỏi

- **Người dùng** (`/admin/users`): danh sách toàn bộ tài khoản (admin + nhân
  viên) lấy trực tiếp từ bảng `users` bên PostgreSQL, và đầy đủ thao tác quản
  lý ngay trên giao diện — xem mục "Quản lý tài khoản admin" ngay bên dưới để
  hiểu rõ cách hoạt động và các lớp bảo vệ đi kèm.
- **Câu hỏi được hỏi nhiều nhất** (dashboard, gọi `GET /admin/stats/top-questions`):
  gộp nhóm các câu hỏi (vai trò `user` trong MongoDB) theo nội dung trùng khớp
  chính xác (đã chuẩn hoá viết thường/bỏ khoảng trắng thừa) rồi đếm số lần xuất
  hiện. Đây là cách làm đơn giản — 2 câu hỏi cùng ý nhưng diễn đạt khác nhau sẽ
  KHÔNG được gộp; muốn chính xác hơn cần thêm bước phân cụm theo embedding
  (semantic clustering), một hướng mở rộng hay cho học viên tìm hiểu thêm.

## Biểu đồ trang Dashboard (`/admin`)

Trang Tổng quan có 1 hàng số liệu (KPI) + **4 biểu đồ**, mỗi biểu đồ trả lời
đúng 1 câu hỏi admin hay cần biết:

| # | Biểu đồ | Trả lời câu hỏi | Dạng | Màu |
|---|---------|-----------------|------|-----|
| 1 | Trạng thái văn bản | Văn bản đã tải lên đang ở đâu trong pipeline xử lý? | Cột xếp chồng (part-to-whole) | **Trạng thái** (good/warning/critical) |
| 2 | Trạng thái hội thoại | Chatbot tự trả lời được bao nhiêu % so với cần admin can thiệp? | Cột xếp chồng | **Phân loại** (categorical) |
| 3 | Lý do cần admin hỗ trợ | Trong số hội thoại từng gắn cờ, do hệ thống tự phát hiện hay nhân viên tự đánh dấu? | Cột xếp chồng | Phân loại |
| 4 | Câu hỏi được hỏi nhiều nhất | Nhân viên hay hỏi gì nhất? | Cột ngang xếp hạng | 1 màu (sequential) |

Vài quyết định thiết kế đáng chú ý (áp dụng phương pháp làm biểu đồ có hệ
thống — màu sắc không chọn tuỳ hứng mà theo "công việc" của nó):

- **Không dùng biểu đồ tròn/donut.** Biểu đồ 1-3 đều là dữ liệu "phần trong
  tổng thể" (part-to-whole) nhưng cố tình dùng **cột xếp chồng 1 hàng ngang**
  thay vì donut — vẽ đúng donut bằng CSS/SVG thuần cần tính toán góc cung khá
  phức tạp cho 1 việc chỉ cần truyền tải đúng tỷ lệ, trong khi cột xếp chồng
  đơn giản hơn nhiều mà hiệu quả tương đương.
- **Trạng thái (status) vs Phân loại (categorical) — chọn đúng "công việc" của
  màu:** biểu đồ (1) dùng bảng màu trạng thái cố định (xanh lá = tốt, vàng =
  cần chú ý, đỏ = nghiêm trọng) vì "sẵn sàng / đang xử lý / lỗi" đúng là 1
  thang tốt → xấu. Biểu đồ (2) và (3) KHÔNG dùng màu trạng thái dù nghe có vẻ
  tương tự, vì các nhóm ở đó không nằm trên 1 thang tốt-xấu duy nhất — ví dụ
  "normal" (chatbot tự xử lý) và "resolved" (admin đã xử lý xong) đều là kết
  quả tốt nhưng là 2 nhóm khác nhau; nếu tô cùng 1 màu "tốt" sẽ không phân
  biệt được 2 nhóm này trên biểu đồ. Trường hợp này dùng màu phân loại
  (categorical) — mỗi nhóm 1 màu cố định, không đại diện tốt/xấu.
- **Biểu đồ (4) chỉ dùng 1 màu duy nhất cho mọi cột** — vì đây là 1 phép đo
  lặp lại (số lần hỏi) cho nhiều câu hỏi khác nhau, không phải nhiều chuỗi dữ
  liệu cần phân biệt; tô mỗi cột 1 màu riêng sẽ khiến người xem lầm tưởng màu
  sắc mang ý nghĩa trong khi độ dài cột đã nói lên tất cả rồi.
- **Luôn có "lối thoát" khi không đọc được màu:** mỗi biểu đồ có khung chú
  thích (legend) hiện đủ số + phần trăm bằng CHỮ (không chỉ màu), và nút "Xem
  dạng bảng" mở ra 1 bảng số liệu đầy đủ — bảng màu đã được kiểm tra qua công
  cụ tự động (phân biệt được với các dạng mù màu phổ biến, đủ tương phản...)
  nhưng vẫn không nên là kênh THÔNG TIN DUY NHẤT.
- Component tái sử dụng: `frontend/src/components/charts/StackedBarChart.jsx`
  (biểu đồ 1-3) và `RankedBarChart.jsx` (biểu đồ 4) — cả 2 đều nhận dữ liệu
  qua props nên có thể dùng lại ở bất kỳ trang nào khác cần biểu đồ tương tự.

## Quản lý tài khoản admin (`/admin/users`)

Trước đây, tài khoản `admin` chỉ có thể được tạo qua script `npm run seed`
hoặc sửa trực tiếp trong PostgreSQL — không có cách nào làm việc này từ giao
diện. Trang **Trang quản trị → Người dùng** giờ hỗ trợ đầy đủ: tạo tài khoản
mới (chọn được vai trò ngay lúc tạo), thăng/hạ quyền 1 tài khoản đã có, và xoá
tài khoản — toàn bộ qua 3 route mới trong `admin.routes.js`:

| Route | Việc gì | Ghi chú |
|-------|---------|---------|
| `POST /admin/users` | Tạo tài khoản mới, admin chọn `role` (`admin`/`employee`) | Validate email trùng (409), mật khẩu ≥ 6 ký tự |
| `PATCH /admin/users/:id/role` | Đổi vai trò 1 tài khoản đã có | Xem 2 lớp bảo vệ bên dưới |
| `DELETE /admin/users/:id` | Xoá hẳn 1 tài khoản | Xem 2 lớp bảo vệ bên dưới |

**Vá luôn 1 lỗ hổng liên quan:** route đăng ký công khai `POST /auth/register`
(`auth.routes.js`) trước đây đọc thẳng trường `role` từ body — phía giao diện
(`Register.jsx`) không có ô chọn vai trò nên không lộ ra, nhưng bất kỳ ai gọi
thẳng API (Postman, curl...) đều có thể tự gửi `role: "admin"` và tạo cho mình
tài khoản quản trị mà không cần qua ai duyệt. Route này giờ **luôn** tạo tài
khoản với `role = 'employee'`, bất kể body gửi lên có trường `role` hay không.
Tài khoản admin từ nay chỉ có thể được tạo bởi 1 admin khác (qua `POST
/admin/users`, route chỉ admin gọi được nhờ middleware `requireRole("admin")`),
hoặc tài khoản admin **đầu tiên** qua `npm run seed`.

**2 lớp bảo vệ trên `PATCH /users/:id/role` và `DELETE /users/:id`:**

1. **Không thể tự thao tác lên chính tài khoản đang đăng nhập** — so `req.params.id`
   với `req.user.id` (id lấy từ JWT), chặn trước khi chạm DB. Tránh trường hợp
   admin tự hạ quyền hoặc tự xoá tài khoản của mình rồi bị khoá ngay lập tức.
2. **Luôn giữ lại tối thiểu 1 admin** — trước khi hạ quyền hoặc xoá 1 tài
   khoản `admin`, hệ thống đếm `SELECT COUNT(*) FROM users WHERE role = 'admin'`
   (hàm `countAdmins()`); nếu kết quả `<= 1` thì từ chối. Lớp bảo vệ (1) đã
   chặn trường hợp dễ thấy nhất (tự hạ chính mình khi chỉ có 1 admin), nhưng
   (2) vẫn cần thiết cho trường hợp có ≥ 2 admin: admin A lần lượt hạ quyền
   từng admin khác — nếu không có lớp này, hệ thống có thể rơi vào trạng thái
   0 admin, không ai còn vào được trang quản trị để sửa lại.

**Giới hạn đã biết (kiến trúc chung của toàn hệ thống, không riêng tính năng
này):** JWT không lưu trạng thái (stateless) — middleware `requireRole` chỉ
đọc `role` từ token, không tra lại DB mỗi request. Nếu 1 admin bị hạ quyền
trong lúc token cũ của họ chưa hết hạn, token đó về lý thuyết vẫn dùng được
tới khi hết hạn hoặc họ đăng nhập lại. Muốn khắc phục triệt để cần cơ chế thu
hồi token (token blacklist/revocation) — hệ thống hiện chưa có, và đây là 1
hướng mở rộng tốt cho học viên tìm hiểu thêm (JWT ngắn hạn + refresh token,
hoặc lưu 1 "phiên bản token" trong DB để so sánh).

## So sánh PostgreSQL vs MongoDB — vì sao dùng cả hai?

Đây là câu hỏi rất đáng đặt ra khi thiết kế hệ thống, không chỉ riêng dự án này.

**Vì sao KHÔNG chuyển toàn bộ sang MongoDB:**
Phần lõi của hệ thống là **tìm kiếm theo vector embedding** (semantic search) để
làm RAG. PostgreSQL có extension `pgvector` hỗ trợ việc này rất tốt, mã nguồn
mở, chạy được ở bất kỳ máy chủ Postgres nào (local, VPS, Docker...). MongoDB
cũng có "Atlas Vector Search", nhưng **chỉ chạy trên MongoDB Atlas (dịch vụ
cloud của MongoDB)** — bản Community tự host (mongod cài trên máy riêng) không
có tính năng này. Vì vậy nếu chuyển hẳn sang Mongo, hoặc phải phụ thuộc Atlas
(khoá vào 1 nhà cung cấp cụ thể), hoặc phải dùng thêm 1 vector database riêng
(Qdrant, Weaviate, Pinecone...) — làm hệ thống phức tạp hơn mà không giải quyết
vấn đề gì mới. Ngoài ra, dữ liệu người dùng/văn bản có quan hệ rõ ràng (user —
documents — chunks) và cần ràng buộc toàn vẹn dữ liệu (foreign key, transaction)
— đây là thế mạnh của cơ sở dữ liệu quan hệ như PostgreSQL.

**Vì sao NÊN dùng MongoDB cho lịch sử hội thoại:**
Ngược lại, dữ liệu hội thoại (1 đoạn chat - nhiều tin nhắn, mỗi tin nhắn có số
lượng nguồn trích dẫn khác nhau, schema linh hoạt hơn dữ liệu quan hệ) phù hợp
với mô hình document của MongoDB, và việc phân trang theo cursor (`createdAt`)
trên 1 collection tin nhắn có index sẵn cũng đơn giản, nhanh, không cần join —
dù (như giải thích ở mục "Mô hình 1 nhân viên = 1 đoạn chat" phía trên)
`Conversation` và `Message` vẫn được tách thành 2 collection riêng thay vì lồng
1 mảng vào nhau, để tránh anti-pattern "mảng không giới hạn" khi 1 đoạn chat có
thể tích luỹ rất nhiều tin nhắn theo thời gian.

**Kết luận:** dùng đúng công cụ cho đúng việc (polyglot persistence) — PostgreSQL
cho dữ liệu quan hệ + tìm kiếm vector, MongoDB cho dữ liệu dạng tài liệu/lồng
nhau — thay vì ép toàn bộ hệ thống chạy trên 1 loại CSDL duy nhất. Đây cũng là
mô hình phổ biến trong thực tế và là ví dụ tốt để minh hoạ cho học viên về cách
chọn CSDL theo đặc điểm dữ liệu, thay vì chọn theo thói quen.

## Cấu trúc thư mục

```
backend/
  src/
    config/       kết nối PostgreSQL, MongoDB, cấu hình Gemini
    db/           schema.sql (PostgreSQL: users, documents [+ is_sensitive],
                  document_chunks), seed.js
    models/       schema MongoDB — 2 collection RIÊNG (không lồng nhau):
                  conversation.model.js (1 đoạn chat/nhân viên, trạng thái
                  normal/flagged/resolved, isDeleted khi nhân viên xoá) và
                  message.model.js (từng tin nhắn, role user/assistant/admin,
                  isDeleted riêng từng tin — xem lý do tách trong file)
    middleware/   xác thực JWT, phân quyền (auth.js), requireMongo.js (trả lỗi
                  503 ngay nếu MongoDB chưa sẵn sàng, tránh "treo" 10 giây)
    routes/
      auth.routes.js         đăng ký / đăng nhập — /register LUÔN tạo tài
                             khoản role='employee' (không đọc role từ body,
                             xem mục "Quản lý tài khoản admin")
      documents.routes.js    upload/xoá/liệt kê văn bản (chỉ admin) — upload
                             cũng lưu file gốc xuống uploads/ (xem bên dưới)
      documentFiles.routes.js tải file GỐC của 1 tài liệu — dành cho MỌI người
                             dùng đã đăng nhập (không chỉ admin), phục vụ nút
                             "Nguồn trích dẫn" trong popover tin nhắn; tự chặn
                             tài liệu `is_sensitive` với người không phải admin
      chat.routes.js         API "đoạn chat đang hoạt động" của nhân viên: xem
                             (phân trang), gửi câu hỏi, tự đánh dấu cần admin,
                             xoá 1 tin nhắn, xoá cả đoạn chat
      admin.routes.js        danh sách user + tạo/đổi vai trò/xoá tài khoản
                             (xem mục "Quản lý tài khoản admin"), thống kê
                             (gồm số liệu cho 4 biểu đồ dashboard — trạng thái
                             văn bản/hội thoại, lý do escalate), top câu hỏi,
                             xem (phân trang, kể cả tin/đoạn đã xoá) & trả lời
                             trực tiếp bất kỳ đoạn chat nào (chỉ admin)
    services/     logic nghiệp vụ: rag.service.js (RAG + xử lý tài liệu nhạy
                  cảm), summary.service.js (tóm tắt hội thoại flagged bằng
                  Gemini), chatThread.service.js (tạo/lấy đoạn chat đang hoạt
                  động, phân trang tin nhắn, xoá mềm, sinh tóm tắt nền — dùng
                  chung cho cả chat.routes.js và admin.routes.js),
                  document.service.js (xử lý văn bản + LƯU/XOÁ file gốc trên
                  đĩa), chunk/embedding/trích xuất text
  uploads/        file GỐC của các văn bản đã upload (tạo tự động, KHÔNG commit
                  vào git — xem .gitignore) — tên file = <document id>.<đuôi>,
                  đường dẫn lưu ở cột documents.storage_path
  sample-data/    6 văn bản mẫu để demo nhanh (5 quy chế thường + 1 tài liệu
                  nhạy cảm) — xem sample-data/README.md
frontend/
  src/
    api/          client gọi API (fetch + JWT)
    context/      AuthContext (trạng thái đăng nhập)
    routes/       ProtectedRoute (bảo vệ route theo role)
    components/
      charts/     StackedBarChart.jsx, RankedBarChart.jsx — 2 component biểu đồ
                  dùng chung cho trang Dashboard, xem mục "Biểu đồ trang
                  Dashboard" phía trên
    pages/
      Login.jsx, Register.jsx        trang client (đăng nhập/đăng ký)
      client/Chat.jsx                trang client: 1 đoạn chat liên tục, tự
                                     tải thêm tin nhắn cũ khi kéo lên; rê chuột
                                     (hoặc chạm) vào 1 tin nhắn hiện nút "..."
                                     mở popover "Sửa & hỏi lại" / "Xoá tin
                                     nhắn" / tải tài liệu nguồn (nếu tin nhắn
                                     có trích dẫn); nút "..." ở thanh tiêu đề
                                     gộp "Xoá đoạn chat" + "Đăng xuất"; bong
                                     bóng chat co giãn tới ~10 dòng rồi tự cuộn
                                     riêng; tự đánh dấu cần admin
      admin/AdminLayout.jsx          khung sườn trang quản trị: sidebar riêng
                                     cho máy tính (>= lg), thanh tab dưới cùng
                                     cho điện thoại/máy tính bảng
      admin/Dashboard.jsx            tổng quan: 1 hàng KPI + 4 biểu đồ (trạng
                                     thái văn bản, trạng thái hội thoại, lý do
                                     cần admin hỗ trợ, câu hỏi hỏi nhiều nhất)
      admin/Documents.jsx            quản lý văn bản (+ cờ tài liệu nhạy cảm)
      admin/Logs.jsx                 xem (phân trang, kể cả nội dung đã xoá) &
                                     trả lời trực tiếp bất kỳ đoạn chat nào —
                                     bố cục "danh sách + chi tiết" 2 cột ở màn
                                     hình máy tính, xếp chồng ở điện thoại
      admin/Users.jsx                danh sách người dùng + tạo tài khoản mới
                                     (chọn vai trò), thăng/hạ quyền, xoá
    styles/       custom.css — CHỈ phần Bootstrap không có sẵn: thanh tab dưới
                  cùng, khung chat, hoạ tiết nền/gradient thương hiệu, popover
                  tuỳ chọn tin nhắn, sidebar + bố cục 2 cột của trang quản trị
                  trên máy tính; mọi layout/màu sắc khác dùng thẳng class
                  Bootstrap trong JSX (container, card, btn, form-control,
                  badge, ...)
```

## Giao diện: thương hiệu, popover tin nhắn, bố cục riêng cho máy tính

Vài điểm về giao diện đáng chú ý khi đọc code (không phải yêu cầu nghiệp vụ,
nhưng giúp hiểu vì sao 1 số file có cấu trúc như vậy):

- **Logo & hoạ tiết nền:** `frontend/public/logo.svg` là logo minh hoạ (dự án
  demo nên chưa có logo thật) dùng ở trang đăng nhập/đăng ký/header;
  `logo-watermark.svg` là bản đơn sắc, độ mờ thấp, LẶP LẠI làm hình nền khung
  chat (`background-repeat: repeat` trong `.chat-messages`) — muốn đổi sang
  logo thật của công ty chỉ cần thay 2 file này.
- **Popover tuỳ chọn tin nhắn** (`Chat.jsx`): thay vì 1 icon "✕" cố định, mỗi
  tin nhắn có nút "..." chỉ hiện rõ khi rê chuột vào dòng tin nhắn (`.msg-row`
  + CSS `:hover`). Bấm vào mở 1 popover nhỏ (render qua `createPortal` thẳng
  ra `<body>`, vị trí tính bằng JS lúc mở — xem `openMessageMenu`) với: "Sửa &
  hỏi lại" (chỉ có ở tin nhắn của chính nhân viên — điền lại nội dung câu hỏi
  cũ vào ô nhập để sửa rồi gửi lại, không tự động gửi), "Xoá tin nhắn" (xoá
  mềm như đã mô tả ở mục "Mô hình 1 nhân viên = 1 đoạn chat"), và — nếu tin
  nhắn trả lời có kèm `sources` — mục "Nguồn trích dẫn" liệt kê từng tài liệu
  đã dùng để trả lời, bấm vào sẽ tải file gốc (`GET /api/doc-files/:id/download`,
  xem `api/client.js#downloadFile` — tải bằng `fetch()` + Blob thay vì thẻ
  `<a href>` thường vì route này yêu cầu JWT trong header). Dùng Portal thay
  vì dropdown thường để popover không bao giờ bị cắt bởi `overflow: auto` của
  khung chat.
- **Popover "..." ở thanh tiêu đề:** gộp 2 nút "Xoá đoạn chat" / "Đăng xuất"
  trước đây thành 1 nút "..." mở dropdown — dùng lại style của
  `.msg-context-menu` nhưng định vị bằng CSS thường (`position: absolute`,
  xem `.header-menu-dropdown`) thay vì tính toạ độ bằng JS, vì vị trí nút này
  cố định trong bố cục và không bị khung cuộn nào che khuất.
- **Bong bóng chat co giãn có giới hạn:** nội dung câu trả lời nằm trong
  `.chat-bubble-content` với `max-height: 15em` (~10 dòng, `line-height` cố
  định để tính đúng) + `overflow-y: auto` — bong bóng co giãn tự nhiên theo độ
  dài câu trả lời như bình thường, nhưng câu trả lời RẤT dài (VD: liệt kê
  nhiều điều khoản) sẽ tự cuộn RIÊNG bên trong thay vì kéo dài cả khung chat.
  Dòng "Nguồn: ..." nằm ngoài phần tử này nên luôn hiển thị đầy đủ.
- **Trang quản trị — ưu tiên máy tính, vẫn responsive:** `AdminLayout.jsx` có
  2 bố cục riêng biệt theo kích thước màn hình thay vì cố "ép" 1 bộ khung dùng
  chung: dưới `lg` (992px) là thanh tab ngang cố định dưới cùng như thiết kế
  mobile-first ban đầu; từ `lg` trở lên là sidebar cố định bên trái (logo,
  icon cho từng mục, trạng thái đang chọn, khu vực đăng xuất ghim ở cuối).
  Trang "Hội thoại" (`Logs.jsx`) ở máy tính dùng bố cục "danh sách + chi tiết"
  2 cột tự cuộn riêng — tham khảo cách các app hộp thư/nhắn tin (Gmail,
  WhatsApp Web) tổ chức màn hình rộng; ở điện thoại, 2 phần này xếp chồng như
  cũ (không có code riêng cho mobile ở đây — chỉ là bố cục mặc định khi cột
  chi tiết bị ẩn bớt CSS của màn hình lớn).

## Hướng phát triển tiếp (gợi ý cho học viên mở rộng)

- Thông báo real-time cho nhân viên khi admin vừa trả lời (WebSocket/SSE) thay
  vì phải tự mở lại hội thoại để biết.
- Phân cụm câu hỏi theo embedding (semantic clustering) để thống kê "câu hỏi
  hay gặp" chính xác hơn, thay vì chỉ gộp theo trùng khớp văn bản.
- Streaming câu trả lời (Server-Sent Events) thay vì chờ trả lời xong mới hiện.
- Đánh giá "hữu ích / không hữu ích" cho mỗi câu trả lời để cải thiện chất lượng.
- Phân quyền văn bản theo phòng ban (nhân viên phòng A không thấy quy chế nội bộ phòng B).
- Highlight chính xác đoạn văn bản gốc được trích dẫn trong câu trả lời.
- Thêm rate-limit cho API `/chat/thread/ask` để tránh lạm dụng.
- Cải tiến việc phát hiện "tài liệu nhạy cảm" bằng mô hình phân loại thay vì
  chỉ dựa vào 1 ngưỡng cosine similarity cố định.
- Chuyển lưu trữ file gốc từ đĩa cục bộ (`backend/uploads/`) sang object
  storage (S3, GCS, Cloudflare R2...) để dễ scale ngang nhiều máy chủ backend.
- Tự động sinh lại tóm tắt hội thoại (`conversation.summary`) khi có thêm tin
  nhắn mới trong lúc đang `flagged`, thay vì chỉ sinh 1 lần lúc gắn cờ.

## Lưu ý bảo mật khi triển khai thật

- Đổi `JWT_SECRET` trong `.env`, không commit file `.env` lên Git.
- Cân nhắc thêm cơ chế thu hồi token (token revocation) nếu cần khoá tài khoản
  admin có hiệu lực ngay lập tức — hiện JWT vẫn dùng được tới khi hết hạn dù
  tài khoản vừa bị hạ quyền/xoá (xem mục "Quản lý tài khoản admin").
- Văn bản nội bộ có thể chứa thông tin nhạy cảm — cân nhắc thêm mã hoá khi lưu
  trữ và kiểm soát log truy cập chặt chẽ hơn trước khi dùng cho dữ liệu thật.
- Thư mục `backend/uploads/` chứa file gốc của mọi văn bản (kể cả tài liệu
  nhạy cảm) — đảm bảo thư mục này KHÔNG được public trực tiếp qua web server
  (VD: Nginx serve static) và chỉ truy cập được qua route có xác thực
  (`documentFiles.routes.js`); khi triển khai nhiều máy chủ, nhớ dùng storage
  dùng chung (xem mục "Hướng phát triển tiếp") thay vì đĩa cục bộ của 1 máy.
