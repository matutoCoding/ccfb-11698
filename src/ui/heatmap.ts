import type { IlluminanceGrid } from '../physics/engine';

/**
 * 照度热力图：把解析引擎的 N×N 网格渲染到 canvas。
 * 配色采用工程上常见的蓝→青→绿→黄→红对数/线性混合，
 * 叠加 d10、d50 等照度线与十字中心标记。
 */

export interface HeatmapOptions {
  showIsolines?: boolean;
  logScale?: boolean;
}

function heatColor(t: number): [number, number, number] {
  // 五段色标：深蓝 → 蓝 → 青 → 绿 → 黄 → 红
  const stops: [number, [number, number, number]][] = [
    [0.0, [12, 28, 68]],
    [0.25, [30, 92, 196]],
    [0.5, [28, 190, 200]],
    [0.7, [70, 200, 90]],
    [0.85, [240, 210, 60]],
    [1.0, [235, 70, 45]],
  ];
  const x = Math.min(1, Math.max(0, t));
  for (let k = 1; k < stops.length; k++) {
    if (x <= stops[k][0]) {
      const [t0, c0] = stops[k - 1];
      const [t1, c1] = stops[k];
      const f = (x - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export function renderHeatmap(
  canvas: HTMLCanvasElement,
  grid: IlluminanceGrid,
  centerLux: number,
  opts: HeatmapOptions = {},
): void {
  const size = 520;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);

  const maxV = grid.values.reduce((m, v) => Math.max(m, v), 1e-9);
  const norm = (v: number) => {
    if (opts.logScale) {
      return Math.log1p(v) / Math.log1p(maxV);
    }
    return v / maxV;
  };

  // 最近邻采样网格到画布（网格本身已足够密）
  for (let py = 0; py < size; py++) {
    const i = Math.min(grid.n - 1, Math.floor((py / size) * grid.n));
    for (let px = 0; px < size; px++) {
      const j = Math.min(grid.n - 1, Math.floor((px / size) * grid.n));
      const v = grid.values[i * grid.n + j];
      const [r, g, b] = heatColor(norm(v));
      const o = (py * size + px) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const toPx = (x: number, z: number): [number, number] => [
    ((x - grid.minX) / (grid.maxX - grid.minX)) * size,
    ((grid.maxZ - z) / (grid.maxZ - grid.minZ)) * size,
  ];

  // 等照度线 d10（Ec/10）与 d50（Ec/2）
  if (opts.showIsolines !== false) {
    drawIsoline(ctx, grid, size, centerLux / 10, 'rgba(255,255,255,0.9)', 'd10', toPx);
    drawIsoline(ctx, grid, size, centerLux / 2, 'rgba(255,255,255,0.55)', 'd50', toPx);
  }

  // 中心十字
  const [cx, cy] = toPx(grid.center.x, grid.center.z);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  // 边框与比例尺
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

/** 用 marching-squares 简化版（逐格画阈值穿越线段）绘制等照度线 */
function drawIsoline(
  ctx: CanvasRenderingContext2D,
  grid: IlluminanceGrid,
  size: number,
  threshold: number,
  color: string,
  label: string,
  toPx: (x: number, z: number) => [number, number],
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = label === 'd10' ? 2 : 1.2;
  const cell = size / (grid.n - 1);
  ctx.beginPath();
  for (let i = 0; i < grid.n - 1; i++) {
    for (let j = 0; j < grid.n - 1; j++) {
      const v00 = grid.values[i * grid.n + j];
      const v10 = grid.values[i * grid.n + j + 1];
      const v01 = grid.values[(i + 1) * grid.n + j];
      const v11 = grid.values[(i + 1) * grid.n + j + 1];
      const bits = (v00 > threshold ? 1 : 0) | (v10 > threshold ? 2 : 0) | (v11 > threshold ? 4 : 0) | (v01 > threshold ? 8 : 0);
      if (bits === 0 || bits === 15) continue;
      const x0 = j * cell;
      const y0 = i * cell;
      const interp = (va: number, vb: number) => (threshold - va) / (vb - va);
      const pts: [number, number][] = [];
      // 上边 v00-v10
      if ((bits & 1) !== ((bits >> 1) & 1)) pts.push([x0 + interp(v00, v10) * cell, y0]);
      // 右边 v10-v11
      if (((bits >> 1) & 1) !== ((bits >> 2) & 1)) pts.push([x0 + cell, y0 + interp(v10, v11) * cell]);
      // 下边 v01-v11
      if (((bits >> 3) & 1) !== ((bits >> 2) & 1)) pts.push([x0 + interp(v01, v11) * cell, y0 + cell]);
      // 左边 v00-v01
      if ((bits & 1) !== ((bits >> 3) & 1)) pts.push([x0, y0 + interp(v00, v01) * cell]);
      if (pts.length >= 2) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        if (pts.length === 4) {
          ctx.moveTo(pts[2][0], pts[2][1]);
          ctx.lineTo(pts[3][0], pts[3][1]);
        }
      }
    }
  }
  ctx.stroke();

  // 标签放在右上角等照度线附近（近似）
  ctx.fillStyle = color;
  ctx.font = '12px system-ui, sans-serif';
  const lx = size - 70;
  const ly = label === 'd10' ? 18 : 34;
  ctx.fillText(`${label} (${Math.round(threshold)} lux)`, lx, ly);
}

/** 色标图例 canvas */
export function renderColorBar(canvas: HTMLCanvasElement, maxLux: number, logScale = false): void {
  canvas.width = 220;
  canvas.height = 18;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < canvas.width; x++) {
    const t = x / canvas.width;
    const v = logScale ? Math.expm1(t * Math.log1p(maxLux)) : t * maxLux;
    const [r, g, b] = heatColor(t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, canvas.height);
  }
  ctx.fillStyle = '#cfd8e3';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('0', 0, canvas.height + 12);
  ctx.fillText(`${Math.round(maxLux).toLocaleString()} lux`, canvas.width - 70, canvas.height + 12);
}
