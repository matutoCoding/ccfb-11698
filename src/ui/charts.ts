/** 极简折线图（纯 canvas，无依赖），用于深度衰减曲线等 */

export interface LineSeries {
  label: string;
  color: string;
  points: { x: number; y: number }[];
}

export interface LineChartOptions {
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
  yMin?: number;
}

export function renderLineChart(canvas: HTMLCanvasElement, series: LineSeries[], opts: LineChartOptions = {}): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = opts.width ?? 560;
  const h = opts.height ?? 300;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const padL = 64;
  const padR = 16;
  const padT = 18;
  const padB = 46;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allPts = series.flatMap((s) => s.points);
  if (allPts.length === 0) return;
  const xMin = Math.min(...allPts.map((p) => p.x));
  const xMax = Math.max(...allPts.map((p) => p.x));
  const yMax = Math.max(...allPts.map((p) => p.y)) * 1.08;
  const yMin = opts.yMin ?? 0;

  const X = (x: number) => padL + ((x - xMin) / Math.max(1e-12, xMax - xMin)) * plotW;
  const Y = (y: number) => padT + plotH - ((y - yMin) / Math.max(1e-12, yMax - yMin)) * plotH;

  // 背景
  ctx.fillStyle = '#141b26';
  ctx.fillRect(0, 0, w, h);

  // 网格 + Y 刻度
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.fillStyle = '#9fb0c3';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  const ticks = 5;
  for (let k = 0; k <= ticks; k++) {
    const val = yMin + (yMax - yMin) * (k / ticks);
    const yy = Y(val);
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL + plotW, yy);
    ctx.stroke();
    ctx.fillText(val >= 1000 ? val.toFixed(0) : val.toFixed(1), padL - 6, yy + 4);
  }

  // X 刻度
  ctx.textAlign = 'center';
  for (let k = 0; k <= ticks; k++) {
    const val = xMin + (xMax - xMin) * (k / ticks);
    const xx = X(val);
    ctx.fillText(val.toFixed(2), xx, padT + plotH + 16);
  }

  // 轴标题
  ctx.fillStyle = '#c6d2e0';
  ctx.textAlign = 'center';
  if (opts.xLabel) ctx.fillText(opts.xLabel, padL + plotW / 2, h - 8);
  ctx.save();
  ctx.translate(16, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  if (opts.yLabel) ctx.fillText(opts.yLabel, 0, 0);
  ctx.restore();

  // 数据线
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const xx = X(p.x);
      const yy = Y(p.y);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    ctx.fillStyle = s.color;
    for (const p of s.points) {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 图例
  ctx.textAlign = 'left';
  series.forEach((s, i) => {
    const lx = padL + 10 + i * 150;
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, padT - 8, 14, 3);
    ctx.fillStyle = '#d5deea';
    ctx.fillText(s.label, lx + 18, padT - 4);
  });
}
