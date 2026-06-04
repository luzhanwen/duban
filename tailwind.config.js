/** @type {import('tailwindcss').Config} */
// Tailwind 配置：定义在哪些文件里查找 class，以及自定义阅读主题
export default {
  // content 告诉 Tailwind 去哪些文件里扫描用到的 class，没扫描到的样式会被裁剪掉
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // 自定义颜色：营造安静、偏暖的阅读氛围
      colors: {
        paper: "#f7f3ec", // 偏暖的米白底色（页面背景）
        "paper-card": "#fffdf8", // 卡片/面板背景，比底色略亮
        ink: "#2b2622", // 正文主色（接近黑但偏暖的深褐）
        "ink-soft": "#6b6258", // 次要文字（说明、提示）
        accent: "#9c6b3f", // 强调色（按钮、链接，暖棕）
        line: "#e6ddcf", // 分隔线/边框颜色
      },
      // 字体：正文阅读区用衬线字体，界面其余部分用无衬线
      fontFamily: {
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
        sans: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
