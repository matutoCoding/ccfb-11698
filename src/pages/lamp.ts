import { h, numberField, sliderField, selectField, toggleField, sectionTitle, statCard, badge } from '../ui/dom';
import { appState } from '../state';
import type { LampHeadConfig, Scheme, LedPlacement } from '../types';
import { mount3D } from '../ui/mount3d';
import { Scene3D } from '../three/scene3d';
import { buildRingLeds, makeLedId } from '../physics/layout';
import { halfIntensityAngleDeg } from '../physics/distribution';
import { uid } from '../factory';

interface PageCtx {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

export function renderLampPage(root: HTMLElement, scheme: Scheme, ctx: PageCtx): () => void {
  let view: { scene: Scene3D; destroy: () => void } | null = null;
  let selectedLampId = scheme.lamps[0]?.id;

  const canvasHost = h('div', { class: 'view-canvas' });
  const controlHost = h('div', { class: 'control-pane' });

  const modeBtn = (mode: 'translate' | 'rotate', text: string) =>
    h('button', {
      class: 'tiny',
      onclick: () => {
        view?.scene.setTransformMode(mode);
        view?.scene.select('lamp', selectedLampId);
        [...toolbar.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
        modeBtnEl(mode).classList.add('active');
      },
    }, text);

  const modeBtnEl = (mode: 'translate' | 'rotate'): HTMLButtonElement => {
    const map: Record<string, number> = { translate: 0, rotate: 1 };
    return toolbar.querySelectorAll('button')[map[mode]] as HTMLButtonElement;
  };

  const toolbar = h('div', { class: 'view-toolbar' },
    h('strong', { style: 'font-size:13px' }, '灯头三维视图（点击灯头选中后拖拽）'),
    h('div', { class: 'spacer', style: 'flex:1' }),
    modeBtn('translate', '移动 (W)'),
    modeBtn('rotate', '旋转 (E)'),
    h('button', { class: 'tiny', onclick: () => view?.scene.resetView() }, '重置视角'),
  );

  const renderControls = () => {
    controlHost.replaceChildren();
    const lamp = scheme.lamps.find((l) => l.id === selectedLampId) ?? scheme.lamps[0];
    if (!lamp) {
      controlHost.append(h('div', { class: 'callout warn' }, '暂无灯头，请新增。'));
      return;
    }
    selectedLampId = lamp.id;

    const lampTabs = h('div', { class: 'tabs' },
      ...scheme.lamps.map((l) =>
        h('div', {
          class: `tab${l.id === lamp.id ? ' active' : ''}`,
          onclick: () => { selectedLampId = l.id; view?.scene.select('lamp', l.id); renderControls(); },
        }, l.name, l.enabled ? '' : h('span', { class: 'badge badge-warn', style: 'margin-left:6px' }, '停用')),
      ),
      h('button', {
        class: 'tiny',
        disabled: scheme.lamps.length >= 2,
        title: scheme.lamps.length >= 2 ? '最多支持双灯头' : '',
        onclick: () => {
          const nl: LampHeadConfig = {
            ...structuredClone(lamp),
            id: uid('lamp'),
            name: `灯头 ${scheme.lamps.length + 1}`,
            position: { x: lamp.position.x + 0.5, y: lamp.position.y, z: lamp.position.z },
            leds: lamp.leds.map((led) => ({ ...led, id: makeLedId() })),
          };
          appState.mutate((s) => s.lamps.push(nl));
          selectedLampId = nl.id;
          ctx.toast('已新增灯头（双灯头）');
        },
      }, '＋ 灯头'),
    );

    const totalPower = lamp.leds.reduce((s, l) => s + l.powerW, 0);
    const totalFlux = totalPower * lamp.luminousEfficacyLpW;

    controlHost.replaceChildren(
      h('div', {},
      lampTabs,
      h('div', { class: 'stat-grid' },
        statCard('LED 数量', String(lamp.leds.length)),
        statCard('总功率', `${totalPower.toFixed(1)} W`),
        statCard('总光通量', `${totalFlux.toFixed(0)} lm`),
        statCard('半光强角', `${halfIntensityAngleDeg(lamp.distribution).toFixed(1)}°`, '配光宽窄参考'),
      ),

      sectionTitle('灯头开关与名称'),
      h('div', { class: 'field-grid' },
        h('label', { class: 'field full' },
          h('span', { class: 'field-label' }, '灯头名称'),
          h('input', {
            type: 'text', value: lamp.name,
            onchange: (e: Event) => appState.mutate((s) => {
              const t = s.lamps.find((x) => x.id === lamp.id)!;
              t.name = (e.target as HTMLInputElement).value;
            }),
          }),
        ),
        toggleField('启用该灯头', lamp.enabled, (v) => appState.mutate((s) => {
          s.lamps.find((x) => x.id === lamp.id)!.enabled = v;
        })),
      ),

      sectionTitle('灯头位置与姿态（也可在 3D 视图拖拽）'),
      h('div', { class: 'field-grid' },
        numberField('位置 X', lamp.position.x, 0.01, (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.position.x = v; }), { unit: 'm' }),
        numberField('位置 Y（高度）', lamp.position.y, 0.01, (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.position.y = v; }), { unit: 'm', min: 0.5, max: 4 }),
        numberField('位置 Z', lamp.position.z, 0.01, (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.position.z = v; }), { unit: 'm' }),
      ),
      sliderField('俯仰角 pitch', lamp.pitchDeg, 0, 90, 0.5, '°', (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.pitchDeg = v; })),
      sliderField('偏航角 yaw', lamp.yawDeg, 0, 360, 0.5, '°', (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.yawDeg = v; })),
      sliderField('滚转角 roll', lamp.rollDeg, 0, 360, 0.5, '°', (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.rollDeg = v; })),

      sectionTitle('光度参数'),
      h('div', { class: 'field-grid' },
        numberField('光效', lamp.luminousEfficacyLpW, 5, (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.luminousEfficacyLpW = Math.max(1, v); }), { unit: 'lm/W', min: 1 }),
        numberField('灯盘半径', lamp.housingRadius, 0.01, (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.housingRadius = Math.max(0.05, v); }), { unit: 'm' }),
        numberField('默认单灯功率', lamp.defaultLedPowerW, 0.1, (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.defaultLedPowerW = Math.max(0.01, v); }), { unit: 'W' }),
      ),
      selectField('角分布模型', lamp.distribution.kind, [
        { value: 'cosn', text: 'cos^n 聚光（工程常用）' },
        { value: 'lambert', text: '朗伯分布（n=1）' },
        { value: 'uniformCone', text: '均匀锥光' },
      ], (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.distribution.kind = v; })),
      lamp.distribution.kind === 'cosn'
        ? sliderField('聚光指数 n（越大光斑越窄）', lamp.distribution.cosn ?? 12, 1, 40, 0.5, '', (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.distribution.cosn = v; }))
        : false,
      lamp.distribution.kind === 'uniformCone'
        ? sliderField('半锥角', lamp.distribution.coneAngleDeg ?? 30, 5, 85, 0.5, '°', (v) => appState.mutate((s) => { s.lamps.find((x) => x.id === lamp.id)!.distribution.coneAngleDeg = v; }))
        : false,

      sectionTitle('LED 环形排布'),
      ringEditor(lamp, ctx),
      sectionTitle('单颗 LED 明细（倾角 / 功率可逐颗编辑）'),
      ledTable(lamp),
      ),
    );
  };

  renderControls();

  root.replaceChildren(
    h('div', { class: 'page' },
      controlHost,
      h('div', { class: 'view-pane' }, toolbar, canvasHost),
    ),
  );

  view = mount3D(canvasHost, scheme);
  view.scene.select('lamp', selectedLampId);

  // 状态变化（含拖拽回写）后增量同步：3D 视图 sync，控件本地刷新
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

