// linkage.test.js —— 联动纯函数的示例单测（QA 可在此基础上补充）
import { describe, it, expect } from 'vitest';
import { linkRelatedNotes, scoreNoteForDiary, extractTags, dateDiffDays } from '../linkage.js';
import { filterNotes } from '../search.js';

describe('extractTags', () => {
  it('从正文提取 #标签', () => {
    expect(extractTags('周六去 #木工 交底')).toEqual(['木工']);
  });
  it('空文本返回空数组', () => {
    expect(extractTags('')).toEqual([]);
  });
});

describe('dateDiffDays', () => {
  it('计算相差天数', () => {
    expect(dateDiffDays('2026-07-01', '2026-07-08')).toBe(7);
  });
  it('非法输入返回 null', () => {
    expect(dateDiffDays('', '2026-07-08')).toBeNull();
  });
});

describe('linkRelatedNotes', () => {
  // 日记正文包含「木工」「工地」（直接命中 note.tags），用于标签重叠匹配
  const diary = { date: '2026-07-10', title: '周六', body: '去工地木工交底' };
  const items = [
    { id: '1', type: 'note', title: '交底清单', tags: ['木工', '工地', '吊顶'], date: '' },
    { id: '2', type: 'note', title: '无关的便签', tags: ['咖啡'], date: '' },
  ];

  it('按标签匹配关联到便签', () => {
    const related = linkRelatedNotes(diary, items);
    expect(related.map((n) => n.id)).toContain('1');
    expect(related.map((n) => n.id)).not.toContain('2');
  });

  it('打分：命中的便签 score>0', () => {
    const { score, reasons } = scoreNoteForDiary(diary, items[0]);
    expect(score).toBeGreaterThan(0);
    expect(reasons.length).toBeGreaterThan(0);
  });
});

describe('filterNotes', () => {
  const notes = [
    { id: '1', type: 'note', title: 'A', body: '木工', tags: ['木工'] },
    { id: '2', type: 'note', title: 'B', body: '咖啡', tags: ['咖啡'] },
  ];
  it('按关键词筛选', () => {
    expect(filterNotes(notes, { keyword: '咖啡' }).map((n) => n.id)).toEqual(['2']);
  });
  it('按标签筛选', () => {
    expect(filterNotes(notes, { tags: ['木工'] }).map((n) => n.id)).toEqual(['1']);
  });
});
