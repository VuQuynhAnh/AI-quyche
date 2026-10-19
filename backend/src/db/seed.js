// Script RESET TOÀN BỘ dữ liệu rồi nạp lại bộ DỮ LIỆU MẪU — chạy 1 lệnh duy
// nhất mỗi khi cần "làm lại từ đầu" để test/demo:
//  1. Chạy schema.sql để tạo bảng (idempotent — chạy lại nhiều lần không lỗi)
//  2. XOÁ SẠCH toàn bộ dữ liệu cũ:
//     - PostgreSQL: tài khoản, gian hàng, lương giờ, chấm công, nhật ký sửa,
//       bảng lương đã chốt, văn bản + chunk (TRUNCATE ... CASCADE).
//     - File gốc trong backend/uploads/.
//     - MongoDB: toàn bộ hội thoại + tin nhắn.
//  3. Nạp dữ liệu mẫu chấm công & lương:
//     - 1 admin + 5 nhân viên (kèm lịch sử lương giờ), 2 gian hàng có toạ độ.
//     - Chấm công cả THÁNG TRƯỚC + tháng này đến hôm qua (nghỉ Chủ nhật), có
//       đủ tình huống: đúng giờ, đi muộn, về sớm, nghỉ, ngoài phạm vi GPS,
//       quên check-out, 1 lần admin chỉnh giờ, vài người đã check-in hôm nay.
//     - Chốt bảng lương tháng trước (payroll_months) như server thật.
//     Dữ liệu sinh bằng bộ số ngẫu nhiên có seed cố định nên mỗi lần chạy ra
//     cùng một kết quả (chỉ lệch theo ngày chạy).
//  4. Nạp lại các văn bản mẫu trong backend/sample-data/ (file nào thiếu thì
//     bỏ qua; lỗi tạo embedding chỉ cảnh báo, không làm hỏng dữ liệu chấm công).
//     Dùng chung saveDocumentFile()/setDocumentStoragePath() với luồng upload
//     qua UI nên nút "Xem" bên Admin xem lại được ngay.
//
// ⚠ KHÔNG chạy trên dữ liệu thật — dùng `npm run migrate` để cập nhật cấu trúc.
//
// Chạy bằng: npm run seed  (trong thư mục backend)
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { pool } from "../config/db.js";
import { connectMongo } from "../config/mongodb.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { splitIntoChunks } from "../services/chunk.service.js";
import { embedBatch, toPgVector } from "../services/embedding.service.js";
import { saveDocumentFile, setDocumentStoragePath } from "../services/document.service.js";
import { extractText } from "../services/textExtract.service.js";
import { freezeFinishedMonths } from "../services/attendance.service.js";
import {
  vnDateKey,
  vnMonthKey,
  vnDayStart,
  prevMonthKey,
  daysInMonth,
  timeToMinutes,
  distanceMeters,
} from "../services/payroll.service.js";

const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATA_DIR = path.resolve(__dirname, "../../sample-data");
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

const MINUTE_MS = 60 * 1000;

// ---------- Dữ liệu mẫu chấm công & lương ----------
// lat/lng: toạ độ gian hàng (Hà Nội) — có toạ độ thì mỗi lần chấm công ghi
// khoảng cách và gắn cờ "ngoài phạm vi" giống luồng thật.
const STALLS = [
  {
    key: "A",
    name: "Gian hàng Hoàn Kiếm",
    address: "12 Hàng Bài, Hoàn Kiếm, Hà Nội",
    lat: 21.0245,
    lng: 105.8522,
    radiusM: 100,
    shiftStart: "08:00",
    shiftEnd: "17:00",
    penaltyPerMinute: 1000,
  },
  {
    key: "B",
    name: "Gian hàng Cầu Giấy",
    address: "88 Xuân Thuỷ, Cầu Giấy, Hà Nội",
    lat: 21.0368,
    lng: 105.7826,
    radiusM: 150,
    shiftStart: "09:00",
    shiftEnd: "18:00",
    penaltyPerMinute: 500,
  },
];

