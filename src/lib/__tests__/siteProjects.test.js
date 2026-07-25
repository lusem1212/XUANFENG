// siteProjects.test.js —— 工地项目独立词库单元测试（QA：严过关）
// 覆盖需求2：removeSiteProjectName 永久删除、空值降级、只删词库不影响 item.tags；
// 覆盖需求3/6：工地项目词库(nd_site_projects) 与 TagSelect 标签池(nd_preset_tags) 独立。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PRESET,
  DEFAULT_PRESET_SET,
  getSiteProjects,
  addSiteProjectName,
  removeSiteProjectName,
  syncTagsFromItems,
} from '../siteProjects.js';

const SITE_KEY = 'nd_site_projects';
const PRESET_KEY = 'nd_preset_tags';

beforeEach(() => {
  // 每个用例前清空 localStorage，保证用例独立、幂等
  localStorage.clear();
});

describe('getSiteProjects 读取', () => {
  it('空词库返回空数组', () => {
    expect(getSiteProjects()).toEqual([]);
  });

  it('能读回已写入的词库', () => {
    localStorage.setItem(SITE_KEY, JSON.stringify(['A工地', 'B工地']));
    expect(getSiteProjects()).toEqual(['A工地', 'B工地']);
  });

  it('解析异常 / 非数组安全降级为空数组', () => {
    localStorage.setItem(SITE_KEY, 'not-json');
    expect(getSiteProjects()).toEqual([]);
    localStorage.setItem(SITE_KEY, JSON.stringify({ a: 1 }));
    expect(getSiteProjects()).toEqual([]);
  });

  it('过滤掉非字符串项', () => {
    localStorage.setItem(SITE_KEY, JSON.stringify(['A', 123, null, { x: 1 }, 'B']));
    expect(getSiteProjects()).toEqual(['A', 'B']);
  });
});

describe('addSiteProjectName 写入', () => {
  it('新增名称并入词库并返回最新数组', () => {
    const next = addSiteProjectName('新工地');
    expect(next).toContain('新工地');
    expect(getSiteProjects()).toContain('新工地');
  });

  it('重复名称不重复写入（去重）', () => {
    addSiteProjectName('A工地');
    const next = addSiteProjectName('A工地');
    expect(next.filter((t) => t === 'A工地').length).toBe(1);
  });

  it('空字符串 / 非字符串安全降级（不写入，返回当前词库）', () => {
    addSiteProjectName('已有');
    expect(addSiteProjectName('')).toEqual(['已有']);
    expect(addSiteProjectName('   ')).toEqual(['已有']);
    expect(addSiteProjectName(null)).toEqual(['已有']);
    expect(addSiteProjectName(123)).toEqual(['已有']);
    expect(getSiteProjects()).toEqual(['已有']);
  });
});

// ===== 需求2 核心：removeSiteProjectName =====
describe('removeSiteProjectName 永久删除', () => {
  it('从词库永久删除一个名称并返回最新数组', () => {
    addSiteProjectName('A工地');
    addSiteProjectName('B工地');
    const next = removeSiteProjectName('A工地');
    expect(next).toEqual(['B工地']);
    expect(getSiteProjects()).toEqual(['B工地']); // 持久化生效
  });

  it('删除不存在的名称：不报错，词库不变', () => {
    addSiteProjectName('A工地');
    const next = removeSiteProjectName('不存在');
    expect(next).toEqual(['A工地']);
  });

  it('空值 / 非字符串安全降级（不删任何内容）', () => {
    addSiteProjectName('A工地');
    addSiteProjectName('B工地');
    expect(removeSiteProjectName('')).toEqual(['A工地', 'B工地']);
    expect(removeSiteProjectName('   ')).toEqual(['A工地', 'B工地']);
    expect(removeSiteProjectName(null)).toEqual(['A工地', 'B工地']);
    expect(removeSiteProjectName(undefined)).toEqual(['A工地', 'B工地']);
    expect(removeSiteProjectName(123)).toEqual(['A工地', 'B工地']);
    expect(getSiteProjects()).toEqual(['A工地', 'B工地']);
  });

  it('只删词库，不影响 item.tags（词库与 item 数据解耦）', () => {
    // 模拟：词库里有"A工地"，某 item.tags 也含"A工地"
    addSiteProjectName('A工地');
    const itemTags = ['A工地', '木工'];
    // 从词库删除"A工地"
    removeSiteProjectName('A工地');
    expect(getSiteProjects()).not.toContain('A工地');
    // item.tags 是 item 自身数据，不受词库删除影响
    expect(itemTags).toContain('A工地');
  });

  it('删除后候选列表刷新不再显示该词', () => {
    addSiteProjectName('A工地');
    addSiteProjectName('B工地');
    addSiteProjectName('C工地');
    removeSiteProjectName('B工地');
    const candidates = getSiteProjects();
    expect(candidates).toEqual(['A工地', 'C工地']);
    expect(candidates).not.toContain('B工地');
  });
});

