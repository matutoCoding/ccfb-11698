import type { Scheme } from './types';
import { loadStore, saveStore, type SchemeStore } from './storage';
import { cloneScheme, createScheme, uid } from './factory';

type Listener = () => void;

/**
 * 极简全局状态容器：可变 current + 版本号 + 订阅。
 * 所有修改走 action，action 内统一打 updatedAt 并防抖持久化。
 */
class AppState {
  store: SchemeStore;
  private listeners = new Set<Listener>();

  constructor() {
    this.store = loadStore();
  }

  get active(): Scheme {
    return this.store.schemes.find((s) => s.id === this.store.activeId) ?? this.store.schemes[0];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(persist = true): void {
    this.active.updatedAt = Date.now();
    for (const fn of this.listeners) fn();
    if (persist) saveStore(this.store);
  }

  /** 在当前方案上执行修改并通知 */
  mutate(fn: (s: Scheme) => void): void {
    fn(this.active);
    this.emit();
  }

  selectScheme(id: string): void {
    if (this.store.schemes.some((s) => s.id === id)) {
      this.store.activeId = id;
      this.emit(false);
      saveStore(this.store, true);
    }
  }

  addScheme(name?: string): Scheme {
    const s = createScheme(name ?? `方案 ${this.store.schemes.length + 1}`);
    this.store.schemes.push(s);
    this.store.activeId = s.id;
    this.emit(true);
    return s;
  }

  duplicateScheme(id: string): Scheme | null {
    const src = this.store.schemes.find((s) => s.id === id);
    if (!src) return null;
    const copy = cloneScheme(src, `${src.name} 副本`);
    const idx = this.store.schemes.findIndex((s) => s.id === id);
    this.store.schemes.splice(idx + 1, 0, copy);
    this.store.activeId = copy.id;
    this.emit(true);
    return copy;
  }

  renameScheme(id: string, name: string): void {
    const s = this.store.schemes.find((x) => x.id === id);
    if (s) {
      s.name = name;
      this.emit(true);
    }
  }

  deleteScheme(id: string): void {
    if (this.store.schemes.length <= 1) return;
    const idx = this.store.schemes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    this.store.schemes.splice(idx, 1);
    if (this.store.activeId === id) {
      this.store.activeId = this.store.schemes[Math.max(0, idx - 1)].id;
    }
    this.emit(true);
  }

  importScheme(s: Scheme): void {
    // 避免 id 冲突
    s.id = uid('scheme');
    for (const lamp of s.lamps) lamp.id = uid('lamp');
    this.store.schemes.push(s);
    this.store.activeId = s.id;
    this.emit(true);
  }
}

export const appState = new AppState();
