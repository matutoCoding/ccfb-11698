import type { LampHeadConfig, OccluderConfig, Vec3, DepthCurveConfig } from '../types';
import { buildAllWorldLeds } from './geometry';
import { pointIlluminance, type LedContribution } from './engine';

/**
 * 标准遮挡测试（参照 IEC 60601-2-41 无影灯残余照度试验思路）：
 * 在采样点分别计算「无遮挡」与「放置遮挡体」的总照度，
 * 残余照度比例 = E_shadow / E_unobstructed。
 *
 * 逐 LED 明细同时输出，每颗灯的遮挡判定可与手算逐项核对。
 */

export interface LampShadowStat {
  lampId: string;
  unobstructedLux: number;
  shadowedLux: number;
  blockedLedCount: number;
  totalLedCount: number;
}

export interface ShadowTestResult {
  point: Vec3;
  unobstructedLux: number;
  shadowedLux: number;
  /** 残余照度比例 0~1（百分比展示 ×100） */
  residualRatio: number;
  /** 阴影深度 1-残余比例 */
  shadowDepth: number;
  perLamp: LampShadowStat[];
  /** 逐 LED 明细（遮挡场景），供导出 CSV 与手算复核 */
  contributions: LedContribution[];
  /** 实际参与的遮挡体 id */
  occluderIds: string[];
}

export function runShadowTest(
  lamps: LampHeadConfig[],
  point: Vec3,
  occluders: OccluderConfig[],
): ShadowTestResult {
  const leds = buildAllWorldLeds(lamps);
  const empty: OccluderConfig[] = [];
  const clean = pointIlluminance(leds, lamps, point, empty);
  const shadowed = pointIlluminance(leds, lamps, point, occluders);

  const perLampMap = new Map<string, LampShadowStat>();
  for (const lamp of lamps) {
    if (!lamp.enabled) continue;
    perLampMap.set(lamp.id, {
      lampId: lamp.id,
      unobstructedLux: 0,
      shadowedLux: 0,
      blockedLedCount: 0,
      totalLedCount: lamp.leds.length,
    });
  }

  for (const c of shadowed.contributions) {
    const stat = perLampMap.get(c.lampId);
    if (!stat) continue;
    if (c.blocked) stat.blockedLedCount++;
    else stat.shadowedLux += c.illuminanceLux;
  }
  for (const c of clean.contributions) {
    const stat = perLampMap.get(c.lampId);
    if (stat) stat.unobstructedLux += c.illuminanceLux;
  }

  const residual = clean.totalLux > 0 ? shadowed.totalLux / clean.totalLux : 0;
  return {
    point,
    unobstructedLux: clean.totalLux,
    shadowedLux: shadowed.totalLux,
    residualRatio: residual,
    shadowDepth: 1 - residual,
    perLamp: [...perLampMap.values()],
    contributions: shadowed.contributions,
    occluderIds: occluders.map((o) => o.id),
  };
}

// ---------------------------------------------------------------------------
// 深度方向照度衰减曲线
// ---------------------------------------------------------------------------

export interface DepthPoint {
  /** 平面高度（米） */
  height: number;
  /** 该高度术野中心照度（lux） */
  centerLux: number;
  /** 灯头到平面的垂直/光程参考距离（米，取启用灯头平均高度差） */
  lampDistance: number;
}

/**
 * 沿深度方向（不同术野平面高度）计算中心照度。
 * 点光源满足逆平方律，单灯垂直照射时 E∝1/d²；双灯为两者叠加。
 */
export function depthCurve(
  lamps: LampHeadConfig[],
  center: Vec3,
  cfg: DepthCurveConfig,
  occluders: OccluderConfig[] = [],
): DepthPoint[] {
  const active = lamps.filter((l) => l.enabled);
  const avgLampY = active.length
    ? active.reduce((s, l) => s + l.position.y, 0) / active.length
    : 0;
  const out: DepthPoint[] = [];
  const steps = Math.max(2, cfg.steps);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const h = cfg.startHeight + (cfg.endHeight - cfg.startHeight) * t;
    const leds = buildAllWorldLeds(lamps);
    const res = pointIlluminance(leds, lamps, { x: center.x, y: h, z: center.z }, occluders);
    out.push({
      height: h,
      centerLux: res.totalLux,
      lampDistance: Math.max(0, avgLampY - h),
    });
  }
  return out;
}
