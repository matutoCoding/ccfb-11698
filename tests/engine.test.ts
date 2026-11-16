import { describe, it, expect } from 'vitest';
import type { LampHeadConfig, Scheme, Vec3 } from '../src/types';
import { makeLampHead } from '../src/physics/layout';
import { buildAllWorldLeds } from '../src/physics/geometry';
import { pointIlluminance, computeGrid, fieldMetrics } from '../src/physics/engine';
import { luminousIntensity } from '../src/physics/distribution';
import { deg2rad } from '../src/physics/vec3';

/**
 * 手算一致性测试（核心验收项）：
 * 单颗 LED 的引擎照度 vs 点光源公式 E = I(θ)·cos i / r² 的独立标量手算。
 */

function singleLedLamp(pos: Vec3, tilt = 0, n = 12, efficacy = 120, power = 1.2): LampHeadConfig {
  const lamp = makeLampHead({ id: 'L1', name: '单灯', position: pos });
  lamp.leds = [
    { id: 'only', ringRadius: 0, azDeg: 0, tiltDeg: tilt, powerW: power },
  ];
  lamp.distribution = { kind: 'cosn', cosn: n };
  lamp.luminousEfficacyLpW = efficacy;
  return lamp;
}

/** 独立手算：不调用引擎任何函数，只复用纯数学分布公式 */
function handCalc(lamp: LampHeadConfig, p: Vec3): number {
  const led = lamp.leds[0];
  const flux = led.powerW * lamp.luminousEfficacyLpW;
  const n = lamp.distribution.cosn!;
  // LED 世界位置 = 灯头位置（ringRadius=0）；轴 = 局部 (0,-1,0) 经 Rx(-pitch)
  const pitch = deg2rad(lamp.pitchDeg);
  const axis: Vec3 = { x: 0, y: -Math.cos(pitch), z: Math.sin(pitch) };
  const dx = p.x - lamp.position.x;
  const dy = p.y - lamp.position.y;
  const dz = p.z - lamp.position.z;
  const r = Math.hypot(dx, dy, dz);
  const ux = dx / r;
  const uy = dy / r;
  const uz = dz / r;
  const cosTheta = axis.x * ux + axis.y * uy + axis.z * uz;
  const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
  const K = (2 * Math.PI) / (n + 1);
  const I = cosTheta > 0 ? (flux / K) * Math.pow(cosTheta, n) : 0;
  const cosInc = -uy; // 水平面 +Y 法向
  return cosInc > 0 ? (I * cosInc) / (r * r) : 0;
}

