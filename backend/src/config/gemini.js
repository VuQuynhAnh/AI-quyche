// Cấu hình client Google Gemini dùng chung.
// Lấy API key miễn phí tại: https://aistudio.google.com/app/apikey
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[gemini] Chưa cấu hình GEMINI_API_KEY trong file .env — các API liên quan tới AI sẽ báo lỗi."
  );
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const chatModel = genAI.getGenerativeModel({
  // Lịch sử đổi model chat (Google liên tục gỡ các model cũ khỏi API):
  //   "gemini-2.0-flash"      -> 404 (gỡ bỏ)
  //   "gemini-3.6-flash"      -> chạy được nhưng hay 503 "high demand"
  //   "gemini-2.5-flash-lite" -> 404 "không còn cho user mới"
  // Hiện dùng "gemini-3.5-flash-lite" theo đúng model Google chỉ định thay thế
  // trong thông báo lỗi gần nhất — vẫn là dòng "flash-lite" nhẹ/nhanh, phù hợp
  // chatbot hỏi-đáp đơn giản. Nếu sau này Google lại đổi, thông báo lỗi trả về
  // từ Gemini luôn ghi rõ tên model thay thế được khuyến nghị.
  model: process.env.GEMINI_CHAT_MODEL || "gemini-3.5-flash-lite",
});

export const embeddingModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
});
