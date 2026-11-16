import type { LampHeadConfig, LedPlacement, Vec3 } from '../types';
import { deg2rad } from './vec3';
import { lampQuat, quatRotate, type Quat } from './quat';

/** 一颗 LED 在世界坐标系中的完整几何/光度描述 */
export interface WorldLed {
  id: string;
  lampId: string;
  /** 发光中心（世界坐标，米） */
  position: Vec3;
  /** 发光轴单位向量（世界坐标） */
  axis: Vec3;
  /** 输入功率 W */
  powerW: number;
  /** 总光通量 lm（功率 × 灯头光效） */
  fluxLm: number;
}

/**
 * LED 局部发光轴：
 *   无倾角时沿局部 -Y；倾角 tilt 绕局部 X 轴旋转，
 *   tilt>0 时光轴向局部 +Z 方向倾斜（环形排布上指向外侧可配合 az 实现）。
 */
export function ledLocalAxis(led: LedPlacement): Vec3 {
  const t = deg2rad(led.tiltDeg);
  // Rx(t) · (0,-1,0) = (0, -cos t, sin t)
  return { x: 0, y: -Math.cos(t), z: Math.sin(t) };
}

/** LED 局部位置：环半径 ringRadius 上方位角 az 处的排布点 */
export function ledLocalPosition(led: LedPlacement): Vec3 {
  const a = deg2rad(led.azDeg);
  return { x: led.ringRadius * Math.cos(a), y: 0, z: led.ringRadius * Math.sin(a) };
}

/** 灯头姿态四元数（按 config 欧拉角） */
export function lampOrientation(lamp: LampHeadConfig): Quat {
  return lampQuat(lamp.pitchDeg, lamp.yawDeg, lamp.rollDeg);
}

/** 把一个灯头的全部 LED 变换到世界坐标（不做 enabled 过滤，由调用方处理） */
export function buildWorldLeds(lamp: LampHeadConfig): WorldLed[] {
  const q = lampOrientation(lamp);
  return lamp.leds.map((led) => {
    const localPos = ledLocalPosition(led);
    const localAxis = ledLocalAxis(led);
    const position: Vec3 = {
      x: lamp.position.x + quatRotate(q, localPos).x,
      y: lamp.position.y + quatRotate(q, localPos).y,
      z: lamp.position.z + quatRotate(q, localPos).z,
    };
    const axis = quatRotate(q, localAxis);
    const fluxLm = led.powerW * lamp.luminousEfficacyLpW;
    return { id: led.id, lampId: lamp.id, position, axis, powerW: led.powerW, fluxLm };
  });
}

/** 场景中所有启用灯头的全部 LED */
export function buildAllWorldLeds(lamps: LampHeadConfig[]): WorldLed[] {
  return lamps.filter((l) => l.enabled).flatMap(buildWorldLeds);
}
