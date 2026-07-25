// useItems.js —— React Hook：负责 Item 的加载与增删改，并维护内存 state
//
// 组件只调用这里暴露的方法，不直接碰数据库；数据变化后自动刷新内存列表，
// 保证 UI 与 IndexedDB 一致。
//
// v2 增强：删除便签时级联删除关联图片（先删 images store 中的图片，再删 item）。
import { useState, useEffect, useCallback } from 'react';
import {
  getAllItems,
  addItem,
  updateItem,
  deleteItem,
  getDiaryByDate,
} from '../lib/db.js';
import { createItem, ITEM_TYPES } from '../lib/model.js';
import { syncTagsFromItems } from '../lib/siteProjects.js';
import { extractImageIdsFromNote, deleteImages } from '../lib/imageStore.js';

export function useItems() {
  const [items, setItems] = useState([]); // 内存中的全部 Item
  const [loading, setLoading] = useState(true); // 首次加载标记

  // 从数据库重新读取全部 Item（写操作后调用以同步内存）。
  // 读取后会把历史 item.tags 中"非默认预设"的标签同步进工地项目独立词库
  // （nd_site_projects），并顺带清理上一轮误写入 nd_preset_tags 的工地项目词；
  // 工地项目词库与 TagSelect 的 nd_preset_tags 完全分离、互不污染。
  const refresh = useCallback(async () => {
    const all = await getAllItems();
    setItems(all);
    syncTagsFromItems(all);
  }, []);

  // 首次挂载加载数据
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // 新增或更新一个 Item：
  // 若 items 中已存在同 id 则 update，否则 add。
  const upsertItem = useCallback(
    async (item) => {
      const exists = items.some((it) => it.id === item.id);
      if (exists) {
        await updateItem(item);
      } else {
        await addItem(item);
      }
      await refresh();
    },
    [items, refresh]
  );

  // 对外暴露的「保存便签」：直接 upsert 即可
  const saveItem = useCallback(
    (item) => upsertItem(item),
    [upsertItem]
  );

  // 删除便签（按 id）：级联删除关联图片
  // 步骤：1. 从内存 items 中找到该 item  2. 提取所有 imageId  3. 批量删除图片  4. 删除 item 本身  5. 刷新
  const removeItem = useCallback(
    async (id) => {
      // 从内存中找到该 item，提取并删除关联图片
      const item = items.find((it) => it.id === id);
      if (item) {
        const imageIds = extractImageIdsFromNote(item);
        if (imageIds.length > 0) {
          await deleteImages(imageIds);
        }
      }
      await deleteItem(id);
      await refresh();
    },
    [items, refresh]
  );

  /**
   * 保存某一天的日记。一天一条：若该日期已有 diary 则更新，否则新建。
   * @param {Object} param0 { date, title, body, tags }
   * @returns {Promise<Object>} 保存后的 diary Item
   */
  const saveDiary = useCallback(
    async ({ date, title = '', body = '', tags = [] }) => {
      const existing = await getDiaryByDate(date);
      const diary = existing
        ? { ...existing, title, body, tags }
        : createItem({
            type: ITEM_TYPES.DIARY,
            date,
            title,
            body,
            tags,
          });
      await upsertItem(diary);
      return diary;
    },
    [upsertItem]
  );

  /**
   * 批量导入记录：对每条传入的 item，按其 id 是否已存在决定新增或更新，
   * 全部写入后统一 refresh()（刷新内存并同步标签池）。
   * 导入为"合并"语义（按 id upsert），不覆盖整库。
   * @param {Array<Object>} incoming 待导入的 item 数组
   * @returns {Promise<number>} 实际写入的条数
   */
  const importItems = useCallback(
    async (incoming) => {
      if (!Array.isArray(incoming)) return 0;
      let count = 0;
      for (const item of incoming) {
        if (!item || !item.id || !item.type) continue;
        const exists = items.some((it) => it.id === item.id);
        if (exists) {
          await updateItem(item);
        } else {
          await addItem(item);
        }
        count += 1;
      }
      await refresh();
      return count;
    },
    [items, refresh, addItem, updateItem]
  );

  return {
    items,
    loading,
    saveItem,
    deleteItem: removeItem,
    saveDiary,
    refresh,
    importItems,
  };
}
