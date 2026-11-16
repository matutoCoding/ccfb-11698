import { h, numberField, sectionTitle, statCard, selectField, badge, toggleField } from '../ui/dom';
import { appState } from '../state';
import type { OccluderConfig, Scheme, Vec3 } from '../types';
import { mount3D } from '../ui/mount3d';
import { Scene3D } from '../three/scene3d';
import { runShadowTest, type ShadowTestResult } from '../physics/analysis';
import { computeGrid, fieldMetrics } from '../physics/engine';
import { renderHeatmap, renderColorBar } from '../ui/heatmap';
import { uid } from '../factory';

interface PageCtx {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

export function renderShadowPage(root: HTMLElement, scheme: Scheme, _ctx: PageCtx): () => void {
  let view: { scene: Scene3D; destroy: () => void } | null = null;
  let selectedOccId = scheme.shadow.occluders[0]?.id ?? null;
  let showCleanCompare = true;

  const canvasHost = h('div', { class: 'view-canvas' });
  const controlHost = h('div', { class: 'control-pane' });
  const resultHost = h('div', { style: 'padding:16px;overflow:auto' });
  const heatCanvas = h('canvas', { class: 'heatmap-canvas', width: 460, height: 460 }) as HTMLCanvasElement;
  const barCanvas = h('canvas') as HTMLCanvasElement;

  const mutateOcc = (id: string, fn: (o: OccluderConfig) => void) => {
    appState.mutate((s) => {
      const o = s.shadow.occluders.find((x) => x.id === id);
      if (o) fn(o);
    });
  };

  const renderControls = () => {
    const s = appState.active;
    controlHost.replaceChildren();

    const occTabs = h('div', { class: 'tabs' },
      ...s.shadow.occluders.map((o) =>
        h('div', {
          class: `tab${o.id === selectedOccId ? ' active' : ''}`,
          onclick: () => { selectedOccId = o.id; view?.scene.select('occluder', o.id); renderControls(); },
        }, o.name),
      ),
      h('button', {
        class: 'tiny',
        onclick: () => {
          const o: OccluderConfig = {
            id: uid('occ'), name: `遮挡体 ${s.shadow.occluders.length + 1}`,
            kind: 'sphere',
            position: { x: 0, y: 1.2, z: 0 }, radius: 0.08, halfLength: 0,
            axis: { x: 1, y: 0, z: 0 },
          };
          appState.mutate((x) => x.shadow.occluders.push(o));
          selectedOccId = o.id;
        },
      }, '＋ 遮挡体'),
    );

    const occ = s.shadow.occluders.find((o) => o.id === selectedOccId);

    controlHost.append(
      h('div', { class: 'callout' },
        '在 3D 视图中点击遮挡体并拖拽移动（移动模式）。残余照度 = 遮挡后总照度 / 无遮挡总照度，逐 LED 遮挡判定为解析求交，明细表可与手算逐项核对。'),
      occTabs,
      occ ? occEditor(occ, mutateOcc, () => renderControls()) : h('div', { class: 'muted' }, '暂无遮挡体'),

      sectionTitle('残余照度采样点'),
      h('div', { class: 'field-grid' },
        numberField('采样点 X', s.shadow.samplePoint.x, 0.01, (v) => appState.mutate((x) => { x.shadow.samplePoint.x = v; }), { unit: 'm' }),
        numberField('采样点 Z', s.shadow.samplePoint.z, 0.01, (v) => appState.mutate((x) => { x.shadow.samplePoint.z = v; }), { unit: 'm' }),
      ),
      h('div', { class: 'muted', style: 'font-size:12px' }, `Y 固定为术野平面高度 ${s.room.planeHeight.toFixed(2)} m`),
      toggleField('结果区同时显示无遮挡对比热力图', showCleanCompare, (v) => { showCleanCompare = v; renderResults(); }),
    );
  };

  const renderResults = () => {
    const s = appState.active;
    const res = runShadowTest(s.lamps, s.shadow.samplePoint, s.shadow.occluders);
    const shadowGrid = computeGrid(s.lamps, s.room, s.shadow.occluders);
    const shadowMetrics = fieldMetrics(shadowGrid, s.lamps);
    renderHeatmap(heatCanvas, shadowGrid, shadowMetrics.centerLux, { showIsolines: true });
    renderColorBar(barCanvas, shadowMetrics.maxLux);

    const cleanGrid = showCleanCompare ? computeGrid(s.lamps, s.room, []) : null;
    const cleanCanvas = h('canvas', { class: 'heatmap-canvas', width: 460, height: 460 }) as HTMLCanvasElement;
    if (cleanGrid) {
      const cleanMetrics = fieldMetrics(cleanGrid, s.lamps);
      renderHeatmap(cleanCanvas, cleanGrid, cleanMetrics.centerLux, { showIsolines: true });
    }

    resultHost.replaceChildren(
      h('div', { class: 'stat-grid' },
        statCard('无遮挡照度 E0', `${Math.round(res.unobstructedLux).toLocaleString()} lux`),
        statCard('遮挡后照度 Es', `${Math.round(res.shadowedLux).toLocaleString()} lux`),
        statCard('残余照度比例', `${(res.residualRatio * 100).toFixed(2)} %`, 'Es / E0', true),
        statCard('阴影深度', `${(res.shadowDepth * 100).toFixed(2)} %`),
      ),
      h('div', { style: 'margin:10px 0;display:flex;gap:8px;flex-wrap:wrap' },
        badge(`采样点 (${res.point.x.toFixed(2)}, ${res.point.y.toFixed(2)}, ${res.point.z.toFixed(2)}) m`, 'info'),
        badge(`遮挡 LED：${res.contributions.filter((c) => c.blocked).length}/${res.contributions.length} 颗`, 'warn'),
      ),

      sectionTitle('分灯头残余照度'),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {},
            h('th', {}, '灯头'), h('th', {}, 'LED 数'), h('th', {}, '被遮挡'),
            h('th', {}, '无遮挡(lux)'), h('th', {}, '遮挡后(lux)'), h('th', {}, '残余(%)'))),
          h('tbody', {}, ...res.perLamp.map((st) => {
            const ratio = st.unobstructedLux > 0 ? (st.shadowedLux / st.unobstructedLux) * 100 : 0;
            return h('tr', {},
              h('td', {}, s.lamps.find((l) => l.id === st.lampId)?.name ?? st.lampId),
              h('td', {}, String(st.totalLedCount)),
              h('td', {}, String(st.blockedLedCount)),
              h('td', {}, st.unobstructedLux.toFixed(1)),
              h('td', {}, st.shadowedLux.toFixed(1)),
              h('td', {}, h('span', { class: ratio < 50 ? 'badge badge-danger' : 'badge badge-ok' }, ratio.toFixed(2))),
            );
          })),
        ),
      ),

      sectionTitle('术野平面遮挡后照度分布'),
      h('div', { class: 'heatmap-wrap' },
        h('div', {},
          h('div', { style: 'font-weight:600;margin-bottom:6px' }, '遮挡场景'),
          heatCanvas,
          h('div', { class: 'legend' }, barCanvas),
        ),
        cleanGrid ? h('div', {},
          h('div', { style: 'font-weight:600;margin-bottom:6px' }, '无遮挡对比'),
          cleanCanvas,
        ) : null,
      ),

      sectionTitle('逐 LED 照度明细（手算复核用）'),
      ledDetailTable(res, s),
    );
  };

  const toolbar = h('div', { class: 'view-toolbar' },
    h('strong', { style: 'font-size:13px' }, '遮挡体三维视图（点击选中后拖拽）'),
    h('div', { style: 'flex:1' }),
    h('button', {
      class: 'tiny',
      onclick: () => { view?.scene.setTransformMode('translate'); view?.scene.select('occluder', selectedOccId); },
    }, '移动模式'),
    h('button', { class: 'tiny', onclick: () => view?.scene.resetView() }, '重置视角'),
  );

  root.replaceChildren(
    h('div', { class: 'page' },
      controlHost,
      h('div', { class: 'view-pane' },
        toolbar,
        h('div', { style: 'display:flex;flex:1;min-height:0' },
          canvasHost,
          h('div', { style: 'width:46%;flex:0 0 auto;border-left:1px solid var(--border);overflow:auto' }, resultHost),
        ),
      ),
    ),
  );

  renderControls();
  renderResults();
  view = mount3D(canvasHost, scheme);
  if (selectedOccId) view.scene.select('occluder', selectedOccId);

  const unsub = appState.subscribe(() => {
    view?.scene.sync(appState.active);
    renderControls();
    renderResults();
  });

  return () => {
    unsub();
    view?.destroy();
    view = null;
  };
}