describe('单 LED 照度 vs 点光源手算公式（误差 < 1%）', () => {
  const lampPos: Vec3 = { x: 0, y: 2.0, z: 0 };
  const lamp = singleLedLamp(lampPos);

  it('垂直正下方：引擎值与手算一致，且与闭式解 E=I0/r² 一致', () => {
    const p: Vec3 = { x: 0, y: 0.95, z: 0 };
    const leds = buildAllWorldLeds([lamp]);
    const res = pointIlluminance(leds, [lamp], p, []);
    const hand = handCalc(lamp, p);

    // 闭式解：θ=0, i=0 → E = (Φ/K)/r²
    const r = lampPos.y - p.y;
    const flux = 1.2 * 120;
    const K = (2 * Math.PI) / 13;
    const closed = flux / K / (r * r);

    expect(res.totalLux).toBeGreaterThan(0);
    expect(Math.abs(res.totalLux - hand) / hand).toBeLessThan(0.01);
    expect(Math.abs(res.totalLux - closed) / closed).toBeLessThan(1e-12);
  });

  it('偏离中心多点：相对误差全部 < 1%', () => {
    const points: Vec3[] = [];
    for (const x of [-0.4, -0.2, -0.07, 0.11, 0.33]) {
      for (const z of [-0.3, 0, 0.25]) {
        points.push({ x, y: 0.95, z });
      }
    }
    const leds = buildAllWorldLeds([lamp]);
    for (const p of points) {
      const res = pointIlluminance(leds, [lamp], p, []);
      const hand = handCalc(lamp, p);
      if (hand > 1e-6) {
        expect(Math.abs(res.totalLux - hand) / hand, `点 ${JSON.stringify(p)}`).toBeLessThan(0.01);
      }
    }
  });

  it('灯头倾斜 20°：引擎与手算一致 < 1%', () => {
    const tilted = singleLedLamp(lampPos, 0);
    tilted.pitchDeg = 20;
    const leds = buildAllWorldLeds([tilted]);
    const points: Vec3[] = [
      { x: 0, y: 0.95, z: 0 },
      { x: 0.15, y: 0.95, z: 0.3 },
      { x: -0.2, y: 0.95, z: -0.1 },
    ];
    for (const p of points) {
      const res = pointIlluminance(leds, [tilted], p, []);
      const hand = handCalc(tilted, p);
      expect(Math.abs(res.totalLux - hand) / Math.max(hand, 1e-9), `点 ${JSON.stringify(p)}`).toBeLessThan(0.01);
    }
  });

  it('不同高度（逆平方律）：r 加倍，垂直照度降到 1/4，误差 < 0.1%', () => {
    const leds = buildAllWorldLeds([lamp]);
    const e1 = pointIlluminance(leds, [lamp], { x: 0, y: 1.5, z: 0 }, []).totalLux;
    const e2 = pointIlluminance(leds, [lamp], { x: 0, y: 0.475, z: 0 }, []).totalLux;
    // r1=0.5, r2=1.525 不是整倍数，按真实距离比换算
    const r1 = 2.0 - 1.5;
    const r2 = 2.0 - 0.475;
    const expected = e1 * (r1 * r1) / (r2 * r2);
    expect(Math.abs(e2 - expected) / expected).toBeLessThan(1e-3);
  });

  it('照度可加性：双灯 = 两单灯之和（机器精度）', () => {
    const a = singleLedLamp({ x: -0.3, y: 2.0, z: 0 });
    a.id = 'A';
    a.leds[0].id = 'a1';
    const b = singleLedLamp({ x: 0.3, y: 2.0, z: 0 });
    b.id = 'B';
    b.leds[0].id = 'b1';
    const p: Vec3 = { x: 0, y: 0.95, z: 0.05 };
    const ea = pointIlluminance(buildAllWorldLeds([a]), [a], p, []).totalLux;
    const eb = pointIlluminance(buildAllWorldLeds([b]), [b], p, []).totalLux;
    const eab = pointIlluminance(buildAllWorldLeds([a, b]), [a, b], p, []).totalLux;
    expect(Math.abs(eab - (ea + eb)) / (ea + eb)).toBeLessThan(1e-12);
  });
});

describe('网格与光斑指标', () => {
  it('中心照度与单点计算一致，d10 在合理量级', () => {
    const lamp = makeLampHead({ id: 'L1', name: '满配', position: { x: 0, y: 2.0, z: 0 } });
    const room = {
      planeHeight: 0.95, fieldSize: 1.2, gridN: 61,
      fieldCenter: { x: 0, y: 0.95, z: 0 },
      roomWidth: 6, roomDepth: 6, roomHeight: 3,
    };
    const grid = computeGrid([lamp], room, []);
    const m = fieldMetrics(grid, [lamp]);
    const leds = buildAllWorldLeds([lamp]);
    const center = pointIlluminance(leds, [lamp], { x: 0, y: 0.95, z: 0 }, []).totalLux;
    expect(Math.abs(m.centerLux - center) / center).toBeLessThan(1e-12);
    expect(m.d10DiameterMm).toBeGreaterThan(100);
    expect(m.d10DiameterMm).toBeLessThan(1200);
    expect(m.d50DiameterMm).toBeLessThan(m.d10DiameterMm);
    expect(m.ledCount).toBe(25);
  });
});
