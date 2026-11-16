import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LampHeadConfig, OccluderConfig, RoomConfig, Scheme, Vec3 } from '../types';
import { ledLocalPosition } from '../physics/geometry';
import { lampQuat, extractPitchYawRoll } from '../physics/quat';

/**
 * 三维场景（可视化层）。
 * 重要：本模块不产生任何分析数值，照度/遮挡全部由 src/physics 解析引擎计算。
 * 阴影采用「每灯头若干虚拟点光源 + PCFSoft」近似多光源叠加软阴影，
 * 仅用于视觉呈现，与解析引擎的硬判定互为独立。
 */

const toV3 = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

interface LampVisual {
  lampId: string;
  group: THREE.Group;
  housing: THREE.Mesh;
  ledPoints: THREE.Points;
  spotLights: THREE.SpotLight[];
}

interface OccluderVisual {
  occId: string;
  mesh: THREE.Mesh;
}

export type TransformMode = 'translate' | 'rotate';

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls;
  private transform: TransformControls;
  private lampVisuals = new Map<string, LampVisual>();
  private occVisuals = new Map<string, OccluderVisual>();
  private roomGroup = new THREE.Group();
  private fieldPlane: THREE.Mesh | null = null;
  private heatTexture: THREE.CanvasTexture | null = null;
  private raf = 0;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  /** 拖拽结束回调（回写状态） */
  onLampTranslated: ((lampId: string, pos: Vec3) => void) | null = null;
  onLampRotated: ((lampId: string, pitch: number, yaw: number, roll: number) => void) | null = null;
  onOccluderTranslated: ((occId: string, pos: Vec3) => void) | null = null;
  onSelectionChange: ((kind: 'lamp' | 'occluder' | null, id: string | null) => void) | null = null;

  private selected: { kind: 'lamp' | 'occluder'; id: string } | null = null;
  private scheme: Scheme;

  constructor(container: HTMLElement, scheme: Scheme) {
    this.container = container;
    this.scheme = scheme;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10151d);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 50);
    this.camera.position.set(2.4, 2.2, 2.8);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 1.1, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 0.8;
    this.orbit.maxDistance = 8;

    // 环境光 + 半球光，保证非照明区域可见
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202830, 0.55));
    const amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(amb);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(0.8);
    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as unknown as { value: boolean }).value;
    });
    this.transform.addEventListener('objectChange', () => this.handleObjectChange());
    this.scene.add(this.transform.getHelper ? this.transform.getHelper() : (this.transform as unknown as THREE.Object3D));

    this.scene.add(this.roomGroup);
    this.buildRoom(scheme.room);
    this.rebuildLamps();
    this.rebuildOccluders();
    this.buildFieldPlane();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.orbit.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // -- 房间 -----------------------------------------------------------------

  private buildRoom(room: RoomConfig) {
    this.roomGroup.clear();
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.95, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.roomWidth, room.roomDepth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    const grid = new THREE.GridHelper(Math.max(room.roomWidth, room.roomDepth), 24, 0x3a4a5e, 0x243040);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    this.roomGroup.add(grid);

    // 手术台
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c8, roughness: 0.6 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 1.9), tableMat);
    tableTop.position.set(0, room.planeHeight - 0.025, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    this.roomGroup.add(tableTop);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x55606e });
    for (const z of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, room.planeHeight - 0.05, 12), legMat);
      leg.position.set(0, (room.planeHeight - 0.05) / 2, z);
      leg.castShadow = true;
      this.roomGroup.add(leg);
    }

    // 墙面（半透明单面，便于观察）
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1c2735, transparent: true, opacity: 0.25, side: THREE.DoubleSide, roughness: 1,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(room.roomWidth, room.roomHeight), wallMat);
    back.position.set(0, room.roomHeight / 2, -room.roomDepth / 2);
    this.roomGroup.add(back);
  }

  // -- 灯头 -----------------------------------------------------------------

  rebuildLamps() {
    for (const v of this.lampVisuals.values()) {
      this.scene.remove(v.group);
      v.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const sp of v.spotLights) this.scene.remove(sp);
    }
    this.lampVisuals.clear();

    for (const lamp of this.scheme.lamps) {
      const group = new THREE.Group();
      group.position.copy(toV3(lamp.position));
      group.quaternion.copy(this.lampQuatThree(lamp));
      group.userData = { kind: 'lamp', id: lamp.id };

      const housingMat = new THREE.MeshStandardMaterial({
        color: lamp.enabled ? 0xd8dee6 : 0x6a7078, roughness: 0.35, metalness: 0.4,
      });
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(lamp.housingRadius, lamp.housingRadius * 0.92, 0.06, 48),
        housingMat,
      );
      housing.castShadow = true;
      group.add(housing);

      // 灯头顶盖/吊臂连接点
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.12, 16),
        new THREE.MeshStandardMaterial({ color: 0x88929e, metalness: 0.6, roughness: 0.4 }),
      );
      cap.position.y = 0.09;
      group.add(cap);

      // LED 点云（直接用灯头局部坐标，由 group 统一变换）
      const positions = new Float32Array(lamp.leds.length * 3);
      lamp.leds.forEach((led, i) => {
        const lp = ledLocalPosition(led);
        positions[i * 3] = lp.x;
        positions[i * 3 + 1] = lp.y - 0.032; // 略低于灯盘下表面可见
        positions[i * 3 + 2] = lp.z;
      });
      const ptsGeo = new THREE.BufferGeometry();
      ptsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const ptsMat = new THREE.PointsMaterial({
        color: lamp.enabled ? 0xfff2c8 : 0x888888,
        size: 0.018, sizeAttenuation: true,
      });
      const ledPoints = new THREE.Points(ptsGeo, ptsMat);
      group.add(ledPoints);

      this.scene.add(group);

      // 多光源叠加软阴影：每灯头 6 盏虚拟聚光灯，均匀布置在灯盘上
      const spotLights: THREE.SpotLight[] = [];
      const ringR = lamp.housingRadius * 0.55;
      const totalPower = lamp.leds.reduce((s, l) => s + l.powerW, 0) || 1;
      for (let k = 0; k < 6; k++) {
        const phi = (k / 6) * Math.PI * 2;
        const sp = new THREE.SpotLight(
          lamp.enabled ? 0xfff4dd : 0x555555,
          lamp.enabled ? Math.max(8, totalPower * 2.2) : 0,
          4, Math.PI / 5, 0.55, 1.4,
        );
        sp.position.set(ringR * Math.cos(phi), -0.02, ringR * Math.sin(phi));
        sp.castShadow = lamp.enabled;
        sp.shadow.mapSize.set(512, 512);
        sp.shadow.camera.near = 0.1;
        sp.shadow.camera.far = 4;
        sp.shadow.bias = -0.0008;
        sp.shadow.radius = 4; // PCFSoft 软阴影半径
        const target = new THREE.Object3D();
        target.position.set(ringR * Math.cos(phi) * 0.6, -1.2, ringR * Math.sin(phi) * 0.6);
        group.add(sp);
        group.add(target);
        sp.target = target;
        spotLights.push(sp);
      }

      this.lampVisuals.set(lamp.id, { lampId: lamp.id, group, housing, ledPoints, spotLights });
    }
  }

  private lampQuatThree(lamp: LampHeadConfig): THREE.Quaternion {
    const q = lampQuat(lamp.pitchDeg, lamp.yawDeg, lamp.rollDeg);
    return new THREE.Quaternion(q.x, q.y, q.z, q.w);
  }

  // -- 遮挡体 ---------------------------------------------------------------

  rebuildOccluders() {
    for (const v of this.occVisuals.values()) {
      this.scene.remove(v.mesh);
      v.mesh.geometry.dispose();
    }
    this.occVisuals.clear();
    for (const occ of this.scheme.shadow.occluders) {
      const geo = occ.kind === 'sphere'
        ? new THREE.SphereGeometry(occ.radius, 32, 24)
        : new THREE.CapsuleGeometry(occ.radius, occ.halfLength * 2, 8, 20);
      const mat = new THREE.MeshStandardMaterial({
        color: occ.kind === 'sphere' ? 0xc96f6f : 0x6f9ec9,
        roughness: 0.55, transparent: true, opacity: 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(toV3(occ.position));
      if (occ.kind === 'capsule') {
        // CapsuleGeometry 默认沿 Y 轴，旋转到配置轴
        const dir = toV3(occ.axis).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
      mesh.castShadow = true;
      mesh.userData = { kind: 'occluder', id: occ.id };
      this.scene.add(mesh);
      this.occVisuals.set(occ.id, { occId: occ.id, mesh });
    }
  }

  // -- 术野平面热力贴花 ------------------------------------------------------

  private buildFieldPlane() {
    const geo = new THREE.PlaneGeometry(this.scheme.room.fieldSize, this.scheme.room.fieldSize);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.fieldPlane = new THREE.Mesh(geo, mat);
    this.fieldPlane.rotation.x = -Math.PI / 2;
    this.fieldPlane.position.set(
      this.scheme.room.fieldCenter.x,
      this.scheme.room.planeHeight + 0.004,
      this.scheme.room.fieldCenter.z,
    );
    this.fieldPlane.renderOrder = 5;
    this.scene.add(this.fieldPlane);
  }

  /** 用解析引擎网格结果更新热力图（canvas 2D 生成纹理） */
  updateHeatmap(canvas: HTMLCanvasElement) {
    if (!this.fieldPlane) return;
    if (this.heatTexture) this.heatTexture.dispose();
    this.heatTexture = new THREE.CanvasTexture(canvas);
    this.heatTexture.colorSpace = THREE.SRGBColorSpace;
    this.fieldPlane.material = new THREE.MeshBasicMaterial({
      map: this.heatTexture, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.fieldPlane.renderOrder = 5;
  }

  clearHeatmap() {
    if (this.fieldPlane && this.heatTexture) {
      this.fieldPlane.material = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
      });
      this.heatTexture.dispose();
      this.heatTexture = null;
    }
  }

  // -- 交互 -----------------------------------------------------------------

  setTransformMode(mode: TransformMode) {
    this.transform.setMode(mode);
  }

  select(kind: 'lamp' | 'occluder' | null, id: string | null) {
    if (!kind || !id) {
      this.transform.detach();
      this.selected = null;
      this.onSelectionChange?.(null, null);
      return;
    }
    const obj = kind === 'lamp'
      ? this.lampVisuals.get(id)?.group
      : this.occVisuals.get(id)?.mesh;
    if (obj) {
      this.transform.attach(obj);
      this.selected = { kind, id };
      this.onSelectionChange?.(kind, id);
    }
  }

  getSelection() {
    return this.selected;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.transform.dragging || e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const pickables: THREE.Object3D[] = [];
    for (const v of this.lampVisuals.values()) pickables.push(v.group);
    for (const v of this.occVisuals.values()) pickables.push(v.mesh);
    const hits = ray.intersectObjects(pickables, true);
    if (hits.length === 0) {
      this.select(null, null);
      return;
    }
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.kind) obj = obj.parent;
    if (obj?.userData.kind) {
      this.select(obj.userData.kind as 'lamp' | 'occluder', obj.userData.id as string);
    }
  };

  private handleObjectChange() {
    if (!this.selected) return;
    if (this.selected.kind === 'lamp') {
      const v = this.lampVisuals.get(this.selected.id);
      if (!v) return;
      const lamp = this.scheme.lamps.find((l) => l.id === this.selected!.id);
      if (!lamp) return;
      if (this.transform.getMode() === 'translate') {
        lamp.position = { x: v.group.position.x, y: v.group.position.y, z: v.group.position.z };
        this.onLampTranslated?.(lamp.id, lamp.position);
      } else {
        const q = v.group.quaternion;
        // 反解欧拉角回写（与解析引擎同一套约定）
        const euler = extractPitchYawRoll({ x: q.x, y: q.y, z: q.z, w: q.w });
        lamp.pitchDeg = euler.pitchDeg;
        lamp.yawDeg = euler.yawDeg;
        lamp.rollDeg = euler.rollDeg;
        this.onLampRotated?.(lamp.id, euler.pitchDeg, euler.yawDeg, euler.rollDeg);
      }
    } else {
      const v = this.occVisuals.get(this.selected.id);
      if (v && this.transform.getMode() === 'translate') {
        this.onOccluderTranslated?.(this.selected.id, {
          x: v.mesh.position.x, y: v.mesh.position.y, z: v.mesh.position.z,
        });
      }
    }
  }

  /** 外部状态变更后整体同步（重建） */
  sync(scheme: Scheme) {
    this.scheme = scheme;
    this.rebuildLamps();
    this.rebuildOccluders();
    if (this.fieldPlane) {
      this.fieldPlane.geometry.dispose();
      this.fieldPlane.geometry = new THREE.PlaneGeometry(scheme.room.fieldSize, scheme.room.fieldSize);
      this.fieldPlane.position.set(
        scheme.room.fieldCenter.x,
        scheme.room.planeHeight + 0.004,
        scheme.room.fieldCenter.z,
      );
    }
    // 保持选中
    if (this.selected) this.select(this.selected.kind, this.selected.id);
  }

  /** 定位相机到默认视角 */
  resetView() {
    this.camera.position.set(2.4, 2.2, 2.8);
    this.orbit.target.set(0, 1.1, 0);
    this.orbit.update();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.transform.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
