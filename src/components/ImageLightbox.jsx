// ImageLightbox.jsx —— 全屏图片浮层组件
//
// props:
//   src     —— 图片 ObjectURL（由父组件传入，父组件管理生命周期）
//   onClose —— 关闭回调
//
// 关闭方式：Esc 键 / 遮罩点击 / 右上角 × 按钮

import { useEffect } from 'react';

export default function ImageLightbox({ src, onClose }) {
  // Esc 键关闭
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* 右上角关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl leading-none text-white hover:bg-white/30"
        aria-label="关闭"
      >
        ×
      </button>

      {/* 图片：点击不冒泡（防止误关闭） */}
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
