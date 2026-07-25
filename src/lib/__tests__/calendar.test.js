// calendar.test.js —— 月历纯逻辑单测
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseYMD,
  itemsOnDate,
  itemsInMonth,
  buildMonthMatrix,
  daysWithItems,
  parseTitle,
  sortEventsByTime,
  PERIODS,
  PERIOD_ORDER,
} from '../calendar.js';

describe('formatDate / parseYMD', () => {
  it('格式化补零', () => {
    expect(formatDate(2026, 1, 3)).toBe('2026-01-03');
    expect(formatDate(2026, 12, 31)).toBe('2026-12-31');
  });

  it('解析可逆且非法返回 null', () => {
    expect(parseYMD('2026-01-03')).toEqual({ year: 2026, month: 1, day: 3 });
    expect(parseYMD('2026-13-03')).toBeNull();
    expect(parseYMD('nope')).toBeNull();
    expect(parseYMD('')).toBeNull();
  });
});

describe('itemsOnDate', () => {
  const items = [
    { id: '1', type: 'note', date: '2026-01-03', title: 'a' },
    { id: '2', type: 'event', date: '2026-01-03', title: 'b' },
    { id: '3', type: 'note', date: '', title: '无日期便签' }, // 不应出现
    { id: '4', type: 'diary', date: '2026-01-04', title: 'c' },
  ];

  it('返回某天全部类型，排除无日期条目', () => {
    const res = itemsOnDate(items, '2026-01-03');
    expect(res.map((i) => i.id).sort()).toEqual(['1', '2']);
  });

  it('空日期返回空数组', () => {
    expect(itemsOnDate(items, '')).toEqual([]);
    expect(itemsOnDate(items, '2026-02-01')).toEqual([]);
  });
});

describe('itemsInMonth', () => {
  const items = [
    { id: '1', type: 'note', date: '2026-01-15' },
    { id: '2', type: 'event', date: '2026-01-31' },
    { id: '3', type: 'note', date: '2026-02-01' }, // 不在 1 月
    { id: '4', type: 'note', date: '' }, // 无日期
  ];

  it('只取该月条目', () => {
    const res = itemsInMonth(items, 2026, 1);
    expect(res.map((i) => i.id).sort()).toEqual(['1', '2']);
  });
});

describe('buildMonthMatrix', () => {
  it('恒为 42 格（6×7）', () => {
    expect(buildMonthMatrix(2026, 1)).toHaveLength(42);
  });

  it('2026-01 从周四开始，前 4 格为 null', () => {
    const m = buildMonthMatrix(2026, 1);
    expect(m.slice(0, 4)).toEqual([null, null, null, null]);
    expect(m[4]).toBe(1); // 1 号是周四
    expect(m[34]).toBe(31); // 31 天
  });

  it('2 月（非闰年）28 天，月末补齐到 42', () => {
    const m = buildMonthMatrix(2026, 2);
    // 2026-02-01 是周日（前置 0 空白），故 28 号落在索引 27，其后为空白
    expect(m[27]).toBe(28);
    expect(m[28]).toBe(null); // 后置空白
  });
});

describe('daysWithItems', () => {
  const items = [
    { id: '1', type: 'note', date: '2026-03-05' },
    { id: '2', type: 'event', date: '2026-03-05' }, // 同一天多类型仍只记一次
    { id: '3', type: 'diary', date: '2026-03-20' },
    { id: '4', type: 'note', date: '2026-04-01' }, // 不在 3 月
  ];

  it('返回该月有记录的天集合', () => {
    const set = daysWithItems(items, 2026, 3);
    expect(set.has(5)).toBe(true);
    expect(set.has(20)).toBe(true);
    expect(set.size).toBe(2);
    expect(set.has(1)).toBe(false); // 4 月的不算
  });
});

