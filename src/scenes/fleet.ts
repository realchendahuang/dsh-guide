import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';
import {
  buildMothership,
  buildScout,
  buildTaskNode,
  buildGate,
  buildCapsule,
  GATE_Z,
  GATE_PANEL_X,
  type Scout,
} from './lib/fleet-models';

// 第 6 幕「分身与闸门」。
// 段落一(progress 0→0.55):母舰依次放出三艘小飞船奔赴三个任务节点,
// 节点点亮后小飞船叼着宝箱返航、汇入核心。
// 段落二(0.55→1):相机转向能量闸门,红色危险命令胶囊被拦停;
// 用户点「允许执行」则开门放行变绿,否则滚到 0.95 时胶囊碎裂消散(拒绝执行)。

const ACCENT = '#b197fc';
const RED = new THREE.Color('#ff5a6e');
const GREEN = new THREE.Color('#4ade80');
const NODE_COLORS = ['#ffd166', '#6ee7ff', '#ff8fa3'];
const NODE_POSITIONS = [
  new THREE.Vector3(-17, 6, -13),
  new THREE.Vector3(16, 9, -17),
  new THREE.Vector3(3, -10, -11),
];
// 段落分界,与文案卡片节奏对应
const PHASE2 = 0.55;
// 闸门视角:胶囊被拦停在门前三米处
const CAPSULE_STOP = new THREE.Vector3(0, 0, GATE_Z + 10);
const CAPSULE_START = new THREE.Vector3(-34, -8, GATE_Z + 48);

const clamp01 = (x: number): number => THREE.MathUtils.clamp(x, 0, 1);
const smooth = (x: number): number => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