// ---------------------------------------------------------------------------

function occEditor(
  occ: OccluderConfig,
  mutate: (id: string, fn: (o: OccluderConfig) => void) => void,
  rerender: () => void,
): HTMLElement {
  return h('div', {},
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, '名称'),
      h('input', {
        type: 'text', value: occ.name,
        onchange: (e: Event) => mutate(occ.id, (o) => { o.name = (e.target as HTMLInputElement).value; }),
      }),
    ),
    selectField('几何类型', occ.kind, [
      { value: 'sphere', text: '球体（模拟医生头部）' },
      { value: 'capsule', text: '胶囊体（模拟手/前臂）' },
    ], (v) => mutate(occ.id, (o) => {
      o.kind = v;
      if (v === 'sphere') o.halfLength = 0;
      else o.halfLength = 0.08;
    })),
    sectionTitle('位置（也可 3D 拖拽）'),
    h('div', { class: 'field-grid' },
      numberField('X', occ.position.x, 0.01, (v) => mutate(occ.id, (o) => { o.position.x = v; }), { unit: 'm' }),
      numberField('Y（高度）', occ.position.y, 0.01, (v) => mutate(occ.id, (o) => { o.position.y = v; }), { unit: 'm' }),
      numberField('Z', occ.position.z, 0.01, (v) => mutate(occ.id, (o) => { o.position.z = v; }), { unit: 'm' }),
    ),
    sectionTitle('尺寸'),
    h('div', { class: 'field-grid' },
      numberField('半径 r', occ.radius, 0.005, (v) => mutate(occ.id, (o) => { o.radius = Math.max(0.005, v); }), { unit: 'm', min: 0.005 }),
      occ.kind === 'capsule'
        ? numberField('段半长 h', occ.halfLength, 0.005, (v) => mutate(occ.id, (o) => { o.halfLength = Math.max(0, v); }), { unit: 'm' })
        : null,
    ),
    occ.kind === 'capsule' ? capsuleAxisEditor(occ, mutate) : null,
    h('div', { class: 'row-actions', style: 'margin-top:8px' },
      h('button', {
        class: 'tiny danger',
        onclick: () => {
          appState.mutate((s) => { s.shadow.occluders = s.shadow.occluders.filter((x) => x.id !== occ.id); });
          rerender();
        },
      }, '删除该遮挡体'),
      h('button', {
        class: 'tiny',
        onclick: () => {
          // 常用预设：IEC 60601-2-41 思路的标准尺寸（可按需调整）
          if (occ.kind === 'sphere') {
            mutate(occ.id, (o) => { o.radius = 0.1; o.position = { x: 0, y: 1.35, z: 0.15 }; });
          } else {
            mutate(occ.id, (o) => {
              o.radius = 0.04; o.halfLength = 0.08;
              o.position = { x: 0.2, y: 1.15, z: 0 };
              o.axis = { x: 1, y: 0, z: 0 };
            });
          }
        },
      }, '恢复标准预设尺寸'),
    ),
    h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' },
      '预设参考标准遮挡试验思路（头部球 r≈100mm，手部胶囊 r≈40mm）；具体口径请按所用标准版本核对。'),
  );
}

