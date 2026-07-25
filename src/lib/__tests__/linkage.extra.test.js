// linkage.extra.test.js —— 联动打分 / 排序 / 过滤 / MVP 验收闭环（QA：严过关）
// 在已有 linkage.test.js 基础上补充：精确打分、排序、无 false positive、blueprint 四步验收
// 注意：v2 起联动与检索完全基于「标签 + 日期邻近」。
import { describe, it, expect } from 'vitest';
import { scoreNoteForDiary, linkRelatedNotes } from '../linkage.js';

describe('scoreNoteForDiary 精确打分', () => {
  it('标签重叠 n 个 = +3n（n=2 → +6）', () => {
    const diary = { date: '2026-07-11', title: '周六', body: '木工 工地 巡场' };
    const note = { id: 't1', type: 'note', tags: ['木工', '工地', '吊顶'], date: '' };
    const { score, reasons } = scoreNoteForDiary(diary, note);
    // 正文只出现 木工、工地，吊顶未出现 → 重叠 2 个 → +6
    expect(score).toBe(6);
    expect(reasons.some((r) => r.includes('标签重叠'))).toBe(true);
  });

  it('标签重叠 n=3 → +9', () => {
    const diary = { date: '2026-07-11', title: '', body: '木工 工地 吊顶' };
    const note = { id: 't2', type: 'note', tags: ['木工', '工地', '吊顶'], date: '' };
    const { score } = scoreNoteForDiary(diary, note);
    expect(score).toBe(9);
  });

  it('日期邻近 ≤7 天（相差 4 天）→ +2 且 reasons 含「日期邻近」', () => {
    const diary = { date: '2026-07-11', title: '周六', body: '无关内容' };
    const note = { id: 'd1', type: 'note', tags: [], date: '2026-07-15' };
    const { score, reasons } = scoreNoteForDiary(diary, note);
    expect(score).toBe(2);
    expect(reasons.some((r) => r.includes('日期邻近'))).toBe(true);
  });

  it('日期正好 7 天 → 仍计入 +2', () => {
    const diary = { date: '2026-07-11', title: '周六', body: '无关内容' };
    const note = { id: 'd2', type: 'note', tags: [], date: '2026-07-18' };
    const { score } = scoreNoteForDiary(diary, note);
    expect(score).toBe(2);
  });

  it('日期相差 >7 天（9 天）→ 不加日期分，且无其他命中 = 0', () => {
    const diary = { date: '2026-07-11', title: '周六', body: '无关内容' };
    const note = { id: 'd3', type: 'note', tags: [], date: '2026-07-20' };
    const { score } = scoreNoteForDiary(diary, note);
    expect(score).toBe(0);
  });

  it('无任何命中（无标签/无邻近日期）返回 score 0 且 reasons 为空', () => {
    const diary = { date: '2026-07-11', title: '周六', body: '完全无关的文字' };
    const note = { id: 'z1', type: 'note', tags: [], date: '' };
    const { score, reasons } = scoreNoteForDiary(diary, note);
    expect(score).toBe(0);
    expect(reasons).toEqual([]);
  });

  it('组合命中：标签 +3 + 日期 +2 = 5', () => {
    const diary = { date: '2026-07-11', title: '周六', body: '周六去工地 #木工 交底' };
    const note = { id: 'c1', type: 'note', tags: ['木工'], date: '2026-07-13' };
    const { score, reasons } = scoreNoteForDiary(diary, note);
    expect(score).toBe(5);
    expect(reasons.some((r) => r.includes('标签重叠'))).toBe(true);
    expect(reasons.some((r) => r.includes('日期邻近'))).toBe(true);
  });
});

describe('linkRelatedNotes 排序与过滤', () => {
  // 日记正文包含「木工交底」「#木工」，用于标签命中
  const diary = { date: '2026-07-11', title: '周六', body: '周六去工地木工交底 #木工' };
  const items = [
    { id: 'low', type: 'note', tags: [], date: '2026-07-15' }, // 仅日期邻近 +2
    { id: 'mid', type: 'note', tags: ['木工'], date: '' }, // 仅标签重叠 +3
    { id: 'high', type: 'note', tags: ['木工', '工地'], date: '' }, // 标签重叠 2 个 +6
    { id: 'unrelated', type: 'note', tags: ['咖啡'], date: '' }, // 0 分
    { id: 'ad', type: 'diary', date: '2026-07-11', title: '日记', body: 'x' }, // 非 note
    { id: 'ev', type: 'event', date: '2026-07-11', title: '事件', body: 'y' }, // 非 note
  ];

  it('按分数从高到低排序', () => {
    const related = linkRelatedNotes(diary, items);
    expect(related.map((n) => n.id)).toEqual(['high', 'mid', 'low']);
  });

  it('无 false positive：无关便签（0 分）不返回', () => {
    const related = linkRelatedNotes(diary, items);
    expect(related.map((n) => n.id)).not.toContain('unrelated');
  });

  it('只返回 note，过滤 diary / event 类型', () => {
    const related = linkRelatedNotes(diary, items);
    expect(related.every((n) => n.type === 'note')).toBe(true);
    expect(related.map((n) => n.id)).not.toContain('ad');
    expect(related.map((n) => n.id)).not.toContain('ev');
  });

  it('空 / 非法输入返回空数组', () => {
    expect(linkRelatedNotes(null, null)).toEqual([]);
    expect(linkRelatedNotes(diary, [])).toEqual([]);
    expect(linkRelatedNotes(null, items)).toEqual([]);
  });
});

describe('MVP 验收闭环（blueprint 四步）', () => {
  // 步骤1：新增便签
  const note = {
    type: 'note',
    title: '木工交底清单',
    body: '吊顶龙骨点位',
    tags: ['木工', '工地', '吊顶'],
    date: '',
  };
  // 步骤2：写日记
  const diary = {
    type: 'diary',
    date: '2026-07-11',
    title: '周六',
    body: '周六去工地木工交底',
  };

  it('步骤3：linkRelatedNotes 包含该便签，且 reasons 含「标签重叠」', () => {
    const related = linkRelatedNotes(diary, [note]);
    expect(related).toContain(note); // 该便签被关联到

    const { reasons } = scoreNoteForDiary(diary, note);
    // reasons 中应存在 标签重叠（日记正文包含 note.tags 中的词）
    expect(reasons.some((r) => r.startsWith('标签重叠'))).toBe(true);
  });

  it('步骤4：再给一条带 date 且与 diary.date 相差 ≤7 天的便签，reasons 含「日期邻近」', () => {
    const nearNote = {
      type: 'note',
      title: '邻近便签',
      body: 'x',
      tags: [],
      date: '2026-07-15', // 与 2026-07-11 相差 4 天，≤7
    };
    const { reasons } = scoreNoteForDiary(diary, nearNote);
    expect(reasons.some((r) => r.includes('日期邻近'))).toBe(true);
  });
});
