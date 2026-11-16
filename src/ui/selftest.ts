/**
 * 浏览器内置自检：不依赖 vitest，在设置页一键运行。
 * 用独立标量公式复核引擎，覆盖单灯照度、逆平方律、遮挡一致性、通量守恒。
 */
import { makeLampHead } from '../physics/layout';
import { buildAllWorldLeds } from '../physics/geometry';
import { pointIlluminance } from '../physics/engine';
import { runShadowTest } from '../physics/analysis';
import { luminousIntensity } from '../physics/distribution';
import type { OccluderConfig, Vec3 } from '../types';

export interface SelfTestItem {
  name: string;
  pass: boolean;
  detail: string;
}

export function runSelfTests(): SelfTestItem[] {
  const out: SelfTestItem[] = [];

  // 1. 单 LED 垂直照度 vs 闭式解 E = (Φ/K)/r²
  {
    const lamp = makeLampHead({ id: 't', name: 't', position: { x: 0, y: 2, z: 0 } });
    lamp.leds = [{ id: 'only', ringRadius: 0, azDeg: 0, tiltDeg: 0, powerW: 1.2 }];
    const n = lamp.distribution.cosn ?? 12;
    const p: Vec3 = { x: 0, y: 0.95, z: 0 };
    const r = 2 - p.y;
    const flux = 1.2 * lamp.luminousEfficacyLpW;
    const expected = (flux / ((2 * Math.PI) / (n + 1))) / (r * r);
    const got = pointIlluminance(buildAllWorldLeds([lamp]), [lamp], p, []).totalLux;
    const err = Math.abs(got - expected) / expected;
    out.push({
      name: '单 LED 垂直照度 vs 点光源闭式解',
      pass: err < 0.01,
      detail: `引擎 ${got.toFixed(3)} lux / 闭式解 ${expected.toFixed(3)} lux，相对误差 ${(err * 100).toFixed(4)}%（阈值 1%）`,
    });
  }

  // 2. 逆平方律（必须用轴上单颗垂直 LED：环形 LED 的 θ 角随距离变化，不满足纯 1/r²）
  {
    const lamp = makeLampHead({ id: 't', name: 't', position: { x: 0, y: 2, z: 0 } });
    lamp.leds = [{ id: 'only', ringRadius: 0, azDeg: 0, tiltDeg: 0, powerW: 1.2 }];
    const leds = buildAllWorldLeds([lamp]);
    const e1 = pointIlluminance(leds, [lamp], { x: 0, y: 1.5, z: 0 }, []).totalLux;
    const e2 = pointIlluminance(leds, [lamp], { x: 0, y: 1.0, z: 0 }, []).totalLux;
    // r1=0.5 → r2=1.0，距离加倍，理论 1/4
    const expected = e1 * 0.25;
    const err = Math.abs(e2 - expected) / expected;
    out.push({
      name: '逆平方律（轴上单灯，距离加倍 → 1/4 照度）',
      pass: err < 0.01,
      detail: `${e1.toFixed(1)} → ${e2.toFixed(1)} lux，理论 ${expected.toFixed(1)}，误差 ${(err * 100).toFixed(4)}%`,
    });
  }

  // 3. 双灯可加性
  {
    const a = makeLampHead({ id: 'a', name: 'a', position: { x: -0.3, y: 2, z: 0 } });
    const b = makeLampHead({ id: 'b', name: 'b', position: { x: 0.3, y: 2, z: 0 } });
    const p: Vec3 = { x: 0, y: 0.95, z: 0 };
    const ea = pointIlluminance(buildAllWorldLeds([a]), [a], p, []).totalLux;
    const eb = pointIlluminance(buildAllWorldLeds([b]), [b], p, []).totalLux;
    const eab = pointIlluminance(buildAllWorldLeds([a, b]), [a, b], p, []).totalLux;
    const err = Math.abs(eab - (ea + eb)) / (ea + eb);
    out.push({
      name: '多光源照度可加性',
      pass: err < 1e-9,
      detail: `双灯 ${eab.toFixed(2)} vs 单灯之和 ${(ea + eb).toFixed(2)}，误差 ${(err * 100).toExponential(2)}%`,
    });
  }

  // 4. 遮挡：残余照度 = 逐 LED 未遮挡贡献之和
  {
    const a = makeLampHead({ id: 'a', name: 'a', position: { x: -0.35, y: 2, z: 0 } });
    const b = makeLampHead({ id: 'b', name: 'b', position: { x: 0.35, y: 2, z: 0 } });
    const head: OccluderConfig = {
      id: 'h', name: '头', kind: 'sphere',
      position: { x: 0, y: 1.35, z: 0 }, radius: 0.1, halfLength: 0,
      axis: { x: 1, y: 0, z: 0 },
    };
    const res = runShadowTest([a, b], { x: 0, y: 0.95, z: 0 }, [head]);
    const sum = res.contributions.filter((c) => !c.blocked).reduce((s, c) => s + c.illuminanceLux, 0);
    const err = Math.abs(sum - res.shadowedLux) / Math.max(res.shadowedLux, 1e-9);
    out.push({
      name: '遮挡残余照度与逐 LED 明细一致',
      pass: err < 1e-9 && res.residualRatio > 0 && res.residualRatio < 1,
      detail: `残余比例 ${(res.residualRatio * 100).toFixed(2)}%，明细求和误差 ${(err * 100).toExponential(2)}%，遮挡 LED ${res.contributions.filter((c) => c.blocked).length}/${res.contributions.length} 颗`,
    });
  }

  // 5. 通量守恒（数值积分）
  {
    const flux = 144;
    const n = 12;
    const steps = 50000;
    const dTheta = (Math.PI / 2) / steps;
    let integrated = 0;
    for (let k = 0; k < steps; k++) {
      const theta = (k + 0.5) * dTheta;
      integrated += luminousIntensity({ kind: 'cosn', cosn: n }, flux, theta) * 2 * Math.PI * Math.sin(theta) * dTheta;
    }
    const err = Math.abs(integrated - flux) / flux;
    out.push({
      name: '角分布通量守恒（cos^n 积分 = 输入光通量）',
      pass: err < 0.001,
      detail: `积分通量 ${integrated.toFixed(3)} lm / 设定 ${flux} lm，误差 ${(err * 100).toFixed(4)}%`,
    });
  }

  return out;
}
