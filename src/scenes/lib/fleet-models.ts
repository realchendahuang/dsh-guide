import * as THREE from 'three';

// 第 6 幕的拼装件:全部是低面数几何 + Additive 光晕贴片的 stylized 造型,
// 用发光材质模拟辉光,避免 Bloom 后期在移动端掉帧。

const ACCENT = '#b197fc';

function halo(color: THREE.ColorRepresentation, scale: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

export interface Mothership {
  group: THREE.Group;
  ring: THREE.Mesh;
  core: THREE.Mesh;
  coreHalo: THREE.Sprite;
}

/** 母舰:锥体舰身 + 线框罩 + 旋转光环 + 发光核心。 */
export function buildMothership(): Mothership {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#3d3277' }),
  );
  const shell = new THREE.Mesh(
    new THREE.ConeGeometry(2.7, 8.6, 6),
    new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.45 }),
  );
  const engine = halo('#7fd4ff', 5, 0.4);
  engine.position.y = -4.6;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.4, 0.12, 8, 48),
    new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2.4;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 20, 20),
    new THREE.MeshBasicMaterial({ color: '#efe9ff' }),
  );
  const coreHalo = halo(ACCENT, 10, 0.35);
  core.add(coreHalo);
  group.add(body, shell, engine, ring, core);
  return { group, ring, core, coreHalo };
}

export interface Scout {
  group: THREE.Group;
  glow: THREE.Sprite;
  chest: THREE.Mesh;
  chestHalo: THREE.Sprite;
}

/** 小飞船:尖头锥 + 短舱,顺带挂一个返回时才亮出的发光宝箱。 */
export function buildScout(tint: THREE.ColorRepresentation): Scout {
  const group = new THREE.Group();
  const noseGeo = new THREE.ConeGeometry(0.55, 1.8, 5);
  noseGeo.rotateX(Math.PI / 2); // 机头朝 +Z,配合 lookAt 定向
  const nose = new THREE.Mesh(noseGeo, new THREE.MeshBasicMaterial({ color: '#d9ccff' }));
  nose.position.z = 0.9;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.55, 1.6),
    new THREE.MeshBasicMaterial({ color: '#4c3f96' }),
  );
  const glow = halo(tint, 3.2, 0.5);
  glow.position.z = -1;
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshBasicMaterial({ color: '#ffe9a8' }),
  );
  const chestHalo = halo('#ffd166', 2.6, 0.6);
  chest.add(chestHalo);
  chest.position.y = -0.9;
  chest.visible = false;
  group.add(nose, cabin, glow, chest);
  return { group, glow, chest, chestHalo };
}

export interface TaskNode {
  group: THREE.Group;
  orb: THREE.Mesh;
  orbMat: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
}

/** 任务节点:未点亮时近乎隐形的光球,小飞船抵达后才增亮。 */
export function buildTaskNode(color: THREE.ColorRepresentation): TaskNode {
  const group = new THREE.Group();
  const orbMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 20), orbMat);
  const glow = halo(color, 9, 0.08);
  group.add(orb, glow);
  return { group, orb, orbMat, glow };
}

export interface Gate {
  group: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  panelMat: THREE.MeshBasicMaterial;
  /** 左板材质(panelMat 的克隆,纹理水平镜像),透明度动画要与 panelMat 同步。 */
  panelMatL: THREE.MeshBasicMaterial;
  edgeMat: THREE.LineBasicMaterial;
  slitMat: THREE.MeshBasicMaterial;
  /** 左右力场板的能量纹理,动画流动用(offset.y 随时间滚动)。 */
  panelTexL: THREE.CanvasTexture;
  panelTexR: THREE.CanvasTexture;
  /** 门缝后方的大片软辉光,给闸门整体的能量存在感。 */
  gateGlow: THREE.Sprite;
}

export const GATE_Z = -140;
const GATE_SLIT_HALF = 3;
const PANEL_W = 37;
const PANEL_H = 30;
/** 门板中心的基础 X 偏移(关门状态)。 */
export const GATE_PANEL_X = GATE_SLIT_HALF + PANEL_W / 2;

