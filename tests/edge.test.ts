import { describe, it, expect } from 'vitest';
import { makeLampHead } from '../src/physics/layout';
import { computeGrid, fieldMetrics, pointIlluminance } from '../src/physics/engine';
import { buildAllWorldLeds } from '../src/physics/geometry';
import { runShadowTest } from '../src/physics/analysis';
import type { RoomConfig } from '../src/types';

const room = (): RoomConfig => ({
  planeHeight: 0.95, fieldSize: 0.6, gridN: 11,
  fieldCenter: { x: 0, y: 0.95, z: 0 },
  roomWidth: 6, roomDepth: 6, roomHeight: 3,
});

describe('边界与健壮性', () => {
  it('全部灯头停用：照度为 0，指标不产生 NaN/Infinity', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 2, z: 0 } });
    lamp.enabled = false;
    const grid = computeGrid([lamp], room(), []);
    for (const v of grid.values) expect(v).toBe(0);
    const m = fieldMetrics(grid, [lamp]);
    expect(Number.isFinite(m.centerLux)).toBe(true);
    expect(m.centerLux).toBe(0);
    expect(Number.isFinite(m.uniformity)).toBe(true);
    expect(m.d10DiameterMm).toBe(0);
  });

  it('测点位于灯头上方（背光）：cos i ≤ 0，照度为 0 不报错', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 1.0, z: 0 } });
    const leds = buildAllWorldLeds([lamp]);
    const res = pointIlluminance(leds, [lamp], { x: 0, y: 2.5, z: 0 }, []);
    expect(res.totalLux).toBe(0);
    expect(res.contributions.length).toBe(lamp.leds.length);
  });

  it('零功率 LED：贡献为 0，不影响其他 LED', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 2, z: 0 } });
    lamp.leds.forEach((l) => (l.powerW = 0));
    const res = pointIlluminance(buildAllWorldLeds([lamp]), [lamp], { x: 0, y: 0.95, z: 0 }, []);
    expect(res.totalLux).toBe(0);
    for (const c of res.contributions) expect(c.intensityCd).toBe(0);
  });

  it('无 LED 灯头：网格正常计算且为 0', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 2, z: 0 } });
    lamp.leds = [];
    const grid = computeGrid([lamp], room(), []);
    expect(grid.values.every((v) => v === 0)).toBe(true);
  });

  it('无遮挡体时阴影测试残余比例为 1，空遮挡体数组安全', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 2, z: 0 } });
    const res = runShadowTest([lamp], { x: 0, y: 0.95, z: 0 }, []);
    expect(res.residualRatio).toBeCloseTo(1, 12);
    expect(res.shadowedLux).toBe(res.unobstructedLux);
    expect(res.perLamp[0].blockedLedCount).toBe(0);
  });

  it('遮挡体完全包裹测点：所有近距 LED 被挡，残余为 0（不产生除零）', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 2, z: 0 } });
    const bigSphere = {
      id: 'big', name: '大球', kind: 'sphere' as const,
      position: { x: 0, y: 0.95, z: 0 }, radius: 0.5, halfLength: 0,
      axis: { x: 1, y: 0, z: 0 },
    };
    const res = runShadowTest([lamp], { x: 0, y: 0.95, z: 0 }, [bigSphere]);
    expect(res.shadowedLux).toBe(0);
    expect(res.residualRatio).toBe(0);
    expect(Number.isFinite(res.residualRatio)).toBe(true);
  });

  it('大网格（121×121）计算在合理时间内完成', () => {
    const lamp = makeLampHead({ id: 'a', name: 'a', position: { x: 0, y: 2, z: 0 } });
    const bigRoom = room();
    bigRoom.gridN = 121;
    const t0 = performance.now();
    const grid = computeGrid([lamp], bigRoom, []);
    const elapsed = performance.now() - t0;
    expect(grid.values.length).toBe(121 * 121);
    expect(elapsed).toBeLessThan(2000);
  });
});
