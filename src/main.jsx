import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css"; // 引入全局样式（含 Tailwind）

// React 18 的入口写法：把 <App /> 挂载到 index.html 的 #root 节点
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
