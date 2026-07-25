// imageStore.js —— IndexedDB images store 的 CRUD 封装
//
// 图片以 Blob 形式存储在独立的 images store 中，不在 item body 中内联 base64。
// body 条目通过 images: string[] 字段引用 imageId。
// 图片 ID 使用 createId()（crypto.randomUUID），与 itemId 格式一致。

import { getDB } from './db.js';
import { createId } from './model.js';

const STORE = 'images';

/**
 * 新增图片到 IndexedDB，返回生成的 imageId。
 * @param {Blob} blob 图片二进制数据（通常为压缩后的 Blob）
 * @param {string} mimeType 图片 MIME 类型（如 'image/jpeg'）
 * @param {number} width 图片宽度（px）
 * @param {number} height 图片高度（px）
 * @returns {Promise<string>} imageId
 */
export async function addImage(blob, mimeType, width, height) {
  const db = await getDB();
  const id = createId();
  const record = {
    id,
    blob,
    mimeType,
    width,
    height,
    size: blob.size,
    createdAt: Date.now(),
  };
  await db.put(STORE, record);
  return id;
}

/**
 * 读取图片记录。
 * @param {string} id imageId
 * @returns {Promise<Object|null>} ImageRecord 或 null
 */
export async function getImage(id) {
  const db = await getDB();
  return (await db.get(STORE, id)) || null;
}

/**
 * 删除单张图片。
 * @param {string} id imageId
 * @returns {Promise<void>}
 */
export async function deleteImage(id) {
  const db = await getDB();
  await db.delete(STORE, id);
}

/**
 * 批量删除图片。
 * @param {string[]} ids imageId 数组
 * @returns {Promise<void>}
 */
export async function deleteImages(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(STORE, 'readwrite');
  await Promise.all(ids.map((id) => tx.objectStore(STORE).delete(id)));
  await tx.done;
}

/**
 * 从 note 的 body 条目中提取所有 imageId。
 * 遍历 note.body 中每个 entry 的 images 数组，收集全部 imageId。
 * @param {Object} note 便签 Item 对象
 * @returns {string[]} imageId 数组（可能为空）
 */
export function extractImageIdsFromNote(note) {
  if (!note || !Array.isArray(note.body)) return [];
  const ids = [];
  for (const entry of note.body) {
    if (Array.isArray(entry?.images)) {
      ids.push(...entry.images);
    }
  }
  return ids;
}
