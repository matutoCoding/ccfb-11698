import { h } from '../ui/dom';
import { appState } from '../state';
import { exportScheme } from '../storage';
import { computeGrid, fieldMetrics } from '../physics/engine';
import type { Route } from '../main';

interface PageCtx {
  routeTo: (r: Route) => void;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

export function renderSchemesPage(root: HTMLElement, ctx: PageCtx): () => void {
  const draw = () => {
    const store = appState.store;
    const cards = store.schemes.map((s) => {
      let summary = '';
      try {
        const grid = computeGrid(s.lamps, s.room, []);
        const m = fieldMetrics(grid, s.lamps);
        summary = `中心照度 ${Math.round(m.centerLux).toLocaleString()} lux · d10 ${m.d10DiameterMm.toFixed(0)} mm · ${m.ledCount} 颗 LED`;
      } catch {
        summary = '配置数据异常，无法计算';
      }
      const isActive = s.id === store.activeId;
      return h('div', { class: `scheme-card${isActive ? ' active' : ''}` },
        h('h4', {}, s.name, isActive ? h('span', { class: 'badge badge-info', style: 'margin-left:8px' }, '当前') : null),
        h('div', { class: 'scheme-meta' },
          h('span', {}, summary),
          h('span', {}, `更新：${new Date(s.updatedAt).toLocaleString('zh-CN')}`),
          h('span', {}, `灯头：${s.lamps.map((l) => l.name).join('、')}`),
          s.note ? h('span', { class: 'muted' }, `备注：${s.note}`) : null,
        ),
        h('div', { class: 'scheme-actions' },
          h('button', {
            class: 'primary tiny',
            onclick: () => { appState.selectScheme(s.id); ctx.routeTo('lamp'); },
          }, '打开编辑'),
          h('button', {
            class: 'tiny',
            onclick: () => {
              const name = prompt('副本名称', `${s.name} 副本`);
              if (name) { appState.duplicateScheme(s.id); appState.renameScheme(appState.active.id, name); ctx.toast('已复制方案'); }
            },
          }, '复制'),
          h('button', { class: 'tiny', onclick: () => exportScheme(s) }, '导出'),
          h('button', {
            class: 'tiny danger',
            disabled: store.schemes.length <= 1,
            onclick: () => {
              if (confirm(`确认删除方案「${s.name}」？此操作不可恢复。`)) {
                appState.deleteScheme(s.id);
                ctx.toast('已删除');
              }
            },
          }, '删除'),
        ),
      );
    });

    root.replaceChildren(
      h('div', { class: 'page single', style: 'flex-direction:column;gap:16px' },
        h('div', { style: 'display:flex;align-items:center;gap:14px' },
          h('h2', { style: 'margin:0;font-size:18px' }, '方案列表'),
          h('span', { class: 'muted' }, `共 ${store.schemes.length} 个方案，数据保存在浏览器 localStorage`),
        ),
        h('div', { class: 'callout' },
          '方案包含灯头/LED、手术室、遮挡体与分析参数的完整配置，可导出 JSON 归档或交换；复制方案可用于在现有配光基础上做对比试验。'),
        h('div', { class: 'scheme-grid' }, ...cards),
      ),
    );
  };

  draw();
  // 方案增删/复制/导入后重绘（计算摘要可能较慢，但方案数量通常很少）
  const unsub = appState.subscribe(draw);
  return () => unsub();
}
