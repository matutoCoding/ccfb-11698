import type { Vec3 } from '../types';
import { deg2rad } from './vec3';

/**
 * 最小四元数实现（Hamilton 约定，v' = q * v * q^-1）。
 *
 * 灯头局部坐标系约定：
 *   局部 -Y = 灯头主轴（pitch=0 时垂直向下）
 *   局部 XZ 平面 = LED 环形排布面
 *
 * 灯头姿态 q = Ry(yaw) · Rx(-pitch) · Ry(roll)
 *   pitch>0 时主轴向 +Z 倾斜；yaw 为水平分量方位角（从 +Z 起算转向 +X）；
 *   roll 为绕灯头主轴（局部 Y）的滚转，右乘 Ry 保证主轴在任意滚转角下不变。
 *   pitch 规范域 [0°,90°]：负俯仰与 yaw+180° 的主轴完全等价，不可区分。
 */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

/** 绕任意单位轴旋转 angleRad 的四元数 */
export const quatAxisAngle = (axis: Vec3, angleRad: number): Quat => {
  const h = angleRad * 0.5;
  const s = Math.sin(h);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) };
};

/** Hamilton 乘法：返回 a·b（先施加 b 再施加 a） */
export const quatMultiply = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

export const quatNormalize = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};

/** 用四元数旋转向量 */
export const quatRotate = (q: Quat, v: Vec3): Vec3 => {
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
};

const AXIS_X: Vec3 = { x: 1, y: 0, z: 0 };
const AXIS_Y: Vec3 = { x: 0, y: 1, z: 0 };

/** 由灯头欧拉角（度）构造姿态四元数 */
export const lampQuat = (pitchDeg: number, yawDeg: number, rollDeg: number): Quat => {
  const qYaw = quatAxisAngle(AXIS_Y, deg2rad(yawDeg));
  const qPitch = quatAxisAngle(AXIS_X, deg2rad(-pitchDeg));
  const qRoll = quatAxisAngle(AXIS_Y, deg2rad(rollDeg));
  return quatNormalize(quatMultiply(quatMultiply(qYaw, qPitch), qRoll));
};

/**
 * 从姿态四元数反解 pitch/yaw/roll（度）。
 * 轴向量 axis = -(q·(0,1,0))，roll 由局部 +X 基向量绕主轴的扭转角得到。
 * pitch≈0 时 yaw 与 roll 绕同一竖直轴、存在万向节奇异，规范取 yaw=0。
 */
export const extractPitchYawRoll = (q: Quat): { pitchDeg: number; yawDeg: number; rollDeg: number } => {
  const localY = quatRotate(q, { x: 0, y: 1, z: 0 });
  const axis = { x: -localY.x, y: -localY.y, z: -localY.z };
  // 带符号俯仰角：axis = (sin p·sin y, -cos p, sin p·cos y)
  const horiz = Math.hypot(axis.x, axis.z);
  const pitchDeg = (Math.atan2(horiz, -axis.y) * 180) / Math.PI;

  const xNow = quatRotate(q, { x: 1, y: 0, z: 0 });

  if (pitchDeg < 1e-6) {
    // 主轴垂直：q 等价于单一 Ry(yaw+roll)，规范 yaw=0
    // Ry(s)·e_x = (cos s, 0, -sin s)
    const s = Math.atan2(-xNow.z, xNow.x);
    return { pitchDeg: 0, yawDeg: 0, rollDeg: (s * 180) / Math.PI };
  }

  const yawDeg = (Math.atan2(axis.x, axis.z) * 180) / Math.PI;
  const q0 = lampQuat(pitchDeg, yawDeg, 0);
  const xRef = quatRotate(q0, { x: 1, y: 0, z: 0 });
  // 推导：dot(axis, cross(xRef, xNow)) = -sin(roll)
  const sinNegRoll =
    axis.x * (xRef.y * xNow.z - xRef.z * xNow.y) +
    axis.y * (xRef.z * xNow.x - xRef.x * xNow.z) +
    axis.z * (xRef.x * xNow.y - xRef.y * xNow.x);
  const cosRoll = xRef.x * xNow.x + xRef.y * xNow.y + xRef.z * xNow.z;
  const rollDeg = (Math.atan2(-sinNegRoll, cosRoll) * 180) / Math.PI;
  return { pitchDeg, yawDeg, rollDeg };
};
