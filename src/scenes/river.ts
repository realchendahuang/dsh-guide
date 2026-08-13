import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';
import { createRiver, riverPoint, glowTexture } from './lib/river-water';

// 第 4 幕「黑匣子之河」:append-only 的会话事件流是一条发光的河。
// 滚动即时间 —— progress 推进时,事件晶体按序从上方落水、激起涟漪、
// 顺流漂一段后沉入河床,但一直在原地发光(永不遗忘);
// 尾声相机拉高俯瞰,让用户看到整条河已经很长,而且只增不减。

type EventKind = 'user' | 'assistant' | 'call' | 'result';

interface EventDef {
  label: string;
  kind: EventKind;
}

// 一段典型会话日志的缩影:用户提问 → 助手输出 → 工具往返 → 再提问 ……
const EVENTS: EventDef[] = [
  { label: 'user/message', kind: 'user' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'tool/call · shell', kind: 'call' },
  { label: 'tool/result', kind: 'result' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'tool/call · fs/read', kind: 'call' },
  { label: 'tool/result', kind: 'result' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'tool/call · fs/edit', kind: 'call' },
  { label: 'tool/result', kind: 'result' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'user/message', kind: 'user' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'tool/call · web/search', kind: 'call' },
  { label: 'tool/result', kind: 'result' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'tool/call · shell', kind: 'call' },
  { label: 'tool/result', kind: 'result' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'tool/call · todo_write', kind: 'call' },
  { label: 'tool/result', kind: 'result' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'assistant/chunk', kind: 'assistant' },
  { label: 'assistant/chunk', kind: 'assistant' },
];

// 每种事件一种晶体形状与颜色:用户=蓝八面体,助手=绿四面体,
// 工具调用=琥珀立方体,工具结果=青立方体。
const KIND_COLOR: Record<EventKind, string> = {
  user: '#6ea8ff',
  assistant: '#63e6be',
  call: '#ffb45e',
  result: '#5edcff',
};

// 时间轴(progress 域):首颗晶体 0.04 落水,末颗 0.62,留足沉降与俯瞰时间。
const FIRST_P = 0.04;
const SPAN_P = 0.58;
const FALL_T = 0.028; // 从空中落到河面
const DRIFT_T = 0.1; // 落水后顺流漂浮并下沉
const DRIFT_S = 0.035; // 漂浮沿河流推进的曲线距离
const RIPPLE_T = 0.14; // 涟漪扩散时长

interface Crystal {
  def: EventDef;
  group: THREE.Group;
  mesh: THREE.Mesh;
  meshMat: THREE.MeshBasicMaterial;
  haloMat: THREE.SpriteMaterial;
  ripple: THREE.Mesh;
  rippleMat: THREE.MeshBasicMaterial;
  s0: number; // 落水点的河流曲线位置
  p0: number; // 落水的 progress 时刻
  seed: number;
  spin: number; // 累积转角,只随时间单向旋转
}

