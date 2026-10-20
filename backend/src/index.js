import "dotenv/config";

import { connectMongo } from "./config/mongodb.js";
import { createContainer } from "./container.js";
import { createApp } from "./app.js";

const app = createApp(createContainer());

// Bắt các Promise bị reject mà không ai xử lý (VD: tác vụ chạy nền) để log ra
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const PORT = process.env.PORT || 4000;

connectMongo().finally(() => {
  app.listen(PORT, () => {
    console.log(`✅ Backend đang chạy tại http://localhost:${PORT}`);
  });
});
