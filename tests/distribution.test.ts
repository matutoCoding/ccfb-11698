import { describe, it, expect } from 'vitest';
import { luminousIntensity, fluxNormalizationK, shapeFactor, halfIntensityAngleDeg } from '../src/physics/distribution';
import { deg2rad } from '../src/physics/vec3';

/**
 * 与文档/手算完全一致的独立标量参考实现，
 * 用于交叉验证引擎（防止引擎与测试犯同一种结构性错误）。
 */
function refIntensity(kind: string, flux: number, thetaDeg: number, n = 12, coneDeg = 30): number {
  const theta = deg2rad(thetaDeg);
  let K: number;
  let f: number;
  if (kind === 'lambert') {
    K = Math.PI;
    f = Math.max(0, Math.cos(theta));
  } else if (kind === 'cosn') {
    K = (2 * Math.PI) / (n + 1);
    f = Math.cos(theta) > 0 ? Math.pow(Math.cos(theta), n) : 0;
  } else {
    const a = deg2rad(coneDeg);
    K = 2 * Math.PI * (1 - Math.cos(a));
    f = theta <= a ? 1 : 0;
  }
  return (flux / K) * f;
}

describe('角分布：通量守恒归一化', () => {
  it('cos^n 数值积分总通量与输入通量一致（误差 < 0.1%）', () => {
    for (const n of [1, 4, 12, 30]) {
      const d = { kind: 'cosn' as const, cosn: n };
      const flux = 144; // lm
      const steps = 200000;
      let integrated = 0;
      const dTheta = Math.PI / 2 / steps;
      for (let k = 0; k < steps; k++) {
        const theta = (k + 0.5) * dTheta;
        const I = luminousIntensity(d, flux, theta);
        integrated += I * 2 * Math.PI * Math.sin(theta) * dTheta;
      }
      expect(Math.abs(integrated - flux) / flux).toBeLessThan(1e-3);
    }
  });

  it('lambert / uniformCone 同样满足通量守恒', () => {
    const flux = 100;
    for (const d of [
      { kind: 'lambert' as const },
      { kind: 'uniformCone' as const, coneAngleDeg: 25 },
    ]) {
      const steps = 200000;
      const maxTheta = d.kind === 'lambert' ? Math.PI / 2 : deg2rad(25);
      const dTheta = maxTheta / steps;
      let integrated = 0;
      for (let k = 0; k < steps; k++) {
        const theta = (k + 0.5) * dTheta;
        integrated += luminousIntensity(d, flux, theta) * 2 * Math.PI * Math.sin(theta) * dTheta;
      }
      expect(Math.abs(integrated - flux) / flux).toBeLessThan(1e-3);
    }
  });

  it('引擎光强与独立参考实现在多角度下完全一致', () => {
    const flux = 144;
    for (const theta of [0, 5, 12.7, 23.4, 40, 60, 80]) {
      const n = 12;
      const d = { kind: 'cosn' as const, cosn: n };
      expect(luminousIntensity(d, flux, deg2rad(theta))).toBeCloseTo(
        refIntensity('cosn', flux, theta, n),
        10,
      );
    }
  });

  it('解析 K 与公式 K=2π/(n+1) 一致', () => {
    const n = 12;
    expect(fluxNormalizationK({ kind: 'cosn', cosn: n })).toBeCloseTo((2 * Math.PI) / (n + 1), 12);
    expect(fluxNormalizationK({ kind: 'lambert' })).toBeCloseTo(Math.PI, 12);
  });

  it('半光强角解析值正确', () => {
    // cos^12 θ = 0.5 → θ = arccos(2^(-1/12))
    const expected = (Math.acos(Math.pow(0.5, 1 / 12)) * 180) / Math.PI;
    expect(halfIntensityAngleDeg({ kind: 'cosn', cosn: 12 })).toBeCloseTo(expected, 10);
  });

  it('shapeFactor 边界：背光半球为 0、锥外为 0', () => {
    expect(shapeFactor({ kind: 'cosn', cosn: 8 }, deg2rad(95))).toBe(0);
    expect(shapeFactor({ kind: 'uniformCone', coneAngleDeg: 30 }, deg2rad(31))).toBe(0);
    expect(shapeFactor({ kind: 'uniformCone', coneAngleDeg: 30 }, deg2rad(29))).toBe(1);
  });
});
