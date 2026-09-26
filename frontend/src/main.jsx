import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import "bootstrap/dist/css/bootstrap.min.css";
// Bundle JS của Bootstrap (kèm Popper) — cần cho các component có tương tác
// bằng JS (dropdown, modal...) dùng ở các trang quản trị.
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "./styles/custom.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* Bọc NGOÀI App (không riêng từng trang) để mọi trang đều gọi được
            useNotification() — thay cho window.confirm()/window.alert() gốc
            của trình duyệt, xem context/NotificationContext.jsx. */}
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
