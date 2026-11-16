/**
 * 环形 LED 排布生成器。
 * 环上 LED 均匀分布方位角；相邻环可设置角度错位（stagger）使光斑更均匀。
 */
import type { AngularDistribution, LampHeadConfig, LedPlacement } from '../types';

export interface RingSpec {
  ringIndex: number;
  radius: number;
  count: number;
  tiltDeg: number;
  powerW: number;
  /** 方位角起始偏移（度），用于错位排布 */
  azOffsetDeg?: number;
}

let seq = 0;
export function makeLedId(): string {
  seq += 1;
  return `led_${Date.now().toString(36)}_${seq}`;
}

export function buildRingLeds(rings: RingSpec[]): LedPlacement[] {
  const leds: LedPlacement[] = [];
  for (const ring of rings) {
    const offset = ring.azOffsetDeg ?? (ring.ringIndex % 2 === 1 ? 180 / ring.count : 0);
    for (let k = 0; k < ring.count; k++) {
      const az = offset + (360 / ring.count) * k;
      leds.push({
        id: makeLedId(),
        ringRadius: ring.radius,
        azDeg: az,
        tiltDeg: ring.tiltDeg,
        powerW: ring.powerW,
      });
    }
  }
  return leds;
}

export function defaultDistribution(): AngularDistribution {
  return { kind: 'cosn', cosn: 12 };
}

/** 生成一个标准灯头：中心 1 颗 + 两环（8/16），典型手术灯布局 */
export function makeLampHead(partial: Partial<LampHeadConfig> & { id: string; name: string; position: { x: number; y: number; z: number } }): LampHeadConfig {
  const rings: RingSpec[] = [
    { ringIndex: 0, radius: 0, count: 1, tiltDeg: 0, powerW: partial.defaultLedPowerW ?? 1.2 },
    { ringIndex: 1, radius: 0.09, count: 8, tiltDeg: 8, powerW: partial.defaultLedPowerW ?? 1.2 },
    { ringIndex: 2, radius: 0.18, count: 16, tiltDeg: 16, powerW: partial.defaultLedPowerW ?? 1.2 },
  ];
  return {
    enabled: true,
    pitchDeg: 0,
    yawDeg: 0,
    rollDeg: 0,
    luminousEfficacyLpW: 120,
    defaultLedPowerW: 1.2,
    distribution: defaultDistribution(),
    housingRadius: 0.22,
    leds: buildRingLeds(rings),
    ...partial,
  };
}
