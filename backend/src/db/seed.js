// RESET TOÀN BỘ database rồi nạp DỮ LIỆU MẪU — chạy mỗi khi cần làm lại từ đầu:
//   npm run db:reset   (trong thư mục backend)
//
//  1. Xoá sạch bảng/kiểu cũ (drop.sql), tạo kiểu ENUM từ constants/enums.js,
//     tạo bảng từ schema.sql. Xoá file trong backend/uploads/ và (nếu kết nối
//     được) toàn bộ hội thoại MongoDB.
//  2. Nạp dữ liệu mẫu QUA CHÍNH CÁC SERVICE của ứng dụng (tạo cửa hàng, nhân
//     viên, sửa giờ, tạo/huỷ/chốt bảng lương...) để dữ liệu giống hệt khi người
//     dùng thao tác trên giao diện:
//     - 1 superadmin, 2 cửa hàng (mỗi cửa hàng 1 admin + vài nhân viên).
//     - Chấm công THÁNG TRƯỚC + tháng này đến hôm qua (nghỉ Chủ nhật): đúng
//       giờ, đi muộn, về sớm, nghỉ, ngoài phạm vi GPS, quên check-out, admin
//       chỉnh giờ, vài người đã check-in hôm nay.
//     - Bảng lương tháng trước: cửa hàng 1 có 1 bảng đã huỷ + 1 bảng đã chốt
//       (sau đó tăng lương 1 nhân viên — bảng đã chốt không đổi); cửa hàng 2 có
//       1 bảng nháp đang "cần tính lại".
//     - Văn bản quy chế mẫu trong backend/sample-data/ cho mỗi cửa hàng (lỗi tạo
//       embedding chỉ cảnh báo, không làm hỏng dữ liệu chấm công).
//     Dữ liệu sinh bằng bộ số ngẫu nhiên có seed cố định nên mỗi lần chạy ra
//     cùng một kết quả (chỉ lệch theo ngày chạy).
//
// ⚠ XOÁ SẠCH dữ liệu — chỉ dùng cho môi trường phát triển/demo.
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { pool } from "../config/db.js";
import { connectMongo } from "../config/mongodb.js";
import { createContainer } from "../container.js";
import {
  CLOCKING_ACTION, CLOCKING_SOURCE, PAYSHEET_STATUS, POSTGRES_ENUM_TYPES, ROLE, enumValues,
} from "../constants/enums.js";
import { summarizeClockingDay } from "../services/payrollCalculator.js";
import { vnToday } from "../services/storePlan.service.js";
import { distanceMeters } from "../utils/geo.js";
import { extractText } from "../utils/textExtractor.js";
import { splitIntoChunks } from "../utils/textChunker.js";
import { daysInMonth, prevMonthKey, timeToMinutes, vnDateKey, vnDayStart, vnMonthKey } from "../utils/vnTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATA_DIR = path.resolve(__dirname, "../../sample-data");
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");
const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MINUTE_MS = 60 * 1000;

const {
  transaction,
  repositories: { accountRepository, storeRepository, documentRepository, conversationRepository, messageRepository },
  providers: { aiProvider },
  services: {
    superadminService, employeeService, clockingManagementService, paysheetService, regulationDocumentService,
  },
} = createContainer();

// ============================================================
// Dữ liệu mẫu — khớp với danh sách gợi ý ở màn đăng nhập
// (frontend/src/constants/demoAccounts.js)
// ============================================================
const SUPERADMIN = { fullName: "Quản trị hệ thống", email: "superadmin@smartclocking.vn", password: "Super@123" };

