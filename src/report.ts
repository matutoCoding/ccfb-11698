import type { Scheme } from './types';
import type { IlluminanceGrid, FieldMetrics } from './physics/engine';
import type { ShadowTestResult } from './physics/analysis';
import type { DepthPoint } from './physics/analysis';

/**
 * 测试报告 CSV 导出。
 * UTF-8 BOM 保证 Excel 直接打开中文不乱码；分节用空行+标题行组织。
 */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(digits);
}

export interface ReportData {
  scheme: Scheme;
  cleanGrid: IlluminanceGrid;
  cleanMetrics: FieldMetrics;
  shadowGrid: IlluminanceGrid;
  shadowMetrics: FieldMetrics;
  shadowResult: ShadowTestResult;
  depth: DepthPoint[];
}

export function buildReportCsv(d: ReportData): string {
  const BOM = '﻿';
  const lines: string[] = [];
  const s = d.scheme;

  lines.push(row(['手术无影灯仿真测试报告']));
  lines.push(row(['导出时间', new Date().toLocaleString('zh-CN')]));
  lines.push(row(['方案名称', s.name]));
  lines.push(row(['备注', s.note ?? '']));
  lines.push(row([]));

  // 1. 灯头配置
  lines.push(row(['【1. 灯头配置】']));
  lines.push(row(['灯头', '启用', '位置X(m)', '位置Y(m)', '位置Z(m)', '俯仰(°)', '偏航(°)', '滚转(°)', '光效(lm/W)', 'LED数', '总功率(W)', '总光通量(lm)', '角分布']));
  for (const lamp of s.lamps) {
    const power = lamp.leds.reduce((x, l) => x + l.powerW, 0);
    lines.push(row([
      lamp.name, lamp.enabled ? '是' : '否',
      fmt(lamp.position.x, 3), fmt(lamp.position.y, 3), fmt(lamp.position.z, 3),
      fmt(lamp.pitchDeg, 1), fmt(lamp.yawDeg, 1), fmt(lamp.rollDeg, 1),
      lamp.luminousEfficacyLpW, lamp.leds.length,
      fmt(power, 2), fmt(power * lamp.luminousEfficacyLpW, 1),
      lamp.distribution.kind === 'cosn' ? `cos^${lamp.distribution.cosn}` : lamp.distribution.kind,
    ]));
  }
  lines.push(row([]));

  // 2. 术野照度
  lines.push(row(['【2. 术野平面照度（无遮挡）】']));
  lines.push(row(['术野平面高度(m)', s.room.planeHeight]));
  lines.push(row(['计算区域(m)', `${s.room.fieldSize}×${s.room.fieldSize}`]));
  lines.push(row(['网格采样', `${s.room.gridN}×${s.room.gridN}`]));
  lines.push(row(['中心照度 Ec (lux)', fmt(d.cleanMetrics.centerLux, 1)]));
  lines.push(row(['平均照度 (lux)', fmt(d.cleanMetrics.meanLux, 1)]));
  lines.push(row(['最大照度 (lux)', fmt(d.cleanMetrics.maxLux, 1)]));
  lines.push(row(['最小照度 (lux)', fmt(d.cleanMetrics.minLux, 1)]));
  lines.push(row(['均匀度 Emin/Emean', fmt(d.cleanMetrics.uniformity, 4)]));
  lines.push(row(['光斑直径 d10 (mm)', fmt(d.cleanMetrics.d10DiameterMm, 1)]));
  lines.push(row(['光斑直径 d50 (mm)', fmt(d.cleanMetrics.d50DiameterMm, 1)]));
  lines.push(row(['d10 内平均照度 (lux)', fmt(d.cleanMetrics.meanInsideD10, 1)]));
  lines.push(row([]));

  // 3. 遮挡测试
  lines.push(row(['【3. 标准遮挡测试】']));
  lines.push(row(['采样点(m)', `(${fmt(d.shadowResult.point.x, 3)}, ${fmt(d.shadowResult.point.y, 3)}, ${fmt(d.shadowResult.point.z, 3)})`]));
  lines.push(row(['遮挡体', s.shadow.occluders.map((o) => `${o.name}(r=${o.radius}m)`).join('；')]));
  lines.push(row(['无遮挡照度 (lux)', fmt(d.shadowResult.unobstructedLux, 1)]));
  lines.push(row(['遮挡后照度 (lux)', fmt(d.shadowResult.shadowedLux, 1)]));
  lines.push(row(['残余照度比例 (%)', fmt(d.shadowResult.residualRatio * 100, 2)]));
  lines.push(row(['阴影深度 (%)', fmt(d.shadowResult.shadowDepth * 100, 2)]));
  lines.push(row([]));
  lines.push(row(['分灯头统计']));
  lines.push(row(['灯头', 'LED总数', '被遮挡LED数', '无遮挡照度(lux)', '遮挡后照度(lux)', '残余比例(%)']));
  for (const st of d.shadowResult.perLamp) {
    const ratio = st.unobstructedLux > 0 ? (st.shadowedLux / st.unobstructedLux) * 100 : 0;
    lines.push(row([
      s.lamps.find((l) => l.id === st.lampId)?.name ?? st.lampId,
      st.totalLedCount, st.blockedLedCount,
      fmt(st.unobstructedLux, 1), fmt(st.shadowedLux, 1), fmt(ratio, 2),
    ]));
  }
  lines.push(row([]));

  // 4. 逐 LED 明细（手算复核用）
  lines.push(row(['【4. 逐 LED 照度明细（遮挡场景，可手算复核）】']));
  lines.push(row(['灯头', 'LED', '光程r(m)', '轴偏角θ(°)', '入射角i(°)', '光强I(cd)', '照度贡献(lux)', '是否遮挡']));
  for (const c of d.shadowResult.contributions) {
    lines.push(row([
      s.lamps.find((l) => l.id === c.lampId)?.name ?? c.lampId,
      c.ledId,
      fmt(c.distance, 4), fmt(c.thetaDeg, 3), fmt(c.incidenceDeg, 3),
      fmt(c.intensityCd, 3), fmt(c.illuminanceLux, 3),
      c.blocked ? '遮挡' : '通光',
    ]));
  }
  lines.push(row([]));

  // 5. 深度衰减
  lines.push(row(['【5. 深度方向中心照度衰减曲线】']));
  lines.push(row(['平面高度(m)', '灯距(m)', '中心照度(lux)']));
  for (const p of d.depth) {
    lines.push(row([fmt(p.height, 3), fmt(p.lampDistance, 3), fmt(p.centerLux, 1)]));
  }
  lines.push(row([]));

  // 6. 照度网格（无遮挡全量）
  lines.push(row(['【6. 术野照度网格数据（无遮挡，行=Z从+到-，列=X从-到+，单位lux）】']));
  const g = d.cleanGrid;
  const header = ['Z\\X'];
  for (let j = 0; j < g.n; j++) header.push(fmt(g.minX + j * g.spacing, 3));
  lines.push(row(header));
  for (let i = 0; i < g.n; i++) {
    const z = g.maxZ - i * g.spacing;
    const vals = [fmt(z, 3)];
    for (let j = 0; j < g.n; j++) vals.push(fmt(g.values[i * g.n + j], 1));
    lines.push(row(vals));
  }

  return BOM + lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
