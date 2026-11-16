import type { Vec3 } from '../types';

/** 三维向量纯函数工具集，物理引擎内部统一使用，避免与 three.js 耦合 */

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const lengthSq = (a: Vec3): number => dot(a, a);

export const length = (a: Vec3): number => Math.sqrt(lengthSq(a));

export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  if (l < 1e-15) return { x: 0, y: 0, z: 0 };
  const inv = 1 / l;
  return { x: a.x * inv, y: a.y * inv, z: a.z * inv };
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;
