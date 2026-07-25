// search.test.js —— 便签筛选 filterNotes 单元测试（QA：严过关）
// 覆盖：关键词大小写不敏感（标题/正文/标签，含 body 数组兼容）、tags 或关系、多条件组合
import { describe, it, expect } from 'vitest';
import { filterNotes } from '../search.js';

const notes = [
  { id: '1', type: 'note', title: 'Woodwork 交底清单', body: 'Ceiling 龙骨', tags: ['wood', 'site'] },
  { id: '2', type: 'note', title: '咖啡笔记', body: 'Coffee time', tags: ['coffee'] },
  { id: '3', type: 'note', title: '工地巡场', body: '检查记录', tags: ['site'] },
];

describe('filterNotes 关键词', () => {
  it('大小写不敏感：大写关键词匹配标题中的英文', () => {
    expect(filterNotes(notes, { keyword: 'WOOD' }).map((n) => n.id)).toEqual(['1']);
  });

  it('中文关键词匹配标题', () => {
    expect(filterNotes(notes, { keyword: '咖啡' }).map((n) => n.id)).toEqual(['2']);
  });

  it('关键词匹配标签字段', () => {
    // 'site' 出现在 1、3 的 tags 中
    expect(filterNotes(notes, { keyword: 'site' }).map((n) => n.id).sort()).toEqual(['1', '3']);
  });

  it('关键词匹配字符串 body', () => {
    expect(filterNotes(notes, { keyword: 'Ceiling' }).map((n) => n.id)).toEqual(['1']);
  });

  it('无匹配返回空', () => {
    expect(filterNotes(notes, { keyword: 'zzz' })).toEqual([]);
  });
});

describe('filterNotes 标签（或关系）', () => {
  it('命中任意一个标签即保留', () => {
    // wood → 1，coffee → 2；二者取并集
    expect(filterNotes(notes, { tags: ['wood', 'coffee'] }).map((n) => n.id).sort()).toEqual(['1', '2']);
  });

  it('标签都不命中则返回空', () => {
    expect(filterNotes(notes, { tags: ['nonexist'] })).toEqual([]);
  });
});

describe('filterNotes body 数组兼容', () => {
  const arrNotes = [
    {
      id: 'a',
      type: 'note',
      title: '项目A',
      body: [
        { time: '09:00', text: '木工交底' },
        { time: '10:00', text: '验收风管' },
      ],
      tags: [],
    },
    { id: 'b', type: 'note', title: '项目B', body: [{ time: '', text: '咖啡采购' }], tags: [] },
  ];

  it('body 为条目数组时按各条 text 拼接匹配关键词', () => {
    expect(filterNotes(arrNotes, { keyword: '验收' }).map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(arrNotes, { keyword: '木工' }).map((n) => n.id)).toEqual(['a']);
  });

  it('空 time 的条目其 text 仍可匹配', () => {
    expect(filterNotes(arrNotes, { keyword: '咖啡' }).map((n) => n.id)).toEqual(['b']);
  });

  it('数组里都不含该词则返回空', () => {
    expect(filterNotes(arrNotes, { keyword: '不存在' })).toEqual([]);
  });
});

describe('filterNotes 多条件组合（AND）', () => {
  it('关键词 + 标签 同时满足', () => {
    const r = filterNotes(notes, { keyword: 'wood', tags: ['wood'] });
    expect(r.map((n) => n.id)).toEqual(['1']);
  });

  it('标签与关键词无交集则返回空', () => {
    // 关键词 site 命中 1/3，但 coffee 标签只命中 2 → 无交集
    expect(filterNotes(notes, { keyword: 'site', tags: ['coffee'] })).toEqual([]);
  });
});

describe('filterNotes 边界', () => {
  it('空 notes 返回空', () => {
    expect(filterNotes([], { keyword: 'x' })).toEqual([]);
  });

  it('所有条件缺省返回全部', () => {
    expect(filterNotes(notes, {}).map((n) => n.id).sort()).toEqual(['1', '2', '3']);
  });
});
