import type { AngularDistribution } from '../types';
import { deg2rad } from './vec3';

/**
 * LED 轴上光强角分布 I(θ)，θ 为发光轴到光线方向的夹角。
 * 所有分布均按「总光通量 Φ 守恒」归一化：
 *
 *   Φ = ∫ I(θ) dΩ = 2π ∫₀^π I(θ) sinθ dθ
 *
 * 给定 LED 光通量 Φ（= 功率 × 光效），轴上光强 I0 = Φ / K，
 * K = 2π ∫₀^π f(θ) sinθ dθ，f(0)=1。
 */

/** 归一化形状因子 f(θ)（轴上为 1） */
export function shapeFactor(d: AngularDistribution, thetaRad: number): number {
  const cos = Math.cos(thetaRad);
  switch (d.kind) {
    case 'lambert':
      return Math.max(0, cos);
    case 'cosn': {
      const n = d.cosn ?? 10;
      // 仅前向半球发光
      if (cos <= 0) return 0;
      return Math.pow(cos, n);
    }
    case 'uniformCone': {
      const half = deg2rad(d.coneAngleDeg ?? 30);
      return thetaRad <= half ? 1 : 0;
    }
  }
}

/** 通量归一化系数 K，使 I(θ) = (Φ/K)·f(θ) 的总通量恰为 Φ */
export function fluxNormalizationK(d: AngularDistribution): number {
  switch (d.kind) {
    case 'lambert':
      // 2π ∫₀^π/2 cosθ sinθ dθ = π
      return Math.PI;
    case 'cosn': {
      const n = d.cosn ?? 10;
      // 2π ∫₀^π/2 cos^n θ sinθ dθ = 2π/(n+1)
      return (2 * Math.PI) / (n + 1);
    }
    case 'uniformCone': {
      const half = deg2rad(d.coneAngleDeg ?? 30);
      // 2π ∫₀^α sinθ dθ = 2π(1-cosα)
      return 2 * Math.PI * (1 - Math.cos(half));
    }
  }
}

/** 由总光通量与角度求光强 I(θ)（cd = lm/sr） */
export function luminousIntensity(d: AngularDistribution, totalFluxLm: number, thetaRad: number): number {
  const I0 = totalFluxLm / fluxNormalizationK(d);
  return I0 * shapeFactor(d, thetaRad);
}

/** 半光强角（度）：I(θ)=I0/2 的角度，用于 UI 展示配光宽窄 */
export function halfIntensityAngleDeg(d: AngularDistribution): number {
  switch (d.kind) {
    case 'lambert':
      return 60; // cos60° = 0.5
    case 'cosn': {
      const n = d.cosn ?? 10;
      return (Math.acos(Math.pow(0.5, 1 / n)) * 180) / Math.PI;
    }
    case 'uniformCone':
      return d.coneAngleDeg ?? 30;
  }
}
