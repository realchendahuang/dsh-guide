import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';

// 第 2 幕「装配车间」:插座(接口定义)、电器(具体实现)、插头(调用方)三块积木
// 悬浮在暗色车间里,用户拖拽(或点积木再点凹槽)把它们装进同色凹槽;
// 三块入位后亮起 BOOT 按钮,按下后电路点亮、粒子沿连线流动。
// 保底:纯滚动时积木随 progress 自动归位,滚到底也能看到点亮状态。

const ACCENT = '#8ce99a';
const clamp01 = (x: number): number => THREE.MathUtils.clamp(x, 0, 1);
const easeInOut = (x: number): number => x * x * (3 - 2 * x);

/** Sprite 没有贴图时会渲染成实心方块,所以光晕用程序生成的径向渐变贴图。 */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(190,255,210,0.55)');
  g.addColorStop(1, 'rgba(190,255,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** 凹槽沿 X 轴排成一条线的间距与落位高度。 */
const SLOT_X = [-6.5, 0, 6.5];
const BASE_Y = -3.3;
const SEAT_Y = BASE_Y + 1.1;

interface BlockState {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  /** 悬浮起点,拖拽落空后以此为新的悬浮基准。 */
  home: THREE.Vector3;
  seatPos: THREE.Vector3;
  color: THREE.Color;
  seated: boolean;
  dragging: boolean;
  phase: number;
}

/** 积木通用外壳:深色机身 + 描边 + 光晕,差异部件由各 builder 追加。 */
const makeBlockShell = (color: string, map: THREE.Texture): { group: THREE.Group; body: THREE.MeshStandardMaterial; halo: THREE.Sprite } => {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: '#141c30',
    metalness: 0.35,
    roughness: 0.55,
    emissive: color,
    emissiveIntensity: 0.08,
  });
  const box = new THREE.BoxGeometry(1.9, 1.9, 1.9);
  group.add(new THREE.Mesh(box, body));
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    ),
  );
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(4.5);
  group.add(halo);
  return { group, body, halo };
};

/** 插座积木:正面两个插孔,代表「接口定义」。 */
const makeSocketBlock = (color: string, map: THREE.Texture): ReturnType<typeof makeBlockShell> => {
  const shell = makeBlockShell(color, map);
  const holeGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.34, 16);
  const holeMat = new THREE.MeshBasicMaterial({ color: '#04060c' });
  for (const dx of [-0.45, 0.45]) {
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(dx, 0, 0.88);
    shell.group.add(hole);
  }
  return shell;
};

/** 电器积木:机身缠两圈线圈,代表「具体实现」。 */
const makeApplianceBlock = (color: string, map: THREE.Texture): ReturnType<typeof makeBlockShell> => {
  const shell = makeBlockShell(color, map);
  const coilMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const [tilt, phase] of [[0.5, 0], [-0.4, 1]] as const) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 8, 36), coilMat);
    coil.rotation.set(Math.PI / 2 + tilt, phase, 0);
    shell.group.add(coil);
  }
  return shell;
};

/** 插头积木:顶部两根插脚,代表「调用方」。 */
const makePlugBlock = (color: string, map: THREE.Texture): ReturnType<typeof makeBlockShell> => {
  const shell = makeBlockShell(color, map);
  const prongGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 10);
  const prongMat = new THREE.MeshStandardMaterial({ color: '#cfd8ff', metalness: 0.7, roughness: 0.3 });
  for (const dx of [-0.42, 0.42]) {
    const prong = new THREE.Mesh(prongGeo, prongMat);
    prong.position.set(dx, 1.35, 0);
    shell.group.add(prong);
  }
  return shell;
};

/** 凹槽基座:深色圆盘 + 发光圆环 + 透光盘面,积木入位后圆环增亮。 */
const makeSocketBase = (color: string, socketIndex: number): { group: THREE.Group; ring: THREE.MeshBasicMaterial; pad: THREE.MeshBasicMaterial } => {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.05, 0.28, 28),
    new THREE.MeshStandardMaterial({ color: '#0d1322', metalness: 0.4, roughness: 0.6 }),
  );
  plate.userData.socketIndex = socketIndex;
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 8, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.16;
  const padMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.15;
  pad.userData.socketIndex = socketIndex;
  group.add(plate, ring, pad);
  return { group, ring: ringMat, pad: padMat };
};