// ---------------------------------------------------------------------------

function ringEditor(lamp: LampHeadConfig, ctx: PageCtx): HTMLElement {
  const rings = new Map<number, { radius: number; count: number; tilt: number; power: number }>();
  for (const led of lamp.leds) {
    const key = led.ringRadius;
    const cur = rings.get(key) ?? { radius: key, count: 0, tilt: led.tiltDeg, power: led.powerW };
    cur.count++;
    rings.set(key, cur);
  }
  const ringList = [...rings.values()].sort((a, b) => a.radius - b.radius);

  const regen = (specs: { radius: number; count: number; tiltDeg: number; powerW: number }[]) => {
    appState.mutate((s) => {
      const t = s.lamps.find((x) => x.id === lamp.id)!;
      t.leds = buildRingLeds(specs.map((sp, i) => ({
        ringIndex: i, radius: sp.radius, count: sp.count,
        tiltDeg: sp.tiltDeg, powerW: sp.powerW,
      })));
    });
    ctx.toast('已按环形参数重新生成 LED');
  };

  return h('div', {},
    h('div', { class: 'table-wrap' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '环'), h('th', {}, '半径(mm)'), h('th', {}, '数量'), h('th', {}, '倾角(°)'), h('th', {}, '功率(W)'))),
        h('tbody', {}, ...ringList.map((r, i) =>
          h('tr', {},
            h('td', {}, `第 ${i + 1} 环`),
            h('td', {}, (r.radius * 1000).toFixed(0)),
            h('td', {}, String(r.count)),
            h('td', {}, r.tilt.toFixed(1)),
            h('td', {}, r.power.toFixed(2)),
          ),
        )),
      ),
    ),
    h('div', { class: 'row-actions', style: 'margin:10px 0' },
      h('button', {
        class: 'tiny',
        onclick: () => {
          const input = prompt('输入环参数，每行一个：半径mm,数量,倾角°,功率W\n例如：\n0,1,0,1.2\n90,8,8,1.2\n180,16,16,1.2',
            ringList.map((r) => `${Math.round(r.radius * 1000)},${r.count},${r.tilt},${r.power}`).join('\n'));
          if (!input) return;
          try {
            const specs = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
              const [radiusMm, count, tilt, power] = line.split(/[,，\s]+/).map(parseFloat);
              if ([radiusMm, count, tilt, power].some((v) => !Number.isFinite(v))) throw new Error('解析失败');
              return { radius: radiusMm / 1000, count: Math.max(1, Math.round(count)), tiltDeg: tilt, powerW: power };
            });
            regen(specs);
          } catch {
            ctx.toast('环参数格式错误', 'error');
          }
        },
      }, '批量编辑环参数'),
      h('button', {
        class: 'tiny',
        onclick: () => regen([
          { radius: 0, count: 1, tiltDeg: 0, powerW: lamp.defaultLedPowerW },
          { radius: 0.09, count: 8, tiltDeg: 8, powerW: lamp.defaultLedPowerW },
          { radius: 0.18, count: 16, tiltDeg: 16, powerW: lamp.defaultLedPowerW },
        ]),
      }, '恢复默认三环'),
      h('span', { class: 'badge badge-info' }, `${lamp.leds.length} 颗 LED`),
    ),
  );
}

