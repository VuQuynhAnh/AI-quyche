# SmartClocking — Chấm công, Tính lương & Trợ lý AI Quy chế

Dự án demo/giảng dạy cho **chuỗi nhiều cửa hàng**, gồm 2 phần:

1. **Chấm công & tính lương**: nhân viên quét mã QR dán tại cửa hàng → đăng
   nhập → bấm CHECK-IN / CHECK-OUT (kèm vị trí GPS); admin cửa hàng quản lý
   thiết lập ca, nhân viên, bảng công và **bảng lương tháng** (tạo → tính lại →
   chốt / huỷ, xuất CSV). Xem mục [Chấm công & Tính lương](#chấm-công--tính-lương).
2. **Trợ lý AI (chatbot)** giúp nhân viên tra cứu quy chế, nội quy, chính sách
   của cửa hàng — và hỏi về lương / số lần đi muộn của chính mình. Dùng kỹ thuật
   **RAG (Retrieval-Augmented Generation)**: hệ thống tìm các đoạn văn bản nội
   bộ liên quan nhất tới câu hỏi, rồi đưa cho mô hình AI (Google Gemini) để sinh
   câu trả lời có trích dẫn nguồn — giúp AI không "bịa" thông tin ngoài văn bản.
   Phía nhân viên, chat là **cửa sổ nổi** trong trang chấm công; phía admin là
   nhóm menu "Trợ lý AI".

## Vai trò & phân quyền

| Role (`constants/enums.js`) | Thuộc cửa hàng | Làm được gì | Trang chủ |
|---|---|---|---|
| `superadmin` | không | Tạo cửa hàng (kèm admin đầu tiên + thiết lập mặc định), tạm ngưng/mở lại cửa hàng, tạo superadmin khác. **Không** quản lý admin/nhân viên của cửa hàng. | `/superadmin` |
| `admin` | có (1 cửa hàng) | Quản lý cửa hàng của mình: thiết lập, nhân viên, chấm công, bảng lương, quy chế, hội thoại, tài khoản (tự nâng/hạ admin ↔ user). | `/admin` |
| `user` | có (1 cửa hàng) | Nhân viên: chấm công, xem lịch sử & lương, chat AI. | `/work` |

- Không có đăng ký công khai: tài khoản do superadmin (admin đầu tiên của cửa
  hàng) hoặc admin cửa hàng tạo.
- Mọi dữ liệu (nhân viên, chấm công, bảng lương, văn bản, hội thoại) **tách
  riêng theo cửa hàng**: admin/user chỉ thấy dữ liệu cửa hàng mình (`storeId`
  lấy từ JWT, không nhận từ client).
- Bảo vệ cửa hàng không tự khoá mình: không tự đổi quyền / tự xoá chính mình,
  cửa hàng luôn còn ít nhất 1 admin đang hoạt động.
- Mọi giá trị cố định (role, trạng thái...) dùng hằng số trong
  `backend/src/constants/enums.js` (bản sao: `frontend/src/constants/enums.js`).
  Kiểu ENUM của PostgreSQL được **sinh từ chính file này** khi chạy `db:reset`.

## Kiến trúc

Dự án dùng **2 loại cơ sở dữ liệu** (polyglot persistence) — mỗi loại cho đúng
việc nó mạnh nhất, xem lý do ở mục "So sánh PostgreSQL vs MongoDB" bên dưới:

```
Trình duyệt (React + Bootstrap)
   ├── /superadmin      → superadmin: cửa hàng, tài khoản superadmin
   ├── /admin/*         → admin cửa hàng: chấm công, nhân viên, bảng lương,
   │                      thiết lập, trợ lý AI (tổng quan, hội thoại, quy chế),
   │                      tài khoản
   ├── /s/:storeId      → trang quét QR tại cửa hàng (công khai)
   ├── /work, /work/history → nhân viên: chấm công, lịch sử + lương (mobile)
   └── /chat            → chat AI toàn màn hình (admin + nhân viên)
        │  (gọi API qua JWT)
        ▼
Backend Node.js (Express) — routes → services → repositories (xem
"Kiến trúc phân tầng")
   /api/auth, /api/superadmin, /api/hr, /api/clocking, /api/admin,
   /api/documents, /api/doc-files, /api/chat
        │                              │
        ▼                              ▼
PostgreSQL + pgvector            MongoDB
(store, store_setting, account,  (conversations, messages — có storeId)
 employee, clocking,
 clocking_history, paysheet,
 paysheet_detail, document,
 document_detail + embedding)
```

## Thiết kế database (PostgreSQL)

Tên bảng số ít, theo nghiệp vụ; bảng con dạng `<cha>_detail` / `<cha>_history`;
tên cột không viết tắt (`check_in_radius_meters`, `early_leave_minutes`...).
Chi tiết từng cột: `backend/src/db/schema.sql`.

```
account (superadmin, store_id = NULL)
   │ tạo
   ▼
store (cửa hàng)
 ├─1─N─ store_setting      thiết lập dạng key-value (giờ ca, tiền phạt, vị trí, Wi-Fi...)
 ├─1─N─ store_network      IP Wi-Fi cửa hàng (ghi khi admin đăng nhập, dòng mới nhất = hiện tại)
 ├─1─N─ account            role admin / user
 │        └─1─1─ employee  SĐT, chức danh, lương giờ (1 mức duy nhất)
 │                 ├─1─N─ clocking ─1─N─ clocking_history
 │                 └─1─N─ paysheet_detail
 ├─1─N─ paysheet ─1─N─ paysheet_detail
 └─1─N─ document ─1─N─ document_detail (đoạn văn bản + vector embedding)
```

| Bảng | Ý nghĩa |
|---|---|
| `store` | Cửa hàng |
| `store_setting` | Thiết lập cửa hàng dạng **key-value** (`key`, `value` đều là chuỗi). Danh sách key, kiểu dữ liệu và giá trị mặc định khai báo ở `SETTING_KEY` / `SETTING_DATA_TYPE` / `SETTING_DEFINITIONS` trong `constants/enums.js` — thêm thiết lập mới **không cần thêm cột** |
| `store_network` | IP công cộng của Wi-Fi cửa hàng, ghi lại mỗi khi admin đăng nhập từ IP mới; dòng mới nhất là mạng hiện tại |
| `account` | Tài khoản đăng nhập (`role` kiểu ENUM `account_role`) |
| `employee` | Hồ sơ nhân viên của mọi tài khoản thuộc cửa hàng (đổi role không mất dữ liệu) |
| `clocking` | Chấm công theo **ngày** (`work_date` giờ VN): giờ vào/ra, phút làm, muộn, về sớm. Unique (`employee_id`, `work_date`). Giờ ca được chụp lại lúc tạo dòng |
| `clocking_history` | Từng lần bấm + các lần admin sửa, kèm cách chấm (`method`: `qr` / `wifi`) và IP. **Bất biến** (trigger chỉ cho đổi `valid` → `voided`) |
| `paysheet` | Bảng lương tháng của cửa hàng (`draft` / `finalized` / `cancelled`). Unique index: mỗi cửa hàng chỉ 1 bảng **chưa huỷ** mỗi tháng |
| `paysheet_detail` | Lương từng nhân viên, lưu cả **mức lương đã dùng** và chi tiết từng ngày |
| `document` / `document_detail` | Văn bản quy chế của cửa hàng và các đoạn đã tách + embedding (pgvector) |

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
npm run db:reset # XOÁ SẠCH rồi tạo lại database + nạp dữ liệu mẫu
npm run dev      # chạy tại http://localhost:4000
```

> ⚠ `npm run db:reset` **xoá sạch toàn bộ** bảng, file upload và hội thoại rồi
> tạo lại từ đầu (`db/drop.sql` → sinh ENUM từ `constants/enums.js` →
> `db/schema.sql` → dữ liệu mẫu). Dự án đang trong giai đoạn phát triển nên
> chưa có migration giữ dữ liệu — sửa schema xong chỉ cần chạy lại lệnh này.
> Không kết nối được MongoDB thì bước xoá hội thoại được bỏ qua (có cảnh báo).

Nếu quên bật MongoDB, backend vẫn khởi động bình thường (chấm công, lương, văn
bản vẫn dùng được vì chỉ cần PostgreSQL) — riêng các API hội thoại (`/chat/*`,
`/admin/stats*`, `/admin/conversations*`) trả lỗi **503** ngay kèm thông báo rõ
ràng (`middleware/requireMongo.js`) thay vì bị "treo" chờ kết nối. Server mở
cổng ngay, không đợi Mongo; kết nối thất bại thì tự thử lại mỗi 30 giây
(`config/mongodb.js#connectMongoInBackground`), nên bật Mongo / whitelist IP
trên Atlas xong là chat dùng được mà không cần khởi động lại backend.

Tài khoản mẫu sau khi `npm run db:reset` (màn đăng nhập có sẵn danh sách này,
bấm để điền nhanh — ẩn khi deploy bằng `VITE_HIDE_DEMO_ACCOUNTS=true`):

| Vai trò | Email | Mật khẩu |
|---|---|---|
| superadmin | superadmin@smartclocking.vn | Super@123 |
| admin — Cửa hàng Hoàn Kiếm | admin.hoankiem@smartclocking.vn | Admin@123 |
| user — Cửa hàng Hoàn Kiếm | nhanvien@, lan@, hung@smartclocking.vn | NhanVien@123 |
| admin — Cửa hàng Cầu Giấy | admin.caugiay@smartclocking.vn | Admin@123 |
| user — Cửa hàng Cầu Giấy | mai@, tuan@smartclocking.vn | NhanVien@123 |

Dữ liệu mẫu được nạp **qua chính các service** của ứng dụng (tạo cửa hàng, nhân
viên, sửa giờ, tạo/huỷ/chốt bảng lương), gồm: chấm công tháng trước + tháng này
(đúng giờ, đi muộn, về sớm, nghỉ, ngoài phạm vi GPS, quên check-out, admin chỉnh
giờ, vài người đã check-in hôm nay); bảng lương tháng trước của Hoàn Kiếm **đã
chốt** (kèm 1 bảng đã huỷ, sau đó tăng lương Lan — bảng đã chốt không đổi), của
Cầu Giấy **nháp cần tính lại**; 6 văn bản mẫu (`backend/sample-data/`) cho mỗi
cửa hàng.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # chạy tại http://localhost:5173, tự proxy /api sang backend
```

Mở `http://localhost:5173` trên trình duyệt (hoặc DevTools chế độ mobile để xem
giao diện responsive).

Khi build production (Vercel/Netlify), tạo `frontend/.env` từ
`frontend/.env.example` và đặt `VITE_API_URL` = địa chỉ backend đã deploy
(không có `/api` ở cuối). Chạy dev thì để trống. Lưu ý: check-in cần GPS nên
trang phải chạy qua **HTTPS** (hoặc `localhost`).

## Chấm công & Tính lương

### Cách dùng

- **Superadmin** (`/superadmin`): tạo cửa hàng kèm tài khoản admin đầu tiên.
- **Admin → Thiết lập cửa hàng** (`/admin/setting`): giờ vào/tan ca, tiền phạt
  mỗi phút, vị trí + bán kính (tuỳ chọn), bật/tắt **chấm công Wi-Fi**; in
  **mã QR** dán tại quầy (trỏ tới `/s/:storeId`).
- **Chấm công Wi-Fi** (tuỳ chọn, bên cạnh QR): khi admin đăng nhập, IP công cộng
  lúc đó được ghi làm Wi-Fi cửa hàng. Nếu cửa hàng bật tính năng và nhân viên
  đang dùng cùng Wi-Fi, màn chấm công hiện thêm nút Wi-Fi (không cần quét QR;
  server vẫn kiểm tra lại IP + GPS). Trình duyệt không đọc được tên Wi-Fi nên
  so theo IP công cộng; chạy sau proxy (Render) cần `TRUST_PROXY_HOPS` đúng.
- **Admin → Nhân viên** (`/admin/employees`): tạo tài khoản nhân viên, đặt lương giờ.
- **Admin → Chấm công** (`/admin/clockings`): bảng công xem theo **tuần**
  (mặc định, ô có thêm giờ vào–ra) hoặc **tháng**; bấm 1 ô ngày → "Chỉnh sửa"
  để sửa giờ vào/ra (tháng chưa chốt lương). Tuần tính từ Thứ Hai, thuộc tháng
  chứa ngày Thứ Năm của nó (VD 28/9–4/10/2026 là "Tuần 1 - Th. 10 2026").
- **Admin → Bảng lương** (`/admin/paysheets`): tạo / tính lại / chốt / huỷ bảng
  lương tháng, xem chi tiết từng ngày, xuất CSV.
- **Nhân viên**: quét QR → đăng nhập → bấm CHECK-IN / CHECK-OUT (cần bật GPS)
  tại `/work`; xem lịch sử + lương tại `/work/history`.

### Vòng đời bảng lương

```
Tạo bảng lương ──▶ draft ──(Tính lại)──▶ draft ──(Chốt)──▶ finalized
                     │                                         │
                     └──────────(Huỷ)──▶ cancelled ◀──(Huỷ)────┘
```

- Mỗi cửa hàng chỉ có **1 bảng lương chưa huỷ mỗi tháng** (unique index trong
  DB). Huỷ xong thì tạo được bảng mới; bảng đã huỷ vẫn giữ lại để tra cứu.
- `draft`: tính theo chấm công + lương giờ + tiền phạt tại lần tính gần nhất.
  Có sửa công / đổi lương / đổi thiết lập sau đó → hiện cảnh báo "cần tính lại".
- `finalized`: chỉ chốt được tháng đã kết thúc. Số liệu đóng băng (lưu cả mức
  lương đã dùng), **chấm công tháng đó bị khoá**. Muốn sửa thì huỷ bảng rồi lập lại.
- Tháng chưa có bảng lương: nhân viên thấy lương **tạm tính** (tính trực tiếp
  với lương giờ hiện tại); có bảng thì thấy số của bảng (nháp / đã chốt).

### Quy tắc tính

- Mỗi nhân viên **1 mức lương giờ**. Đổi lương chỉ ảnh hưởng các bảng lương
  chưa chốt.
- Lương ngày = lương giờ × số giờ làm **trong khung ca** − (phút muộn + phút về
  sớm) × tiền phạt/phút. Đến sớm/về muộn không được tính thêm. Muộn/sớm làm tròn
  xuống phút. Lương thực nhận cả tháng không âm.
- Ngày/tháng tính theo giờ Việt Nam. Giờ ca được chụp vào từng ngày chấm công,
  nên đổi giờ ca không làm sai các ngày đã qua.
- Lịch sử chấm công **không sửa/xoá được** (`clocking_history` có trigger).
  Admin "Chỉnh sửa" 1 ngày = huỷ lần cũ + thêm lần mới (`source = admin`) trỏ
  về lần cũ.
- Chi tiết ngày (admin) hiện **bảng lịch sử chấm công**, mới nhất trước, mỗi
  dòng là 1 lần ghi nhận:
  - *Thời gian*: lúc ghi nhận (không phải giờ chấm).
  - *Trạng thái*: "Đã chấm công vào" / "Đã chấm công ra" — trạng thái của ngày
    ngay sau lần đó.
  - *Hình thức*: "Chấm công QR" (nhân viên tự chấm, kèm link vị trí), "Điều
    chỉnh" (admin sửa giờ đã có) hoặc "Thủ công" (admin thêm giờ còn thiếu),
    kèm tên admin.
  - *Nội dung*: phần giờ thay đổi, so với ca (VD `Giờ vào: 07:00, làm thêm
    trước ca: 1 giờ 0 phút`; đi muộn / về sớm / làm thêm sau ca tương tự); giờ
    chưa có ghi `--:--`.
  Bảng được dựng ở frontend (`DayDetail.jsx#buildChangeLog`) bằng cách phát lại
  các dòng `clocking_history` theo `created_at`; các dòng admin tạo trong cùng
  1 lần lưu (cùng transaction nên cùng `created_at`) gộp thành 1 dòng.
- Chỉ lưu vị trí GPS, không lưu IP. Vị trí ngoài bán kính chỉ gắn cờ cho admin,
  không chặn chấm công.

### AI trả lời về lương / đi muộn

Câu hỏi có tự xưng ("lương tháng này của tôi", "tháng 9 em đi muộn mấy lần")
được trả lời từ số liệu hệ thống tự tính (`salaryInquiry.service.js`, cùng
nguồn với màn Lịch sử: bảng lương nếu có, không thì tạm tính); Gemini chỉ diễn
đạt lại. Gemini lỗi thì trả số liệu thô. Câu hỏi chính sách chung vẫn đi đường
RAG tra văn bản **của cửa hàng** như mô tả bên dưới.

### API

| Route | Ai gọi | Việc gì |
|-------|--------|---------|
| `POST /api/auth/login` | mọi người | Đăng nhập, trả JWT (`id, role, storeId`) |
| `GET/POST/PATCH /api/superadmin/stores[/:id]` | superadmin | Cửa hàng (tạo kèm admin đầu tiên) |
| `GET/POST /api/superadmin/accounts` | superadmin | Tài khoản superadmin |
| `GET/PATCH /api/hr/setting` | admin | Thiết lập cửa hàng |
| `GET/POST/PATCH /api/hr/employees[/:id]` | admin | Nhân viên, lương giờ |
| `GET /api/hr/clockings/overview?from=&to=` hoặc `?month=` | admin | Bảng công theo khoảng ngày (tối đa 31 ngày, dùng cho xem theo tuần) hoặc theo tháng; trả `dates`, `rows`, `lockedMonths` (tháng đã chốt lương trong khoảng) |
| `GET /api/hr/clockings/day` | admin | Chi tiết 1 ngày |
| `POST /api/hr/clockings/day-edit` | admin | Sửa giờ vào/ra 1 ngày |
| `GET /api/hr/paysheets?month=` | admin | Bảng lương của tháng + các bảng đã huỷ |
| `POST /api/hr/paysheets` | admin | Tạo bảng lương (`{ payMonth }`) |
| `POST /api/hr/paysheets/:id/recalculate` · `/finalize` · `/cancel` | admin | Tính lại / chốt / huỷ |
| `GET /api/hr/paysheets/:id/export` | admin | Xuất CSV |
| `GET/POST /api/admin/accounts`, `PATCH /:id/role`, `DELETE /:id` | admin | Tài khoản của cửa hàng |
| `GET /api/clocking/store/:id` | công khai | Thông tin cửa hàng khi quét QR |
| `GET /api/clocking/me/today` · `POST /check` | user | Trạng thái hôm nay / check-in, check-out (`method`: `qr` kèm `storeId`, hoặc `wifi`) |
| `GET /api/clocking/me/wifi` | user | Có đang dùng Wi-Fi cửa hàng không (chỉ gọi khi cửa hàng bật chấm công Wi-Fi) |
| `GET /api/clocking/me/month`, `/me/day` | user | Lịch sử + lương tháng / chi tiết ngày |

## Giải thích luồng RAG (phần lõi để dạy học viên)

1. **Nạp văn bản** (`backend/src/services/regulationDocument.service.js`): file được
   trích xuất text thô (`utils/textExtractor.js`), tách thành các đoạn ~900 ký
   tự có chồng lấn (`utils/textChunker.js`), mỗi đoạn được chuyển thành 1 vector
   768 chiều bằng model `text-embedding-004` (`providers/ai.provider.js`), rồi lưu
   vào bảng `document_detail` cùng vector đó.
2. **Trả lời câu hỏi** (`backend/src/services/assistant.service.js`): câu hỏi cũng
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
sau này), nhưng luồng RAG (`backend/src/services/assistant.service.js`) xử lý khác
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
`chat.service.js#paginateMessages`). Khi nhân viên kéo lên gần đầu khung
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
viên — xem `chat.service.js#generateSummaryInBackground`) tới cùng
Gemini model đang dùng để chat (`conversationSummary.service.js#summarize`) để
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

## Biểu đồ trang Dashboard (`/admin/ai`)

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

## Giới hạn đã biết của JWT

JWT không lưu trạng thái (stateless) — middleware `requireRole` chỉ đọc
`role`/`storeId` từ token, không tra lại DB mỗi request. Nếu 1 tài khoản bị hạ
quyền, nghỉ việc hoặc cửa hàng bị tạm ngưng trong lúc token cũ chưa hết hạn,
token đó về lý thuyết vẫn dùng được tới khi hết hạn hoặc đăng nhập lại (riêng
chấm công có kiểm tra lại trạng thái tài khoản + cửa hàng). Muốn khắc phục triệt
để cần cơ chế thu hồi token (JWT ngắn hạn + refresh token, hoặc lưu "phiên bản
token" trong DB) — 1 hướng mở rộng tốt cho học viên.

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

## Kiến trúc phân tầng (backend)

```
HTTP request
   │
   ▼
routes/        nhận req → gọi 1 hàm service → trả res (không có if/else nghiệp vụ)
   │
   ▼
services/      TOÀN BỘ logic: kiểm tra dữ liệu, quy tắc nghiệp vụ, tính toán,
   │           ném AppError(status, message) khi không hợp lệ
   ▼
repositories/  CHỈ chạy câu truy vấn SQL / Mongo, trả dữ liệu thô
providers/     CHỈ gọi API bên ngoài (Gemini)
   │
   ▼
PostgreSQL · MongoDB · ổ đĩa · Gemini
```

**Dependency Injection:** mỗi file là 1 hàm factory nhận phụ thuộc qua tham số,
VD `createPaysheetService({ paysheetRepository, timesheetService, ... })` — không tự
`import` repository. `src/container.js` là nơi duy nhất tạo và nối các thành
phần với nhau. Nhờ vậy:

- Muốn thêm cache, đổi lưu file sang S3... chỉ sửa `container.js`, service
  không đổi (VD Redis cache bên dưới).
- Test service bằng repository giả, không cần DB:
  `createStoreSettingService({ storeRepository: { findSetting: async () => null, ... } })`.

**Redis cache (tuỳ chọn):** đặt `REDIS_URL` trong `.env` để bật. Chỉ cache các
API đọc dữ liệu lớn, ít thay đổi: bảng lương tháng đã chốt, file CSV bảng lương,
bảng công khi mọi tháng trong khoảng đã chốt (1 giờ), số liệu dashboard (5 phút).
Service được "bọc" trong `src/cache/cachedServices.js`; thao tác bảng lương /
nhân viên tự bỏ cache của cửa hàng (tăng số phiên bản key, xem
`src/cache/redisCache.js`). Không có Redis hoặc Redis lỗi thì API vẫn chạy
thẳng vào DB.

Lỗi nghiệp vụ: service `throw AppError.badRequest("...")` (hoặc
`notFound`/`forbidden`/`conflict`), `middleware/errorHandler.js` trả về
`{ error, code? }` với đúng HTTP status.

## Cấu trúc thư mục

```
backend/
  src/
    config/       kết nối PostgreSQL, MongoDB, cấu hình Gemini
    constants/    enums.js — bộ ENUM dùng chung (role, trạng thái...) + nguồn
                  sinh kiểu ENUM của PostgreSQL
    db/           schema.sql (bảng — xem mục "Thiết kế database"), drop.sql,
                  seed.js (npm run db:reset: xoá sạch, tạo lại, nạp dữ liệu mẫu)
    models/       schema MongoDB — 2 collection RIÊNG (không lồng nhau):
                  conversation.model.js (1 đoạn chat/nhân viên, trạng thái
                  normal/flagged/resolved, isDeleted khi nhân viên xoá) và
                  message.model.js (từng tin nhắn, role user/assistant/admin,
                  isDeleted riêng từng tin — xem lý do tách trong file)
    middleware/   xác thực JWT, phân quyền (auth.js), requireMongo.js (trả lỗi
                  503 ngay nếu MongoDB chưa sẵn sàng, tránh "treo" 10 giây),
                  errorHandler.js (chuyển AppError thành response JSON)
    container.js  COMPOSITION ROOT (Dependency Injection) — tạo repository →
                  service → router và truyền vào nhau (xem mục "Kiến trúc
                  phân tầng")
    app.js        tạo Express app từ các router của container
    index.js      khởi động server, kết nối MongoDB ở nền (không chặn)
    routes/       TẦNG ROUTER — chỉ đọc req, gọi service, trả res
      auth.routes.js          /api/auth        đăng nhập
      superadmin.routes.js    /api/superadmin  cửa hàng, tài khoản superadmin
      hr.routes.js            /api/hr          thiết lập, nhân viên, chấm công, bảng lương
      clocking.routes.js      /api/clocking    nhân viên chấm công
      admin.routes.js         /api/admin       tài khoản cửa hàng, thống kê AI, hộp thư hỗ trợ
      documents.routes.js     /api/documents   upload/xoá/liệt kê văn bản (admin)
      documentFiles.routes.js /api/doc-files   xem trước / tải file gốc (admin + user)
      chat.routes.js          /api/chat        đoạn chat với trợ lý AI
    services/     TẦNG SERVICE — toàn bộ logic nghiệp vụ, đặt tên theo nghiệp vụ:
      auth.service.js                  đăng nhập (kiểm tra tài khoản + cửa hàng còn hoạt động)
      superadmin.service.js            cửa hàng (+ admin đầu tiên, thiết lập mặc định), superadmin
      storeAccount.service.js          tài khoản cửa hàng (chặn tự hạ quyền, giữ >= 1 admin)
      storeSetting.service.js          thiết lập cửa hàng
      employee.service.js              nhân viên + lương giờ
      timesheet.service.js             lõi chấm công: dòng ngày, tổng hợp từ lịch sử, khoá tháng
      clocking.service.js              nhân viên check-in/out (GPS + QR), lịch sử, lương của mình
      clockingManagement.service.js    bảng công tháng, admin sửa giờ
      paysheet.service.js              bảng lương: tạo / tính lại / chốt / huỷ / CSV, lương tạm tính
      payrollCalculator.js             hàm THUẦN: tổng hợp 1 ngày, tính lương tháng
      serializers.js                   chuyển dòng DB -> JSON API (camelCase)
      dashboard.service.js             số liệu trợ lý AI của cửa hàng
      chat.service.js                  đoạn chat nhân viên: phân trang, hỏi, gắn cờ, đánh giá, xoá mềm
      supportInbox.service.js          admin xem & trả lời đoạn chat của cửa hàng
      assistant.service.js             trợ lý AI — lõi RAG + chặn tài liệu nhạy cảm
      salaryInquiry.service.js         trả lời câu hỏi lương/công của chính nhân viên
      conversationSummary.service.js   tóm tắt đoạn chat flagged bằng Gemini
      regulationDocument.service.js    văn bản quy chế: upload, xử lý nền, xem/tải
    repositories/ TẦNG REPOSITORY — CHỈ kết nối & truy vấn DB, không có logic:
                  store (+ store_setting), account, employee, clocking (+ history),
                  paysheet (+ detail), document (+ detail) — PostgreSQL;
                  conversation, message — MongoDB; fileStorage (file gốc trên
                  đĩa); transaction.js (BEGIN/COMMIT)
    providers/    ai.provider.js — gọi Gemini (embedding, sinh text, retry 503)
    utils/        AppError, vnTime (ngày giờ VN), geo, textExtractor,
                  textChunker, password (bcrypt), jwt, validators
  uploads/        file GỐC của các văn bản đã upload (tạo tự động, KHÔNG commit
                  vào git — xem .gitignore) — tên file = <document id>.<đuôi>,
                  lưu ở cột document.stored_file_name
  sample-data/    6 văn bản mẫu để demo nhanh (5 quy chế thường + 1 tài liệu
                  nhạy cảm) — xem sample-data/README.md
frontend/
  src/
    api/          client gọi API (fetch + JWT)
    constants/    enums.js (bản sao enum backend + nhãn hiển thị, trang chủ theo
                  role), demoAccounts.js (tài khoản mẫu ở màn đăng nhập)
    context/      AuthContext (trạng thái đăng nhập)
    routes/       ProtectedRoute (bảo vệ route theo role)
    components/
      charts/     StackedBarChart.jsx, RankedBarChart.jsx — 2 component biểu đồ
                  dùng chung cho trang Dashboard, xem mục "Biểu đồ trang
                  Dashboard" phía trên
      hr/         DayDetail.jsx (chi tiết 1 ngày + bảng lịch sử chấm công),
                  Modal.jsx (hộp thoại Bootstrap dùng chung), PeriodNav.jsx
                  (khung ‹ kỳ › dùng chung + WeekNav), MonthNav.jsx,
                  TimeInput.jsx (chọn giờ 24h), MoneyInput.jsx — dùng chung cho
                  các trang chấm công/lương
      ChatPopup.jsx  cửa sổ chat nổi trong trang nhân viên (bọc Chat.jsx)
    utils/        format.js (định dạng tiền/giờ), geo.js (lấy vị trí GPS)
    pages/
      employee/                      StoreLanding.jsx (trang quét QR),
                                     EmployeeLayout.jsx, CheckIn.jsx, History.jsx
      superadmin/SuperadminPage.jsx  cửa hàng + tài khoản superadmin
      admin/Clockings.jsx, Employees.jsx, Paysheets.jsx, StoreSetting.jsx
                                     các trang chấm công & lương của admin
      Login.jsx                      đăng nhập (+ danh sách tài khoản mẫu)
      client/Chat.jsx                trang client: 1 đoạn chat liên tục, tự
                                     tải thêm tin nhắn cũ khi kéo lên; rê chuột
                                     (hoặc chạm) vào 1 tin nhắn hiện nút "..."
                                     mở menu "Sửa & hỏi lại" / "Xoá tin
                                     nhắn" / tải tài liệu nguồn (nếu tin nhắn
                                     có trích dẫn); nút "..." ở thanh tiêu đề
                                     gộp "Xoá đoạn chat" + "Đăng xuất"; tự
                                     đánh dấu cần admin
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
      admin/Accounts.jsx             tài khoản của cửa hàng: tạo (chọn vai trò),
                                     thăng/hạ quyền, xoá
    styles/       custom.css (~300 dòng) — CHỈ phần Bootstrap không có sẵn: bố
                  cục admin cao đúng 100dvh + 2 cột trang Hội thoại, khung chat
                  (hoạ tiết nền, bong bóng, cửa sổ chat nổi), lưới lịch tháng,
                  bảng công có cột ghim, khung ngắm QR, thanh cuộn mảnh,
                  safe-area điện thoại, bảng màu biểu đồ. Mọi thứ khác dùng
                  thẳng class/component Bootstrap trong JSX (xem mục "Giao
                  diện" bên dưới)
```

## Giao diện: Bootstrap trước, CSS riêng sau cùng

Vài điểm về giao diện đáng chú ý khi đọc code (không phải yêu cầu nghiệp vụ,
nhưng giúp hiểu vì sao 1 số file có cấu trúc như vậy):

- **Ưu tiên Bootstrap 5.3:** layout, màu, spacing và các thành phần giao diện
  đều dùng class/component có sẵn của Bootstrap ngay trong JSX — chỉ viết CSS
  riêng (`styles/custom.css`) khi Bootstrap thật sự không có. Thêm giao diện
  mới thì tìm utility/component Bootstrap trước. Cụ thể:

  | Thành phần | Dùng của Bootstrap |
  |---|---|
  | Hộp thoại (`Modal.jsx`), hộp xác nhận | `.modal` render bằng React (Portal), không dùng JS của Bootstrap |
  | Thông báo (`NotificationContext`) | `.toast-container` + `.toast` |
  | Menu "..." (tin nhắn, thanh tiêu đề chat, thẻ quy chế) | `.dropdown-menu` + `.dropdown-item` |
  | Giải thích trạng thái (Chat, Logs) | `Tooltip` (`import { Tooltip } from "bootstrap"`) |
  | Chi tiết ngày của nhân viên (`History.jsx`) | `.offcanvas-bottom` |
  | Chip trạng thái, nhãn VÀO/RA, cờ muộn/sớm | `badge` + `bg-*-subtle` |
  | Biểu đồ Dashboard | `card`, `.progress` / `.progress-stacked` |
  | Sidebar admin | `nav nav-pills flex-column` trên nền `bg-dark` |
  | Đang tải toàn màn hình | `.spinner-border` |

- **Logo & hoạ tiết nền:** `frontend/public/logo.svg` là logo minh hoạ (dự án
  demo nên chưa có logo thật) dùng ở trang đăng nhập/header;
  `logo-watermark.svg` là bản đơn sắc, độ mờ thấp, LẶP LẠI làm hình nền khung
  chat (`.chat-messages`) — muốn đổi sang logo thật chỉ cần thay 2 file này.
- **Menu tuỳ chọn tin nhắn** (`Chat.jsx`): mỗi tin nhắn có nút "..." chỉ hiện
  rõ khi rê chuột vào dòng tin nhắn (`.hover-reveal` trong `custom.css`; máy
  cảm ứng thì luôn hiện mờ). Bấm vào mở 1 `.dropdown-menu` (render qua
  `createPortal` ra `<body>`, vị trí `fixed` tính bằng JS lúc mở — xem
  `openMessageMenu`) để không bị `overflow: auto` của khung chat cắt mất. Các
  mục: "Sửa & hỏi lại" (chỉ tin của chính nhân viên — điền lại câu hỏi cũ vào
  ô nhập, không tự gửi), "Xoá tin nhắn" (xoá mềm, xem mục "Mô hình 1 nhân viên
  = 1 đoạn chat"), và — nếu câu trả lời có `sources` — danh sách tài liệu
  nguồn, bấm để tải file gốc (`GET /api/doc-files/:id/download`, tải bằng
  `fetch()` + Blob trong `api/client.js#downloadFile` vì route cần JWT).
- **Nút "..." ở thanh tiêu đề chat:** gộp "Xoá đoạn chat" / "Đăng xuất" vào 1
  dropdown, định vị bình thường (`position-absolute`) vì nút này không nằm
  trong khung cuộn.
- **Bong bóng chat** hiện đầy đủ nội dung câu trả lời (không cuộn riêng bên
  trong); việc cuộn xem tin khác do khung `.chat-messages` đảm nhiệm.
- **Trang quản trị — ưu tiên máy tính, vẫn responsive:** `AdminLayout.jsx` có
  2 bố cục riêng: dưới `lg` (992px) là thanh tab cố định dưới cùng
  (`fixed-bottom`, cuộn ngang khi nhiều mục); từ `lg` trở lên là sidebar cố
  định bên trái. Ở máy tính khung admin cao đúng `100dvh` và chỉ vùng nội dung
  tự cuộn; trang "Hội thoại" (`Logs.jsx`) dùng bố cục "danh sách + chi tiết" 2
  cột tự cuộn riêng (giống Gmail/WhatsApp Web), ở điện thoại 2 phần xếp chồng.

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
