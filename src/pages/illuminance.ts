import { h, sectionTitle, statCard, toggleField, badge } from '../ui/dom';
import { appState } from '../state';
import type { Scheme } from '../types';
import { computeGrid, fieldMetrics, type IlluminanceGrid, type FieldMetrics } from '../physics/engine';
import { depthCurve, type DepthPoint } from '../physics/analysis';
import { renderHeatmap, renderColorBar } from '../ui/heatmap';
import { renderLineChart } from '../ui/charts';
import { buildReportCsv, downloadCsv } from '../report';
import { runShadowTest } from '../physics/analysis';

interface PageCtx {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

interface Computed {
  grid: IlluminanceGrid;
  metrics: FieldMetrics;
  depth: DepthPoint[];
  elapsedMs: number;
}

export function renderIlluminancePage(root: HTMLElement, scheme: Scheme, ctx: PageCtx): () => void {
  let computed: Computed | null = null;
  let showIsolines = true;
  let logScale = false;

  const heatCanvas = h('canvas', { class: 'heatmap-canvas', width: 520, height: 520 }) as HTMLCanvasElement;
  const barCanvas = h('canvas') as HTMLCanvasElement;
  const depthCanvas = h('canvas') as HTMLCanvasElement;
  const metricsHost = h('div', {});
  const statusLine = h('div', { class: 'muted', style: 'font-size:12px' }, '点击「开始计算」生成照度分布');

  const recompute = () => {
    const s = appState.active;
    const t0 = performance.now();
    const grid = computeGrid(s.lamps, s.room, []);
    const metrics = fieldMetrics(grid, s.lamps);
    const depth = depthCurve(s.lamps, s.room.fieldCenter, s.depth, []);
    computed = { grid, metrics, depth, elapsedMs: performance.now() - t0 };
    paint();
  };

  const paint = () => {
    if (!computed) return;
    const { grid, metrics, depth, elapsedMs } = computed;
    renderHeatmap(heatCanvas, grid, metrics.centerLux, { showIsolines, logScale });
    renderColorBar(barCanvas, metrics.maxLux, logScale);
    renderLineChart(depthCanvas, [
      { label: '中心照度', color: '#4da3ff', points: depth.map((p) => ({ x: p.height, y: p.centerLux })) },
    ], { xLabel: '术野平面高度 (m)', yLabel: '中心照度 (lux)', width: 560, height: 280 });

    statusLine.textContent = `计算完成：${grid.n}×${grid.n} 网格，耗时 ${elapsedMs.toFixed(0)} ms · 公式 E=I(θ)·cos i/r² 逐 LED 解析叠加`;

    metricsHost.replaceChildren(
      h('div', { class: 'stat-grid' },
        statCard('中心照度 Ec', `${Math.round(metrics.centerLux).toLocaleString()} lux`, '术野中心点', true),
        statCard('光斑直径 d10', `${metrics.d10DiameterMm.toFixed(0)} mm`, 'Ec/10 等照度线等效圆'),
        statCard('光斑直径 d50', `${metrics.d50DiameterMm.toFixed(0)} mm`, 'Ec/2 等照度线等效圆'),
        statCard('d10 内平均照度', `${Math.round(metrics.meanInsideD10).toLocaleString()} lux`),
        statCard('平均照度', `${Math.round(metrics.meanLux).toLocaleString()} lux`),
        statCard('最大 / 最小', `${Math.round(metrics.maxLux)} / ${Math.round(metrics.minLux)} lux`),
        statCard('均匀度 Emin/Emean', metrics.uniformity.toFixed(3)),
        statCard('LED / 总功率', `${metrics.ledCount} 颗 / ${metrics.totalPowerW.toFixed(1)} W`),
      ),
      h('div', { style: 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap' },
        badge(`总光通量 ${metrics.totalFluxLm.toFixed(0)} lm`, 'info'),
        badge(`平面高度 ${appState.active.room.planeHeight.toFixed(2)} m`, 'info'),
        badge(`计算区域 ${appState.active.room.fieldSize} m × ${appState.active.room.fieldSize} m`, 'info'),
      ),
    );
  };

  const exportReport = () => {
    if (!computed) {
      ctx.toast('请先运行照度计算', 'error');
      return;
    }
    const s = appState.active;
    try {
      const shadowResult = runShadowTest(s.lamps, s.shadow.samplePoint, s.shadow.occluders);
      const shadowGrid = computeGrid(s.lamps, s.room, s.shadow.occluders);
      const shadowMetrics = fieldMetrics(shadowGrid, s.lamps);
      const csv = buildReportCsv({
        scheme: s,
        cleanGrid: computed.grid,
        cleanMetrics: computed.metrics,
        shadowGrid,
        shadowMetrics,
        shadowResult,
        depth: computed.depth,
      });
      downloadCsv(`${s.name.replace(/[\\/:*?"<>|]/g, '_')}_测试报告.csv`, csv);
      ctx.toast('CSV 测试报告已导出（含逐 LED 明细）');
    } catch (e) {
      ctx.toast(`导出失败：${(e as Error).message}`, 'error');
    }
  };

  const controlHost = h('div', { class: 'control-pane' },
    h('div', { class: 'callout' },
      '所有数值由纯 TypeScript 解析引擎计算，与 three.js 渲染完全独立。中心照度、d10/d50 光斑直径按标准口径给出，可在设置页运行手算一致性自检。'),
    h('div', { class: 'row-actions' },
      h('button', { class: 'primary', onclick: recompute }, '开始计算照度'),
      h('button', { onclick: exportReport }, '导出测试报告 CSV'),
    ),
    sectionTitle('显示选项'),
    toggleField('显示 d10/d50 等照度线', showIsolines, (v) => { showIsolines = v; paint(); }),
    toggleField('对数色标（高亮低照度区）', logScale, (v) => { logScale = v; paint(); }),

    sectionTitle('深度衰减曲线参数'),
    h('div', { class: 'field-grid' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, '起始高度(m)'),
        h('input', {
          type: 'number', step: 0.05, value: scheme.depth.startHeight,
          onchange: (e: Event) => appState.mutate((s) => { s.depth.startHeight = parseFloat((e.target as HTMLInputElement).value); }),
        })),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, '终止高度(m)'),
        h('input', {
          type: 'number', step: 0.05, value: scheme.depth.endHeight,
          onchange: (e: Event) => appState.mutate((s) => { s.depth.endHeight = parseFloat((e.target as HTMLInputElement).value); }),
        })),
      h('label', { class: 'field full' }, h('span', { class: 'field-label' }, `采样步数：${scheme.depth.steps}`),
        h('input', {
          type: 'range', min: 4, max: 30, step: 1, value: scheme.depth.steps,
          oninput: (e: Event) => appState.mutate((s) => { s.depth.steps = parseInt((e.target as HTMLInputElement).value, 10); }),
        })),
    ),
    h('div', { class: 'muted', style: 'font-size:12px' },
      '深度曲线考察灯头-术野距离变化时的中心照度；单灯垂直照射严格服从逆平方律 E∝1/d²。'),

