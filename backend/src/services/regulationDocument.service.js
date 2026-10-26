// VĂN BẢN QUY CHẾ (riêng từng cửa hàng): upload (admin) → trích xuất text →
// tách đoạn → tạo embedding → lưu DB; xem danh sách, xoá; xem trước / tải file
// gốc (mọi tài khoản của cửa hàng, trừ tài liệu nhạy cảm chỉ admin xem được).
import path from "path";
import { DOCUMENT_PROCESSING_STATUS, ROLE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { extractText } from "../utils/textExtractor.js";
import { splitIntoChunks } from "../utils/textChunker.js";
import { isUuid, optionalText } from "../utils/validators.js";
import { serializeDocument } from "./serializers.js";

const SENSITIVE_FORBIDDEN_MESSAGE =
  "Tài liệu này thuộc diện nhạy cảm — vui lòng liên hệ trực tiếp quản trị viên để được hỗ trợ.";

// Tên file lưu trên đĩa = <id văn bản>.<đuôi gốc> để không bao giờ trùng nhau
export function buildStoredFileName(documentId, originalFileName) {
  const ext = path.extname(originalFileName || "");
  const safeExt = ext.length > 0 && ext.length <= 10 ? ext : "";
  return `${documentId}${safeExt}`;
}

export function createRegulationDocumentService({ documentRepository, fileStorage, aiProvider, transaction }) {
  async function list(actor) {
    return { documents: (await documentRepository.listWithStats(actor.storeId)).map(serializeDocument) };
  }

  // Lưu file gốc xuống kho lưu trữ + ghi stored_file_name. Dùng chung cho luồng
  // upload qua UI và script seed. Trả về stored_file_name.
  async function saveOriginalFile(documentId, buffer, originalFileName) {
    const storedFileName = buildStoredFileName(documentId, originalFileName);
    await fileStorage.save(storedFileName, buffer);
    await documentRepository.setStoredFileName(documentId, storedFileName);
    return storedFileName;
  }

  // Lưu các đoạn + embedding rồi chuyển văn bản sang 'ready' (1 transaction)
  async function saveDetails(documentId, chunks, embeddings) {
    await transaction.run(async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        await documentRepository.insertDetail(
          { documentId, chunkIndex: i, content: chunks[i], embedding: embeddings[i] },
          tx
        );
      }
      await documentRepository.setProcessingStatus(documentId, DOCUMENT_PROCESSING_STATUS.READY, tx);
    });
  }

  // Chạy nền: xử lý nội dung file. Tách khỏi request HTTP để không bắt người
  // dùng chờ (processing -> ready sau vài giây/phút, hoặc failed nếu lỗi).
  async function processInBackground(documentId, buffer, mimetype, fileName) {
    try {
      const rawText = await extractText(buffer, mimetype, fileName);
      const chunks = splitIntoChunks(rawText);
      if (chunks.length === 0) {
        throw new Error("Không trích xuất được nội dung văn bản (file rỗng hoặc lỗi định dạng).");
      }
      await saveDetails(documentId, chunks, await aiProvider.embedBatch(chunks));
    } catch (err) {
      console.error(`[regulationDocument.service] Xử lý văn bản ${documentId} thất bại:`, err.message);
      await documentRepository.setProcessingStatus(documentId, DOCUMENT_PROCESSING_STATUS.FAILED).catch(() => {});
    }
  }

  // file: { buffer, originalname, mimetype } (từ multer)
  async function upload(actor, { title, category, isSensitive } = {}, file) {
    if (!file) throw AppError.badRequest("Vui lòng chọn file để upload (PDF, DOCX hoặc TXT).");

    // Form gửi qua FormData nên "isSensitive" là chuỗi "true"/"false" (hoặc "on")
    const document = await documentRepository.create({
      storeId: actor.storeId,
      title: optionalText(title, 500) || file.originalname,
      category: optionalText(category, 150),
      originalFileName: file.originalname || null,
      isSensitive: isSensitive === "true" || isSensitive === "on" || isSensitive === true,
      uploadedByAccountId: actor.id,
    });

    // Lưu file gốc NGAY vì buffer chỉ tồn tại trong phạm vi request này
    await saveOriginalFile(document.id, file.buffer, file.originalname);

    // Không "await" — xử lý (trích xuất + embedding) chạy nền, trả response ngay.
    processInBackground(document.id, file.buffer, file.mimetype, file.originalname);

    return { document: serializeDocument(document), message: "Đã nhận file, đang xử lý trong nền." };
  }

  async function findInStoreOrThrow(actor, documentId, message) {
    const document = isUuid(documentId) ? await documentRepository.findInStore(documentId, actor.storeId) : null;
    if (!document) throw AppError.notFound(message);
    return document;
  }

  // Xoá file gốc trên đĩa SAU khi đã đọc stored_file_name
  async function remove(actor, documentId) {
    const document = await findInStoreOrThrow(actor, documentId, "Không tìm thấy văn bản.");
    // Xoá mềm: giữ cả file gốc để còn mở lại khi đối soát
    await documentRepository.softDeleteById(document.id);
  }

  // AN TOÀN: dù assistant.service.js không bao giờ trả tài liệu nhạy cảm trong
  // "sources", vẫn tự kiểm tra lại trước khi cho xem/tải — "phòng thủ theo chiều sâu".
  function assertCanAccess(actor, document) {
    if (document.is_sensitive && actor.role !== ROLE.ADMIN) throw AppError.forbidden(SENSITIVE_FORBIDDEN_MESSAGE);
  }

  // Xem trước nội dung NGAY TRONG TRÌNH DUYỆT — ghép lại text từ các đoạn đã lưu
  async function getPreview(actor, documentId) {
    const document = await findInStoreOrThrow(actor, documentId, "Không tìm thấy tài liệu (có thể đã bị quản trị viên xoá).");
    assertCanAccess(actor, document);
    if (document.processing_status !== DOCUMENT_PROCESSING_STATUS.READY) {
      throw AppError.conflict("Văn bản đang xử lý hoặc xử lý thất bại, chưa có nội dung để xem trước.");
    }
    const contents = await documentRepository.findDetailContents(document.id);
    return { title: document.title, content: contents.join("\n\n") };
  }

  // Trả về đường dẫn file trên đĩa + tên file khi tải — router lo việc gửi file
  async function getDownload(actor, documentId) {
    const document = await findInStoreOrThrow(actor, documentId, "Không tìm thấy file tài liệu (có thể đã bị quản trị viên xoá).");
    if (!document.stored_file_name) {
      throw AppError.notFound("Không tìm thấy file tài liệu (có thể đã bị quản trị viên xoá).");
    }
    assertCanAccess(actor, document);
    return {
      absolutePath: fileStorage.resolvePath(document.stored_file_name),
      downloadName: document.original_file_name || `${document.title}${path.extname(document.stored_file_name)}`,
    };
  }

  return { list, saveOriginalFile, saveDetails, upload, remove, getPreview, getDownload };
}
