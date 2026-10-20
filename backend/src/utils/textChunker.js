// Tách văn bản dài thành các đoạn nhỏ (chunk) để:
//  1. Mỗi đoạn nằm trong giới hạn token khi gửi cho model embedding/LLM
//  2. Khi tìm kiếm, chỉ những đoạn liên quan nhất mới được đưa vào ngữ cảnh trả lời
//
// Chiến lược: tách theo đoạn văn (xuống dòng kép), rồi gộp các đoạn liền kề lại
// cho tới khi đạt khoảng "maxChars" ký tự, có chồng lấn (overlap) để không bị mất
// ngữ cảnh ở ranh giới giữa 2 chunk.

export function splitIntoChunks(rawText, { maxChars = 900, overlap = 150 } = {}) {
  const cleaned = rawText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length <= maxChars) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }

    if (current) chunks.push(current);

    // Nếu 1 đoạn văn đã dài hơn maxChars thì cắt cứng theo ký tự
    if (paragraph.length > maxChars) {
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + maxChars, paragraph.length);
        chunks.push(paragraph.slice(start, end));
        start = end - overlap;
        if (start < 0) start = 0;
        if (end === paragraph.length) break;
      }
      current = "";
    } else {
      current = paragraph;
    }
  }

  if (current) chunks.push(current);

  return chunks.filter((c) => c.trim().length > 0);
}