// profile quyết định thói quen chấm công khi sinh dữ liệu:
//  punctual — gần như luôn đúng giờ;  late — hay đi muộn;  early — hay về sớm
//  offsite  — hay chấm công ngoài phạm vi cửa hàng, thỉnh thoảng nghỉ
const STORES = [
  {
    key: "hoan-kiem",
    name: "Cửa hàng Hoàn Kiếm",
    address: "12 Hàng Bài, Hoàn Kiếm, Hà Nội",
    // Gói do superadmin đặt: hạn dùng tính từ hôm nay (ngày)
    plan: { ownerPhoneNumber: "0912000001", maxEmployeeCount: 10, expiresInDays: 365 },
    setting: { latitude: 21.0245, longitude: 105.8522, checkInRadiusMeters: 100, shiftStartTime: "08:00", shiftEndTime: "17:00", penaltyAmountPerMinute: 1000 },
    admin: { fullName: "Đỗ Thu Hà", email: "admin.hoankiem@smartclocking.vn", password: "Admin@123" },
    employees: [
      { fullName: "Nhân viên Demo", email: "nhanvien@smartclocking.vn", phoneNumber: "0901000001", jobTitle: "Nhân viên bán hàng", hourlyWage: 30000, profile: "punctual", checkedInToday: false },
      { fullName: "Nguyễn Thị Lan", email: "lan@smartclocking.vn", phoneNumber: "0901000002", jobTitle: "Trưởng quầy", hourlyWage: 32000, raisedWage: 35000, profile: "punctual", checkedInToday: true },
      { fullName: "Trần Văn Hùng", email: "hung@smartclocking.vn", phoneNumber: "0901000003", jobTitle: "Nhân viên bán hàng", hourlyWage: 28000, profile: "late", checkedInToday: true, adminEditsFirstDay: true },
    ],
  },
  {
    key: "cau-giay",
    name: "Cửa hàng Cầu Giấy",
    address: "88 Xuân Thuỷ, Cầu Giấy, Hà Nội",
    plan: { ownerPhoneNumber: "0912000002", maxEmployeeCount: 5, expiresInDays: 20 }, // sắp hết hạn
    setting: { latitude: 21.0368, longitude: 105.7826, checkInRadiusMeters: 150, shiftStartTime: "09:00", shiftEndTime: "18:00", penaltyAmountPerMinute: 500 },
    admin: { fullName: "Vũ Minh Quân", email: "admin.caugiay@smartclocking.vn", password: "Admin@123" },
    employees: [
      { fullName: "Lê Thị Mai", email: "mai@smartclocking.vn", phoneNumber: "0901000004", jobTitle: "Thu ngân", hourlyWage: 30000, raisedWage: 31000, profile: "early", checkedInToday: true, forgetsCheckOut: true },
      { fullName: "Phạm Minh Tuấn", email: "tuan@smartclocking.vn", phoneNumber: "0901000005", jobTitle: "Nhân viên kho", hourlyWage: 27000, profile: "offsite", checkedInToday: false },
    ],
  },
];
const EMPLOYEE_PASSWORD = "NhanVien@123";

