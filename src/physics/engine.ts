import type { OccluderConfig, RoomConfig, Vec3 } from '../types';
import { dot, sub, normalize, length } from './vec3';
import { luminousIntensity } from './distribution';
import type { WorldLed } from './geometry';
import { isOccluded } from './occlusion';
import type { LampHeadConfig } from '../types';
import { buildAllWorldLeds } from './geometry';

/**
 * 照度计算引擎 —— 全系统唯一的数值来源。
 *
 * 点光源余弦定律（逆平方 + 入射角余弦）：
 *
 *   E = I(θ) · cos i / r²
 *
 *   r   : LED 发光中心到测点的距离 (m)
 *   θ   : LED 发光轴与光线方向的夹角
 *   I(θ): 该方向光强 (cd)，由通量守恒的角分布给出
 *   i   : 光线方向与受光面法线（水平面 +Y）的夹角
 *
 * 水平面法向固定为 (0,1,0)，故 cos i = -rayDir.y。
 * 多颗 LED 的贡献直接线性叠加（照度可加性）。
 * 遮挡为确定性解析判定：连线穿过任一遮挡体则该 LED 贡献为 0。
 */

export interface LedContribution {
  ledId: string;
  lampId: string;
  /** 光程 r（米） */
  distance: number;
  /** 轴偏角 θ（度） */
  thetaDeg: number;
  /** 入射角 i（度） */
  incidenceDeg: number;
  /** 该方向光强 I(θ)（cd） */
  intensityCd: number;
  /** 无遮挡照度贡献（lux） */
  illuminanceLux: number;
  /** 是否被遮挡 */
  blocked: boolean;
}

export interface PointResult {
  totalLux: number;
  contributions: LedContribution[];
}

/** 单颗 LED 在水平面上点 p 的照度贡献（occluders 为空数组即无遮挡） */
export function ledPointIlluminance(
  led: WorldLed,
  lamp: LampHeadConfig,
  p: Vec3,
  occluders: OccluderConfig[],
): LedContribution {
  const delta = sub(p, led.position);
  const r = length(delta);
  const blocked = r > 1e-9 ? isOccluded(led.position, p, occluders) : false;
  if (r <= 1e-9) {
    return {
      ledId: led.id, lampId: led.lampId, distance: 0, thetaDeg: 0, incidenceDeg: 0,
      intensityCd: 0, illuminanceLux: 0, blocked,
    };
  }
  const rayDir = normalize(delta);
  const cosTheta = dot(led.axis, rayDir); // 轴·光线方向
  const thetaRad = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
  const cosIncidence = -rayDir.y; // 水平面法线 +Y
  const intensity = luminousIntensity(lamp.distribution, led.fluxLm, thetaRad);
  const e = cosIncidence > 0 ? (intensity * cosIncidence) / (r * r) : 0;
  return {
    ledId: led.id,
    lampId: led.lampId,
    distance: r,
    thetaDeg: (thetaRad * 180) / Math.PI,
    incidenceDeg: (Math.acos(Math.min(1, Math.max(-1, cosIncidence))) * 180) / Math.PI,
    intensityCd: intensity,
    illuminanceLux: e,
    blocked,
  };
}

/** 计算点 p 的总照度与逐 LED 明细（被遮挡贡献记 0，但明细保留可见） */
export function pointIlluminance(
  leds: WorldLed[],
  lamps: LampHeadConfig[],
  p: Vec3,
  occluders: OccluderConfig[],
): PointResult {
  const lampMap = new Map(lamps.map((l) => [l.id, l]));
  const contributions: LedContribution[] = [];
  let total = 0;
  for (const led of leds) {
    const lamp = lampMap.get(led.lampId);
    if (!lamp) continue;
    const c = ledPointIlluminance(led, lamp, p, occluders);
    if (!c.blocked) total += c.illuminanceLux;
    contributions.push(c);
  }
  return { totalLux: total, contributions };
}

// ---------------------------------------------------------------------------
// 术野平面网格
// ---------------------------------------------------------------------------

export interface IlluminanceGrid {
  /** 行优先 N×N，grid[i*N+j]，i 对应 z（行），j 对应 x（列） */
  values: Float64Array;
  n: number;
  /** 网格覆盖范围（米） */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 网格间距（米） */
  spacing: number;
  center: Vec3;
  planeHeight: number;
}

/** 在术野平面上生成 N×N 照度网格 */
export function computeGrid(
  lamps: LampHeadConfig[],
  room: RoomConfig,
  occluders: OccluderConfig[] = [],
): IlluminanceGrid {
  const leds = buildAllWorldLeds(lamps);
  const n = room.gridN;
  const half = room.fieldSize / 2;
  const minX = room.fieldCenter.x - half;
  const maxX = room.fieldCenter.x + half;
  const minZ = room.fieldCenter.z - half;
  const maxZ = room.fieldCenter.z + half;
  const spacing = room.fieldSize / (n - 1);
  const values = new Float64Array(n * n);
  const y = room.planeHeight;

  for (let i = 0; i < n; i++) {
    const z = maxZ - i * spacing; // 行从上(+Z)到下(-Z)，便于 canvas 直接绘制
    for (let j = 0; j < n; j++) {
      const x = minX + j * spacing;
      const res = pointIlluminance(leds, lamps, { x, y, z }, occluders);
      values[i * n + j] = res.totalLux;
    }
  }
  return { values, n, minX, maxX, minZ, maxZ, spacing, center: room.fieldCenter, planeHeight: y };
}

