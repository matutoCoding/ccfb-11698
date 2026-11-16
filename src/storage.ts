import type { Scheme } from './types';
import { createScheme, validateScheme } from './factory';

/**
 * 方案持久化：localStorage 存全部方案 + 当前方案 id。
 * 自动保存带 400ms 防抖；导入/导出为 JSON 文件。
 */

const STORAGE_KEY = 'shadowless-lamp-sim:schemes:v1';
const ACTIVE_KEY = 'shadowless-lamp-sim:active:v1';

export interface SchemeStore {
  schemes: Scheme[];
  activeId: string;
}

export function loadStore(): SchemeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const activeId = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const schemes = JSON.parse(raw) as Scheme[];
      if (Array.isArray(schemes) && schemes.length > 0) {
        const active = schemes.find((s) => s.id === activeId) ?? schemes[0];
        return { schemes, activeId: active.id };
      }
    }
  } catch (e) {
    console.error('读取本地方案失败，初始化默认方案', e);
  }
  const first = createScheme('默认双灯方案');
  return { schemes: [first], activeId: first.id };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function saveStore(store: SchemeStore, immediate = false): void {
  const doSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.schemes));
    localStorage.setItem(ACTIVE_KEY, store.activeId);
  };
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    doSave();
  } else {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 400);
  }
}

export function exportScheme(scheme: Scheme): void {
  const blob = new Blob([JSON.stringify(scheme, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${scheme.name.replace(/[\\/:*?"<>|]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSchemeFile(file: File): Promise<Scheme> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  const result = validateScheme(raw);
  if (!result.ok) throw new Error(result.error);
  return result.scheme;
}
