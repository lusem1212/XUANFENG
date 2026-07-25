// imageCompress.js —— Canvas API 图片压缩工具
//
// 使用原生 Canvas API 进行图片压缩，不引入第三方库。
// 压缩流程：File → URL.createObjectURL → <img> 加载 → Canvas 绘制（缩放）→ toBlob
// 最长边超过 1600px 时按比例缩小，统一质量参数 0.8。
// GIF 压缩后变为静态首帧（Canvas 不支持动画帧），这是浏览器原生限制。

/** 最长边上限（px） */
export const MAX_EDGE = 1600;

/** 压缩质量（0-1） */
export const QUALITY = 0.8;

/** 支持的图片 MIME 类型 */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * 检查文件类型是否受支持。
 * @param {File} file
 * @returns {boolean}
 */
export function isAcceptedType(file) {
  return ACCEPTED_TYPES.includes(file.type);
}

/**
 * 压缩图片文件。
 * 若最长边超过 MAX_EDGE，按比例缩小；否则保持原尺寸。
 * 输出格式与输入一致（toBlob 使用原 mimeType），统一质量参数 QUALITY。
 * @param {File} file 图片文件
 * @returns {Promise<{blob: Blob, mimeType: string, width: number, height: number}>}
 * @throws {Error} 不支持的格式或压缩失败时抛出
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!isAcceptedType(file)) {
      reject(
        new Error(
          `不支持的图片格式: ${file.type}。支持: ${ACCEPTED_TYPES.join(', ')}`
        )
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      const maxEdge = Math.max(width, height);
      if (maxEdge > MAX_EDGE) {
        const scale = MAX_EDGE / maxEdge;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob 失败'));
            return;
          }
          resolve({ blob, mimeType: file.type, width, height });
        },
        file.type,
        QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };

    img.src = url;
  });
}
