// NoteSkeleton.jsx —— 便签列表骨架屏占位卡片（C5 快速加载）
//
// 用 animate-pulse 的占位卡片模拟 NoteCard 的高度 / 布局，加载中先显示，
// 首屏文本优先（NoteCard 本就不渲染图片，图片由 useImageUrls 惰性生成），
// 故骨架屏仅占位文本区域即可。深浅色 className 成对同步。
export default function NoteSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* 标题条占位 */}
      <div className="mb-3 h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700"></div>
      {/* 正文三行占位 */}
      <div className="mb-2 h-3 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
      <div className="mb-2 h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-700"></div>
      <div className="mb-3 h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700"></div>
      {/* 标签条占位 */}
      <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-700"></div>
    </div>
  );
}
