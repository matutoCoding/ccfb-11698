import { describe, it, expect } from 'vitest';
import type { LampHeadConfig, OccluderConfig, Vec3 } from '../src/types';
import { makeLampHead } from '../src/physics/layout';
import { buildAllWorldLeds } from '../src/physics/geometry';
import {
  segmentHitsSphere,
  segmentHitsCapsule,
  segmentSegmentMinDistanceSq,
} from '../src/physics/occlusion';
import { runShadowTest } from '../src/physics/analysis';
import { pointIlluminance } from '../src/physics/engine';
import { sub, scale, add, length } from '../src/physics/vec3';

describe('解析遮挡求交', () => {
  it('射线-球：穿过球心、相切、远离三种情形判定正确', () => {
    const center: Vec3 = { x: 0, y: 1, z: 0 };
    const r = 0.1;
    // 穿球心
    expect(segmentHitsSphere({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, center, r)).toBe(true);
    // 远离（水平距离 0.5 > 0.1）
    expect(segmentHitsSphere({ x: 0.5, y: 2, z: 0 }, { x: 0.5, y: 0, z: 0 }, center, r)).toBe(false);
    // 相切：水平距离恰为 r
    expect(segmentHitsSphere({ x: 0.1, y: 2, z: 0 }, { x: 0.1, y: 0, z: 0 }, center, r)).toBe(true);
    // 端点在球内
    expect(segmentHitsSphere({ x: 0, y: 1.05, z: 0 }, { x: 0, y: 0, z: 0 }, center, r)).toBe(true);
    // 线段不过球（y 范围只在球上方）
    expect(segmentHitsSphere({ x: 0, y: 3, z: 0 }, { x: 0, y: 2.5, z: 0 }, center, r)).toBe(false);
  });

  it('射线-球解析结果与独立二次方程参考实现一致（随机线段）', () => {
    // 独立参考：经典 ray-sphere |o+td-c|²=r² 求判别式，再检查 t∈[0,1]
    const refSphere = (a: Vec3, b: Vec3, c: Vec3, r: number): boolean => {
      const d = sub(b, a);
      const oc = sub(a, c);
      const A = d.x * d.x + d.y * d.y + d.z * d.z;
      const B = 2 * (oc.x * d.x + oc.y * d.y + oc.z * d.z);
      const C = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - r * r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return false;
      const sq = Math.sqrt(disc);
      const t1 = (-B - sq) / (2 * A);
      const t2 = (-B + sq) / (2 * A);
      return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
    };
    // 确定性伪随机（不用 Math.random，保证可复现）
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const center: Vec3 = { x: 0.2, y: 1.3, z: -0.1 };
    for (let k = 0; k < 500; k++) {
      const a: Vec3 = { x: rand() * 2 - 1, y: 1 + rand() * 1.5, z: rand() * 2 - 1 };
      const b: Vec3 = { x: rand() * 2 - 1, y: rand() * 1.2, z: rand() * 2 - 1 };
      const r = 0.05 + rand() * 0.2;
      expect(segmentHitsSphere(a, b, center, r)).toBe(refSphere(a, b, center, r));
    }
  });

  it('胶囊：轴段中点命中、球冠命中、侧偏未命中', () => {
    const cap: OccluderConfig = {
      id: 'cap', name: '手', kind: 'capsule',
      position: { x: 0, y: 1.2, z: 0 },
      radius: 0.05, halfLength: 0.1,
      axis: { x: 1, y: 0, z: 0 },
    };
    // 垂直穿过圆柱段
    expect(segmentHitsCapsule({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, cap)).toBe(true);
    // 穿过球冠（x 超出半长但在球冠半径内）
    expect(segmentHitsCapsule({ x: 0.12, y: 2, z: 0 }, { x: 0.12, y: 0, z: 0 }, cap)).toBe(true);
    // 完全侧偏
    expect(segmentHitsCapsule({ x: 0, y: 2, z: 0.4 }, { x: 0, y: 0, z: 0.4 }, cap)).toBe(false);
    // 端点超出球冠范围
    expect(segmentHitsCapsule({ x: 0.3, y: 2, z: 0 }, { x: 0.3, y: 0, z: 0 }, cap)).toBe(false);
  });

  it('胶囊退化为球（halfLength=0）时与球判定一致', () => {
    const cap: OccluderConfig = {
      id: 'cap', name: '退化', kind: 'capsule',
      position: { x: 0.1, y: 1.2, z: 0.2 },
      radius: 0.08, halfLength: 0,
      axis: { x: 1, y: 0, z: 0 },
    };
    const a: Vec3 = { x: 0, y: 2, z: 0 };
    const b: Vec3 = { x: 0.2, y: 0, z: 0.3 };
    expect(segmentHitsCapsule(a, b, cap)).toBe(
      segmentHitsSphere(a, b, cap.position, cap.radius),
    );
  });

  it('线段间最小距离：平行、相交、异面均正确', () => {
    // 平行间距 0.3
    const d1 = segmentSegmentMinDistanceSq(
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 0, y: 0.3, z: 0 }, { x: 1, y: 0.3, z: 0 },
    );
    expect(d1).toBeCloseTo(0.09, 12);
    // 相交 → 0
    const d2 = segmentSegmentMinDistanceSq(
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 0.5, y: -1, z: 0 }, { x: 0.5, y: 1, z: 0 },
    );
    expect(d2).toBeCloseTo(0, 12);
  });
});