function ledTable(lamp: LampHeadConfig): HTMLElement {
  const update = (id: string, patch: Partial<LedPlacement>) => {
    appState.mutate((s) => {
      const t = s.lamps.find((x) => x.id === lamp.id)!;
      const led = t.leds.find((l) => l.id === id);
      if (led) Object.assign(led, patch);
    });
  };
  const rows = lamp.leds.map((led, idx) =>
    h('tr', {},
      h('td', { class: 'mono' }, `#${idx + 1}`),
      h('td', {}, (led.ringRadius * 1000).toFixed(0)),
      h('td', {}, led.azDeg.toFixed(1)),
      h('td', {}, h('input', {
        type: 'number', step: 0.5, value: led.tiltDeg,
        onchange: (e: Event) => update(led.id, { tiltDeg: parseFloat((e.target as HTMLInputElement).value) }),
      })),
      h('td', {}, h('input', {
        type: 'number', step: 0.05, min: 0, value: led.powerW,
        onchange: (e: Event) => update(led.id, { powerW: Math.max(0, parseFloat((e.target as HTMLInputElement).value)) }),
      })),
      h('td', {}, h('button', {
        class: 'tiny danger',
        onclick: () => appState.mutate((s) => {
          const t = s.lamps.find((x) => x.id === lamp.id)!;
          t.leds = t.leds.filter((l) => l.id !== led.id);
        }),
      }, '删')),
    ),
  );
  return h('div', { class: 'table-wrap led-table' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, '#'), h('th', {}, '环半径(mm)'), h('th', {}, '方位角(°)'),
        h('th', {}, '倾角(°)'), h('th', {}, '功率(W)'), h('th', {}, '操作'))),
      h('tbody', {}, ...rows),
    ),
  );
}
