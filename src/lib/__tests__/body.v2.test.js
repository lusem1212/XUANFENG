// body.v2.test.js —— body.js v2/v3 增量测试（QA：严过关）
// 验证需求1/2：body 条目数组格式化 + images 字段兼容
// v3(C3) 更新：
//   - 涉及时间的断言更新为 'MM-DD HH:MM' 新格式（配合 formatEntryTime 生成）；
//   - 新增 formatEntryTime 单测（格式 / 补零 / 默认值）；
//   - 保留旧 'HH:MM' 格式在 formatBody 下的兼容断言（旧数据兼容守护）。
import { describe, it, expect } from 'vitest';
import { formatBody, formatEntryTime } from '../body.js';

describe('body.js v2 — formatBody 条目数组（含 images 字段，新格式 MM-DD HH:MM）', () => {
  it('多条目格式化为 [MM-DD HH:MM] text 格式', () => {
    const body = [
      { time: '07-24 09:00', text: '木工进场', images: ['img1'] },
      { time: '07-24 14:00', text: '吊顶龙骨', images: [] },
    ];
    expect(formatBody(body)).toBe('[07-24 09:00] 木工进场\n[07-24 14:00] 吊顶龙骨');
  });

  it('条目带 images 字段不影响文本格式化', () => {
    const body = [
      { time: '07-24 09:00', text: '有图片的条目', images: ['img1', 'img2', 'img3'] },
    ];
    expect(formatBody(body)).toBe('[07-24 09:00] 有图片的条目');
  });

  it('time 为空的条目只显示 text', () => {
    const body = [
      { time: '', text: '无时间条目', images: ['img1'] },
    ];
    expect(formatBody(body)).toBe('无时间条目');
  });

  it('条目同时缺少 time 和 text（只有 images）→ 被过滤', () => {
    const body = [
      { time: '', text: '', images: ['img1'] },
      { time: '07-24 10:00', text: '有效条目', images: [] },
    ];
    expect(formatBody(body)).toBe('[07-24 10:00] 有效条目');
  });

  it('空数组返回空字符串', () => {
    expect(formatBody([])).toBe('');
  });

  it('字符串 body 原样返回（兼容旧数据）', () => {
    expect(formatBody('一些旧内容')).toBe('一些旧内容');
  });

  it('null/undefined 返回空字符串', () => {
    expect(formatBody(null)).toBe('');
    expect(formatBody(undefined)).toBe('');
  });
});

describe('body.js v3(C3) — formatEntryTime 时间生成', () => {
  it('返回 MM-DD HH:MM 格式并正确补零（示例 2026-07-24 17:26）', () => {
    const d = new Date(2026, 6, 24, 17, 26); // 注意：月份 0 基，6 = 七月
    expect(formatEntryTime(d)).toBe('07-24 17:26');
  });

  it('个位数月/日/时/分均补零到两位', () => {
    const d = new Date(2026, 2, 5, 8, 3); // 2026-03-05 08:03
    expect(formatEntryTime(d)).toBe('03-05 08:03');
  });

  it('默认（不传参）返回符合 ^\\d{2}-\\d{2} \\d{2}:\\d{2}$ 的当前时间串', () => {
    const s = formatEntryTime();
    expect(s).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(s.length).toBe(11);
  });
});

describe('body.js v3(C3) — 旧 HH:MM 格式在 formatBody 下仍原样兼容（回归守护）', () => {
  it('旧数据 time 为 HH:MM 时仍原样包进 [time]', () => {
    const body = [
      { time: '09:00', text: '木工进场', images: ['img1'] },
      { time: '14:00', text: '吊顶龙骨', images: [] },
    ];
    expect(formatBody(body)).toBe('[09:00] 木工进场\n[14:00] 吊顶龙骨');
  });

  it('混合旧 HH:MM 与新 MM-DD HH:MM 均可正确渲染', () => {
    const body = [
      { time: '09:00', text: '旧格式条目' },
      { time: '07-24 15:30', text: '新格式条目' },
    ];
    expect(formatBody(body)).toBe('[09:00] 旧格式条目\n[07-24 15:30] 新格式条目');
  });
});