    sectionTitle('指标口径'),
    h('ul', { class: 'muted', style: 'margin:0;padding-left:18px;line-height:1.9;font-size:12px' },
      h('li', {}, 'Ec：术野中心网格点照度（lux）'),
      h('li', {}, 'd10：72 条径向射线定位 Ec/10 交叉点，平均半径×2'),
      h('li', {}, 'd50：同上，阈值 Ec/2'),
      h('li', {}, '均匀度：网格最小照度 / 平均照度'),
    ),
  );

  const viewHost = h('div', { class: 'view-pane', style: 'overflow:auto;padding:18px' },
    h('div', { style: 'display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap' },
      h('div', {},
        h('div', { style: 'font-weight:600;margin-bottom:8px' }, '术野照度分布热力图'),
        heatCanvas,
        h('div', { class: 'legend' }, barCanvas),
      ),
      h('div', { style: 'flex:1;min-width:340px' },
        metricsHost,
      ),
    ),
    h('div', { style: 'height:18px' }),
    statusLine,
    h('div', { style: 'margin-top:16px' },
      h('div', { style: 'font-weight:600;margin-bottom:8px' }, '深度方向中心照度衰减曲线'),
      depthCanvas,
    ),
  );

  root.replaceChildren(h('div', { class: 'page' }, controlHost, viewHost));

  // 首次进入自动计算一次
  recompute();

  // 参数变更后自动重算（防抖由浏览器事件节奏自然限制；网格计算为纯内存操作）
  const unsub = appState.subscribe(() => {
    if (computed) recompute();
  });
  return () => unsub();
}
