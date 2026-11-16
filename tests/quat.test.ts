import { describe, it, expect } from 'vitest';
import { lampQuat, quatRotate, extractPitchYawRoll, quatMultiply, quatAxisAngle } from '../src/physics/quat';
import { deg2rad, rad2deg } from '../src/physics/vec3';

describe('灯头姿态四元数', () => {
  it('零姿态：局部 -Y 映射到世界 -Y（垂直向下）', () => {
    const q = lampQuat(0, 0, 0);
    const v = quatRotate(q, { x: 0, y: -1, z: 0 });
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(-1, 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it('pitch=90°：主轴转向 +Z', () => {
    const q = lampQuat(90, 0, 0);
    const v = quatRotate(q, { x: 0, y: -1, z: 0 });
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(1, 12);
  });

  it('pitch/yaw/roll 反解往返误差 < 1e-9 度', () => {
    // pitch 规范域 [0,90]（负俯仰与 yaw+180° 等价，主轴向量不可区分）
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [15, 30, 10],
      [20, 75, 45],
      [45, 290, -30],
      [80, 180, 90],
    ];
    for (const [p, y, r] of cases) {
      const q = lampQuat(p, y, r);
      const back = extractPitchYawRoll(q);
      expect(Math.abs(back.pitchDeg - p), `pitch ${p}`).toBeLessThan(1e-9);
      // yaw 在 pitch=0 附近与 roll 耦合，用角度差比较
      const dy = Math.atan2(
        Math.sin(deg2rad(back.yawDeg - y)),
        Math.cos(deg2rad(back.yawDeg - y)),
      );
      expect(Math.abs(rad2deg(dy)), `yaw ${y}`).toBeLessThan(1e-9);
      const dr = Math.atan2(
        Math.sin(deg2rad(back.rollDeg - r)),
        Math.cos(deg2rad(back.rollDeg - r)),
      );
      expect(Math.abs(rad2deg(dr)), `roll ${r}`).toBeLessThan(1e-9);
    }
  });

  it('四元数乘法结合旋转顺序：先 pitch 再 yaw', () => {
    // q = Ry(yaw)·Rx(-pitch)，验证与分步构造一致
    const q = lampQuat(30, 45, 0);
    const qy = quatAxisAngle({ x: 0, y: 1, z: 0 }, deg2rad(45));
    const qp = quatAxisAngle({ x: 1, y: 0, z: 0 }, deg2rad(-30));
    const q2 = quatMultiply(qy, qp);
    const v1 = quatRotate(q, { x: 0, y: -1, z: 0 });
    const v2 = quatRotate(q2, { x: 0, y: -1, z: 0 });
    expect(v1.x).toBeCloseTo(v2.x, 12);
    expect(v1.y).toBeCloseTo(v2.y, 12);
    expect(v1.z).toBeCloseTo(v2.z, 12);
  });

  it('滚转不改变主轴方向，只改变环上 LED 方位', () => {
    const q0 = lampQuat(20, 30, 0);
    const q1 = lampQuat(20, 30, 60);
    const axis0 = quatRotate(q0, { x: 0, y: -1, z: 0 });
    const axis1 = quatRotate(q1, { x: 0, y: -1, z: 0 });
    expect(axis0.x).toBeCloseTo(axis1.x, 12);
    expect(axis0.y).toBeCloseTo(axis1.y, 12);
    expect(axis0.z).toBeCloseTo(axis1.z, 12);
  });
});
