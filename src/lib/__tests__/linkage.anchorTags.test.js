// linkage.anchorTags.test.js —— 针对「关联注意事项」面板不显示 Bug 的定向单测
//
// Bug 根因：scoreNoteForDiary 原先只从日记正文抽 #标签 + 文本子串匹配，
// 完全没看 anchor.tags(即 diary.tags)。而「工地项目」名存在 item.tags 数组里
// (不是写成 #工地名 正文)，导致共享同一工地项目标签的事件与便签无法联动。
//
// 修复：把锚点自身的 tags 也并入标签匹配集合(anchorTagSet)。
import { describe, it, expect } from 'vitest';
import { scoreNoteForDiary, linkRelatedNotes } from '../linkage.js';

describe('scoreNoteForDiary 锚点 tags 并入匹配（核心 Bug 场景）', () => {
  it('核心 Bug：事件 anchor tags:["某工地"] + 空正文，note 含相同 tags 被关联', () => {
    const anchor = {
      type: 'event',
      title: '',
      body: '',
      tags: ['某工地'],
      date: '2026-07-11',
    };
    const note = {
      type: 'note',
      title: '某工地交底清单',
      body: '正文里没有 #工地 写法',
      tags: ['某工地'],
      date: '',
    };

    const { score, reasons } = scoreNoteForDiary(anchor, note);
    expect(score).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes('标签重叠'))).toBe(true);

    const related = linkRelatedNotes(anchor, [note]);
    expect(related).toContain(note);
  });

  it('回归保护：anchor 同时带 tags 与 body 内 #标签，两者都能命中(合并去重)', () => {
    const anchor = {
      type: 'event',
      title: '巡场',
      body: '今天去 #木工 交底',
      tags: ['某工地', '木工'],
      date: '2026-07-11',
    };
    // note 同时含 #标签提取到的「木工」与锚点 tags 的「某工地」
    const note = {
      type: 'note',
      title: '清单',
      body: 'x',
      tags: ['木工', '某工地', '吊顶'],
      date: '',
    };

    const { score, reasons } = scoreNoteForDiary(anchor, note);
    // 木工(来自正文 #标签 + 锚点tags，去重计 1) + 某工地(锚点tags) = 2 个重叠 → +6
    expect(score).toBe(6);
    expect(reasons.some((r) => r.includes('标签重叠'))).toBe(true);

    const related = linkRelatedNotes(anchor, [note]);
    expect(related).toContain(note);
  });

  it('空标签：anchor tags:[] 且 body 无 #标签、note.tags 无交集 → score 0', () => {
    const anchor = {
      type: 'event',
      title: '',
      body: '完全无关的文字',
      tags: [],
      date: '2026-07-11',
    };
    const note = {
      type: 'note',
      title: '无关便签',
      body: 'x',
      tags: ['咖啡'],
      date: '',
    };

    const { score, reasons } = scoreNoteForDiary(anchor, note);
    expect(score).toBe(0);
    expect(reasons).toEqual([]);

    const related = linkRelatedNotes(anchor, [note]);
    expect(related).not.toContain(note);
  });
});
