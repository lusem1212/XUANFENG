# LUSEM 个人工作站

> 日历 · 便签 · 客户 · 工地 — 室内设计师的一站式桌面工作台

单文件 HTML 应用，数据存浏览器 localStorage，零依赖、离线可用。

## 预览

### Apple · 玻璃白（默认主题）
![Apple 主题](previews/apple.png)

### 浅色
![浅色主题](previews/light.png)

### 深色
![深色主题](previews/dark.png)

### 粗野主义
![粗野主题](previews/brutal.png)

### 赛博朋克
![赛博主题](previews/cyber.png)

## 功能

- **日历**：当日计划管理、工地提醒、跨阶段预警、农历黄历
- **便签**：瀑布流双列、多内容块、标签关联工地、AI 预判注意事项
- **客户**：楼盘/风格标签、跟进进度、关联便签与日历记录、一键转签约
- **工地**：施工/设计双体系、阶段进度追踪、全局标签
- **AI**：DeepSeek 驱动，便签预判冲突、计划识别标签
- **备份**：JSON 导入导出、自动备份、图片压缩
- **☁ 同步**：Chrome 扩展 + 坚果云 WebDAV，多设备数据同步

## 使用

直接双击 `LUSEM的个人工作站.html` 即可打开，无需安装任何依赖。

## 多设备同步

工作站支持通过 Chrome 扩展 + 坚果云实现多设备数据同步（如办公电脑 ↔ 家里电脑）。

### 安装

1. 下载仓库的 `extensions/` 文件夹（或整个仓库）
2. Chrome 打开 `chrome://extensions/`，开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择 `extensions/` 文件夹
4. Windows 用户可双击 `extensions/安装到Chrome.bat` 一键安装

### 配置

1. 先在 [坚果云](https://www.jianguoyun.com) 获取**应用密码**：
   - 登录 → 右上角头像 → 账户信息 → 安全选项
   - 「第三方应用授权」→ 添加应用 → 输入「工作站同步」→ 复制密码
2. 点浏览器右上角扩展图标 → ⚙ 设置
3. 填入坚果云账号 + 应用密码 + 设备名称（如「办公电脑」）
4. 点「测试连接」确认成功，保存

### 使用

- **手动同步**：点扩展图标 → 「同步」按钮
- **自动同步**：设置中开启「自动同步」，可选间隔（1~30 分钟）
- **推送到云端**：仅上传本地数据
- **从云端拉取**：仅下载云端数据覆盖本地

### 工作原理

```
扩展通过 chrome.scripting 注入页面脚本到 MAIN world
直接读写页面的 localStorage（便签/计划/工地/客户数据）
通过坚果云 WebDAV API 双向同步备份 JSON 文件
```

- 数据源：浏览器 localStorage（`workstation-*` 前缀的 key）
- 同步协议：WebDAV（Basic Auth + 应用密码）
- 云端路径：`坚果云/WebDAV/LUSEM工作站备份/workstation-backup.json`
- 冲突策略：后同步者赢（时间戳对比）

## 技术

- 纯 HTML + CSS + JavaScript，单文件 ~1.2MB（含内嵌视频背景）
- CSS 变量驱动的 5 套主题，一键切换
- localStorage 持久化，数据仅存本地
- Chrome Extension Manifest V3 + WebDAV 同步

---

*Design by LUSEM · Built with Hermes Agent*
