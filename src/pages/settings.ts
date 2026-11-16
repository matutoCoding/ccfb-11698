import { h, sectionTitle, statCard } from '../ui/dom';
import { appState } from '../state';
import { runSelfTests } from '../ui/selftest';
import type { Scheme } from '../types';
import { saveStore } from '../storage';

interface PageCtx {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

export function renderSettingsPage(root: HTMLElement, scheme: Scheme, ctx: PageCtx): void {
  const resultBox = h('div', {});

  const runBtn = h('button', {
    class: 'primary',
    onclick: () => {
      const items = runSelfTests();
      resultBox.replaceChildren(
        h('div', { class: 'stat-grid', style: 'margin-bottom:14px' },
          statCard('自检项数', String(items.length)),
          statCard('通过', String(items.filter((i) => i.pass).length), '', true),
          statCard('失败', String(items.filter((i) => !i.pass).length), items.every((i) => i.pass) ? '全部通过' : '存在失败项'),
        ),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'data' },
            h('thead', {}, h('tr', {}, h('th', {}, '校验项'), h('th', {}, '结论'), h('th', {}, '详情'))),
            h('tbody', {}, ...items.map((it) =>
              h('tr', {},
                h('td', {}, it.name),
                h('td', {}, h('span', { class: it.pass ? 'badge badge-ok' : 'badge badge-danger' }, it.pass ? '通过' : '失败')),
                h('td', { class: 'mono', style: 'text-align:left' }, it.detail),
              ),
            )),
          ),
        ),
      );
      ctx.toast(items.every((i) => i.pass) ? '自检全部通过' : '自检存在失败项', items.every((i) => i.pass) ? 'ok' : 'error');
    },
  }, '运行计算自检');

  root.replaceChildren(
    h('div', { class: 'page single', style: 'flex-direction:column' },
      h('h2', { style: 'margin:0 0 12px;font-size:18px' }, '设置与计算自检'),

      h('div', { class: 'panel' },
        sectionTitle('方案信息'),
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, '方案名称'),
          h('input', {
            type: 'text', value: scheme.name,
            onchange: (e: Event) => appState.mutate((s) => { s.name = (e.target as HTMLInputElement).value; }),
          }),
        ),
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, '备注（随方案保存/导出）'),
          h('input', {
            type: 'text', value: scheme.note ?? '', placeholder: '例如：某三甲医院手术室投标配光方案',
            onchange: (e: Event) => appState.mutate((s) => { s.note = (e.target as HTMLInputElement).value; }),
          }),
        ),
        h('div', { class: 'muted', style: 'font-size:12px' },
          `方案 ID：${scheme.id} · 创建于 ${new Date(scheme.createdAt).toLocaleString('zh-CN')}`),
      ),

      h('div', { class: 'panel' },
        sectionTitle('计算引擎自检（手算一致性）'),
        h('div', { class: 'callout' },
          '自检使用与引擎相互独立的标量公式，验证点光源余弦定律、逆平方律、多光源叠加、解析遮挡与通量守恒。验收口径：单 LED 照度与闭式解误差 < 1%，遮挡残余照度与逐光源手算一致。'),
        runBtn,
        h('div', { style: 'height:14px' }),
        resultBox,
      ),

      h('div', { class: 'panel' },
        sectionTitle('数据管理'),
        h('div', { class: 'row-actions' },
          h('button', {
            onclick: () => { saveStore(appState.store, true); ctx.toast('已立即写入浏览器存储'); },
          }, '立即保存全部方案'),
          h('button', {
            class: 'danger',
            onclick: () => {
              if (confirm('确认清空浏览器中的全部方案并恢复默认？')) {
                localStorage.clear();
                location.reload();
              }
            },
          }, '清空并重置'),
        ),
        h('div', { class: 'muted', style: 'margin-top:10px;font-size:12px' },
          '存储键：shadowless-lamp-sim:*:v1；导出 JSON 可用于离线归档或跨浏览器迁移。'),
      ),

      h('div', { class: 'panel' },
        sectionTitle('计算口径说明'),
        h('ul', { class: 'muted', style: 'margin:0;padding-left:18px;line-height:1.9' },
          h('li', {}, '点光源公式：E = I(θ)·cos i / r²，θ 为轴偏角，i 为水平面入射角'),
          h('li', {}, '角分布 I(θ) 按总光通量 Φ 守恒归一化，cos^n 模型 K = 2π/(n+1)'),
          h('li', {}, '遮挡为线段-球/胶囊解析求交（闭式解），被遮挡 LED 贡献记 0，逐 LED 明细可导出复核'),
          h('li', {}, '光斑直径 d10/d50：72 条径向射线定位 Ec/10、Ec/2 等照度线并线性插值，取等效圆直径'),
          h('li', {}, 'three.js 虚拟聚光灯+PCFSoft 仅用于软阴影视觉呈现，不参与任何数值结论'),
        ),
      ),
    ),
  );
}