const createFleetScene: SceneFactory = (canvas) => {
  const stage = createStage(canvas);
  const { scene, camera } = stage;

  scene.add(starPoints(800, 300, '#8fb4ff', 0.5));
  scene.add(starPoints(250, 180, ACCENT, 0.4));

  const mothership = buildMothership();
  scene.add(mothership.group);

  const nodes = NODE_COLORS.map((c, i) => {
    const node = buildTaskNode(c);
    node.group.position.copy(NODE_POSITIONS[i]);
    scene.add(node.group);
    return node;
  });

  // 每艘小飞船:停靠位、航迹弧线用的侧向偏移、返航宝箱都在同一结构里
  const scouts = NODE_COLORS.map((c, i) => {
    const scout: Scout & { dock: THREE.Vector3; side: THREE.Vector3; merged: boolean } = {
      ...buildScout(c),
      dock: new THREE.Vector3(Math.cos((i * 2 * Math.PI) / 3) * 3, Math.sin((i * 2 * Math.PI) / 3) * 3, 0),
      side: new THREE.Vector3(),
      merged: false,
    };
    const dir = NODE_POSITIONS[i].clone().sub(scout.dock);
    scout.side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
    scout.group.position.copy(scout.dock);
    scene.add(scout.group);
    return scout;
  });

  const gate = buildGate();
  scene.add(gate.group);

  const capsule = buildCapsule();
  capsule.group.visible = false;
  scene.add(capsule.group);

  // 拒绝结局的碎片:一小把加法混合的粒子,从胶囊位置炸开
  const SHARDS = 42;
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHARDS * 3), 3));
  const shardMat = new THREE.PointsMaterial({
    color: '#ff8d9d',
    size: 0.7,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shards = new THREE.Points(shardGeo, shardMat);
  shards.visible = false;
  scene.add(shards);
  const shardVel = Array.from({ length: SHARDS }, () =>
    new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 9),
  );

  // 闸门周边的能量尘埃:在门前空间缓慢漂移,避免闸门段落显得荒芜
  const DUST = 260;
  const dustBase = new Float32Array(DUST * 3);
  const dustPhase = new Float32Array(DUST);
  for (let k = 0; k < DUST; k++) {
    dustBase[k * 3] = (Math.random() * 2 - 1) * 46;
    dustBase[k * 3 + 1] = (Math.random() * 2 - 1) * 22;
    dustBase[k * 3 + 2] = GATE_Z + 2 + Math.random() * 52;
    dustPhase[k] = Math.random() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: '#9d86e8',
      size: 0.55,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(dust);

  // 审批按钮由场景自建自管:挂在 .act-stage 里,只在闸门段落且未决时出现
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '允许执行';
  btn.style.cssText = [
    'position:absolute', 'left:50%', 'bottom:12%', 'transform:translateX(-50%)',
    'pointer-events:auto', 'cursor:pointer', 'z-index:5',
    'padding:0.7rem 1.8rem', 'border-radius:999px',
    'border:1px solid rgba(177,151,252,0.7)', 'background:rgba(20,16,40,0.78)',
    'color:#e6defc', 'font:600 0.95rem/1 system-ui,sans-serif', 'letter-spacing:0.08em',
    'backdrop-filter:blur(6px)', 'box-shadow:0 0 22px rgba(177,151,252,0.35)',
    'display:none',
  ].join(';');
  canvas.parentElement?.appendChild(btn);

  let progress = 0;
  let lastT = 0;
  // 结局一旦触发即锁存,回滚进度也不翻案
  let approveT = -1;
  let rejectT = -1;
  let corePulseT = -10;
  btn.addEventListener('click', () => {
    if (approveT >= 0 || rejectT >= 0) return;
    approveT = lastT;
  });

  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const loop = stage.run((t) => {
    lastT = t;
    const p1 = clamp01(progress / PHASE2);
    const p2 = clamp01((progress - PHASE2) / (1 - PHASE2));
    const s2 = smooth(p2);
    const decided = approveT >= 0 || rejectT >= 0;
    // 保底结局:滚到 0.95 仍未点击 → 拒绝执行,胶囊碎裂
    if (!decided && progress >= 0.95) rejectT = t;

    // ---- 段落一:母舰与分身 ----
    mothership.group.rotation.y = t * 0.2;
    mothership.group.position.y = Math.sin(t * 0.8) * 0.4;
    mothership.ring.rotation.z = t * 0.5;

    scouts.forEach((scout, i) => {
      // 三艘分身错峰出发:u=0 停靠,0.42 抵达,0.52 返程,0.9 汇入,1 完成
      const u = clamp01((p1 - i * 0.28) / 0.44);
      const nodePos = NODE_POSITIONS[i];
      const pos = scout.group.position;
      if (u <= 0) {
        pos.copy(scout.dock);
      } else if (u < 0.42) {
        const a = smooth(u / 0.42);
        pos.lerpVectors(scout.dock, nodePos, a).addScaledVector(scout.side, Math.sin(a * Math.PI) * 4);
        scout.group.lookAt(tmp.copy(pos).add(nodePos).sub(scout.dock));
      } else if (u < 0.52) {
        pos.copy(nodePos);
      } else if (u < 0.9) {
        const b = smooth((u - 0.52) / 0.38);
        pos.lerpVectors(nodePos, scout.dock, b).addScaledVector(scout.side, Math.sin(b * Math.PI) * 3);
        scout.group.lookAt(tmp.copy(pos).add(scout.dock).sub(nodePos));
      } else {
        const c = smooth((u - 0.9) / 0.1);
        pos.lerpVectors(scout.dock, mothership.group.position, c);
        scout.group.scale.setScalar(1 - c);
      }
      // 回滚进度时恢复原状
      if (u < 0.9) scout.group.scale.setScalar(1);

      // 节点在小飞船抵达后点亮并保持
      const lit = smooth((u - 0.32) / 0.14);
      nodes[i].orbMat.opacity = 0.12 + lit * 0.78;
      nodes[i].glow.material.opacity = 0.08 + lit * 0.5;
      nodes[i].orb.scale.setScalar(1 + lit * 0.25 + Math.sin(t * 2 + i) * 0.04 * lit);

      // 返程段叼出宝箱,汇入时随船一起缩小
      scout.chest.visible = u >= 0.5 && u < 0.999;
      scout.chest.rotation.y = t * 2;

      // 汇入核心的一刻记时间戳,驱动核心脉冲
      if (u >= 0.999 && !scout.merged) {
        scout.merged = true;
        corePulseT = t;
      } else if (u < 0.95) {
        scout.merged = false;
      }
      scout.group.visible = u < 0.999;
    });

    const corePulse = Math.exp(-Math.max(0, t - corePulseT) * 2.5);
    mothership.core.scale.setScalar(1 + corePulse * 0.6);
    mothership.coreHalo.material.opacity = 0.35 + corePulse * 0.45 + Math.sin(t * 2.4) * 0.05;

    // ---- 段落二:闸门与命令胶囊 ----
    const gateOpen = approveT >= 0
      ? smooth((t - approveT) / 1.0) * (1 - smooth((t - approveT - 2.8) / 1.5))
      : 0;
    gate.left.position.x = -GATE_PANEL_X - gateOpen * 34;
    gate.right.position.x = GATE_PANEL_X + gateOpen * 34;
    const field = 1 - gateOpen * 0.85;
    // 扫描线持续向上流动;开门时力场与门后辉光一并消散
    gate.panelTexL.offset.y = -t * 0.22;
    gate.panelTexR.offset.y = -t * 0.22;
    const panelOpacity = 0.85 * field * (0.92 + 0.08 * Math.sin(t * 7));
    gate.panelMat.opacity = panelOpacity;
    gate.panelMatL.opacity = panelOpacity;
    gate.edgeMat.opacity = field * (0.55 + 0.3 * Math.sin(t * 3));
    gate.slitMat.opacity = 0.9 * field * (0.8 + 0.2 * Math.sin(t * 5));
    gate.gateGlow.material.opacity = (0.14 + 0.06 * Math.sin(t * 2.2)) * (1 - gateOpen * 0.75);

    // 能量尘埃绕原位缓慢漂移
    const dustAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < DUST; k++) {
      const ph = dustPhase[k];
      dustAttr.setXYZ(
        k,
        dustBase[k * 3] + Math.cos(t * 0.3 + ph) * 1.0,
        dustBase[k * 3 + 1] + Math.sin(t * 0.4 + ph) * 1.4,
        dustBase[k * 3 + 2],
      );
    }
    dustAttr.needsUpdate = true;

    capsule.group.visible = p2 > 0.005 || decided;
    if (capsule.group.visible) {
      const approach = smooth(p2 / 0.55);
      capsule.group.position.lerpVectors(CAPSULE_START, CAPSULE_STOP, approach);
      capsule.group.rotation.z = Math.sin(t * 1.5) * 0.1;
      const waiting = !decided && approach >= 0.999;
      if (waiting) {
        // 被闸门拦停:原地震动 + 双圈警告环反相脉动
        capsule.group.position.x += Math.sin(t * 31) * 0.18;
        capsule.group.position.y += Math.cos(t * 37) * 0.14;
        const beat = Math.sin(t * 6);
        capsule.ring.scale.setScalar(1 + 0.18 * beat);
        capsule.ringMat.opacity = 0.6 + 0.3 * beat;
        capsule.ring2.scale.setScalar(1 - 0.14 * beat);
        capsule.ring2Mat.opacity = 0.45 - 0.25 * beat;
        capsule.ring.lookAt(camera.position);
        capsule.ring2.lookAt(camera.position);
      }
      if (approveT >= 0) {
        const ta = t - approveT;
        const pass = smooth((ta - 0.6) / 1.4);
        capsule.group.position.z = THREE.MathUtils.lerp(CAPSULE_STOP.z, GATE_Z - 40, pass);
        capsule.bodyMat.color.lerpColors(RED, GREEN, pass);
        capsule.glowMat.color.lerpColors(RED, GREEN, pass);
        capsule.ringMat.opacity = Math.max(0, 0.8 - ta);
        capsule.ring2Mat.opacity = Math.max(0, 0.45 - ta);
        const fade = smooth((ta - 2.4) / 0.8);
        capsule.bodyMat.opacity = 1 - fade;
        capsule.glowMat.opacity = 0.6 * (1 - fade);
        capsule.labelMat.opacity = 0.95 * (1 - fade);
        if (ta > 3.4) capsule.group.visible = false;
      } else if (rejectT >= 0) {
        const tr = t - rejectT;
        const back = smooth(tr / 0.8);
        capsule.group.position.addScaledVector(tmp.set(-1, -0.25, 1).normalize(), back * 10);
        capsule.group.scale.setScalar(Math.max(0, 1 - back));
        capsule.ringMat.opacity = Math.max(0, 0.8 - tr * 2);
        capsule.ring2Mat.opacity = Math.max(0, 0.45 - tr * 2);
        capsule.labelMat.opacity = Math.max(0, 0.95 - tr * 2.5);
        if (tr > 1.8) capsule.group.visible = false;
      }
    }

    // 碎片只在拒绝结局里活一次
    if (rejectT >= 0) {
      const tr = t - rejectT;
      shards.visible = tr < 1.8;
      if (shards.visible) {
        const attr = shardGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < SHARDS; k++) {
          tmp.copy(CAPSULE_STOP).addScaledVector(shardVel[k], tr);
          attr.setXYZ(k, tmp.x, tmp.y, tmp.z);
        }
        attr.needsUpdate = true;
        shardMat.opacity = Math.max(0, 0.9 - tr / 1.8);
      }
    }

    btn.style.display = !decided && progress >= 0.6 ? '' : 'none';

    // ---- 运镜:从舰队视角平滑过渡到闸门视角 ----
    const a1 = smooth(p1);
    camera.position.set(
      THREE.MathUtils.lerp(Math.sin(a1 * Math.PI) * 8, 0, s2),
      THREE.MathUtils.lerp(5 + a1 * 3, 3, s2),
      THREE.MathUtils.lerp(40 - a1 * 8, GATE_Z + 36, s2),
    );
    camLook.set(0, 0, THREE.MathUtils.lerp(-4, GATE_Z, s2));
    camera.lookAt(camLook);
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (p) => {
      progress = p;
    },
    dispose: () => {
      btn.remove();
      stage.dispose();
    },
  };
};

export default createFleetScene;
