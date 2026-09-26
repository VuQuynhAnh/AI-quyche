// Trích xuất nội dung văn bản thuần từ file người dùng upload (PDF / DOCX / TXT).
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractText(buffer, mimetype, filename = "") {
  const lowerName = filename.toLowerCase();

  if (mimetype === "application/pdf" || lowerName.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (mimetype === "text/plain" || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  throw new Error(
    `Định dạng file không được hỗ trợ: ${mimetype || lowerName}. Chỉ hỗ trợ PDF, DOCX, TXT.`
  );
}