const createAssemblyScene: SceneFactory = (canvas) => {
  const stage = createStage(canvas);
  const { scene, camera } = stage;

  scene.add(starPoints(700, 240, '#8ce99a', 0.35));
  scene.add(starPoints(400, 200, '#8fb4ff', 0.3));

  // 车间照明:环境光 + 主光,点亮后再补一盏 accent 点光模拟机器发光。
  scene.add(new THREE.AmbientLight('#5a6c9a', 0.6));
  const keyLight = new THREE.DirectionalLight('#e8f0ff', 1.4);
  keyLight.position.set(6, 12, 9);
  scene.add(keyLight);
  const machineLight = new THREE.PointLight(ACCENT, 0, 60, 1.6);
  machineLight.position.set(0, 0, 4);
  scene.add(machineLight);

  // 三块积木与三个凹槽,颜色即匹配关系;光晕共享一张径向渐变贴图。
  const haloTexture = glowTexture();
  const defs = [
    { build: makeSocketBlock, color: '#8ce99a', home: new THREE.Vector3(5.4, 3.6, 0.6) },
    { build: makeApplianceBlock, color: '#66d9e8', home: new THREE.Vector3(-5.2, 3.1, 1.4) },
    { build: makePlugBlock, color: '#da77f2', home: new THREE.Vector3(0.4, 4.4, -0.6) },
  ];
  const blocks: BlockState[] = [];
  const bases: { ring: THREE.MeshBasicMaterial; pad: THREE.MeshBasicMaterial }[] = [];
  const hitTargets: THREE.Object3D[] = [];

  defs.forEach((def, i) => {
    const shell = def.build(def.color, haloTexture);
    shell.group.position.copy(def.home);
    shell.group.userData.blockIndex = i;
    shell.group.traverse((o) => {
      o.userData.blockIndex = i;
      hitTargets.push(o);
    });
    scene.add(shell.group);

    const base = makeSocketBase(def.color, i);
    base.group.position.set(SLOT_X[i], BASE_Y, 0);
    base.group.traverse((o) => {
      if (o.userData.socketIndex !== undefined) hitTargets.push(o);
    });
    scene.add(base.group);
    bases.push({ ring: base.ring, pad: base.pad });

    blocks.push({
      group: shell.group,
      body: shell.body,
      halo: shell.halo,
      home: def.home,
      seatPos: new THREE.Vector3(SLOT_X[i], SEAT_Y, 0),
      color: new THREE.Color(def.color),
      seated: false,
      dragging: false,
      phase: i * 2.1,
    });
  });

  // 电路干线:贯穿三个凹槽的一条发光细线 + 沿线流动的粒子。
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(SLOT_X[0], BASE_Y + 0.2, 0),
    new THREE.Vector3(SLOT_X[2], BASE_Y + 0.2, 0),
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.06 });
  scene.add(new THREE.Line(lineGeo, lineMat));

  const FLOW_COUNT = 14;
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLOW_COUNT * 3), 3));
  const flowMat = new THREE.PointsMaterial({
    color: '#d3f9d8',
    size: 0.5,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(flowGeo, flowMat));

  // ---------- DOM 覆盖层:提示文字 + BOOT 按钮(内联样式,不动全局 CSS) ----------
  const overlayHost = (canvas.closest('.act-stage') ?? canvas.parentElement) as HTMLElement;
  const hint = document.createElement('div');
  hint.style.cssText = [
    'position:absolute', 'left:50%', 'bottom:5.5%', 'transform:translateX(-50%)',
    'color:#b2f2bb', 'font:500 0.82rem/1.5 ui-monospace,monospace', 'letter-spacing:0.12em',
    'text-shadow:0 0 12px rgba(140,233,154,0.8)', 'pointer-events:none',
    'transition:opacity .5s', 'white-space:nowrap', 'z-index:2',
  ].join(';');
  hint.textContent = '拖动积木 装进同色凹槽(或点一下积木,再点凹槽)';
  overlayHost.appendChild(hint);

  const bootBtn = document.createElement('button');
  bootBtn.type = 'button';
  bootBtn.textContent = '⏻ BOOT';
  bootBtn.style.cssText = [
    'position:absolute', 'left:50%', 'bottom:12%', 'transform:translateX(-50%)',
    'padding:0.6em 2.2em', 'border-radius:999px', 'border:1px solid #8ce99a',
    'background:rgba(140,233,154,0.08)', 'color:#b2f2bb',
    'font:600 0.9rem/1 ui-monospace,monospace', 'letter-spacing:0.28em', 'cursor:pointer',
    'box-shadow:0 0 18px rgba(140,233,154,0.45), inset 0 0 12px rgba(140,233,154,0.15)',
    'text-shadow:0 0 10px rgba(140,233,154,0.9)',
    'opacity:0', 'pointer-events:none', 'transition:opacity .6s', 'z-index:2',
  ].join(';');
  overlayHost.appendChild(bootBtn);

  // ---------- 交互状态 ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragOffset = new THREE.Vector3();
  const planeHit = new THREE.Vector3();
  let dragBlock: BlockState | null = null;
  let selected: BlockState | null = null;
  let downX = 0;
  let downY = 0;
  let booted = false;
  let pulse = 0;
  let progress = 0;
  let power = 0;

  // 移动端保留竖向滚屏,竖直拖动交给滚动、水平拖动能拖积木,点按则不受限。
  canvas.style.touchAction = 'pan-y';

  const setRay = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };

  const pickBlock = (): BlockState | null => {
    const hit = raycaster.intersectObjects(hitTargets, false)[0];
    if (!hit) return null;
    const idx = hit.object.userData.blockIndex as number | undefined;
    return idx === undefined ? null : blocks[idx];
  };

  const pickSocket = (): number | null => {
    const hit = raycaster.intersectObjects(hitTargets, false)[0];
    if (!hit) return null;
    const idx = hit.object.userData.socketIndex as number | undefined;
    return idx ?? null;
  };

  const seatBlock = (block: BlockState): void => {
    block.seated = true;
    block.dragging = false;
    if (selected === block) selected = null;
    if (blocks.every((b) => b.seated)) {
      hint.textContent = '电路就绪 —— 按下 BOOT';
      bootBtn.style.opacity = '1';
      bootBtn.style.pointerEvents = 'auto';
    }
  };

  const SNAP_RADIUS = 2.6;

  const onPointerDown = (e: PointerEvent): void => {
    setRay(e);
    const block = pickBlock();
    if (!block || block.seated) return;
    dragBlock = block;
    block.dragging = true;
    downX = e.clientX;
    downY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    camera.getWorldDirection(planeHit);
    dragPlane.setFromNormalAndCoplanarPoint(planeHit, block.group.position);
    raycaster.ray.intersectPlane(dragPlane, planeHit);
    dragOffset.copy(block.group.position).sub(planeHit);
    canvas.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragBlock) return;
    setRay(e);
    if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;
    dragBlock.group.position.copy(planeHit).add(dragOffset);
    // 限制拖运范围,防止积木被甩出画面。
    dragBlock.group.position.x = THREE.MathUtils.clamp(dragBlock.group.position.x, -9.5, 9.5);
    dragBlock.group.position.y = THREE.MathUtils.clamp(dragBlock.group.position.y, -2.4, 6.5);
    dragBlock.group.position.z = THREE.MathUtils.clamp(dragBlock.group.position.z, -3, 3);
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!dragBlock) return;
    const block = dragBlock;
    dragBlock = null;
    block.dragging = false;
    canvas.style.cursor = '';
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);

    if (moved < 8) {
      // 点按:点积木 = 选中;点凹槽 = 把选中的同体积木装进去。
      setRay(e);
      const socketIdx = pickSocket();
      if (socketIdx !== null && selected && blocks[socketIdx] === selected) {
        seatBlock(selected);
        return;
      }
      const tapped = pickBlock();
      selected = tapped && !tapped.seated ? (selected === tapped ? null : tapped) : selected;
      return;
    }

    // 拖拽松手:靠近本家凹槽则吸附,否则原地悬停(之后仍会被自动归位接管)。
    if (block.group.position.distanceTo(block.seatPos) < SNAP_RADIUS) {
      seatBlock(block);
    } else {
      block.home.copy(block.group.position);
    }
  };

  const onBoot = (): void => {
    if (booted || !blocks.every((b) => b.seated)) return;
    booted = true;
    pulse = 1;
    bootBtn.textContent = '◉ ONLINE';
    bootBtn.style.pointerEvents = 'none';
    hint.textContent = '电路接通,机器点亮';
  };
  bootBtn.addEventListener('click', onBoot);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // ---------- 帧循环 ----------
  const camTarget = new THREE.Vector3(0, 0, 0);
  const camPos = new THREE.Vector3();
  const hoverPos = new THREE.Vector3();

  const loop = stage.run((t, dt) => {
    // 运镜:0→0.3 从远景推进到装配台,0.3→1 保持可交互视角并缓慢环绕。
    const dolly = easeInOut(clamp01(progress / 0.3));
    const radius = THREE.MathUtils.lerp(48, 23, dolly);
    const orbit = Math.max(0, progress - 0.3) * 1.1;
    // 竖屏拉远相机,保证两端的凹槽不被裁掉。
    const aspectFix = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1;
    camPos.set(
      Math.sin(orbit) * radius * aspectFix,
      THREE.MathUtils.lerp(7.5, 2.8, dolly),
      Math.cos(orbit) * radius * aspectFix,
    );
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    const allSeated = blocks.every((b) => b.seated);
    // 电量:BOOT 按下立即满格;否则三块入位且滚到幕后段时自动点亮(保底)。
    const powerTarget = booted || (allSeated && progress > 0.85) ? 1 : 0;
    power += (powerTarget - power) * Math.min(1, dt * 2.2);
    pulse = Math.max(0, pulse - dt * 0.9);

    blocks.forEach((block, i) => {
      // 自动归位:进度越过阈值后,位置是 progress 的纯函数(直接赋值,不逐帧逼近),
      // 保证 QA/跳转场景下 setProgress 之后第一帧就是确定画面;滚动 scrub 时进度连续,
      // 直接赋值看起来同样是平滑飘入。
      const autoF = block.seated ? 1 : easeInOut(clamp01((progress - (0.42 + i * 0.13)) / 0.16));
      if (autoF >= 1 && !block.seated) seatBlock(block);

      if (!block.dragging) {
        hoverPos.copy(block.home);
        hoverPos.y += Math.sin(t * 1.2 + block.phase) * 0.28;
        hoverPos.x += Math.sin(t * 0.7 + block.phase) * 0.12;
        if (autoF > 0) hoverPos.lerp(block.seatPos, autoF);
        block.group.position.copy(hoverPos);
      }

      // 姿态:悬浮时缓慢自转,入位后回正。
      const spinTarget = block.seated ? Math.round(block.group.rotation.y / (Math.PI * 2)) * Math.PI * 2 : block.group.rotation.y + dt * 0.35;
      block.group.rotation.y = block.seated
        ? THREE.MathUtils.lerp(block.group.rotation.y, spinTarget, Math.min(1, dt * 4))
        : spinTarget;

      // 发光:选中/入位/通电逐级增亮,BOOT 脉冲叠一次整体闪光。
      const glow = (selected === block ? 0.22 : 0) + (block.seated ? 0.3 : 0) + power * 0.35 + pulse * 0.5;
      block.body.emissiveIntensity = 0.08 + glow;
      block.halo.material.opacity = 0.16 + glow * 0.5;
      block.halo.scale.setScalar(4.5 * (1 + pulse * 0.5 + (selected === block ? 0.15 : 0)));

      const near = !block.seated && block.group.position.distanceTo(block.seatPos) < SNAP_RADIUS;
      bases[i].ring.opacity = block.seated ? 0.85 + power * 0.15 : near ? 0.8 : 0.3 + Math.sin(t * 2 + i) * 0.06;
      bases[i].pad.opacity = 0.05 + (block.seated ? 0.06 : 0) + power * 0.1;
    });

    // 干线与流动粒子随电量显现;脉冲时干线短暂过亮。
    lineMat.opacity = 0.06 + power * 0.8 + pulse * 0.3;
    flowMat.opacity = power;
    if (power > 0.02) {
      const pos = flowGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < FLOW_COUNT; k++) {
        const u = (t * 0.45 + k / FLOW_COUNT) % 1;
        pos.setXYZ(k, THREE.MathUtils.lerp(SLOT_X[0], SLOT_X[2], u), BASE_Y + 0.2 + Math.sin(u * Math.PI) * 0.15, 0);
      }
      pos.needsUpdate = true;
    }
    machineLight.intensity = power * 50 + pulse * 40;
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (p) => {
      progress = p;
    },
    dispose: () => {
      bootBtn.removeEventListener('click', onBoot);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      hint.remove();
      bootBtn.remove();
      canvas.style.touchAction = '';
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
        if (o instanceof THREE.Sprite) o.material.dispose();
      });
      haloTexture.dispose();
      stage.dispose();
    },
  };
};

export default createAssemblyScene;
