// db.js —— IndexedDB 持久化封装（基于 idb 库）
//
// 数据库：notes-diary
// 对象仓库：items（keyPath: id），并建立 type / date 索引便于查询。
//          images（keyPath: id），存储图片 Blob 记录（v2 新增）。
// 所有函数都是对 idb 的纯封装，无业务判断，方便单测与复用。

import { openDB } from 'idb';
import { ITEM_TYPES } from './model.js';

const DB_NAME = 'notes-diary';
const DB_VERSION = 2;
const STORE = 'items';
const STORE_IMAGES = 'images';

// 用单例缓存数据库连接，避免重复打开
let dbPromise = null;

/**
 * 获取（惰性创建）数据库连接。
 * upgrade 回调按版本递增创建对象仓库：
 *   v1 → items store（含 type/date 索引）
 *   v2 → images store（仅 keyPath，无索引）
 * @returns {Promise<IDBPDatabase>}
 */
export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Version 1: items store
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('type', 'type'); // 按类型查询
            store.createIndex('date', 'date'); // 按日期查询
          }
        }
        // Version 2: images store（存储图片 Blob，由 body 条目 images 数组引用）
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(STORE_IMAGES)) {
            db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
          }
        }
      },
    });
  }
  return dbPromise;
}

/**
 * 新增一个 Item（id 不存在时使用）。
 * @param {Object} item
 * @returns {Promise<void>}
 */
export async function addItem(item) {
  const db = await getDB();
  await db.put(STORE, item);
}

/**
 * 更新一个 Item（id 已存在时使用，idb 的 put 会覆盖）。
 * @param {Object} item
 * @returns {Promise<void>}
 */
export async function updateItem(item) {
  const db = await getDB();
  await db.put(STORE, item);
}

/**
 * 根据 id 删除一个 Item。
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteItem(id) {
  const db = await getDB();
  await db.delete(STORE, id);
}

/**
 * 读取全部 Item。
 * @returns {Promise<Object[]>}
 */
export async function getAllItems() {
  const db = await getDB();
  return db.getAll(STORE);
}

/**
 * 按类型读取 Item（如 'note' / 'diary'）。
 * @param {string} type
 * @returns {Promise<Object[]>}
 */
export async function getItemsByType(type) {
  const db = await getDB();
  const index = db.transaction(STORE).objectStore(STORE).index('type');
  return index.getAll(type);
}

/**
 * 按日期读取某一天的日记（diary）。一天一条，无则返回 null。
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function getDiaryByDate(date) {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE, 'date', date);
  return items.find((it) => it.type === ITEM_TYPES.DIARY) || null;
}