// ---- 时间段解析 & 事件排序（T8 新增） ----
describe('PERIODS / PERIOD_ORDER', () => {
  it('PERIODS 为 5 个时间段且顺序 早上→上午→中午→下午→晚上', () => {
    expect(PERIODS).toEqual(['早上', '上午', '中午', '下午', '晚上']);
    expect(PERIODS).toHaveLength(5);
  });

  it('PERIOD_ORDER 键与 PERIODS 一致，序号 0..4 连续对应', () => {
    expect(Object.keys(PERIOD_ORDER)).toEqual(PERIODS);
    expect(PERIOD_ORDER).toEqual({ 早上: 0, 上午: 1, 中午: 2, 下午: 3, 晚上: 4 });
  });
});

describe('parseTitle', () => {
  it('"上午 09:30" → period 上午, time 09:30', () => {
    expect(parseTitle('上午 09:30')).toEqual({ period: '上午', time: '09:30' });
  });

  it('仅时间段无时间 "晚上" → period 晚上, time 空串', () => {
    expect(parseTitle('晚上')).toEqual({ period: '晚上', time: '' });
  });

  it('不以时间段开头的旧数据 → period 空串, time 为整体标题', () => {
    expect(parseTitle('自由标题旧数据')).toEqual({ period: '', time: '自由标题旧数据' });
  });

  it('空串 → period/time 全空', () => {
    expect(parseTitle('')).toEqual({ period: '', time: '' });
  });

  it('undefined / 无参 → period/time 全空（参数默认值生效）', () => {
    expect(parseTitle(undefined)).toEqual({ period: '', time: '' });
    expect(parseTitle()).toEqual({ period: '', time: '' });
  });

  it('时间段必须出现在开头才识别： "去上午开会" 不应识别为上午', () => {
    const r = parseTitle('去上午开会');
    expect(r.period).toBe(''); // 未识别为时间段
    expect(r.time).toBe('去上午开会'); // 整体作为旧数据标题回退
  });

  it('时间段 + 后续文案： "上午 09:30 开会" → time 含后续文案', () => {
    expect(parseTitle('上午 09:30 开会')).toEqual({ period: '上午', time: '09:30 开会' });
  });
});

describe('sortEventsByTime', () => {
  const mk = (id, title) => ({ id, type: 'event', title });

  it('混合乱序按 早上→上午→中午→下午→晚上 排序', () => {
    const input = [
      mk('e1', '晚上 20:00'),
      mk('e2', '早上 07:00'),
      mk('e3', '上午 09:30'),
      mk('e4', '中午 12:00'),
      mk('e5', '下午 15:00'),
    ];
    expect(sortEventsByTime(input).map((e) => e.id)).toEqual(['e2', 'e3', 'e4', 'e5', 'e1']);
  });

  it('同一时间段内按时间升序（段内排序）', () => {
    const input = [
      mk('a', '上午 10:30'),
      mk('b', '上午 08:00'),
      mk('c', '上午 09:00'),
    ];
    expect(sortEventsByTime(input).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('无时间段（旧数据）排到最后', () => {
    const input = [
      mk('old', '自由标题旧数据'),
      mk('p1', '上午 09:00'),
      mk('p2', '晚上 21:00'),
    ];
    expect(sortEventsByTime(input).map((e) => e.id)).toEqual(['p1', 'p2', 'old']);
  });

  it('不修改入参（返回新数组，原数组顺序不变）', () => {
    const input = [mk('x', '晚上 20:00'), mk('y', '早上 07:00')];
    const snapshot = [...input];
    const out = sortEventsByTime(input);
    expect(out).not.toBe(input); // 返回的是新数组
    expect(input).toEqual(snapshot); // 原数组未被改动
  });

  it('空数组 / undefined / 无参 → 空数组', () => {
    expect(sortEventsByTime([])).toEqual([]);
    expect(sortEventsByTime(undefined)).toEqual([]);
    expect(sortEventsByTime()).toEqual([]);
  });
});
