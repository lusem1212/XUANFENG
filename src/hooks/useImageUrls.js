// useImageUrls.js —— ObjectURL 生命周期管理 hook
//
// 根据 imageIds 从 IndexedDB 批量读取 Blob 并创建 ObjectURL，
// 在组件卸载或 imageIds 变化时自动 revoke 所有已创建的 ObjectURL。
// useEffect 依赖项使用 imageIds.join(',') 派生字符串，避免数组引用变化导致无限重渲染。

import { useState, useEffect } from 'react';
import { getImage } from '../lib/imageStore.js';

/**
 * 根据 imageIds 批量加载图片 ObjectURL。
 * @param {string[]} imageIds 图片 ID 数组
 * @returns {(string|null)[]} ObjectURL 数组，null 表示该图片未找到
 */
export function useImageUrls(imageIds) {
  const [urls, setUrls] = useState([]);

  // 用 join(',') 作为依赖，避免数组引用变化导致无限循环
  const depKey = Array.isArray(imageIds) ? imageIds.join(',') : '';

  useEffect(() => {
    const ids = Array.isArray(imageIds) ? imageIds.filter(Boolean) : [];
    if (ids.length === 0) {
      setUrls([]);
      return;
    }

    let cancelled = false;
    const created = [];

    Promise.all(ids.map((id) => getImage(id))).then((records) => {
      if (cancelled) return;
      const newUrls = records.map((rec) => {
        if (!rec || !rec.blob) return null;
        const url = URL.createObjectURL(rec.blob);
        created.push(url);
        return url;
      });
      setUrls(newUrls);
    });

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return urls;
}