const ADMIN = { fullName: "Quản trị viên Demo", email: "admin@congty.vn", password: "Admin@123" };

// profile quyết định thói quen chấm công khi sinh dữ liệu:
//  punctual  — gần như luôn đúng giờ
//  late      — hay đi muộn
//  early     — hay về sớm
//  offsite   — hay chấm công ngoài phạm vi gian hàng, thỉnh thoảng nghỉ
// rates: lịch sử lương giờ; "PREV_15" = ngày 15 tháng trước (minh hoạ tăng lương giữa tháng).
const EMPLOYEES = [
  {
    fullName: "Nhân viên Demo",
    email: "nhanvien@congty.vn",
    password: "NhanVien@123",
    phone: "0901000001",
    position: "Nhân viên bán hàng",
    stall: "A",
    profile: "punctual",
    rates: [{ from: "2000-01-01", rate: 30000 }],
    checkedInToday: false, // để tự bấm CHECK-IN thử
  },
  {
    fullName: "Nguyễn Thị Lan",
    email: "lan@congty.vn",
    password: "NhanVien@123",
    phone: "0901000002",
    position: "Trưởng quầy",
    stall: "A",
    profile: "punctual",
    rates: [
      { from: "2000-01-01", rate: 32000 },
      { from: "PREV_15", rate: 35000 },
    ],
    checkedInToday: true,
  },
  {
    fullName: "Trần Văn Hùng",
    email: "hung@congty.vn",
    password: "NhanVien@123",
    phone: "0901000003",
    position: "Nhân viên bán hàng",
    stall: "A",
    profile: "late",
    rates: [{ from: "2000-01-01", rate: 28000 }],
    checkedInToday: true,
  },
  {
    fullName: "Lê Thị Mai",
    email: "mai@congty.vn",
    password: "NhanVien@123",
    phone: "0901000004",
    position: "Thu ngân",
    stall: "B",
    profile: "early",
    rates: [{ from: "2000-01-01", rate: 30000 }],
    checkedInToday: true,
  },
  {
    fullName: "Phạm Minh Tuấn",
    email: "tuan@congty.vn",
    password: "NhanVien@123",
    phone: "0901000005",
    position: "Nhân viên kho",
    stall: "B",
    profile: "offsite",
    rates: [{ from: "2000-01-01", rate: 27000 }],
    checkedInToday: false,
  },
];

// ---------- Văn bản mẫu ----------
// TOÀN BỘ 6 file mẫu ở backend/sample-data/ (xem README.md trong thư mục đó) —
// 5 văn bản thông thường và 1 văn bản nhạy cảm minh hoạ tính năng "tài liệu
// nhạy cảm" (chatbot KHÔNG tự trả lời, chuyển cho quản trị viên).
const DOCS_TO_SEED = [
  { file: "quy-che-nghi-phep.docx", title: "Quy chế Nghỉ phép", category: "Nhân sự", isSensitive: false },
  { file: "noi-quy-lao-dong.docx", title: "Nội quy Lao động", category: "Nhân sự", isSensitive: false },
  {
    file: "quy-dinh-luong-thuong.docx",
    title: "Quy định Lương, Thưởng và Phúc lợi",
    category: "Nhân sự",
    isSensitive: false,
  },
  {
    file: "quy-dinh-an-toan-thong-tin.docx",
    title: "Quy định An toàn Thông tin",
    category: "An toàn thông tin",
    isSensitive: false,
  },
  {
    file: "quy-trinh-lam-viec-tu-xa.docx",
    title: "Quy trình Đăng ký Làm việc Từ xa",
    category: "Nhân sự",
    isSensitive: false,
  },
  {
    file: "ho-so-luong-thuong-ca-nhan.docx",
    title: "Hồ sơ Lương thưởng Cá nhân (Ví dụ minh hoạ)",
    category: "Nhân sự",
    isSensitive: true,
  },
];

