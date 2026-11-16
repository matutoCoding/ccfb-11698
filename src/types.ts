/**
 * 核心数据模型 —— 方案 / 灯头 / LED / 手术室 / 遮挡体
 * 所有角度单位均为「度」，距离单位均为「米」，光通量 lm，照度 lux(lm/m²)。
 * 坐标系：three.js 习惯，Y 轴向上；术野平面为水平面 (XZ 平面, y = planeHeight)。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type DistributionKind = 'cosn' | 'lambert' | 'uniformCone';

/** LED 轴上光强角分布 I(θ) 的参数 */
export interface AngularDistribution {
  /** cosn: I=I0*cos^n θ；lambert: I=I0*cos θ（等价 n=1）；uniformCone: 锥内 I0、锥外 0 */
  kind: DistributionKind;
  /** cosn 模式的聚光指数 n，n 越大光斑越窄 */
  cosn?: number;
  /** uniformCone 的半锥角（度） */
  coneAngleDeg?: number;
}

/** 单颗 LED 相对灯头中心的环形排布参数（极坐标，灯头局部坐标） */
export interface LedPlacement {
  id: string;
  /** 所在环半径（米） */
  ringRadius: number;
  /** 在环上的方位角（度，灯头局部系） */
  azDeg: number;
  /** 发光轴相对灯头主轴（局部 -Y 方向）的倾角（度），0 = 垂直向下 */
  tiltDeg: number;
  /** 输入电功率（W） */
  powerW: number;
}

export type OccluderKind = 'sphere' | 'capsule';

export interface OccluderConfig {
  id: string;
  name: string;
  kind: OccluderKind;
  /** 球心 / 胶囊段中点，世界坐标（米） */
  position: Vec3;
  /** 球半径；胶囊时为截面半径（米） */
  radius: number;
  /** 胶囊段半长（米），球形体该值为 0 */
  halfLength: number;
  /** 胶囊段轴方向单位向量；球形体忽略 */
  axis: Vec3;
}

export interface LampHeadConfig {
  id: string;
  name: string;
  enabled: boolean;
  /** 灯头中心（LED 排布中心）世界坐标（米） */
  position: Vec3;
  /** 灯头主轴朝向：俯仰角（度），0 = 垂直向下，正值向 +Z 倾斜 */
  pitchDeg: number;
  /** 灯头主轴朝向：偏航角（度），绕世界 Y 轴 */
  yawDeg: number;
  /** 灯头绕自身主轴的滚转角（度），影响 LED 环方位角 */
  rollDeg: number;
  /** 每瓦电功产生的光通量（lm/W），灯头级默认值，单灯可覆盖 */
  luminousEfficacyLpW: number;
  /** 默认单灯功率（W），新增 LED 时使用 */
  defaultLedPowerW: number;
  /** 角分布参数（灯头统一，简化工程模型） */
  distribution: AngularDistribution;
  /** 灯头圆盘半径（米，用于 3D 外形与排布校验） */
  housingRadius: number;
  leds: LedPlacement[];
}

export interface RoomConfig {
  /** 术野平面高度（米），通常为手术台面高度，默认 0.95 m */
  planeHeight: number;
  /** 照度计算区域边长（米，正方形，术野中心居中） */
  fieldSize: number;
  /** 每维网格采样点数（N×N），默认 81（间距约 25mm @ 2m 区域） */
  gridN: number;
  /** 术野中心在 XZ 平面的位置（米） */
  fieldCenter: Vec3;
  /** 房间尺寸（米），仅用于 3D 场景 */
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}

export interface ShadowTestConfig {
  /** 残余照度采样点（默认术野中心） */
  samplePoint: Vec3;
  occluders: OccluderConfig[];
}

export interface DepthCurveConfig {
  /** 起始平面高度（米） */
  startHeight: number;
  /** 终止平面高度（米） */
  endHeight: number;
  /** 采样步数 */
  steps: number;
}

export interface Scheme {
  /** 持久化格式版本 */
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  room: RoomConfig;
  lamps: LampHeadConfig[];
  shadow: ShadowTestConfig;
  depth: DepthCurveConfig;
  /** 备注 */
  note?: string;
}

export const SCHEME_VERSION = 1 as const;