/** 双线性插值取网格任意 (x,z) 处照度，超出范围返回 null */
export function sampleGrid(g: IlluminanceGrid, x: number, z: number): number | null {
  if (x < g.minX || x > g.maxX || z < g.minZ || z > g.maxZ) return null;
  const fx = (x - g.minX) / g.spacing;
  const fz = (g.maxZ - z) / g.spacing;
  const j0 = Math.floor(fx);
  const i0 = Math.floor(fz);
  const j1 = Math.min(g.n - 1, j0 + 1);
  const i1 = Math.min(g.n - 1, i0 + 1);
  const tx = fx - j0;
  const tz = fz - i0;
  const v00 = g.values[i0 * g.n + j0];
  const v10 = g.values[i0 * g.n + j1];
  const v01 = g.values[i1 * g.n + j0];
  const v11 = g.values[i1 * g.n + j1];
  return (
    v00 * (1 - tx) * (1 - tz) +
    v10 * tx * (1 - tz) +
    v01 * (1 - tx) * tz +
    v11 * tx * tz
  );
}

export interface FieldMetrics {
  /** 中心照度 Ec（lux） */
  centerLux: number;
  meanLux: number;
  minLux: number;
  maxLux: number;
  /** 均匀度 Emin/Emean（0~1） */
  uniformity: number;
  /** d10 光斑直径（mm）：照度降至 Ec/10 的等照度线等效圆直径 */
  d10DiameterMm: number;
  /** d50 光斑直径（mm）：照度降至 Ec/2 的等照度线等效圆直径 */
  d50DiameterMm: number;
  /** 有效光斑内（≥Ec/10）平均照度（lux） */
  meanInsideD10: number;
  /** 参与统计的 LED 总数 */
  ledCount: number;
  totalPowerW: number;
  totalFluxLm: number;
}

/**
 * 按标准口径给出光斑直径：
 * 从中心沿 M 条径向射线找照度穿过阈值（Ec/10、Ec/2）的半径，
 * 线性插值定位交叉点，各射线半径取平均后 ×2 得等效圆直径。
 */
export function fieldMetrics(grid: IlluminanceGrid, lamps: LampHeadConfig[], spokes = 72): FieldMetrics {
  const centerLux = sampleGrid(grid, grid.center.x, grid.center.z) ?? grid.values[0];
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / grid.values.length;

  const radiusForThreshold = (threshold: number): number | null => {
    const maxR = Math.min(grid.maxX - grid.minX, grid.maxZ - grid.minZ) / 2;
    const radii: number[] = [];
    for (let s = 0; s < spokes; s++) {
      const phi = (s / spokes) * Math.PI * 2;
      const ux = Math.cos(phi);
      const uz = Math.sin(phi);
      let prevR = 0;
      let prevV = centerLux;
      const steps = Math.ceil(maxR / grid.spacing);
      let hit = false;
      for (let k = 1; k <= steps; k++) {
        const r = Math.min(maxR, (k * maxR) / steps);
        const v = sampleGrid(grid, grid.center.x + ux * r, grid.center.z + uz * r);
        if (v === null) break;
        if (v <= threshold) {
          // 在 (prevR, r) 间线性插值交叉点
          const span = prevV - v;
          const t = span > 1e-15 ? (prevV - threshold) / span : 0;
          radii.push(prevR + t * (r - prevR));
          hit = true;
          break;
        }
        prevR = r;
        prevV = v;
      }
      if (!hit) radii.push(maxR); // 阈值未到达，按网格边界保守计
    }
    if (radii.length === 0) return null;
    return radii.reduce((a, b) => a + b, 0) / radii.length;
  };

  const r10 = radiusForThreshold(centerLux / 10);
  const r50 = radiusForThreshold(centerLux / 2);
  const d10Mm = (r10 ?? 0) * 2 * 1000;
  const d50Mm = (r50 ?? 0) * 2 * 1000;

  // d10 内部平均照度
  let insideSum = 0;
  let insideCount = 0;
  const r10sq = (r10 ?? 0) * (r10 ?? 0);
  if (r10sq > 0) {
    for (let i = 0; i < grid.n; i++) {
      for (let j = 0; j < grid.n; j++) {
        const x = grid.minX + j * grid.spacing;
        const z = grid.maxZ - i * grid.spacing;
        const dx = x - grid.center.x;
        const dz = z - grid.center.z;
        if (dx * dx + dz * dz <= r10sq) {
          insideSum += grid.values[i * grid.n + j];
          insideCount++;
        }
      }
    }
  }

  let ledCount = 0;
  let totalPower = 0;
  let totalFlux = 0;
  for (const lamp of lamps) {
    if (!lamp.enabled) continue;
    ledCount += lamp.leds.length;
    for (const led of lamp.leds) {
      totalPower += led.powerW;
      totalFlux += led.powerW * lamp.luminousEfficacyLpW;
    }
  }

  return {
    centerLux,
    meanLux: mean,
    minLux: min,
    maxLux: max,
    uniformity: mean > 0 ? min / mean : 0,
    d10DiameterMm: d10Mm,
    d50DiameterMm: d50Mm,
    meanInsideD10: insideCount > 0 ? insideSum / insideCount : 0,
    ledCount,
    totalPowerW: totalPower,
    totalFluxLm: totalFlux,
  };
}
