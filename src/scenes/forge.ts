import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';
import { clamp01, easeOutBack, hash, makeGlowTexture, smooth } from './lib/forge-utils';

// 第 5 幕「压缩熔炉」:上游晶体排队入炉,被逐个吸入、拉长、烧白、碎成光尘,
// 最终凝成一颗致密的摘要水晶;河床里原件一颗不少,只是暗了下去 ——
// 模型从此只看亮的那颗,但原件永远都在。
//
// 全部状态都是 progress 的纯函数(配确定性 hash),scrub 回退不穿帮,不留事件式状态。
const createForgeScene: SceneFactory = (canvas) => {
  const ACCENT = '#f783ac';
  const N = 14; // 晶体总数
  const K = 22; // 每颗晶体碎出的光尘数
  const SPACING = 2.6; // 排队间距
  const MARCH0 = 12; // 阶段一队伍整体推进距离
  const HOLD = -1.8; // 队首等待被吸入的 x 位置
  const QUEUE_Y = 2.2;
  const MELT_START = 0.4; // 吸入阶段起点
  const MELT_STEP = 0.0185; // 相邻晶体吸入间隔(progress)
  const MELT_DUR = 0.055; // 单颗晶体的吸入时长
  const BIRTH = 0.7; // 摘要水晶诞生
  const REVEAL = 0.75; // 相机下移揭示河床(与诞生收尾交叠,让对比构图更早成立)
  const BED_Y = -26; // 河床高度:藏在 reveal 前取景框的下沿之外
  const SWIRL = 110; // 熔口旋涡粒子数

  const stage = createStage(canvas);
  const { scene, camera } = stage;
  const glowTex = makeGlowTexture();

  scene.add(starPoints(500, 260, '#8fb4ff', 0.5));
  scene.add(starPoints(260, 180, ACCENT, 0.42));

  const F = new THREE.Vector3(2.5, 2.2, 0); // 熔炉中心

  // ---------- 熔炉:环形 portal + 熔口柔光 + 内核 + 旋涡粒子 ----------
  const furnace = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring2Mat = ringMat.clone();
  ring2Mat.opacity = 0.7;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.18, 12, 72), ringMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.11, 10, 60), ring2Mat);
  const ringGroup = new THREE.Group();
  // 环面基本朝向相机、只向 -x 来料方向微倾:正侧对相机时 torus 会退化成一条竖直亮线
  ringGroup.rotation.y = 0.42;
  ringGroup.add(ring1, ring2);

  const CORE_COLD = new THREE.Color('#30081c');
  const CORE_HOT = new THREE.Color('#fff0f6');
  const coreMat = new THREE.MeshBasicMaterial({ color: CORE_COLD.clone() });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 24), coreMat);

  const mouthGlowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: '#ff6ba3',
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mouthGlow = new THREE.Sprite(mouthGlowMat);
  mouthGlow.scale.setScalar(6);

  const flashMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: '#ffffff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMat);

  const swirlGeo = new THREE.BufferGeometry();
  swirlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SWIRL * 3), 3));
  const swirlMat = new THREE.PointsMaterial({
    map: glowTex,
    color: ACCENT,
    size: 0.5,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const swirl = new THREE.Points(swirlGeo, swirlMat);
  swirl.frustumCulled = false;
  const swirlSeedA = new Float32Array(SWIRL);
  const swirlSeedB = new Float32Array(SWIRL);
  const swirlRad = new Float32Array(SWIRL);
  for (let i = 0; i < SWIRL; i++) {
    swirlSeedA[i] = hash(i * 3 + 1);
    swirlSeedB[i] = hash(i * 3 + 2);
    swirlRad[i] = 1.2 + hash(i * 3 + 3) * 2.2;
  }
  // 旋涡粒子挂在 ringGroup 里、在环平面内绕行,跟着环一起侧倾,否则侧视会退化成一列竖点
  ringGroup.add(swirl);
  furnace.add(ringGroup, core, mouthGlow, flash);
  furnace.position.copy(F);
  scene.add(furnace);

  // ---------- 晶体:队列(自发光)+ 河床原件(受光,暗)共用八面体几何 ----------
  const crystalGeo = new THREE.OctahedronGeometry(0.85, 0);
  // 队列晶体用 Basic+instanceColor,亮即发光;河床原件用 Standard,靠摘要水晶的 PointLight 照亮
  const queue = new THREE.InstancedMesh(crystalGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), N);
  const bed = new THREE.InstancedMesh(
    crystalGeo,
    new THREE.MeshStandardMaterial({
      color: '#5c3049',
      emissive: '#3a1424',
      flatShading: true,
      roughness: 0.6,
      metalness: 0.1,
    }),
    N,
  );
  queue.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bed.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  queue.frustumCulled = false; // 实例散布范围远超几何包围球,禁用误剔除
  bed.frustumCulled = false;
  scene.add(queue, bed);

  // 河床槽位:每颗原件的最终归宿,确定性随机散布
  const bedPos = new Float32Array(N * 3);
  const bedRot = new Float32Array(N * 3);
  const bedScale = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    bedPos.set([(hash(i * 3 + 1) - 0.5) * 30, BED_Y + hash(i * 3 + 2) * 1.2, (hash(i * 3 + 3) - 0.5) * 12], i * 3);
    bedRot.set([(Math.PI / 2) * (0.7 + hash(i * 7 + 4) * 0.6), hash(i * 7 + 5) * Math.PI * 2, hash(i * 7 + 6) * 0.8], i * 3);
    bedScale[i] = 0.8 + hash(i * 11) * 0.5;
    queue.setColorAt(i, new THREE.Color(ACCENT)); // 预分配 instanceColor 缓冲
  }

  // ---------- 光尘:晶体入炉时碎裂的爆发粒子,位置/透明度都是 progress 的纯函数 ----------
  const DUST = N * K;
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: glowTex,
      size: 0.55,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  dust.frustumCulled = false;
  scene.add(dust);
  const dustDir = new Float32Array(DUST * 3);
  const dustPerp = new Float32Array(DUST * 3);
  const dustSpeed = new Float32Array(DUST);
  {
    const d = new THREE.Vector3();
    for (let idx = 0; idx < DUST; idx++) {
      d.set(hash(idx * 3 + 1) - 0.5, hash(idx * 3 + 2) - 0.5, hash(idx * 3 + 3) - 0.5).normalize();
      dustDir.set([d.x, d.y, d.z], idx * 3);
      // 切向分量:碎裂时带一点漩涡感;dir 与 z 轴叉积的近垂直向量
      const px = d.y;
      const py = -d.x;
      const pl = Math.hypot(px, py);
      if (pl > 0.01) dustPerp.set([px / pl, py / pl, 0], idx * 3);
      else dustPerp.set([1, 0, 0], idx * 3);
      dustSpeed[idx] = 3.5 + hash(idx * 7 + 4) * 6;
    }
  }

  // ---------- 摘要水晶:多面切割 + 描边 + 光晕,自带照亮河床的 PointLight ----------
  const gem = new THREE.Group();
  const gemMat = new THREE.MeshStandardMaterial({
    color: '#ffe3ee',
    emissive: ACCENT,
    emissiveIntensity: 1,
    flatShading: true,
    roughness: 0.2,
    metalness: 0.3,
  });
  const gemSolid = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 0), gemMat);
  const gemEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(gemSolid.geometry),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }),
  );
  const gemHaloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: ACCENT,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const gemHalo = new THREE.Sprite(gemHaloMat);
  gemHalo.scale.setScalar(9);
  const gemLight = new THREE.PointLight('#ffc2d9', 0, 0, 2); // 物理衰减,河床距它约 35  gem.add(gemSolid, gemEdges, gemHalo, gemLight);
  gem.visible = false;
  scene.add(gem);

  // 河床地面:只为接住摘要水晶投下的光池,reveal 前透明
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#1f0e18',
    roughness: 0.9,
    transparent: true,
    opacity: 0,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = BED_Y - 1.4;
  scene.add(ground);

  scene.add(new THREE.AmbientLight('#2b1a26', 0.9));
  const keyLight = new THREE.DirectionalLight('#ffffff', 0.9); // 给摘要水晶的切面一点明暗变化
  keyLight.position.set(6, 10, 8);
  scene.add(keyLight);

  // 指针视差:可选交互,纯滚动也有完整保底构图
  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent): void => {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointer);
  let ptrX = 0;
  let ptrY = 0;

  const WHITE_HOT = new THREE.Color('#fff5fa');
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color();

  let progress = 0;
  const loop = stage.run((t, dt) => {
    const p = progress;

    // 吸力:阶段一逐渐增强的波动,吸入期持续,诞生后衰竭
    const suction =
      p < MELT_START
        ? clamp01(p / MELT_START) * (0.5 + 0.5 * Math.sin(t * 3.2 + p * 9))
        : 0.5 * (1 - smooth((p - BIRTH) / 0.1));
    const intake = clamp01((p - MELT_START) / 0.3);
    const fb = Math.exp(-(((p - (BIRTH + 0.02)) / 0.035) ** 2)); // 诞生瞬间的高斯脉冲
    const settle = 1 - 0.55 * clamp01((p - BIRTH - 0.02) / 0.1); // 吐出水晶后炉内余烬变暗
    const flickerAmp = p < MELT_START ? clamp01(p / MELT_START) : 0.35;
    const glow = (0.22 + 0.78 * intake) * settle * (1 + 0.14 * Math.sin(t * 2.7) * flickerAmp) + fb * 0.9;

    // 熔炉
    furnace.position.set(F.x, F.y + Math.sin(t * 0.9) * 0.22, F.z);
    ring1.rotation.z = t * 0.25;
    ring2.rotation.z = -t * 0.42;
    coreMat.color.lerpColors(CORE_COLD, CORE_HOT, clamp01(glow));
    // 熔口柔光压低一档,避免把炉环轮廓糊掉;炉环本身保持常亮并随 glow 微闪
    mouthGlowMat.opacity = 0.1 + 0.3 * clamp01(glow);
    mouthGlow.scale.setScalar(4 + clamp01(glow) * 3 + suction * 1.2);
    ringMat.opacity = 0.8 + 0.2 * clamp01(glow);
    ring2Mat.opacity = 0.55 + 0.3 * clamp01(glow);
    flashMat.opacity = fb * 0.85;
    flash.scale.setScalar(3 + fb * 16);
    swirlMat.opacity = 0.3 + clamp01(glow) * 0.5;
    const sp = swirlGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SWIRL; i++) {
      const a = swirlSeedA[i] * Math.PI * 2 + t * (0.7 + glow * 1.6) * (0.6 + swirlSeedB[i]);
      const r = swirlRad[i] * (1 - 0.3 * suction * (0.5 + 0.5 * Math.sin(t * 3 + i)));
      // 环平面内的圆周轨道,轴向(z)小抖动
      sp.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, -0.4 + Math.sin(a * 2) * 0.25);
    }
    sp.needsUpdate = true;

    // 队伍推进:阶段一走入画面;吸入期保持传送带节奏,每颗恰在自己的时刻抵达炉口
    const advance =
      MARCH0 * clamp01(p / MELT_START) + (SPACING / MELT_STEP) * Math.max(0, Math.min(p, BIRTH) - MELT_START);

    for (let i = 0; i < N; i++) {
      const ms = MELT_START + i * MELT_STEP;
      const s = clamp01((p - ms) / MELT_DUR);

      // 队列晶体:走进来,或在吸入中拉长、烧白
      if (s < 1) {
        const qx = HOLD - i * SPACING - MARCH0 + advance;
        const qy = QUEUE_Y + Math.sin(t * 1.5 + i * 1.3) * 0.18 + (hash(i * 7 + 1) - 0.5) * 0.9;
        const qz = (hash(i * 5 + 2) - 0.5) * 3;
        const pull = s * s * s; // 吸力加速:越靠近炉口飞得越快
        tmpV.set(
          THREE.MathUtils.lerp(qx, furnace.position.x, pull),
          THREE.MathUtils.lerp(qy, furnace.position.y, pull),
          THREE.MathUtils.lerp(qz, furnace.position.z, pull),
        );
        tmpE.set(t * 0.4 + i, i * 1.7 + t * 0.3, t * 0.2);
        tmpQ.setFromEuler(tmpE);
        tmpS.set(1 + s * 2.6, 1 - s * 0.45, 1 - s * 0.45);
        tmpM.compose(tmpV, tmpQ, tmpS);
        queue.setMatrixAt(i, tmpM);
        tmpC.setHSL(0.93 + hash(i * 3) * 0.03, 0.85, 0.6 + hash(i * 11) * 0.14);
        tmpC.lerp(WHITE_HOT, clamp01(s * 1.5));
        queue.setColorAt(i, tmpC);
      } else {
        tmpM.makeScale(0, 0, 0);
        queue.setMatrixAt(i, tmpM);
      }

      // 河床原件:熔完后坠落到自己的槽位,从翻滚过渡到静卧
      const u = clamp01((p - ms - MELT_DUR * 0.55) / 0.14);
      if (u <= 0) {
        tmpM.makeScale(0, 0, 0);
        bed.setMatrixAt(i, tmpM);
      } else {
        const su = smooth(u);
        tmpV.set(
          THREE.MathUtils.lerp(furnace.position.x, bedPos[i * 3], su),
          THREE.MathUtils.lerp(furnace.position.y, bedPos[i * 3 + 1], su * su), // y 加速下坠
          THREE.MathUtils.lerp(furnace.position.z, bedPos[i * 3 + 2], su),
        );
        tmpE.set(t * 0.4 + i, i * 1.7, 0);
        tmpQ.setFromEuler(tmpE);
        tmpE.set(bedRot[i * 3], bedRot[i * 3 + 1], bedRot[i * 3 + 2]);
        tmpQ2.setFromEuler(tmpE);
        tmpQ.slerp(tmpQ2, su);
        tmpS.setScalar(smooth(u / 0.2) * bedScale[i]);
        tmpM.compose(tmpV, tmpQ, tmpS);
        bed.setMatrixAt(i, tmpM);
      }
    }
    queue.instanceMatrix.needsUpdate = true;
    bed.instanceMatrix.needsUpdate = true;
    if (queue.instanceColor) queue.instanceColor.needsUpdate = true;

    // 光尘爆发:与坠落同节奏,减速外扩 + 切向漩涡,平方衰减消散
    const dp = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    const dc = dustGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const ms = MELT_START + i * MELT_STEP;
      const u = clamp01((p - ms - MELT_DUR * 0.55) / 0.13);
      const fade = u <= 0 || u >= 1 ? 0 : smooth(u / 0.1) * (1 - u) * (1 - u);
      const reach = 1 - (1 - u) * (1 - u);
      for (let j = 0; j < K; j++) {
        const idx = i * K + j;
        const o = idx * 3;
        const swirlAmt = Math.sin(u * Math.PI) * (0.6 + hash(idx * 5 + 2)) * 2;
        dp.setXYZ(
          idx,
          furnace.position.x + (dustDir[o] * dustSpeed[idx] + dustPerp[o] * swirlAmt) * reach,
          furnace.position.y + (dustDir[o + 1] * dustSpeed[idx] + dustPerp[o + 1] * swirlAmt) * reach,
          furnace.position.z + dustDir[o + 2] * dustSpeed[idx] * reach,
        );
        const b2 = fade * (0.5 + 0.5 * hash(idx * 9 + 1)); // 白偏粉
        dc.setXYZ(idx, b2, b2 * 0.55, b2 * 0.75);
      }
    }
    dp.needsUpdate = true;
    dc.needsUpdate = true;

    // 摘要水晶:脉冲中诞生,升到熔炉上方缓慢旋转
    const b = clamp01((p - BIRTH) / 0.13);
    gem.visible = b > 0;
    if (b > 0) {
      const sb = smooth(b);
      gem.scale.setScalar(Math.max(0.001, easeOutBack(b)));
      gem.position.set(
        THREE.MathUtils.lerp(furnace.position.x, 2.2, sb),
        THREE.MathUtils.lerp(furnace.position.y, 8.3, 1 - (1 - b) ** 3) + sb * Math.sin(t * 0.8) * 0.35,
        THREE.MathUtils.lerp(furnace.position.z, 2, sb),
      );
      gem.rotation.y = t * 0.45;
      gem.rotation.x = Math.sin(t * 0.3) * 0.15;
      gemMat.emissiveIntensity = 0.9 + fb * 3.5 + Math.sin(t * 2) * 0.12;
      gemHaloMat.opacity = (0.45 + fb * 0.6 + Math.sin(t * 1.6) * 0.05) * sb;
      gemLight.intensity = 1250 * sb * (1 + fb * 2.5);
    } else {
      gemLight.intensity = 0;
    }
    groundMat.opacity = smooth((p - REVEAL) / (1 - REVEAL));

    // 运镜:先跟着队伍向熔炉平移推近,最后下移揭示河床
    ptrX += (pointer.x - ptrX) * Math.min(1, dt * 3);
    ptrY += (pointer.y - ptrY) * Math.min(1, dt * 3);
    const drift = smooth(p / 0.7);
    const rev = smooth((p - REVEAL) / (1 - REVEAL));
    camera.position.set(
      THREE.MathUtils.lerp(-7, 1.5, drift) + ptrX * 1.6,
      THREE.MathUtils.lerp(2.0, -5.0, rev) + ptrY * 1.0,
      THREE.MathUtils.lerp(42, 36.5, smooth(p / REVEAL)) + rev * 3.5,
    );
    camera.lookAt(
      THREE.MathUtils.lerp(-5, 2.2, drift) + ptrX * 0.8,
      THREE.MathUtils.lerp(2.5, -9, rev) + ptrY * 0.5,
      0,
    );
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (pr) => {
      progress = clamp01(pr);
    },
    dispose: () => {
      window.removeEventListener('pointermove', onPointer);
      stage.dispose();
    },
  };
};

export default createForgeScene;
