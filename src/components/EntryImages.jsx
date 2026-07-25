// EntryImages.jsx —— 单条目图片管理组件
//
// props:
//   imageIds      —— 当前条目的图片 ID 数组（string[]）
//   onAddImages   —— 添加图片回调，接收新 imageId 数组
//   onRemoveImage —— 删除单张图片回调，接收 imageId
//
// 功能：
//   - 缩略图网格展示（grid-cols-4，每张 64×64 圆角）
//   - 上传按钮（隐藏 file input，支持多选）
//   - 点击缩略图打开 ImageLightbox 大图浮层
//   - 右上角 × 删除单张图片（同时从 IndexedDB 删除）
//   - 软上限 10 张：达到时隐藏上传按钮
//   - dark: 变体适配
//
// 注意：粘贴支持由 NoteEditor 的 textarea onPaste 处理，此处不重复。

import { useState, useRef } from 'react';
import { useImageUrls } from '../hooks/useImageUrls.js';
import { compressImage } from '../lib/imageCompress.js';
import { addImage, deleteImage } from '../lib/imageStore.js';
import ImageLightbox from './ImageLightbox.jsx';

/** 每条目最多图片数 */
const MAX_IMAGES = 10;

export default function EntryImages({ imageIds = [], onAddImages, onRemoveImage }) {
  const urls = useImageUrls(imageIds);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const fileInputRef = useRef(null);

  /**
   * 文件选择处理：对每个文件压缩 → 存储 → 收集 imageId → 回调
   * @param {Event} e file input change 事件
   */
  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // 重置，允许重复选择同一文件
    if (files.length === 0) return;

    const newIds = [];
    for (const file of files) {
      try {
        const { blob, mimeType, width, height } = await compressImage(file);
        const id = await addImage(blob, mimeType, width, height);
        newIds.push(id);
      } catch (err) {
        console.error('图片处理失败:', err);
        alert(err.message || '图片处理失败');
      }
    }
    if (newIds.length > 0) {
      onAddImages(newIds);
    }
  }

  /**
   * 删除单张图片：先从 IndexedDB 删除，再回调更新 UI
   * @param {string} imageId
   */
  async function handleRemoveImage(imageId) {
    try {
      await deleteImage(imageId);
    } catch (err) {
      console.error('图片删除失败:', err);
    }
    onRemoveImage(imageId);
  }

  const count = imageIds.length;
  const canAddMore = count < MAX_IMAGES;

  return (
    <div className="mt-2">
      {/* 缩略图网格 */}
      {count > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {imageIds.map((id, idx) => {
            const url = urls[idx];
            return (
              <div
                key={id}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full cursor-pointer object-cover"
                    onClick={() => setLightboxSrc(url)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-200 dark:bg-slate-700">
                    <span className="text-xs text-slate-400">…</span>
                  </div>
                )}
                {/* 右上角删除按钮 */}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(id)}
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/50 text-xs leading-none text-white hover:bg-black/70"
                  aria-label="删除图片"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 上传按钮（达到上限时隐藏） */}
      {canAddMore && (
        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ＋ 添加图片
          </button>
        </div>
      )}

      {/* 大图浮层 */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