/** 程序化力场纹理:门缝侧(u=0)亮、向外衰减的渐变 + 横向扫描线 + 能量噪点。 */
function paintForceField(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.38)');
    grad.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    // 挖掉暗带形成扫描线,加法混合下透明处不发光
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < 256; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, y, 256, 3);
    }
    g.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 90; k++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  }
  return c;
}

/** 能量闸门:左右两块力场板(能量纹理可滚动),中央留门缝,内缘亮边 + 门后辉光。 */
export function buildGate(): Gate {
  const group = new THREE.Group();
  group.position.z = GATE_Z;
  const fieldCanvas = paintForceField();
  const panelTexL = new THREE.CanvasTexture(fieldCanvas);
  const panelTexR = new THREE.CanvasTexture(fieldCanvas);
  // 左板的门缝在 u=1 一侧,水平镜像让两块板都朝门缝最亮
  panelTexL.repeat.x = -1;
  panelTexL.offset.x = 1;
  for (const tex of [panelTexL, panelTexR]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  const panelMat = new THREE.MeshBasicMaterial({
    map: panelTexR,
    color: ACCENT,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // 左板用独立材质引用各自的纹理
  const panelMatL = panelMat.clone();
  panelMatL.map = panelTexL;
  const edgeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8 });
  const slitMat = new THREE.MeshBasicMaterial({
    color: '#e3d8ff',
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const slitGeo = new THREE.BoxGeometry(0.5, PANEL_H, 0.5);
  const makePanel = (side: 1 | -1): THREE.Mesh => {
    const panel = new THREE.Mesh(geo, side === -1 ? panelMatL : panelMat);
    panel.position.x = side * GATE_PANEL_X;
    panel.add(new THREE.LineSegments(edgeGeo, edgeMat));
    const slit = new THREE.Mesh(slitGeo, slitMat);
    slit.position.x = -side * PANEL_W / 2; // 门缝一侧的内缘亮条
    panel.add(slit);
    group.add(panel);
    return panel;
  };
  const left = makePanel(-1);
  const right = makePanel(1);
  const gateGlow = halo(ACCENT, 34, 0.18);
  gateGlow.position.z = -2;
  group.add(gateGlow);
  return { group, left, right, panelMat, panelMatL, edgeMat, slitMat, panelTexL, panelTexR, gateGlow };
}

export interface Capsule {
  group: THREE.Group;
  bodyMat: THREE.MeshBasicMaterial;
  glowMat: THREE.SpriteMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  ring2: THREE.Mesh;
  ring2Mat: THREE.MeshBasicMaterial;
  labelMat: THREE.SpriteMaterial;
}

/** 命令胶囊:红色发光胶囊体 + 双圈脉动警告环 + 「⚠ rm -rf」标签贴片。 */
export function buildCapsule(): Capsule {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: '#ff5a6e', transparent: true, opacity: 1 });
  const bodyGeo = new THREE.CapsuleGeometry(1.3, 3.2, 6, 14);
  bodyGeo.rotateX(Math.PI / 2); // 长轴顺 +Z,朝飞行方向
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  const glow = halo('#ff5a6e', 13, 0.6);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#ff5a6e',
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.2, 8, 48), ringMat);
  // 外圈更细更淡,与内圈反相脉动,做出告警扩散的感觉
  const ring2Mat = ringMat.clone();
  ring2Mat.opacity = 0.4;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.09, 8, 48), ring2Mat);
  // 标签用 CanvasTexture 现画,全 procedural,不引网络资源
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 80;
  const ctx = labelCanvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 40px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff8d9d';
    ctx.fillText('⚠ rm -rf', 128, 42);
  }
  const labelMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(labelCanvas),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const label = new THREE.Sprite(labelMat);
  label.scale.set(10, 3.1, 1);
  label.position.y = 4.4;
  group.add(body, glow, ring, ring2, label);
  return { group, bodyMat, glowMat: glow.material, ring, ringMat, ring2, ring2Mat, labelMat };
}
