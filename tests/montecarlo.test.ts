import { describe, it, expect } from 'vitest';
import type { LampHeadConfig, Vec3 } from '../src/types';
import { makeLampHead } from '../src/physics/layout';
import { buildAllWorldLeds, ledLocalAxis, ledLocalPosition } from '../src/physics/geometry';
import { pointIlluminance } from '../src/physics/engine';
import { lampQuat, quatRotate } from '../src/physics/quat';
import { normalize, sub } from '../src/physics/vec3';

/**
 * 随机化交叉验证（确定性 LCG 种子，可复现）：
 * 参考实现完全独立地从「灯头配置 → 四元数 → LED 世界位姿 → 点光源公式」重算，
 * 不调用引擎的 pointIlluminance。覆盖单/双灯、随机位姿、功率、倾角与测点。
 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function referenceLampIlluminance(lamp: LampHeadConfig, p: Vec3): number {
  const q = lampQuat(lamp.pitchDeg, lamp.yawDeg, lamp.rollDeg);
  let total = 0;
  for (const led of lamp.leds) {
    const localPos = ledLocalPosition(led);
    const localAxis = ledLocalAxis(led);
    const wp = {
      x: lamp.position.x + quatRotate(q, localPos).x,
      y: lamp.position.y + quatRotate(q, localPos).y,
      z: lamp.position.z + quatRotate(q, localPos).z,
    };
    const axis = quatRotate(q, localAxis);
    const d = sub(p, wp);
    const r = Math.hypot(d.x, d.y, d.z);
    const u = normalize(d);
    const cosT = axis.x * u.x + axis.y * u.y + axis.z * u.z;
    if (cosT <= 0) continue;
    const n = lamp.distribution.cosn ?? 10;
    const flux = led.powerW * lamp.luminousEfficacyLpW;
    const K = (2 * Math.PI) / (n + 1);
    const I = (flux / K) * Math.pow(cosT, n);
    const cosI = -u.y;
    if (cosI > 0) total += (I * cosI) / (r * r);
  }
  return total;
}

describe('随机配置交叉验证（500 组）', () => {
  it('引擎与独立参考实现逐点相对误差全部 < 0.1%', () => {
    const rand = mulberry32(20261116);
    let checked = 0;
    for (let k = 0; k < 500; k++) {
      const lampCount = rand() > 0.4 ? 2 : 1;
      const lamps: LampHeadConfig[] = [];
      for (let li = 0; li < lampCount; li++) {
        const lamp = makeLampHead({
          id: `L${li}`,
          name: `灯${li}`,
          position: {
            x: (rand() - 0.5) * 0.8,
            y: 1.8 + rand() * 0.6,
            z: (rand() - 0.5) * 0.8,
          },
        });
        lamp.pitchDeg = rand() * 35;
        lamp.yawDeg = rand() * 360;
        lamp.rollDeg = rand() * 90;
        lamp.distribution = { kind: 'cosn', cosn: 6 + Math.floor(rand() * 24) };
        lamp.luminousEfficacyLpW = 80 + rand() * 80;
        for (const led of lamp.leds) {
          led.powerW = 0.5 + rand() * 2;
          led.tiltDeg = rand() * 25;
        }
        lamps.push(lamp);
      }
      const p: Vec3 = {
        x: (rand() - 0.5) * 0.6,
        y: 0.85 + rand() * 0.2,
        z: (rand() - 0.5) * 0.6,
      };
      const engine = pointIlluminance(buildAllWorldLeds(lamps), lamps, p, []).totalLux;
      const ref = lamps.reduce((s, l) => s + referenceLampIlluminance(l, p), 0);
      if (ref > 100) {
        expect(Math.abs(engine - ref) / ref, `配置 #${k}`).toBeLessThan(1e-3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});