// Bộ sinh số ngẫu nhiên có seed (mulberry32) — chạy lại ra cùng dữ liệu
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRandom(20260101);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;

// ============================================================
// 1. Schema
// ============================================================
async function setupSchema() {
  console.log("→ Đang tạo bảng từ schema.sql ...");
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schemaSql);
  console.log("✓ Đã tạo/kiểm tra xong bảng.");
}

// ============================================================
// 2. Xoá dữ liệu cũ
// ============================================================
async function resetPostgres() {
  console.log("\n→ Đang xoá TOÀN BỘ dữ liệu cũ (PostgreSQL)...");
  // TRUNCATE không kích hoạt trigger BEFORE UPDATE chặn sửa chấm công, và
  // CASCADE dọn luôn mọi bảng tham chiếu tới các bảng này.
  await pool.query(`
    TRUNCATE TABLE
      payroll_months, attendance_edits, attendance_events, employee_rates,
      document_chunks, documents, users, stalls
    CASCADE
  `);
  console.log("  ✓ Đã xoá tài khoản, gian hàng, lương giờ, chấm công, bảng lương, văn bản.");

  console.log("→ Đang xoá file gốc cũ trong backend/uploads/...");
  await fsp.rm(UPLOAD_DIR, { recursive: true, force: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  console.log("  ✓ Đã dọn sạch backend/uploads/.");
}

async function resetConversations() {
  console.log("→ Đang xoá toàn bộ hội thoại + tin nhắn cũ (MongoDB)...");
  const [convResult, msgResult] = await Promise.all([Conversation.deleteMany({}), Message.deleteMany({})]);
  console.log(`  ✓ Đã xoá ${convResult.deletedCount} hội thoại và ${msgResult.deletedCount} tin nhắn.`);
}

// ============================================================
// 3. Dữ liệu mẫu chấm công & lương
// ============================================================
async function seedStallsAndUsers(prevMonth) {
  console.log("\n→ Đang tạo gian hàng, tài khoản và lương giờ mẫu...");

  const stallIds = {};
  for (const s of STALLS) {
    const r = await pool.query(
      `INSERT INTO stalls (name, address, lat, lng, radius_m, shift_start, shift_end, penalty_per_minute)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [s.name, s.address, s.lat, s.lng, s.radiusM, s.shiftStart, s.shiftEnd, s.penaltyPerMinute]
    );
    stallIds[s.key] = r.rows[0].id;
    console.log(`  ✓ Gian hàng "${s.name}" (ca ${s.shiftStart}-${s.shiftEnd}, phạt ${s.penaltyPerMinute}đ/phút)`);
  }

  const adminRes = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING id`,
    [ADMIN.fullName, ADMIN.email, await bcrypt.hash(ADMIN.password, 10)]
  );
  const adminId = adminRes.rows[0].id;

  const employees = [];
  for (const e of EMPLOYEES) {
    const r = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, stall_id, phone, position)
       VALUES ($1,$2,$3,'employee',$4,$5,$6) RETURNING id`,
      [e.fullName, e.email, await bcrypt.hash(e.password, 10), stallIds[e.stall], e.phone, e.position]
    );
    const id = r.rows[0].id;
    for (const rate of e.rates) {
      const from = rate.from === "PREV_15" ? `${prevMonth}-15` : rate.from;
      await pool.query(
        `INSERT INTO employee_rates (user_id, hourly_rate, effective_from, created_by) VALUES ($1,$2,$3,$4)`,
        [id, rate.rate, from, adminId]
      );
    }
    employees.push({ ...e, id, stallId: stallIds[e.stall], stallCfg: STALLS.find((s) => s.key === e.stall) });
  }
  console.log(`  ✓ 1 admin + ${employees.length} nhân viên (kèm lịch sử lương giờ).`);

  return { adminId, employees };
}

// Vị trí GPS khi chấm công: trong phạm vi (lệch vài chục mét) hoặc ngoài phạm vi (~0,5-1,5 km)
function makeLocation(stall, outside) {
  const meters = outside ? randInt(500, 1500) : randInt(5, Math.floor(stall.radiusM * 0.6));
  const angle = rand() * 2 * Math.PI;
  const lat = stall.lat + (meters * Math.cos(angle)) / 111320;
  const lng = stall.lng + (meters * Math.sin(angle)) / (111320 * Math.cos((stall.lat * Math.PI) / 180));
  const distance = Math.round(distanceMeters(lat, lng, stall.lat, stall.lng));
  return { lat, lng, accuracy: randInt(5, 30), distance, outOfRange: distance > stall.radiusM };
}

// Thời điểm (UTC) của "ngày dateKey, giờ ca + offset phút" theo giờ VN, kèm giây ngẫu nhiên
function atShift(dateKey, hhmm, offsetMin) {
  const t = vnDayStart(dateKey).getTime() + (timeToMinutes(hhmm) + offsetMin) * MINUTE_MS;
  return new Date(t + randInt(0, 59) * 1000);
}

// Lệch giờ vào/ra (phút) theo thói quen của từng nhân viên
function sampleDay(profile) {
  const absent = chance(profile === "offsite" ? 0.12 : 0.04);
  let inOffset = randInt(-15, 0);
  let outOffset = randInt(0, 20);
  if (profile === "punctual" && chance(0.08)) inOffset = randInt(1, 10);
  if (profile === "late" && chance(0.4)) inOffset = randInt(5, 45);
  if (profile === "early" && chance(0.35)) outOffset = -randInt(10, 60);
  if (profile === "offsite" && chance(0.15)) inOffset = randInt(1, 20);
  const offsite = profile === "offsite" ? chance(0.25) : chance(0.02);
  return { absent, inOffset, outOffset, offsite };
}

function eventRow(emp, type, at, offsite) {
  const loc = makeLocation(emp.stallCfg, offsite);
  return {
    userId: emp.id,
    stallId: emp.stallId,
    type,
    at,
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy,
    distance: loc.distance,
    outOfRange: loc.outOfRange,
  };
}

async function insertEvents(rows) {
  const BATCH = 400;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params = [];
    const values = slice.map((r) => {
      params.push(r.userId, r.stallId, r.type, r.at, r.lat, r.lng, r.accuracy, r.distance, r.outOfRange);
      const b = params.length - 9;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},'seed-device','self',$${b + 1})`;
    });
    await pool.query(
      `INSERT INTO attendance_events
         (user_id, stall_id, type, occurred_at, lat, lng, accuracy_m, distance_m, out_of_range, device_id, method, created_by)
       VALUES ${values.join(",")}`,
      params
    );
  }
}