const createRiverScene: SceneFactory = (canvas) => {
  const stage = createStage(canvas);
  const { scene, camera } = stage;

  scene.add(starPoints(900, 320, '#63e6be', 0.45));
  scene.add(starPoints(500, 240, '#8fb4ff', 0.35));

  const river = createRiver('#63e6be');
  scene.add(river.group);

  const disposables: Array<{ dispose(): void }> = [river];

  // 四种晶体几何(含描边)各只建一份,所有事件共享。
  const solidGeo: Record<EventKind, THREE.BufferGeometry> = {
    user: new THREE.OctahedronGeometry(1.8),
    assistant: new THREE.TetrahedronGeometry(2.0),
    call: new THREE.BoxGeometry(2.2, 2.2, 2.2),
    result: new THREE.BoxGeometry(2.0, 2.0, 2.0),
  };
  const edgeGeo: Record<EventKind, THREE.EdgesGeometry> = {
    user: new THREE.EdgesGeometry(solidGeo.user),
    assistant: new THREE.EdgesGeometry(solidGeo.assistant),
    call: new THREE.EdgesGeometry(solidGeo.call),
    result: new THREE.EdgesGeometry(solidGeo.result),
  };
  const edgeMat: Record<EventKind, THREE.LineBasicMaterial> = {
    user: new THREE.LineBasicMaterial({ color: KIND_COLOR.user, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    assistant: new THREE.LineBasicMaterial({ color: KIND_COLOR.assistant, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    call: new THREE.LineBasicMaterial({ color: KIND_COLOR.call, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    result: new THREE.LineBasicMaterial({ color: KIND_COLOR.result, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  const rippleGeo = new THREE.RingGeometry(0.95, 1.05, 48);
  disposables.push(...Object.values(solidGeo), ...Object.values(edgeGeo), ...Object.values(edgeMat), rippleGeo);

  const crystals: Crystal[] = EVENTS.map((def, i) => {
    const p0 = FIRST_P + (i / (EVENTS.length - 1)) * SPAN_P;
    const s0 = 0.06 + (i / (EVENTS.length - 1)) * 0.86;
    const color = KIND_COLOR[def.kind];

    const group = new THREE.Group();
    group.visible = false;

    const meshMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(solidGeo[def.kind], meshMat);
    mesh.add(new THREE.LineSegments(edgeGeo[def.kind], edgeMat[def.kind]));
    const haloMat = new THREE.SpriteMaterial({
      map: glowTexture(), // 无贴图的 Sprite 是实心方块,会整个盖住晶体
      color,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(8);
    mesh.add(halo);
    mesh.userData.label = def.label;
    group.add(mesh);

    // 涟漪躺在落水点的河面上,平时隐藏
    const rippleMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ripple = new THREE.Mesh(rippleGeo, rippleMat);
    ripple.rotation.x = -Math.PI / 2;
    const drop = riverPoint(s0);
    ripple.position.set(drop.x, 0.4, drop.z);
    ripple.visible = false;
    scene.add(ripple);

    disposables.push(meshMat, haloMat, rippleMat);
    scene.add(group);
    return { def, group, mesh, meshMat, haloMat, ripple, rippleMat, s0, p0, seed: Math.random() * 10, spin: 0 };
  });
  const pickMeshes = crystals.map((c) => c.mesh);

  // --- hover/tap tooltip:DOM 覆盖在 .act-stage 上,不交互也有完整保底画面 ---
  const host = (canvas.closest('.act-stage') as HTMLElement | null) ?? document.body;
  const fixed = host === document.body;
  const tip = document.createElement('div');
  tip.style.cssText = [
    `position:${fixed ? 'fixed' : 'absolute'}`,
    'pointer-events:none',
    'z-index:6',
    'display:none',
    'padding:4px 10px',
    'border-radius:6px',
    'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#d8fff1',
    'background:rgba(4,10,14,.88)',
    'border:1px solid rgba(99,230,190,.55)',
    'transform:translate(-50%,-160%)',
    'white-space:nowrap',
  ].join(';');
  host.appendChild(tip);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onPointer = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray
      .intersectObjects(pickMeshes, false)
      .find((h) => (h.object.parent?.visible ?? false));
    if (hit) {
      tip.textContent = hit.object.userData.label as string;
      const hostRect = fixed ? { left: 0, top: 0 } : host.getBoundingClientRect();
      tip.style.left = `${e.clientX - hostRect.left}px`;
      tip.style.top = `${e.clientY - hostRect.top}px`;
      tip.style.display = 'block';
      canvas.style.cursor = 'pointer';
    } else {
      tip.style.display = 'none';
      canvas.style.cursor = '';
    }
  };
  const onLeave = (): void => {
    tip.style.display = 'none';
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointerleave', onLeave);

  // --- 运镜:低位沿河跟拍写入头 → 高位俯瞰全河 ---
  const HIGH_POS = new THREE.Vector3(-22, 185, 140);
  const HIGH_TARGET = new THREE.Vector3(-22, 0, -48);
  const head = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const lowPos = new THREE.Vector3();
  const lowTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  let progress = 0;
  let pSmooth = 0; // 略微平滑,消除 scrub 的抖动

  const loop = stage.run((t, dt) => {
    pSmooth += (progress - pSmooth) * Math.min(1, dt * 7);
    const p = pSmooth;

    river.update(t, dt);

    for (const c of crystals) {
      const tau = p - c.p0;
      if (tau <= 0) {
        c.group.visible = false;
        c.ripple.visible = false;
        continue;
      }
      c.group.visible = true;

      let s = c.s0;
      let y: number;
      let scale = 1;
      let spinSpeed: number;
      if (tau < FALL_T) {
        // 落水:加速下坠,略微放大入场
        const k = tau / FALL_T;
        y = THREE.MathUtils.lerp(30, 1.3, k * k);
        scale = 0.6 + 0.4 * k;
        spinSpeed = 6;
        c.meshMat.opacity = 0.95;
        c.haloMat.opacity = 0.5;
      } else {
        // 漂浮 → 沉降:顺流前移一段后沉入河床,之后留在原地脉动发光
        const dt2 = tau - FALL_T;
        const dk = Math.min(dt2 / DRIFT_T, 1);
        s = c.s0 + (1 - (1 - dk) * (1 - dk)) * DRIFT_S;
        const sink = THREE.MathUtils.smoothstep(dt2, DRIFT_T * 0.35, DRIFT_T);
        const bob = Math.sin(t * 2.2 + c.seed * 9) * 0.3 * (1 - sink);
        y = THREE.MathUtils.lerp(1.3, -1.9, sink) + bob;
        spinSpeed = THREE.MathUtils.lerp(0.9, 0.15, sink);
        // 沉底后压暗,只靠微光脉动提示「它还在」
        c.meshMat.opacity = THREE.MathUtils.lerp(0.95, 0.55, sink);
        c.haloMat.opacity = THREE.MathUtils.lerp(0.5, 0.16 + 0.1 * Math.sin(t * 1.6 + c.seed * 5), sink);
      }
      c.spin += dt * spinSpeed;
      riverPoint(s, tmp);
      c.group.position.set(tmp.x, y, tmp.z);
      c.group.scale.setScalar(scale);
      c.group.rotation.set(c.seed * 3 + c.spin * 0.6, c.seed * 7 + c.spin, c.seed * 5);

      // 涟漪:落水瞬间触发,扩散后消失
      const rt = tau - FALL_T;
      if (rt >= 0 && rt < RIPPLE_T) {
        const k = rt / RIPPLE_T;
        c.ripple.visible = true;
        c.ripple.scale.setScalar(1 + k * 10);
        c.rippleMat.opacity = (1 - k) * 0.7;
      } else {
        c.ripple.visible = false;
      }
    }

    // 低位跟拍:镜头贴着「写入头」(最新落水点附近)沿河缓移;
    // 机位稍高稍远、视线略压低,让加宽后的河面在画面里占足分量
    const headS = THREE.MathUtils.clamp(
      0.1 + THREE.MathUtils.smoothstep(p, 0, 0.62) * 0.84,
      0,
      0.97,
    );
    riverPoint(headS, head);
    riverPoint(Math.min(headS + 0.06, 1), ahead);
    tan.subVectors(ahead, head).normalize();
    lowPos.copy(head).addScaledVector(tmp.set(-tan.z, 0, tan.x), 23).addScaledVector(tan, -7);
    lowPos.y = 7.5;
    lowTarget.copy(ahead).addScaledVector(tan, 6);
    lowTarget.y = 0.8;

    // 0.66 → 0.92 拉升到高位俯瞰:看全河的「只增不减」
    const k = THREE.MathUtils.smoothstep(p, 0.66, 0.92);
    camPos.lerpVectors(lowPos, HIGH_POS, k);
    camTarget.lerpVectors(lowTarget, HIGH_TARGET, k);
    camPos.y += Math.sin(t * 0.6) * 0.5 * (1 - k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (p) => {
      progress = p;
    },
    dispose() {
      canvas.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('pointerleave', onLeave);
      tip.remove();
      for (const d of disposables) d.dispose();
      stage.dispose();
    },
  };
};

export default createRiverScene;