describe('标准遮挡测试：残余照度与逐光源手算一致', () => {
  const makeLamps = (): LampHeadConfig[] => {
    const a = makeLampHead({ id: 'A', name: '灯A', position: { x: -0.35, y: 2.0, z: 0 } });
    const b = makeLampHead({ id: 'B', name: '灯B', position: { x: 0.35, y: 2.0, z: 0 } });
    return [a, b];
  };

  const head: OccluderConfig = {
    id: 'head', name: '医生头部', kind: 'sphere',
    position: { x: 0, y: 1.35, z: 0 },
    radius: 0.1, halfLength: 0,
    axis: { x: 1, y: 0, z: 0 },
  };

  const point: Vec3 = { x: 0, y: 0.95, z: 0 };

  it('无遮挡残余比例 = 100%，遮挡后 0 < 比例 < 1', () => {
    const lamps = makeLamps();
    const clean = runShadowTest(lamps, point, []);
    expect(clean.residualRatio).toBeCloseTo(1, 12);
    const blocked = runShadowTest(lamps, point, [head]);
    expect(blocked.residualRatio).toBeGreaterThan(0);
    expect(blocked.residualRatio).toBeLessThan(1);
    expect(blocked.shadowedLux).toBeLessThan(blocked.unobstructedLux);
  });

  it('残余照度 = 逐 LED 未遮挡贡献之和（与引擎明细完全相等）', () => {
    const lamps = makeLamps();
    const res = runShadowTest(lamps, point, [head]);
    const sumFromDetails = res.contributions
      .filter((c) => !c.blocked)
      .reduce((s, c) => s + c.illuminanceLux, 0);
    expect(Math.abs(sumFromDetails - res.shadowedLux)).toBeLessThan(1e-12);
    // 每灯统计与总明细一致
    for (const stat of res.perLamp) {
      const lampRows = res.contributions.filter((c) => c.lampId === stat.lampId);
      const s = lampRows.filter((c) => !c.blocked).reduce((x, c) => x + c.illuminanceLux, 0);
      expect(stat.shadowedLux).toBeCloseTo(s, 12);
      expect(stat.blockedLedCount).toBe(lampRows.filter((c) => c.blocked).length);
    }
  });

  it('独立手算复核：自己用点光源公式+几何遮挡重算，残余比例一致 < 0.5%', () => {
    const lamps = makeLamps();
    const engineRes = runShadowTest(lamps, point, [head]);

    // 独立复算：直接取世界 LED，用最朴素的标量公式与球方程判定
    const leds = buildAllWorldLeds(lamps);
    let cleanSum = 0;
    let shadowSum = 0;
    const lampById = new Map(lamps.map((l) => [l.id, l]));
    for (const led of leds) {
      const lamp = lampById.get(led.lampId)!;
      const d = sub(point, led.position);
      const r = length(d);
      const u = scale(d, 1 / r);
      const cosT = led.axis.x * u.x + led.axis.y * u.y + led.axis.z * u.z;
      const n = lamp.distribution.cosn!;
      const flux = led.fluxLm;
      const K = (2 * Math.PI) / (n + 1);
      const I = cosT > 0 ? (flux / K) * Math.pow(cosT, n) : 0;
      const cosI = -u.y;
      const e = cosI > 0 ? (I * cosI) / (r * r) : 0;
      cleanSum += e;
      // 遮挡：球心到线段最近距离
      const t = Math.min(1, Math.max(0, (
        (head.position.x - led.position.x) * d.x +
        (head.position.y - led.position.y) * d.y +
        (head.position.z - led.position.z) * d.z) / (r * r)));
      const closest = add(led.position, scale(d, t));
      const distSq =
        (closest.x - head.position.x) ** 2 +
        (closest.y - head.position.y) ** 2 +
        (closest.z - head.position.z) ** 2;
      if (distSq > head.radius * head.radius) shadowSum += e;
    }
    const handRatio = shadowSum / cleanSum;
    expect(Math.abs(handRatio - engineRes.residualRatio) / handRatio).toBeLessThan(0.005);
    expect(Math.abs(cleanSum - engineRes.unobstructedLux) / cleanSum).toBeLessThan(1e-10);
    expect(Math.abs(shadowSum - engineRes.shadowedLux) / shadowSum).toBeLessThan(1e-10);
  });

  it('胶囊遮挡体（手）场景：结果确定且明细自洽', () => {
    const lamps = makeLamps();
    const hand: OccluderConfig = {
      id: 'hand', name: '医生手', kind: 'capsule',
      position: { x: 0.1, y: 1.15, z: 0 },
      radius: 0.04, halfLength: 0.08,
      axis: { x: 1, y: 0, z: 0 },
    };
    const r1 = runShadowTest(lamps, point, [hand]);
    const r2 = runShadowTest(lamps, point, [hand]);
    expect(r1.residualRatio).toBe(r2.residualRatio); // 确定性
    expect(r1.contributions.some((c) => c.blocked)).toBe(true);
    const direct = pointIlluminance(buildAllWorldLeds(lamps), lamps, point, [hand]);
    expect(direct.totalLux).toBeCloseTo(r1.shadowedLux, 12);
  });
});