// ===== 需求3/6：词库独立（nd_site_projects 与 nd_preset_tags 互不污染）=====
describe('工地项目词库与 TagSelect 标签池独立', () => {
  it('addSiteProjectName 只写 nd_site_projects，不碰 nd_preset_tags', () => {
    localStorage.setItem(PRESET_KEY, JSON.stringify(['木工', '水电']));
    addSiteProjectName('A工地');
    expect(JSON.parse(localStorage.getItem(PRESET_KEY))).toEqual(['木工', '水电']);
    expect(JSON.parse(localStorage.getItem(SITE_KEY))).toEqual(['A工地']);
  });

  it('removeSiteProjectName 只删 nd_site_projects，不碰 nd_preset_tags', () => {
    localStorage.setItem(PRESET_KEY, JSON.stringify(['木工', '水电']));
    addSiteProjectName('A工地');
    addSiteProjectName('B工地');
    removeSiteProjectName('A工地');
    expect(JSON.parse(localStorage.getItem(PRESET_KEY))).toEqual(['木工', '水电']);
    expect(JSON.parse(localStorage.getItem(SITE_KEY))).toEqual(['B工地']);
  });

  it('DEFAULT_PRESET 不进工地项目词库', () => {
    expect(DEFAULT_PRESET_SET.has('木工')).toBe(true);
    expect(DEFAULT_PRESET_SET.has('水电')).toBe(true);
    // syncTagsFromItems 只把非默认预设的历史标签写入工地项目词库
    syncTagsFromItems([
      { tags: ['木工', 'A工地'] },
      { tags: ['水电', 'B工地'] },
    ]);
    const site = getSiteProjects();
    expect(site).toContain('A工地');
    expect(site).toContain('B工地');
    expect(site).not.toContain('木工');
    expect(site).not.toContain('水电');
  });

  it('syncTagsFromItems 迁移清理 nd_preset_tags 中的工地项目词（幂等）', () => {
    // 模拟上一轮污染：nd_preset_tags 里混入了工地项目词
    localStorage.setItem(PRESET_KEY, JSON.stringify(['木工', '水电', 'A工地', 'B工地']));
    syncTagsFromItems([{ tags: ['木工', 'A工地'] }]);
    const preset = JSON.parse(localStorage.getItem(PRESET_KEY));
    // 默认预设保留
    expect(preset).toContain('木工');
    expect(preset).toContain('水电');
    // 工地项目词从 preset 中移除
    expect(preset).not.toContain('A工地');
    // 多次调用幂等，不重复、不丢数据
    syncTagsFromItems([{ tags: ['木工', 'A工地'] }]);
    const preset2 = JSON.parse(localStorage.getItem(PRESET_KEY));
    expect(preset2).toEqual(preset);
  });

  it('syncTagsFromItems 合并去重写入工地项目词库', () => {
    addSiteProjectName('已有工地');
    syncTagsFromItems([{ tags: ['已有工地', '新工地'] }]);
    const site = getSiteProjects();
    expect(site.filter((t) => t === '已有工地').length).toBe(1); // 去重
    expect(site).toContain('新工地');
  });
});
