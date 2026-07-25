// db.test.js —— IndexedDB 持久化往返测试（QA：严过关，可选加分项）
// 依赖 fake-indexeddb 提供 jsdom 缺失的 IndexedDB 实现（仅加入 devDependencies）
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  addItem,
  getAllItems,
  getDiaryByDate,
  getItemsByType,
  updateItem,
  deleteItem,
} from '../db.js';

describe('db.js 持久化往返 (fake-indexeddb)', () => {
  it('addItem → getAllItems → getDiaryByDate → getItemsByType → updateItem → deleteItem 往返正确', async () => {
    const note = {
      id: 'n1',
      type: 'note',
      date: '',
      title: '木工交底清单',
      body: '吊顶龙骨点位',
      tags: ['木工'],
      links: [],
      createdAt: Date.now(),
    };
    const diary = {
      id: 'd1',
      type: 'diary',
      date: '2026-07-11',
      title: '周六',
      body: '去工地木工交底',
      tags: [],
      links: [],
      createdAt: Date.now(),
    };

    // 写入便签与日记
    await addItem(note);
    await addItem(diary);

    // 读取全部
    const all = await getAllItems();
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.id).sort()).toEqual(['d1', 'n1']);

    // 按日期取日记
    const gotDiary = await getDiaryByDate('2026-07-11');
    expect(gotDiary).not.toBeNull();
    expect(gotDiary.id).toBe('d1');
    expect(gotDiary.type).toBe('diary');

    // 当天没有日记 → null
    expect(await getDiaryByDate('2026-07-12')).toBeNull();

    // 按类型取便签
    const notes = await getItemsByType('note');
    expect(notes.map((i) => i.id)).toEqual(['n1']);

    // 更新（idb 的 put 覆盖）
    const updated = { ...note, title: '更新后的标题' };
    await updateItem(updated);
    const afterUpdate = await getAllItems();
    expect(afterUpdate.find((i) => i.id === 'n1').title).toBe('更新后的标题');

    // 删除
    await deleteItem('n1');
    const afterDelete = await getAllItems();
    expect(afterDelete.map((i) => i.id)).toEqual(['d1']);
  });
});