// Các ngày làm việc (trừ Chủ nhật) của tháng, chỉ lấy ngày < beforeDateKey
function workDays(monthKey, beforeDateKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const out = [];
  for (let d = 1; d <= daysInMonth(monthKey); d++) {
    const key = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (key >= beforeDateKey) break;
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) continue;
    out.push(key);
  }
  return out;
}

async function seedAttendance({ adminId, employees }, now) {
  console.log("\n→ Đang sinh dữ liệu chấm công mẫu...");
  const today = vnDateKey(now);
  const curMonth = vnMonthKey(now);
  const prevMonth = prevMonthKey(curMonth);
  const days = [...workDays(prevMonth, today), ...workDays(curMonth, today)];
  const curMonthDays = days.filter((d) => d.startsWith(curMonth));

  const hung = employees.find((e) => e.email === "hung@congty.vn");
  const mai = employees.find((e) => e.email === "mai@congty.vn");
  // Ngày quên check-out (Mai) và ngày admin chỉnh giờ (Hùng): trong tháng này
  // (tháng cũ bị khoá, admin không sửa được) — cần tháng này đã có ngày làm việc.
  const missingCheckoutDay = curMonthDays.length >= 2 ? curMonthDays[curMonthDays.length - 2] : null;
  const adminEditDay = curMonthDays.length >= 1 ? curMonthDays[0] : null;

  const rows = [];
  for (const emp of employees) {
    const { shiftStart, shiftEnd } = emp.stallCfg;
    for (const day of days) {
      const forced = emp === hung && day === adminEditDay; // ngày sẽ được admin chỉnh: luôn đi làm, đi muộn
      const s = sampleDay(emp.profile);
      if (s.absent && !forced) continue;
      const inOffset = forced ? 35 : s.inOffset;
      rows.push(eventRow(emp, "in", atShift(day, shiftStart, inOffset), s.offsite));
      if (emp === mai && day === missingCheckoutDay) continue; // quên check-out
      rows.push(eventRow(emp, "out", atShift(day, shiftEnd, s.outOffset), s.offsite));
    }

    // Đã check-in hôm nay (nếu giờ đó đã qua) — chưa check-out
    if (emp.checkedInToday) {
      const at = atShift(today, shiftStart, randInt(-10, 5));
      if (at < now) rows.push(eventRow(emp, "in", at, false));
    }
  }
  await insertEvents(rows);
  console.log(`  ✓ ${rows.length} lần chấm công (${prevMonth} và ${curMonth} đến hôm nay).`);
  if (missingCheckoutDay) console.log(`  ✓ ${mai.fullName} quên check-out ngày ${missingCheckoutDay}.`);

  // Admin chỉnh giờ vào của Hùng về đúng giờ ca: giống hệt luồng
  // POST /api/hr/attendance/day-edit — huỷ (voided) lần cũ, thêm lần mới
  // method='admin' trỏ về lần cũ, ghi nhật ký attendance_edits.
  if (adminEditDay) {
    const orig = await pool.query(
      `SELECT id, occurred_at FROM attendance_events
       WHERE user_id = $1 AND type = 'in' AND occurred_at >= $2 AND occurred_at < $3
       ORDER BY occurred_at LIMIT 1`,
      [hung.id, vnDayStart(adminEditDay), new Date(vnDayStart(adminEditDay).getTime() + 24 * 60 * MINUTE_MS)]
    );
    const old = orig.rows[0];
    const newAt = new Date(vnDayStart(adminEditDay).getTime() + timeToMinutes(hung.stallCfg.shiftStart) * MINUTE_MS);
    await pool.query(`UPDATE attendance_events SET status = 'voided' WHERE id = $1`, [old.id]);
    const ins = await pool.query(
      `INSERT INTO attendance_events (user_id, stall_id, type, occurred_at, method, created_by, replaces_event_id)
       VALUES ($1,$2,'in',$3,'admin',$4,$5) RETURNING id, occurred_at`,
      [hung.id, hung.stallId, newAt, adminId, old.id]
    );
    await pool.query(
      `INSERT INTO attendance_edits (event_id, user_id, admin_id, action, before, after)
       VALUES ($1,$2,$3,'update',$4,$5)`,
      [
        ins.rows[0].id,
        hung.id,
        adminId,
        JSON.stringify({ type: "in", occurred_at: old.occurred_at, method: "self" }),
        JSON.stringify({ type: "in", occurred_at: ins.rows[0].occurred_at, method: "admin" }),
      ]
    );
    console.log(`  ✓ Admin chỉnh giờ vào của ${hung.fullName} ngày ${adminEditDay} về ${hung.stallCfg.shiftStart}.`);
  }

  // Chốt bảng lương tháng trước giống server thật (payroll_months)
  const frozen = await freezeFinishedMonths(now);
  console.log(`  ✓ Đã chốt bảng lương tháng ${prevMonth} (${frozen} nhân viên).`);
}

