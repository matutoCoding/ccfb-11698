import { Scene3D } from '../three/scene3d';
import type { Scheme } from '../types';
import { appState } from '../state';

/**
 * 三维视图挂载/生命周期管理。
 * 页面切换时旧视图 dispose；同页状态变更通过 scene.sync 增量重建。
 */
export interface MountedView {
  scene: Scene3D;
  destroy: () => void;
}

export function mount3D(container: HTMLElement, scheme: Scheme): MountedView {
  const scene = new Scene3D(container, scheme);

  scene.onLampTranslated = (lampId, pos) => {
    appState.mutate((s) => {
      const lamp = s.lamps.find((l) => l.id === lampId);
      if (lamp) lamp.position = { ...pos };
    });
  };
  scene.onLampRotated = (lampId, pitch, yaw, roll) => {
    appState.mutate((s) => {
      const lamp = s.lamps.find((l) => l.id === lampId);
      if (lamp) {
        lamp.pitchDeg = pitch;
        lamp.yawDeg = yaw;
        lamp.rollDeg = roll;
      }
    });
  };
  scene.onOccluderTranslated = (occId, pos) => {
    appState.mutate((s) => {
      const occ = s.shadow.occluders.find((o) => o.id === occId);
      if (occ) occ.position = { ...pos };
      s.shadow.samplePoint = { ...s.shadow.samplePoint, y: s.room.planeHeight };
    });
  };

  return {
    scene,
    destroy: () => scene.dispose(),
  };
}
