// model.test.js —— 统一数据模型单元测试（QA：严过关）
// 覆盖：parseTags 边界、createItem 字段默认值完整性、today() 格式、createId/ITEM_TYPES
import { describe, it, expect } from 'vitest';
import {
  ITEM_TYPES,
  createId,
  parseTags,
  createItem,
  today,
} from '../model.js';

describe('ITEM_TYPES 常量', () => {
  it('三种类型值正确', () => {
    expect(ITEM_TYPES.NOTE).toBe('note');
    expect(ITEM_TYPES.DIARY).toBe('diary');
    expect(ITEM_TYPES.EVENT).toBe('event');
  });
});

describe('parseTags 边界', () => {
  it('纯数组输入：原样清洗并去空', () => {
    // 已经是数组：逐元素去除 # 号、trim，并过滤空字符串
    expect(parseTags(['木工', '工地', '吊顶'])).toEqual(['木工', '工地', '吊顶']);
  });

  it('数组元素带 # 号与空格也能清洗', () => {
    expect(parseTags(['#木工', ' 工地 ', '#吊顶'])).toEqual(['木工', '工地', '吊顶']);
  });

  it('中文逗号 / 分号 分隔', () => {
    expect(parseTags('木工，工地；吊顶')).toEqual(['木工', '工地', '吊顶']);
  });

  it('英文逗号 / 空格 分隔', () => {
    expect(parseTags('木工, 工地 吊顶')).toEqual(['木工', '工地', '吊顶']);
  });

  it('混合分隔符（逗号+分号+空格）一次性切分', () => {
    expect(parseTags('木工,工地；吊顶 水电')).toEqual(['木工', '工地', '吊顶', '水电']);
  });

  it('带 # 号前缀自动去除', () => {
    expect(parseTags('#木工 #工地')).toEqual(['木工', '工地']);
  });

  it('首尾分隔符不产生空标签', () => {
    expect(parseTags('，木工，工地，')).toEqual(['木工', '工地']);
  });

  it('空字符串返回空数组', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('null 输入返回空数组', () => {
    expect(parseTags(null)).toEqual([]);
  });

  it('undefined 输入返回空数组', () => {
    expect(parseTags(undefined)).toEqual([]);
  });

  it('空数组输入返回空数组', () => {
    // 注意：空数组本身为 truthy，走 Array 分支，结果为 []
    expect(parseTags([])).toEqual([]);
  });
});

describe('createItem 字段默认值完整性', () => {
  it('仅给 type 时，其余字段都有合理默认值', () => {
    const item = createItem({ type: 'note' });
    expect(item).toEqual({
      id: expect.any(String),
      type: 'note',
      date: '',
      title: '',
      body: '',
      tags: [],
      links: [],
      done: false, // 仅便签使用，默认 false
      plan: '', // 事件专属当日工作计划，默认空串（T8 新增字段）
      createdAt: expect.any(Number),
    });
  });

  it('传入的值被正确保留', () => {
    const item = createItem({
      type: 'diary',
      title: '周六',
      body: '去工地',
      tags: ['木工', '工地'],
      date: '2026-07-11',
      links: ['x1'],
    });
    expect(item.type).toBe('diary');
    expect(item.title).toBe('周六');
    expect(item.body).toBe('去工地');
    expect(item.tags).toEqual(['木工', '工地']);
    expect(item.date).toBe('2026-07-11');
    expect(item.links).toEqual(['x1']);
  });

  it('tags 字符串会被 parseTags 解析为数组', () => {
    const item = createItem({ type: 'note', tags: '木工, 工地' });
    expect(item.tags).toEqual(['木工', '工地']);
  });

  it('links 非数组时回退为空数组', () => {
    // 防御性：传入字符串而非数组，不应报错
    const item = createItem({ type: 'note', links: 'not-array' });
    expect(item.links).toEqual([]);
  });

  it('createdAt 为数字时间戳，id 为字符串且唯一', () => {
    const a = createItem({ type: 'note' });
    const b = createItem({ type: 'note' });
    expect(typeof a.createdAt).toBe('number');
    expect(typeof a.id).toBe('string');
    expect(a.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id); // 两次生成 id 不应相同
  });
});

// T8 新增：createItem 的 plan 字段（事件「当日工作计划」）
describe('createItem plan 字段（当日工作计划）', () => {
  it('默认不传 plan 时 plan 为 空串', () => {
    const item = createItem({ type: 'event' });
    expect(item.plan).toBe('');
  });

  it('传入 plan: "开会" 时原样保留', () => {
    const item = createItem({ type: 'event', plan: '开会' });
    expect(item.plan).toBe('开会');
  });

  it('传入纯空白 plan: "  " 时按实现保留（plan || "" 不 trim，保留 "  "）', () => {
    // 注意：createItem 用 `plan || ''`，'  ' 为 truthy 字符串，会原样保留。
    // 若未来需要 trim 行为，应在此处同步修改实现。
    const item = createItem({ type: 'event', plan: '  ' });
    expect(item.plan).toBe('  ');
  });

  it('其余字段默认值未被破坏（type/title/body/tags/links/done）', () => {
    const item = createItem({ type: 'event' });
    expect(item.type).toBe('event');
    expect(item.title).toBe('');
    expect(item.body).toBe('');
    expect(item.tags).toEqual([]);
    expect(item.links).toEqual([]);
    expect(item.done).toBe(false);
  });
});

describe('today() 格式', () => {
  it('返回 YYYY-MM-DD 格式', () => {
    const t = today();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('与本地当前日期一致', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(today()).toBe(expected);
  });

  it('各分段为合法数值（月份/日期补零、范围正确）', () => {
    const [, y, m, d] = today().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    expect(Number(m)).toBeGreaterThanOrEqual(1);
    expect(Number(m)).toBeLessThanOrEqual(12);
    expect(Number(d)).toBeGreaterThanOrEqual(1);
    expect(Number(d)).toBeLessThanOrEqual(31);
    expect(Number(y)).toBeGreaterThan(2000);
  });
});

describe('createId()', () => {
  it('返回非空字符串', () => {
    const id = createId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('多次调用结果不同', () => {
    expect(createId()).not.toBe(createId());
  });
});
