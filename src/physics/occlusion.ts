import type { OccluderConfig, Vec3 } from '../types';
import { dot, sub, add, scale, lengthSq, clamp } from './vec3';

/**
 * 遮挡判定：解析法判断线段 [A, B] 是否与遮挡体相交。
 * 全部为闭式解（无采样、无迭代），保证可逐光源复算、结果确定性。
 *
 * - sphere  ：射线-球二次方程
 * - capsule ：到线段（胶囊轴段）的最近点距离判定，等价于无限圆柱 + 两端球冠
 */

export interface Segment {
  a: Vec3;
  b: Vec3;
}

/** 线段到点 c 的最近点参数 t∈[0,1] */
function closestTOnSegment(a: Vec3, b: Vec3, c: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz;
  if (denom < 1e-18) return 0;
  const t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / denom;
  return clamp(t, 0, 1);
}

/** 线段 [a,b] 与球 (center, r) 是否相交（含相切，端点在球内也算遮挡） */
export function segmentHitsSphere(a: Vec3, b: Vec3, center: Vec3, r: number): boolean {
  // 最近点距离判定，数值稳定且天然处理「端点在球内」
  const t = closestTOnSegment(a, b, center);
  const p = add(a, scale(sub(b, a), t));
  return lengthSq(sub(p, center)) <= r * r + 1e-15;
}

/**
 * 线段 [a,b] 与胶囊是否相交。
 * 胶囊 = 轴段 [c-h·u, c+h·u]（c 为中点，u 为单位轴，h 为半长）的半径 r 扫掠体。
 * 两线段间最近距离 ≤ r 即相交（圆柱段 + 球冠统一处理）。
 */
export function segmentHitsCapsule(a: Vec3, b: Vec3, o: OccluderConfig): boolean {
  const c = o.position;
  const u = o.axis;
  const h = o.halfLength;
  const p0 = sub(c, scale(u, h));
  const p1 = add(c, scale(u, h));
  const d2 = segmentSegmentMinDistanceSq(a, b, p0, p1);
  return d2 <= o.radius * o.radius + 1e-15;
}

/** 两线段 S1=[p1,q1]、S2=[p2,q2] 的最小距离平方（Real-Time Collision Detection, Christer Ericson 5.1.9） */
export function segmentSegmentMinDistanceSq(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const EPS = 1e-12;
  let s: number;
  let t: number;

  if (a <= EPS && e <= EPS) {
    return lengthSq(sub(p1, p2));
  }
  if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const c1 = add(p1, scale(d1, s));
  const c2 = add(p2, scale(d2, t));
  return lengthSq(sub(c1, c2));
}

/** 单颗 LED 到目标点的连线是否被任一遮挡体挡住 */
export function isOccluded(ledPos: Vec3, target: Vec3, occluders: OccluderConfig[]): boolean {
  for (const o of occluders) {
    if (o.kind === 'sphere') {
      if (segmentHitsSphere(ledPos, target, o.position, o.radius)) return true;
    } else {
      if (segmentHitsCapsule(ledPos, target, o)) return true;
    }
  }
  return false;
}
