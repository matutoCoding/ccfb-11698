import { h, clear } from './ui/dom';
import './styles.css';
import { appState } from './state';
import { exportScheme, importSchemeFile } from './storage';
import { renderSchemesPage } from './pages/schemes';
import { renderLampPage } from './pages/lamp';
import { renderRoomPage } from './pages/room';
import { renderIlluminancePage } from './pages/illuminance';
import { renderShadowPage } from './pages/shadow';
import { renderSettingsPage } from './pages/settings';

export type Route = 'schemes' | 'lamp' | 'room' | 'illuminance' | 'shadow' | 'settings';

const NAV: { route: Route; label: string; icon: string }[] = [
  { route: 'schemes', label: '方案列表', icon: '▤' },
  { route: 'lamp', label: '灯头设计', icon: '◎' },
  { route: 'room', label: '手术室布置', icon: '▦' },
  { route: 'illuminance', label: '照度分析', icon: '☀' },
  { route: 'shadow', label: '阴影测试', icon: '◐' },
  { route: 'settings', label: '设置', icon: '⚙' },
];

let currentRoute: Route = (location.hash.replace('#/', '') as Route) || 'schemes';

function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

function renderTopbar(): HTMLElement {
  const schemeSelect = h('select', {
    onchange: () => appState.selectScheme(schemeSelect.value),
  }, ...appState.store.schemes.map((s) =>
    h('option', { value: s.id, selected: s.id === appState.store.activeId }, s.name),
  )) as HTMLSelectElement;

  const saveState = h('span', { class: 'save-state' }, '已自动保存');

  const fileInput = h('input', {
    type: 'file', accept: '.json,application/json', style: 'display:none',
    onchange: async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const scheme = await importSchemeFile(file);
        appState.importScheme(scheme);
        toast(`已导入方案：${scheme.name}`);
        routeTo('schemes');
      } catch (e) {
        toast(`导入失败：${(e as Error).message}`, 'error');
      }
      fileInput.value = '';
    },
  }) as HTMLInputElement;

  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, '无影灯配光与术野阴影仿真', h('small', {}, 'TypeScript + three.js')),
    schemeSelect,
    saveState,
    h('div', { class: 'spacer' }),
    h('button', {
      class: 'tiny',
      onclick: () => {
        const s = appState.addScheme();
        toast(`已新建方案：${s.name}`);
      },
    }, '＋ 新建方案'),
    h('button', { class: 'tiny', onclick: () => exportScheme(appState.active) }, '导出 JSON'),
    h('button', { class: 'tiny', onclick: () => fileInput.click() }, '导入 JSON'),
    fileInput,
  );
}

function renderSidebar(): HTMLElement {
  return h('nav', { class: 'sidebar' },
    ...NAV.map((n) =>
      h('div', {
        class: `nav-item${n.route === currentRoute ? ' active' : ''}`,
        onclick: () => routeTo(n.route),
      }, h('span', { class: 'nav-icon' }, n.icon), h('span', {}, n.label)),
    ),
    h('div', { class: 'sidebar-foot' }, '照度与遮挡计算基于解析公式，three.js 仅用于可视化'),
  );
}

const pageRoot = h('div', { class: 'main' });
let pageCleanup: (() => void) | null = null;

export function routeTo(route: Route): void {
  currentRoute = route;
  location.hash = `/${route}`;
  render();
}

function render(): void {
  pageCleanup?.();
  pageCleanup = null;
  const app = document.getElementById('app')!;
  clear(app);
  app.append(renderTopbar(), h('div', { class: 'layout' }, renderSidebar(), pageRoot));
  clear(pageRoot);

  const p = appState.active;
  const ctx = { routeTo, toast };
  switch (currentRoute) {
    case 'schemes':
      renderSchemesPage(pageRoot, ctx);
      break;
    case 'lamp':
      pageCleanup = renderLampPage(pageRoot, p, { toast });
      break;
    case 'room':
      pageCleanup = renderRoomPage(pageRoot, p, { toast });
      break;
    case 'illuminance':
      pageCleanup = renderIlluminancePage(pageRoot, p, { toast });
      break;
    case 'shadow':
      pageCleanup = renderShadowPage(pageRoot, p, { toast });
      break;
    case 'settings':
      renderSettingsPage(pageRoot, p, { toast });
      break;
  }
}

// 状态变更不做整页重渲染（避免 3D 视图销毁重建/拖拽闪烁）；
// 各页面通过 appState.subscribe 做本地增量更新，这里只刷新保存状态。
let saveTimer: ReturnType<typeof setTimeout> | undefined;
appState.subscribe(() => {
  const stateEl = document.querySelector('.save-state');
  if (stateEl) {
    stateEl.textContent = '保存中…';
    stateEl.classList.remove('saved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      stateEl.textContent = '已自动保存';
      stateEl.classList.add('saved');
    }, 500);
  }
});

window.addEventListener('hashchange', () => {
  const r = location.hash.replace('#/', '') as Route;
  if (r && r !== currentRoute) {
    currentRoute = r;
    render();
  }
});

render();
