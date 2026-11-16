import { h, numberField, sliderField, sectionTitle, statCard } from '../ui/dom';
import { appState } from '../state';
import type { Scheme } from '../types';
import { mount3D } from '../ui/mount3d';
import { Scene3D } from '../three/scene3d';

interface PageCtx {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

export function renderRoomPage(root: HTMLElement, scheme: Scheme, _ctx: PageCtx): () => void {
  let view: { scene: Scene3D; destroy: () => void } | null = null;
  const canvasHost = h('div', { class: 'view-canvas' });
  const controlHost = h('div', { class: 'control-pane' });

  const room = scheme.room;

  const renderControls = () => {
    const r = appState.active.room;
    controlHost.replaceChildren(
      h('div', { class: 'callout' },
        '布置参数决定术野平面位置与照度计算网格。灯头位置/角度在「灯头设计」页调整，遮挡体在「阴影测试」页调整。'),

      h('div', { class: 'stat-grid' },
        statCard('平面高度', `${r.planeHeight.toFixed(2)} m`, '手术台术野面'),
        statCard('计算区域', `${r.fieldSize.toFixed(2)} m`, '正方形边长'),
        statCard('网格精度', `${r.gridN}×${r.gridN}`, `间距 ${(r.fieldSize / (r.gridN - 1) * 1000).toFixed(1)} mm`),
      ),

      sectionTitle('术野平面'),
      h('div', { class: 'field-grid' },
        numberField('平面高度', r.planeHeight, 0.01, (v) => appState.mutate((s) => {
          s.room.planeHeight = Math.max(0.3, v);
          s.room.fieldCenter.y = s.room.planeHeight;
          s.shadow.samplePoint.y = s.room.planeHeight;
        }), { unit: 'm', min: 0.3, max: 2 }),
        numberField('区域边长', r.fieldSize, 0.05, (v) => appState.mutate((s) => { s.room.fieldSize = Math.max(0.2, v); }), { unit: 'm', min: 0.2, max: 3 }),
        numberField('中心 X', r.fieldCenter.x, 0.01, (v) => appState.mutate((s) => { s.room.fieldCenter.x = v; }), { unit: 'm' }),
        numberField('中心 Z', r.fieldCenter.z, 0.01, (v) => appState.mutate((s) => { s.room.fieldCenter.z = v; }), { unit: 'm' }),
      ),
      sliderField('网格采样 N（每维点数）', r.gridN, 21, 121, 2, '点', (v) => appState.mutate((s) => { s.room.gridN = Math.round(v); })),
      h('div', { class: 'muted', style: 'font-size:12px' },
        `当前总采样点 ${r.gridN * r.gridN} 个；N 越大光斑直径插值越准，计算量按 N² 增长。`),

      sectionTitle('房间尺寸（仅影响 3D 场景）'),
      h('div', { class: 'field-grid' },
        numberField('宽 X', r.roomWidth, 0.1, (v) => appState.mutate((s) => { s.room.roomWidth = Math.max(2, v); }), { unit: 'm' }),
        numberField('深 Z', r.roomDepth, 0.1, (v) => appState.mutate((s) => { s.room.roomDepth = Math.max(2, v); }), { unit: 'm' }),
        numberField('高 Y', r.roomHeight, 0.1, (v) => appState.mutate((s) => { s.room.roomHeight = Math.max(2.2, v); }), { unit: 'm' }),
      ),

      sectionTitle('灯头高度速览'),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '灯头'), h('th', {}, '高度(m)'), h('th', {}, '距术野面(m)'), h('th', {}, '俯仰(°)'), h('th', {}, '偏航(°)'))),
          h('tbody', {}, ...appState.active.lamps.map((l) =>
            h('tr', {},
              h('td', {}, l.name),
              h('td', {}, l.position.y.toFixed(2)),
              h('td', {}, (l.position.y - r.planeHeight).toFixed(2)),
              h('td', {}, l.pitchDeg.toFixed(1)),
              h('td', {}, l.yawDeg.toFixed(1)),
            ),
          )),
        ),
      ),
    );
  };

  renderControls();

  const toolbar = h('div', { class: 'view-toolbar' },
    h('strong', { style: 'font-size:13px' }, '手术室三维布置'),
    h('div', { style: 'flex:1' }),
    h('button', { class: 'tiny', onclick: () => view?.scene.resetView() }, '重置视角'),
  );

  root.replaceChildren(
    h('div', { class: 'page' },
      controlHost,
      h('div', { class: 'view-pane' }, toolbar, canvasHost),
    ),
  );

  view = mount3D(canvasHost, scheme);
  const unsub = appState.subscribe(() => {
    view?.scene.sync(appState.active);
    renderControls();
  });

  return () => {
    unsub();
    view?.destroy();
    view = null;
  };
}
