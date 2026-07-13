/** @type {import('tailwindcss').Config} */
// Tailwind 配置：定义在哪些文件里查找 class，以及自定义阅读主题
export default {
  // content 告诉 Tailwind 去哪些文件里扫描用到的 class，没扫描到的样式会被裁剪掉
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // 自定义颜色：营造安静、偏暖的阅读氛围
      colors: {
        paper: "#F7F1E6", // 米纸底色（页面背景）
        "paper-card": "#FBF6EC", // 卡片/面板背景，比底色略亮
        "paper-muted": "#EFE5D6", // 次级分区、悬停底色
        ink: "#2B2622", // 主墨色（标题、高优先级正文）
        "ink-soft": "#5F554A", // 次墨色（正文、说明）
        "ink-muted": "#8A7664", // 弱提示、时间、元信息
        accent: "#B94132", // 朱砂强调色（按钮、链接、状态、印章）
        "accent-hover": "#A7382D", // 朱砂 hover
        "accent-soft": "#DFA093", // 浅朱砂背景、轻提示
        line: "#E3D6C6", // 柔和纸边
        "line-strong": "#D3C1AD", // 重点边框、选中框
        "progress-track": "#E6DAC9", // 进度条轨道
      },
      // 字体：产品界面与阅读正文统一使用全局宋体变量，品牌字标另行管理
      fontFamily: {
        serif: ["var(--font-app-cn)"],
        sans: ["var(--font-app-cn)"],
        latin: ['"Inter"', '"SF Pro Text"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
