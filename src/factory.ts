import type { Scheme, LampHeadConfig, RoomConfig, ShadowTestConfig, DepthCurveConfig, OccluderConfig, Vec3 } from './types';
import { SCHEME_VERSION } from './types';
import { makeLampHead } from './physics/layout';

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function defaultRoom(): RoomConfig {
  return {
    planeHeight: 0.95,
    fieldSize: 1.0,
    gridN: 81,
    fieldCenter: { x: 0, y: 0.95, z: 0 },
    roomWidth: 6,
    roomDepth: 6,
    roomHeight: 3,
  };
}

/** IEC 60601-2-41 思路的标准遮挡体预设（尺寸可在页面调整） */
export function defaultOccluders(): OccluderConfig[] {
  return [
    {
      id: uid('occ'),
      name: '医生头部（球）',
      kind: 'sphere',
      position: { x: 0, y: 1.35, z: 0.15 },
      radius: 0.1,
      halfLength: 0,
      axis: { x: 1, y: 0, z: 0 },
    },
    {
      id: uid('occ'),
      name: '医生手/前臂（胶囊）',
      kind: 'capsule',
      position: { x: 0.2, y: 1.15, z: 0 },
      radius: 0.04,
      halfLength: 0.08,
      axis: { x: 1, y: 0, z: 0 },
    },
  ];
}

export function defaultShadow(): ShadowTestConfig {
  return {
    samplePoint: { x: 0, y: 0.95, z: 0 },
    occluders: defaultOccluders(),
  };
}

export function defaultDepth(): DepthCurveConfig {
  return { startHeight: 0.7, endHeight: 1.4, steps: 14 };
}

export function defaultLamps(): LampHeadConfig[] {
  return [
    makeLampHead({
      id: uid('lamp'),
      name: '主灯头',
      position: { x: -0.35, y: 2.1, z: 0 },
    }),
    makeLampHead({
      id: uid('lamp'),
      name: '副灯头',
      position: { x: 0.35, y: 2.1, z: 0 },
    }),
  ];
}

export function createScheme(name: string): Scheme {
  const now = Date.now();
  return {
    version: SCHEME_VERSION,
    id: uid('scheme'),
    name,
    createdAt: now,
    updatedAt: now,
    room: defaultRoom(),
    lamps: defaultLamps(),
    shadow: defaultShadow(),
    depth: defaultDepth(),
    note: '',
  };
}

export function cloneScheme(s: Scheme, newName: string): Scheme {
  const now = Date.now();
  return {
    ...structuredClone(s),
    id: uid('scheme'),
    name: newName,
    createdAt: now,
    updatedAt: now,
  };
}

/** 导入时的轻量校验，避免坏数据进入引擎 */
export function validateScheme(raw: unknown): { ok: true; scheme: Scheme } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: '文件内容不是 JSON 对象' };
  const s = raw as Partial<Scheme>;
  if (!s || typeof s.name !== 'string') return { ok: false, error: '缺少 name 字段' };
  if (!Array.isArray(s.lamps) || s.lamps.length === 0) return { ok: false, error: 'lamps 为空或格式错误' };
  for (const lamp of s.lamps) {
    if (!lamp.position || !Array.isArray(lamp.leds)) {
      return { ok: false, error: `灯头 ${lamp.name ?? ''} 数据不完整` };
    }
  }
  if (!s.room || typeof s.room.planeHeight !== 'number') {
    return { ok: false, error: 'room 参数缺失' };
  }
  const scheme = structuredClone(raw) as Scheme;
  scheme.version = SCHEME_VERSION;
  scheme.id = s.id ?? uid('scheme');
  scheme.createdAt = s.createdAt ?? Date.now();
  scheme.updatedAt = Date.now();
  scheme.shadow ??= defaultShadow();
  scheme.depth ??= defaultDepth();
  scheme.note ??= '';
  return { ok: true, scheme };
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}
