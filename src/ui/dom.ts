/** DOM 构建小工具：hyperscript 风格，保持无框架依赖 */

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

type Child = Node | string | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  const appendChild = (child: Child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(appendChild);
      return;
    }
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  };
  children.forEach(appendChild);
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

export function numberField(
  label: string,
  value: number,
  step: number,
  onChange: (v: number) => void,
  extra: { min?: number; max?: number; unit?: string; disabled?: boolean } = {},
): HTMLElement {
  const input = h('input', {
    type: 'number',
    value: Number.isFinite(value) ? roundDisplay(value) : 0,
    step,
    min: extra.min,
    max: extra.max,
    disabled: extra.disabled ?? false,
    onchange: () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) onChange(v);
    },
  }) as HTMLInputElement;
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label + (extra.unit ? `（${extra.unit}）` : '')),
    input,
  );
}

export function sliderField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit: string,
  onChange: (v: number) => void,
): HTMLElement {
  const valSpan = h('span', { class: 'slider-val' }, `${roundDisplay(value)} ${unit}`);
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: () => {
      const v = parseFloat(input.value);
      valSpan.textContent = `${roundDisplay(v)} ${unit}`;
      onChange(v);
    },
  }) as HTMLInputElement;
  return h('label', { class: 'field slider-field' },
    h('span', { class: 'field-label' }, label),
    h('div', { class: 'slider-row' }, input, valSpan),
  );
}

export function selectField<T extends string>(
  label: string,
  value: T,
  options: { value: T; text: string }[],
  onChange: (v: T) => void,
): HTMLElement {
  const sel = h('select', {
    onchange: () => onChange(sel.value as T),
  }, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.text))) as HTMLSelectElement;
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), sel);
}

export function toggleField(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    checked: value,
    onchange: () => onChange(input.checked),
  }) as HTMLInputElement;
  return h('label', { class: 'field toggle-field' }, h('span', { class: 'field-label' }, label), input);
}

function roundDisplay(v: number): number {
  return Math.abs(v) >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000;
}

export function statCard(label: string, value: string, hint = '', accent = false): HTMLElement {
  return h('div', { class: `stat-card${accent ? ' accent' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    hint ? h('div', { class: 'stat-hint' }, hint) : null,
  );
}

export function sectionTitle(text: string): HTMLElement {
  return h('h3', { class: 'section-title' }, text);
}

export function badge(text: string, kind = 'info'): HTMLElement {
  return h('span', { class: `badge badge-${kind}` }, text);
}
