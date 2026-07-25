// useTheme.js —— 主题管理 hook（light / dark / system）
//
// - 初始值读取 localStorage('nd_theme')，无值则默认 'system'
// - isDark 派生值：theme === 'system' 时跟随系统偏好，否则直接判断
// - toggleTheme()：在 light / dark 间切换，写入 localStorage
// - 副作用：useEffect 中 toggle document.documentElement.classList('dark')
// - 系统偏好监听：matchMedia('prefers-color-scheme: dark') change 事件
// - 主题偏好不进导出 JSON（仅 localStorage）

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'nd_theme';

/**
 * 主题管理 hook。
 * @returns {{theme: string, isDark: boolean, toggleTheme: Function}}
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  // 系统深色模式偏好
  const [systemDark, setSystemDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  // 监听系统主题变化
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => setSystemDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } catch {
      /* ignore */
    }
  }, []);

  // 实际是否深色：system 模式跟随系统，否则直接判断
  const isDark = theme === 'system' ? systemDark : theme === 'dark';

  // 同步到 DOM（切换 .dark class）
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // 在 light / dark 间切换（system → 解析当前实际值再取反）
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const current = prev === 'system' ? (systemDark ? 'dark' : 'light') : prev;
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [systemDark]);

  return { theme, isDark, toggleTheme };
}
