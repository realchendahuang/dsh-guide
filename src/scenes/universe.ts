import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';
import { UNIVERSE_CLUSTERS } from './lib/universe-data';

// 第 1 幕「插件宇宙」:54 颗插件星组成 6 个按职责着色的星团。
// 滚动运镜:全景 → 穿越星团之间 → 停靠核心脊柱星团;hover 星星出职责 tooltip。

/** 单个插件星:实体小球 + 发光 Sprite,自带相位错开的呼吸闪烁。 */
interface PluginStar {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  glowMaterial: THREE.SpriteMaterial;
  name: string;
  duty: string;
  color: THREE.Color;
  baseScale: number;
  phase: number;
  speed: number;
  /** 星团内的静态偏移 + 随时间轻微浮动。 */
  offset: THREE.Vector3;
  home: THREE.Vector3;
}

/** 程序生成的径向光晕纹理,所有星共享一张,用材质颜色区分星团。 */
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 星团内的高斯式散布:三次均匀随机相加,让星云紧凑而边缘稀疏。 */
function gaussianSpread(radius: number): THREE.Vector3 {
  const v = new THREE.Vector3();
  for (const set of ['x', 'y', 'z'] as const) {
    v[set] = ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * radius;
  }
  return v;
}

const createUniverseScene: SceneFactory = (canvas) => {
  const stage = createStage(canvas);
  const { scene, camera } = stage;

  // 两层远景星尘拉开纵深,保持静态、不参与运镜。
  scene.add(starPoints(1300, 420, '#4d6390', 0.5));
  scene.add(starPoints(600, 260, '#7cc7ff', 0.32));

  const universe = new THREE.Group();
  scene.add(universe);

  const glowTexture = makeGlowTexture();
  const starGeo = new THREE.SphereGeometry(1, 12, 10);
  const stars: PluginStar[] = [];
  const disposables: { dispose(): void }[] = [glowTexture, starGeo];

  for (const cluster of UNIVERSE_CLUSTERS) {
    const center = new THREE.Vector3(...cluster.center);
    const color = new THREE.Color(cluster.color);
    // 核心脊柱星团的主角待遇:星星略大、散布略开。
    const isCore = cluster.id === 'core';
    const clusterRadius = isCore ? 6.5 : 5.5 + Math.random();
    const starPositions: THREE.Vector3[] = [];

    for (const spec of cluster.stars) {
      const offset = gaussianSpread(clusterRadius);
      starPositions.push(offset.clone());

      const baseScale = (isCore ? 0.72 : 0.5) + Math.random() * 0.28;
      const material = new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55) });
      disposables.push(material);
      const mesh = new THREE.Mesh(starGeo, material);
      mesh.scale.setScalar(baseScale);
      mesh.position.copy(center).add(offset);
      mesh.userData.starIndex = stars.length;

      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(glowMaterial);
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.setScalar(baseScale * 7);
      mesh.add(glow);

      universe.add(mesh);
      stars.push({
        mesh,
        glow,
        glowMaterial,
        name: spec.name,
        duty: spec.duty,
        color,
        baseScale,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 0.9,
        offset,
        home: center.clone(),
      });
    }

    // 星座连线:每颗星连向星团内最近的邻居,让星团读起来像一张星图。
    const linePositions: number[] = [];
    starPositions.forEach((p, i) => {
      let best = -1;
      let bestDist = Infinity;
      starPositions.forEach((q, j) => {
        if (i === j) return;
        const d = p.distanceToSquared(q);
        if (d < bestDist) {
          bestDist = d;
          best = j;
        }
      });
      const a = center.clone().add(p);
      const b = center.clone().add(starPositions[best]);
      linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3));
    const lineMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(lineGeo, lineMat);
    universe.add(new THREE.LineSegments(lineGeo, lineMat));
  }

  // 运镜路径:从极远的全景出发,近距离飞掠各星团(协作→记忆→LLM→执行),
  // 最后停靠核心星团。飞掠点距星团中心仅 12~15 单位,且注视点同时落在该星团中心,
  // 保证两条曲线同一 u 处对齐——画面中央始终有主体星团,而不是远远看全景。
  const camCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 10, 118), // 全景
    new THREE.Vector3(34, -4, 44), // 俯向协作星团
    new THREE.Vector3(18, -9, 22), // 飞掠协作(27,-12,11)
    new THREE.Vector3(-6, -16, 26), // 横穿到记忆一侧
    new THREE.Vector3(-22, -10, 17), // 飞掠记忆(-30,-13,7)
    new THREE.Vector3(-32, 3, 0), // 爬升转向 LLM
    new THREE.Vector3(-18, 11, -6), // 飞掠 LLM(-27,13,-14)
    new THREE.Vector3(13, 8, 4), // 掠过执行(30,9,-10)后转向核心
    new THREE.Vector3(0, 4, 17), // 停靠核心(0,2,0)
  ]);
  const lookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -6), // 全景:星座中心
    new THREE.Vector3(25, -10, 14),
    new THREE.Vector3(27, -12, 11), // 协作星团中心
    new THREE.Vector3(-14, -14, 12),
    new THREE.Vector3(-30, -13, 7), // 记忆星团中心
    new THREE.Vector3(-28, 8, -6),
    new THREE.Vector3(-27, 13, -14), // LLM 星团中心
    new THREE.Vector3(24, 8, -8), // 执行星团方向
    new THREE.Vector3(0, 2, 0), // 核心星团中心
  ]);

  // hover tooltip:挂在 .act-stage 上,纯 DOM,不挡事件。
  const tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 160ms ease',
    'transform:translate(-50%,-115%)',
    'max-width:16rem',
    'padding:0.55rem 0.8rem',
    'border-radius:10px',
    'background:rgba(8,10,24,0.82)',
    'border:1px solid rgba(124,199,255,0.35)',
    'backdrop-filter:blur(6px)',
    'color:#dbe7ff',
    'font-size:0.8rem',
    'line-height:1.5',
    'z-index:5',
    'white-space:normal',
  ].join(';');
  const tooltipName = document.createElement('b');
  tooltipName.style.cssText = 'display:block;font-size:0.85rem;letter-spacing:0.02em';
  const tooltipDuty = document.createElement('span');
  tooltipDuty.style.cssText = 'opacity:0.85';
  tooltip.appendChild(tooltipName);
  tooltip.appendChild(tooltipDuty);
  (canvas.parentElement ?? document.body).appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let pointerOnCanvas = false;
  let hovered: PluginStar | null = null;

  const onPointerMove = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
    pointerOnCanvas = true;
  };
  const onPointerLeave = (): void => {
    pointerOnCanvas = false;
    hovered = null;
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);

  let progress = 0;
  const camPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const projected = new THREE.Vector3();

  const loop = stage.run((t) => {
    // smoothstep 让首尾停靠更稳,中段(约 0.3→0.7)正好落在星团间穿行。
    const u = THREE.MathUtils.smoothstep(progress, 0, 1);
    camCurve.getPoint(u, camPos);
    lookCurve.getPoint(u, lookTarget);
    camera.position.copy(camPos);
    camera.lookAt(lookTarget);

    // 呼吸闪烁 + hover 放大;星团整体随时间轻微上下浮动。
    for (const star of stars) {
      const breathe = Math.sin(t * star.speed + star.phase);
      const isHovered = star === hovered;
      const targetScale = star.baseScale * (1 + breathe * 0.1) * (isHovered ? 1.7 : 1);
      star.mesh.scale.setScalar(THREE.MathUtils.lerp(star.mesh.scale.x, targetScale, 0.15));
      star.glow.scale.setScalar(star.mesh.scale.x * 7);
      star.glowMaterial.opacity = THREE.MathUtils.clamp(
        0.5 + breathe * 0.22 + (isHovered ? 0.4 : 0),
        0,
        1,
      );
      star.mesh.position.copy(star.home).add(star.offset);
      star.mesh.position.y += Math.sin(t * 0.4 + star.phase) * 0.35;
    }

    // hover 拾取:每帧对 54 个小球 raycast,代价可忽略。
    if (pointerOnCanvas) {
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(universe.children, false);
      const hit = hits.find((h) => h.object.userData.starIndex !== undefined);
      hovered = hit ? stars[hit.object.userData.starIndex as number] : null;
    }

    if (hovered) {
      tooltipName.textContent = hovered.name;
      tooltipName.style.color = `#${hovered.color.getHexString()}`;
      tooltipDuty.textContent = hovered.duty;
      projected.copy(hovered.mesh.position).project(camera);
      if (projected.z < 1) {
        const x = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
        const y = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;
        tooltip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-115%)`;
        tooltip.style.opacity = '1';
      } else {
        tooltip.style.opacity = '0';
      }
      canvas.style.cursor = 'pointer';
    } else {
      tooltip.style.opacity = '0';
      canvas.style.cursor = '';
    }
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (p) => {
      progress = THREE.MathUtils.clamp(p, 0, 1);
    },
    dispose() {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      tooltip.remove();
      for (const d of disposables) d.dispose();
      stage.dispose();
    },
  };
};

export default createUniverseScene;
