// vite.config.js
// 构建配置：React 插件 + Tailwind v4 插件 + Vitest 测试配置
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 项目站 base：必须是 /<仓库名>/（仓库名即 Pages 子路径）
// 部署仓库名为 XUANFENG → base 为 '/XUANFENG/'
// 若你的仓库名不同，只改 REPO_NAME 这一处即可（保持首尾斜杠）。
const REPO_NAME = 'XUANFENG';

export default defineConfig({
  // Pages 子路径：确保打包后的 JS/CSS 资源以 /XUANFENG/assets/... 正确加载
  base: `/${REPO_NAME}/`,
  // 插件：react(JSX 支持) + tailwindcss(通过 Vite 插件引入，无需独立 config 文件)
  plugins: [react(), tailwindcss()],
  // Vitest 测试相关配置（QA 后续可在此写单测）
  test: {
    environment: 'jsdom', // 模拟浏览器环境，便于测试涉及 DOM/IndexedDB 的代码
    globals: true, // 允许全局使用 describe/it/expect
  },
});