// 6 file mẫu ở backend/sample-data/ — 5 văn bản thường + 1 văn bản nhạy cảm
const DOCUMENTS = [
  { file: "quy-che-nghi-phep.docx", title: "Quy chế Nghỉ phép", category: "Nhân sự", isSensitive: false },
  { file: "noi-quy-lao-dong.docx", title: "Nội quy Lao động", category: "Nhân sự", isSensitive: false },
  { file: "quy-dinh-luong-thuong.docx", title: "Quy định Lương, Thưởng và Phúc lợi", category: "Nhân sự", isSensitive: false },
  { file: "quy-dinh-an-toan-thong-tin.docx", title: "Quy định An toàn Thông tin", category: "An toàn thông tin", isSensitive: false },
  { file: "quy-trinh-lam-viec-tu-xa.docx", title: "Quy trình Đăng ký Làm việc Từ xa", category: "Nhân sự", isSensitive: false },
  { file: "ho-so-luong-thuong-ca-nhan.docx", title: "Hồ sơ Lương thưởng Cá nhân (Ví dụ minh hoạ)", category: "Nhân sự", isSensitive: true },
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
// 1. Tạo lại cấu trúc database
// ============================================================
const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

async function recreateSchema() {
  console.log("→ Đang xoá và tạo lại cấu trúc database...");
  await pool.query(fs.readFileSync(path.join(__dirname, "drop.sql"), "utf-8"));
  for (const [typeName, enumObject] of Object.entries(POSTGRES_ENUM_TYPES)) {
    await pool.query(`DROP TYPE IF EXISTS ${typeName} CASCADE`);
    await pool.query(`CREATE TYPE ${typeName} AS ENUM (${enumValues(enumObject).map(sqlLiteral).join(", ")})`);
  }
  await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8"));
  console.log(`  ✓ Đã tạo ${Object.keys(POSTGRES_ENUM_TYPES).length} kiểu ENUM và toàn bộ bảng.`);

  await fsp.rm(UPLOAD_DIR, { recursive: true, force: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await fsp.writeFile(path.join(UPLOAD_DIR, ".gitkeep"), "");
  console.log("  ✓ Đã dọn sạch backend/uploads/.");
}

async function resetConversations() {
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.warn("  ! Không kết nối được MongoDB — bỏ qua bước xoá hội thoại cũ.");
    return;
  }
  const [conversations, messages] = await Promise.all([conversationRepository.deleteAll(), messageRepository.deleteAll()]);
  console.log(`  ✓ Đã xoá ${conversations.deletedCount} hội thoại và ${messages.deletedCount} tin nhắn (MongoDB).`);
}

// ============================================================
// 2. Tài khoản, cửa hàng, nhân viên
// ============================================================
async function seedAccounts() {
  console.log("\n→ Đang tạo superadmin, cửa hàng và nhân viên...");
  const { account } = await superadminService.createSuperadmin(SUPERADMIN);
  const superadmin = { id: account.id, role: ROLE.SUPERADMIN, storeId: null };

  const stores = [];
  for (const def of STORES) {
    const expiry = new Date(Date.now() + def.plan.expiresInDays * 86400000);
    const { store } = await superadminService.createStore(superadmin, {
      name: def.name,
      address: def.address,
      ownerPhoneNumber: def.plan.ownerPhoneNumber,
      maxEmployeeCount: def.plan.maxEmployeeCount,
      expiryDate: vnToday(expiry),
      admin: def.admin,
    });
    const s = def.setting;
    await storeRepository.updateSetting(store.id, {
      shift_start_time: s.shiftStartTime,
      shift_end_time: s.shiftEndTime,
      penalty_amount_per_minute: s.penaltyAmountPerMinute,
      latitude: s.latitude,
      longitude: s.longitude,
      check_in_radius_meters: s.checkInRadiusMeters,
    });

    const adminAccount = await accountRepository.findByEmailForLogin(def.admin.email);
    const admin = { id: adminAccount.id, role: ROLE.ADMIN, storeId: store.id };

    const employees = [];
    for (const e of def.employees) {
      const { employee } = await employeeService.create(admin, { ...e, password: EMPLOYEE_PASSWORD });
      employees.push({ ...e, id: employee.id, accountId: employee.accountId });
    }
    stores.push({ ...def, id: store.id, adminActor: admin, employees });
    console.log(`  ✓ ${def.name}: 1 admin + ${employees.length} nhân viên (ca ${s.shiftStartTime}–${s.shiftEndTime}, phạt ${s.penaltyAmountPerMinute}đ/phút)`);
  }
  return stores;
}

// ============================================================
// 3. Chấm công
// ============================================================
// Vị trí GPS: trong phạm vi (lệch vài chục mét) hoặc ngoài phạm vi (~0,5–1,5 km)
function makeLocation(setting, outside) {
  const meters = outside ? randInt(500, 1500) : randInt(5, Math.floor(setting.checkInRadiusMeters * 0.6));
  const angle = rand() * 2 * Math.PI;
  const latitude = setting.latitude + (meters * Math.cos(angle)) / 111320;
  const longitude = setting.longitude + (meters * Math.sin(angle)) / (111320 * Math.cos((setting.latitude * Math.PI) / 180));
  const distance = Math.round(distanceMeters(latitude, longitude, setting.latitude, setting.longitude));
  return { latitude, longitude, accuracy: randInt(5, 30), distance, isOutOfRange: distance > setting.checkInRadiusMeters };
}

// Thời điểm (UTC) của "ngày workDate, giờ hhmm + offset phút" theo giờ VN, kèm giây ngẫu nhiên
function atShift(workDate, hhmm, offsetMinutes) {
  const t = vnDayStart(workDate).getTime() + (timeToMinutes(hhmm) + offsetMinutes) * MINUTE_MS;
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

// Các ngày làm việc (trừ Chủ nhật) của tháng, chỉ lấy ngày < beforeDate
function workDays(monthKey, beforeDate) {
  const [y, m] = monthKey.split("-").map(Number);
  const out = [];
  for (let d = 1; d <= daysInMonth(monthKey); d++) {
    const key = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (key >= beforeDate) break;
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) continue;
    out.push(key);
  }
  return out;
}

function historyRow(store, employee, actionType, clockTime, offsite) {
  const loc = makeLocation(store.setting, offsite);
  return {
    action_type: actionType,
    clock_time: clockTime,
    is_out_of_range: loc.isOutOfRange,
    latitude: loc.latitude,
    longitude: loc.longitude,
    gps_accuracy_meters: loc.accuracy,
    distance_to_store_meters: loc.distance,
    created_by_account_id: employee.accountId,
  };
}

// Insert nhiều dòng 1 lần (nhanh hơn từng dòng khi DB ở xa)
async function bulkInsert(tx, table, columns, rows, returning = "") {
  const out = [];
  for (let i = 0; i < rows.length; i += 300) {
    const slice = rows.slice(i, i + 300);
    const params = [];
    const values = slice.map((row) => {
      const placeholders = columns.map((col) => {
        params.push(row[col]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    const r = await tx.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values.join(",")} ${returning ? `RETURNING ${returning}` : ""}`,
      params
    );
    out.push(...r.rows);
  }
  return out;
}

// Sinh lịch sử bấm của từng ngày, tổng hợp bằng đúng hàm của ứng dụng
// (summarizeClockingDay), rồi insert clocking + clocking_history theo lô.
async function seedClockings(stores, now) {
  console.log("\n→ Đang sinh dữ liệu chấm công mẫu...");
  const today = vnDateKey(now);
  const currentMonth = vnMonthKey(now);
  const days = [...workDays(prevMonthKey(currentMonth), today), ...workDays(currentMonth, today)];
  const currentMonthDays = days.filter((d) => d.startsWith(currentMonth));
  const forgetDay = currentMonthDays.length >= 2 ? currentMonthDays[currentMonthDays.length - 2] : null;
  const adminEditDay = currentMonthDays[0] ?? null;

  const dayRecords = []; // { clocking, histories }
  for (const store of stores) {
    const { shiftStartTime, shiftEndTime } = store.setting;
    for (const emp of store.employees) {
      for (const day of days) {
        const forced = emp.adminEditsFirstDay && day === adminEditDay; // ngày admin sẽ chỉnh: luôn đi làm, đi muộn
        const s = sampleDay(emp.profile);
        if (s.absent && !forced) continue;
        const histories = [historyRow(store, emp, CLOCKING_ACTION.CHECK_IN, atShift(day, shiftStartTime, forced ? 35 : s.inOffset), s.offsite)];
        if (!(emp.forgetsCheckOut && day === forgetDay)) {
          histories.push(historyRow(store, emp, CLOCKING_ACTION.CHECK_OUT, atShift(day, shiftEndTime, s.outOffset), s.offsite));
        }
        dayRecords.push({ store, emp, workDate: day, histories });
      }
      // Đã check-in hôm nay (nếu giờ đó đã qua) — chưa check-out
      const at = atShift(today, shiftStartTime, randInt(-10, 5));
      if (emp.checkedInToday && at < now) {
        dayRecords.push({ store, emp, workDate: today, histories: [historyRow(store, emp, CLOCKING_ACTION.CHECK_IN, at, false)] });
      }
    }
  }

  await transaction.run(async (tx) => {
    const clockingRows = dayRecords.map(({ store, emp, workDate, histories }) => {
      const summary = summarizeClockingDay({
        workDate,
        shiftStartTime: store.setting.shiftStartTime,
        shiftEndTime: store.setting.shiftEndTime,
        histories,
      });
      return {
        store_id: store.id,
        employee_id: emp.id,
        work_date: workDate,
        shift_start_time: store.setting.shiftStartTime,
        shift_end_time: store.setting.shiftEndTime,
        check_in_time: summary.checkInTime,
        check_out_time: summary.checkOutTime,
        worked_minutes: summary.workedMinutes,
        late_minutes: summary.lateMinutes,
        early_leave_minutes: summary.earlyLeaveMinutes,
        is_missing_check_out: summary.isMissingCheckOut,
        is_out_of_range: summary.isOutOfRange,
      };
    });
    const inserted = await bulkInsert(tx, "clocking", Object.keys(clockingRows[0]), clockingRows, "id, employee_id, work_date");
    const clockingIdOf = new Map(inserted.map((r) => [`${r.employee_id}|${r.work_date}`, r.id]));

    const historyRows = dayRecords.flatMap(({ emp, workDate, histories }) =>
      histories.map((h) => ({
        ...h,
        clocking_id: clockingIdOf.get(`${emp.id}|${workDate}`),
        source: CLOCKING_SOURCE.EMPLOYEE,
        device_identifier: "seed-device",
      }))
    );
    await bulkInsert(tx, "clocking_history", Object.keys(historyRows[0]), historyRows);
    console.log(`  ✓ ${clockingRows.length} ngày công, ${historyRows.length} lần bấm (${days[0]} → hôm nay).`);
  });

  if (forgetDay) console.log(`  ✓ Lê Thị Mai quên check-out ngày ${forgetDay}.`);

  // Admin chỉnh giờ vào về đúng giờ ca — đi qua đúng luồng sửa giờ của admin
  if (adminEditDay) {
    for (const store of stores) {
      const emp = store.employees.find((e) => e.adminEditsFirstDay);
      if (!emp) continue;
      await clockingManagementService.editDay(store.adminActor, {
        employeeId: emp.id,
        date: adminEditDay,
        checkInTime: store.setting.shiftStartTime,
      });
      console.log(`  ✓ Admin chỉnh giờ vào của ${emp.fullName} ngày ${adminEditDay} về ${store.setting.shiftStartTime}.`);
    }
  }
}

// ============================================================
// 4. Bảng lương — đi qua đúng luồng tạo / huỷ / chốt / tính lại
// ============================================================
async function seedPaysheets(stores, now) {
  console.log("\n→ Đang tạo bảng lương mẫu...");
  const previousMonth = prevMonthKey(vnMonthKey(now));
  const [first, second] = stores;

  // Cửa hàng 1: tạo -> huỷ -> tạo lại -> chốt, rồi tăng lương 1 nhân viên
  let result = await paysheetService.create(first.adminActor, { payMonth: previousMonth });
  await paysheetService.cancel(first.adminActor, result.paysheet.id, { reason: "Lập nhầm trước khi chỉnh công, lập lại bảng mới." });
  result = await paysheetService.create(first.adminActor, { payMonth: previousMonth });
  result = await paysheetService.finalize(first.adminActor, result.paysheet.id);
  console.log(`  ✓ ${first.name}: bảng lương ${previousMonth} đã ${result.paysheet.status} (kèm 1 bảng đã huỷ).`);

  // Cửa hàng 2: bảng nháp, sau đó đổi lương nên bảng hiện "cần tính lại"
  result = await paysheetService.create(second.adminActor, { payMonth: previousMonth });
  console.log(`  ✓ ${second.name}: bảng lương ${previousMonth} đang ${PAYSHEET_STATUS.DRAFT}.`);

  for (const store of stores) {
    for (const emp of store.employees.filter((e) => e.raisedWage)) {
      await employeeService.update(store.adminActor, emp.id, { hourlyWage: emp.raisedWage });
      console.log(`  ✓ Tăng lương ${emp.fullName}: ${emp.hourlyWage} → ${emp.raisedWage}đ/giờ (bảng đã chốt không đổi).`);
    }
  }
}

// ============================================================
// 5. Văn bản quy chế — mỗi file tạo embedding 1 lần, dùng cho mọi cửa hàng
// ============================================================
async function seedDocuments(stores) {
  console.log("\n→ Đang nạp văn bản quy chế mẫu...");
  let saved = 0;
  for (const doc of DOCUMENTS) {
    const filePath = path.join(SAMPLE_DATA_DIR, doc.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ! Bỏ qua (không thấy file backend/sample-data/${doc.file})`);
      continue;
    }
    try {
      const buffer = await fsp.readFile(filePath);
      const chunks = splitIntoChunks(await extractText(buffer, DOCX_MIMETYPE, doc.file));
      const embeddings = await aiProvider.embedBatch(chunks);
      for (const store of stores) {
        const document = await documentRepository.create({
          storeId: store.id,
          title: doc.title,
          category: doc.category,
          originalFileName: doc.file,
          isSensitive: doc.isSensitive,
          uploadedByAccountId: store.adminActor.id,
        });
        await regulationDocumentService.saveOriginalFile(document.id, buffer, doc.file);
        await regulationDocumentService.saveDetails(document.id, chunks, embeddings);
        saved++;
      }
      console.log(`  ✓ "${doc.title}" (${chunks.length} đoạn) × ${stores.length} cửa hàng`);
    } catch (err) {
      console.warn(`  ! Lỗi khi nạp "${doc.title}": ${err.message}`);
    }
  }
  return saved;
}

// ============================================================
async function run() {
  await recreateSchema();
  await resetConversations();

  const now = new Date();
  const stores = await seedAccounts();
  await seedClockings(stores, now);
  await seedPaysheets(stores, now);
  const documentCount = await seedDocuments(stores);

  console.log("\nHoàn tất! Tài khoản đăng nhập thử:");
  console.log(`  superadmin | ${SUPERADMIN.email} / ${SUPERADMIN.password}`);
  for (const store of stores) {
    console.log(`  admin      | ${store.admin.email} / ${store.admin.password}  (${store.name})`);
    store.employees.forEach((e) => console.log(`  user       | ${e.email} / ${EMPLOYEE_PASSWORD}  (${e.fullName} — ${store.name})`));
  }
  console.log(`Đã nạp ${documentCount} văn bản. Thử hỏi chatbot: "Một năm được nghỉ phép bao nhiêu ngày?", "Lương tháng trước của tôi là bao nhiêu?"`);
}

run()
  .catch((err) => {
    console.error("Seed thất bại:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await mongoose.disconnect();
  });