// ============================================================
// 4. Văn bản mẫu
// ============================================================
async function seedOneDocument(doc) {
  const filePath = path.join(SAMPLE_DATA_DIR, doc.file);
  // Đọc dưới dạng buffer NHỊ PHÂN vì file mẫu là .docx (ZIP/XML), rồi trích
  // xuất text bằng đúng hàm của luồng upload DOCX thật qua UI (mammoth).
  const fileBuffer = await fsp.readFile(filePath);
  const rawText = await extractText(fileBuffer, DOCX_MIMETYPE, doc.file);

  const docResult = await pool.query(
    `INSERT INTO documents (title, category, original_filename, is_sensitive, status, uploaded_by)
     VALUES ($1, $2, $3, $4, 'processing', NULL)
     RETURNING id`,
    [doc.title, doc.category, doc.file, doc.isSensitive]
  );
  const documentId = docResult.rows[0].id;

  // Lưu file gốc + ghi storage_path NGAY (giống hệt luồng upload qua UI)
  const storagePath = await saveDocumentFile(documentId, fileBuffer, doc.file);
  await setDocumentStoragePath(documentId, storagePath);

  const chunks = splitIntoChunks(rawText);
  console.log(`  → [${doc.title}] ${chunks.length} chunk(s), đang tạo embedding...`);

  const client = await pool.connect();
  try {
    const embeddings = await embedBatch(chunks);
    await client.query("BEGIN");
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4)`,
        [documentId, i, chunks[i], toPgVector(embeddings[i])]
      );
    }
    await client.query(`UPDATE documents SET status = 'ready', updated_at = now() WHERE id = $1`, [documentId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    await pool.query(`UPDATE documents SET status = 'failed', updated_at = now() WHERE id = $1`, [documentId]);
    throw err;
  } finally {
    client.release();
  }

  console.log(`  ✓ Đã lưu "${doc.title}" (${chunks.length} chunk)`);
}

async function seedDocuments() {
  console.log("\n→ Đang nạp bộ văn bản mẫu...\n");
  let ok = 0;
  for (const doc of DOCS_TO_SEED) {
    if (!fs.existsSync(path.join(SAMPLE_DATA_DIR, doc.file))) {
      console.warn(`  ! Bỏ qua (không thấy file backend/sample-data/${doc.file})`);
      continue;
    }
    try {
      await seedOneDocument(doc);
      ok++;
    } catch (err) {
      console.warn(`  ! Lỗi khi nạp "${doc.title}": ${err.message}`);
    }
  }
  return ok;
}

// ============================================================
async function run() {
  await setupSchema();

  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "Chưa kết nối được MongoDB — kiểm tra MONGODB_URI trong .env rồi chạy lại (xem log lỗi phía trên)."
    );
  }

  await resetPostgres();
  await resetConversations();

  const now = new Date();
  const people = await seedStallsAndUsers(prevMonthKey(vnMonthKey(now)));
  await seedAttendance(people, now);
  const docCount = await seedDocuments();

  console.log("\nHoàn tất! Database đã được reset sạch và nạp lại dữ liệu mẫu.");
  console.log("Tài khoản để đăng nhập thử:");
  console.log(`  - admin     | ${ADMIN.email} / ${ADMIN.password}`);
  EMPLOYEES.forEach((u) => console.log(`  - employee  | ${u.email} / ${u.password}  (${u.fullName})`));
  console.log(`Đã nạp ${docCount}/${DOCS_TO_SEED.length} văn bản mẫu. Thử hỏi chatbot:`);
  console.log('  - "Một năm được nghỉ phép bao nhiêu ngày?"');
  console.log('  - "Lương tháng trước của tôi là bao nhiêu?"');
  console.log('  - "Tháng này em đi muộn mấy lần?"');

  await pool.end();
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seed thất bại:", err);
  process.exit(1);
});