function capsuleAxisEditor(occ: OccluderConfig, mutate: (id: string, fn: (o: OccluderConfig) => void) => void): HTMLElement[] {
  const presets: { name: string; axis: Vec3 }[] = [
    { name: '沿 X 轴', axis: { x: 1, y: 0, z: 0 } },
    { name: '沿 Y 轴', axis: { x: 0, y: 1, z: 0 } },
    { name: '沿 Z 轴', axis: { x: 0, y: 0, z: 1 } },
  ];
  return [h('div', { class: 'row-actions', style: 'margin-top:8px' },
    ...presets.map((p) => h('button', {
      class: 'tiny',
      onclick: () => mutate(occ.id, (o) => { o.axis = { ...p.axis }; }),
    }, p.name)),
  )];
}

function ledDetailTable(res: ShadowTestResult, scheme: Scheme): HTMLElement {
  const rows = res.contributions.map((c, i) =>
    h('tr', { class: c.blocked ? 'blocked' : '' },
      h('td', { class: 'mono' }, `#${i + 1}`),
      h('td', {}, scheme.lamps.find((l) => l.id === c.lampId)?.name ?? c.lampId),
      h('td', {}, c.distance.toFixed(4)),
      h('td', {}, c.thetaDeg.toFixed(2)),
      h('td', {}, c.incidenceDeg.toFixed(2)),
      h('td', {}, c.intensityCd.toFixed(3)),
      h('td', {}, c.illuminanceLux.toFixed(3)),
      h('td', {}, c.blocked ? h('span', { class: 'badge badge-danger' }, '遮挡(0)') : h('span', { class: 'badge badge-ok' }, '通光')),
    ),
  );
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, '#'), h('th', {}, '灯头'), h('th', {}, 'r(m)'),
        h('th', {}, 'θ(°)'), h('th', {}, 'i(°)'), h('th', {}, 'I(cd)'),
        h('th', {}, 'E(lux)'), h('th', {}, '状态'))),
      h('tbody', {}, ...rows),
    ),
  );
}
