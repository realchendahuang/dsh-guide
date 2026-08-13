import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';
import { glowTexture, makeGlowSprite, makeFresnelShell, makeGearGeometry, heartbeat } from './lib/heart-parts';

// 第三幕「主循环之心」:一颗悬浮的反应堆心脏。滚动驱动一次完整的 agent turn:
// 0–0.15 消息摄入 → 0.15–0.3 上下文光环组装 → 0.3–0.45 光束请示 LLM 云团 →
// 0.45–0.6 token 雨回流 → 0.6–0.75 工具齿轮执行 → 0.75–0.9 turn 继续(迷你循环)→ 0.9–1 归于平静。
// 设计目标是「机械 + 生命」:心跳泵动的发光核心,套在齿轮、管线与玻璃外壳里。

const ACCENT = '#ffa94d';
const CLOUD_POS = new THREE.Vector3(8, 21, -9);
const CORE_TOP = new THREE.Vector3(0, 3.2, 0);
const CORE_POS = new THREE.Vector3(0, 0.8, 0);
const FUNNEL_TIP = new THREE.Vector3(0, -13.5, 1.5);
const RING_RADIUS = 11;

/** 把 progress 的子区间 [a,b] 映射成 0→1 的平滑值,所有阶段动画都由它驱动。 */
const seg = (p: number, a: number, b: number): number =>
  THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((p - a) / (b - a), 0, 1), 0, 1);

const createHeartScene: SceneFactory = (canvas) => {
  const stage = createStage(canvas);
  const { scene, camera } = stage;

  scene.add(starPoints(800, 260, ACCENT, 0.5));
  scene.add(starPoints(400, 200, '#8fb4ff', 0.4));

  // ---------- 心脏本体(核心 + 陀螺笼 + 玻璃外壳) ----------
  const heartGroup = new THREE.Group();
  scene.add(heartGroup);

  const coreGroup = new THREE.Group();
  coreGroup.position.copy(CORE_POS);
  heartGroup.add(coreGroup);

  const coreInner = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 32, 24),
    new THREE.MeshBasicMaterial({ color: '#fff6e8' }),
  );
  const coreMid = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 32, 24),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  // 机械感的陀螺笼:缓慢自转的线框二十面体
  const gyro = new THREE.Mesh(
    new THREE.IcosahedronGeometry(4.8, 1),
    new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const shell = makeFresnelShell(6.1, ACCENT);
  const coreGlow = makeGlowSprite(ACCENT, 24, 0.35);
  coreGroup.add(coreInner, coreMid, gyro, shell, coreGlow);

  // 核心点光源:只负责照亮齿轮等受光材质,强度随心跳起伏
  const coreLight = new THREE.PointLight(ACCENT, 140, 0, 2);
  coreLight.position.set(0, 1, 3);
  coreGroup.add(coreLight);
  scene.add(new THREE.AmbientLight('#46506a', 0.8));

  // ---------- 上下文光环:底盘细环 + 三段依次点亮的弧 ----------
  const ringGroup = new THREE.Group();
  ringGroup.position.copy(CORE_POS);
  ringGroup.rotation.x = 1.12; // 斜置轨道,让光环呈椭圆透视
  heartGroup.add(ringGroup);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS, 0.1, 8, 128),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ringGroup.add(baseRing);

  // 三段弧 = 系统提示 / 记忆 / 工具清单,同色系由深到浅区分
  const arcColors = ['#ff8c1a', ACCENT, '#ffd8a8'];
  const arcs = arcColors.map((color, i) => {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.34, 10, 72, Math.PI * 0.58),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    arc.rotation.z = i * ((Math.PI * 2) / 3) + 0.12;
    ringGroup.add(arc);
    return arc;
  });

  // 迷你循环的环绕粒子(0.75–0.9 阶段沿光环快跑一圈)
  const orbiter = new THREE.Group();
  const orbiterBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#fff1dd' }),
  );
  orbiter.add(orbiterBall, makeGlowSprite(ACCENT, 5, 0.8));
  orbiter.visible = false;
  ringGroup.add(orbiter);

  // ---------- inbox 漏斗与消息粒子 ----------
  const funnel = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 7, 24, 3, true),
    new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  funnel.position.set(FUNNEL_TIP.x, FUNNEL_TIP.y - 3.5, FUNNEL_TIP.z); // 锥尖朝上,正对核心
  heartGroup.add(funnel);
  const funnelGlow = makeGlowSprite(ACCENT, 7, 0.25);
  funnelGlow.position.copy(FUNNEL_TIP);
  heartGroup.add(funnelGlow);

  const message = new THREE.Group();
  const messageBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 20, 14),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  );
  const messageHalo = makeGlowSprite('#ffffff', 6.5, 0.85);
  message.add(messageBall, messageHalo);
  heartGroup.add(message);

  // ---------- LLM 云团 + 请示光束 ----------
  const cloudGroup = new THREE.Group();
  cloudGroup.position.copy(CLOUD_POS);
  scene.add(cloudGroup);

  const CLOUD_COUNT = 150;
  const cloudBase = new Float32Array(CLOUD_COUNT * 3);
  const cloudPhase = new Float32Array(CLOUD_COUNT);
  for (let i = 0; i < CLOUD_COUNT; i++) {
    // 椭球分布,越靠近中心越密
    const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()));
    cloudBase.set([v.x * 6, v.y * 3.2, v.z * 4.2], i * 3);
    cloudPhase[i] = Math.random() * Math.PI * 2;
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudBase.slice(), 3));
  const cloudMat = new THREE.PointsMaterial({
    map: glowTexture(),
    color: '#4d6bb3',
    size: 1.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  cloud.frustumCulled = false;
  cloudGroup.add(cloud);
  const cloudGlow = makeGlowSprite('#8fb4ff', 30, 0.1);
  cloudGroup.add(cloudGlow);
  const cloudDim = new THREE.Color('#4d6bb3');
  const cloudLit = new THREE.Color('#dfeaff');

  // 光束:单位长圆柱沿核心→云团方向拉伸,透明加法叠加出能量通道
  const beamLen = CLOUD_POS.distanceTo(CORE_TOP);
  const beamGeo = new THREE.CylinderGeometry(0.55, 1.1, 1, 12, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffb35c',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.copy(CORE_TOP).add(CORE_POS);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), CLOUD_POS.clone().sub(CORE_POS).sub(CORE_TOP).normalize());
  beam.scale.set(1, beamLen, 1);
  scene.add(beam);
  const beamPulses = [makeGlowSprite('#ffe2b8', 4.5, 0), makeGlowSprite('#ffe2b8', 4.5, 0)];
  beamPulses.forEach((s) => scene.add(s));

  // ---------- token 雨:云团沿弧线回流核心的粒子流 ----------
  const RAIN_COUNT = 90;
  const rainDelay = new Float32Array(RAIN_COUNT);
  const rainJitter = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainDelay[i] = (i / RAIN_COUNT) * 0.55 + Math.random() * 0.12;
    rainJitter.set([(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5], i * 3);
  }
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 3).fill(-9999);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    map: glowTexture(),
    color: '#ffd8a8',
    size: 1.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  // 回流弧线:从云团下方起,向镜头方向鼓出一条抛物线,落回核心
  const rainP0 = CLOUD_POS.clone().add(new THREE.Vector3(0, -2, 0));
  const rainP1 = new THREE.Vector3(9, 12, 5);
  const rainP2 = CORE_POS.clone();

  // ---------- 工具齿轮组(核心右侧的执行机构) ----------
  const gearGroup = new THREE.Group();
  gearGroup.position.set(11.5, -2.5, -2);
  gearGroup.rotation.y = -0.3;
  scene.add(gearGroup);

  const gearMat = new THREE.MeshStandardMaterial({ color: '#9aa0ad', metalness: 0.85, roughness: 0.35, emissive: '#3a2408', emissiveIntensity: 0.3 });
  // 半径按齿数比例配对,相邻齿轮中心距 = 半径之和,转向相反、角速度反比于齿数
  const gearSpecs = [
    { teeth: 16, r: 4.0, x: 0, y: 2.0, z: 0, dir: 1 },
    { teeth: 11, r: 2.6, x: 6.6, y: 2.0, z: 0.4, dir: -1 },
    { teeth: 13, r: 3.2, x: 0, y: -5.2, z: 0, dir: -1 },
    { teeth: 9, r: 2.2, x: 5.4, y: -5.2, z: 0.6, dir: 1 },
  ];
  const gears = gearSpecs.map((spec) => {
    const gear = new THREE.Mesh(makeGearGeometry(spec.teeth, spec.r, spec.r * 0.22, 1.1), gearMat);
    gear.position.set(spec.x, spec.y, spec.z);
    gearGroup.add(gear);
    return gear;
  });

  // 命令执行粒子:从齿轮缘飞出(派发)再飞回(结果回收)
  const command = new THREE.Group();
  command.add(
    new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff6e8' })),
    makeGlowSprite(ACCENT, 4, 0.9),
  );
  command.visible = false;
  gearGroup.add(command);
  const commandFrom = new THREE.Vector3(6.6, 4.8, 1.2);
  const commandDir = new THREE.Vector3(1, 0.75, 0.55).normalize();

  // ---------- 发光管线:齿轮组与核心之间、核心与漏斗之间的能量导管 ----------
  const conduitMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const gearConduitCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(8.2, -1.5, -1.2),
    new THREE.Vector3(6.2, 1.6, -0.6),
    new THREE.Vector3(4.2, 1.0, 0),
  ]);
  const gearConduit = new THREE.Mesh(new THREE.TubeGeometry(gearConduitCurve, 40, 0.16, 8), conduitMat);
  heartGroup.add(gearConduit);
  const inletConduitCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -2.6, 0),
    new THREE.Vector3(0.8, -6.5, 0.6),
    new THREE.Vector3(-0.4, -10, 1),
    FUNNEL_TIP.clone(),
  ]);
  const inletConduit = new THREE.Mesh(new THREE.TubeGeometry(inletConduitCurve, 40, 0.14, 8), conduitMat);
  heartGroup.add(inletConduit);
  // 导管里循环奔跑的能量脉冲
  const conduitPulses = [makeGlowSprite(ACCENT, 2.6, 0.4), makeGlowSprite(ACCENT, 2.6, 0.4)];
  conduitPulses.forEach((s) => heartGroup.add(s));

  // ---------- 动画状态 ----------
  let progress = 0;
  let hbPhase = 0;
  const gearAngles = gearSpecs.map(() => Math.random() * Math.PI * 2);

  const loop = stage.run((t, dt) => {
    const p = progress;

    // 阶段推进值
    const sIn = seg(p, 0, 0.15); // 消息摄入
    const sBeam = seg(p, 0.3, 0.45); // 请示 LLM
    const sRain = seg(p, 0.45, 0.6); // token 回流
    const sGear = seg(p, 0.6, 0.75); // 工具执行
    const sMini = seg(p, 0.78, 0.9); // 迷你循环
    const sCalm = seg(p, 0.9, 1); // 归于平静

    // 活跃度:消息到达后拉高,尾声回落;心跳频率与能量都随它走
    const activity = seg(p, 0.1, 0.25) * (1 - 0.7 * sCalm);
    hbPhase += dt * (0.55 + 1.6 * activity);
    const pulse = heartbeat(hbPhase % 1);
    // 消息被核心吸收瞬间的闪光( scrub 到 0.15 附近时出现)
    const absorbFlash = seg(p, 0.13, 0.15) * (1 - seg(p, 0.15, 0.22));
    const miniBoost = seg(p, 0.75, 0.8) * (1 - seg(p, 0.88, 0.98));

    // 心脏整体缓慢浮空 + 微自转
    heartGroup.position.y = Math.sin(t * 0.5) * 0.5;
    heartGroup.rotation.y = Math.sin(t * 0.12) * 0.06;

    // 核心:心率式缩放 + 发光呼吸
    const pump = pulse * (0.5 + 0.5 * activity);
    coreGroup.scale.setScalar(1 + pump * 0.13 + miniBoost * 0.06);
    const coreMidMat = coreMid.material as THREE.MeshBasicMaterial;
    coreMidMat.opacity = 0.22 + pump * 0.3 + absorbFlash * 0.4 + miniBoost * 0.15;
    (coreGlow.material as THREE.SpriteMaterial).opacity = 0.28 + pump * 0.35 + absorbFlash * 0.5 + miniBoost * 0.2;
    ((shell.material as THREE.ShaderMaterial).uniforms.uIntensity as { value: number }).value = 0.8 + pump * 0.9 + miniBoost * 0.5;
    coreLight.intensity = 120 + pump * 170 + absorbFlash * 220;
    gyro.rotation.y = t * 0.35;
    gyro.rotation.x = t * 0.18;

    // 光环:三段弧依次点亮,组装完成后保持柔和常亮,迷你循环阶段增亮
    ringGroup.rotation.z = t * 0.05;
    arcs.forEach((arc, i) => {
      const fade = seg(p, 0.15 + i * 0.05, 0.2 + i * 0.05);
      (arc.material as THREE.MeshBasicMaterial).opacity = 0.05 + fade * (0.55 + miniBoost * 0.3) * (1 - 0.25 * sCalm) + pump * 0.06 * fade;
    });
    (baseRing.material as THREE.MeshBasicMaterial).opacity = 0.14 + activity * 0.08;

    // 消息粒子:从漏斗尖飞入核心,抵达时缩小被「吸收」
    const msgGone = seg(p, 0.14, 0.155);
    message.position.set(
      Math.sin(sIn * Math.PI) * 2.2,
      THREE.MathUtils.lerp(FUNNEL_TIP.y, CORE_POS.y, sIn),
      THREE.MathUtils.lerp(FUNNEL_TIP.z, CORE_POS.z, sIn),
    );
    message.scale.setScalar(Math.max(1 - msgGone, 0.001));
    message.visible = msgGone < 1;
    (messageHalo.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(t * 6) * 0.15;
    funnel.rotation.y = t * 0.4;
    (funnelGlow.material as THREE.SpriteMaterial).opacity = 0.18 + (1 - sIn) * 0.12 + Math.sin(t * 2.4) * 0.05;

    // 光束:0.3–0.45 建立,token 雨期间残留细流,0.65 后消散
    const beamOn = sBeam * (1 - seg(p, 0.62, 0.72));
    beamMat.opacity = beamOn * (0.55 + Math.sin(t * 18) * 0.1);
    beam.scale.x = beam.scale.z = 1 + Math.sin(t * 20) * 0.18 * beamOn;
    beamPulses.forEach((sprite, i) => {
      const u = (t * 0.9 + i * 0.5) % 1;
      sprite.position.lerpVectors(beam.position, CLOUD_POS, u);
      (sprite.material as THREE.SpriteMaterial).opacity = beamOn * 0.85 * Math.sin(u * Math.PI);
    });

    // LLM 云团:被光束点亮后增亮、加速翻涌,token 雨后期逐渐回落
    const cloudEnergy = Math.max(0.05, sBeam * (1 - seg(p, 0.62, 0.8)));
    cloudMat.color.lerpColors(cloudDim, cloudLit, cloudEnergy);
    cloudMat.opacity = 0.3 + cloudEnergy * 0.55;
    cloudGroup.rotation.y = t * (0.12 + cloudEnergy * 0.9);
    cloudGroup.scale.setScalar(1 + cloudEnergy * 0.22);
    (cloudGlow.material as THREE.SpriteMaterial).opacity = 0.08 + cloudEnergy * 0.45;
    const cloudAttr = cloudGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const b = i * 3;
      const wobble = 0.25 + cloudEnergy * 0.9;
      cloudAttr.setXYZ(
        i,
        cloudBase[b] + Math.sin(t * 1.1 + cloudPhase[i]) * wobble,
        cloudBase[b + 1] + Math.sin(t * 1.6 + cloudPhase[i] * 1.7) * wobble,
        cloudBase[b + 2] + Math.cos(t * 1.3 + cloudPhase[i]) * wobble,
      );
    }
    cloudAttr.needsUpdate = true;

    // token 雨:各粒子错峰出发,沿抛物线从云团落回核心
    const rainAttr = rainGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const local = THREE.MathUtils.clamp((sRain - rainDelay[i]) / 0.38, 0, 1);
      if (local <= 0 || local >= 1 || sRain <= 0) {
        rainAttr.setXYZ(i, 0, -9999, 0);
        continue;
      }
      const u = local;
      const iu = 1 - u;
      const swing = Math.sin(u * Math.PI); // 中段横向散开,两端收束
      rainAttr.setXYZ(
        i,
        iu * iu * rainP0.x + 2 * iu * u * rainP1.x + u * u * rainP2.x + rainJitter[i * 3] * swing,
        iu * iu * rainP0.y + 2 * iu * u * rainP1.y + u * u * rainP2.y + rainJitter[i * 3 + 1] * swing,
        iu * iu * rainP0.z + 2 * iu * u * rainP1.z + u * u * rainP2.z + rainJitter[i * 3 + 2] * swing,
      );
    }
    rainAttr.needsUpdate = true;

    // 齿轮:常驻怠速,工具执行阶段加速咬合,尾声回到怠速
    const gearActivity = sGear * (1 - 0.65 * sCalm);
    gears.forEach((gear, i) => {
      const spec = gearSpecs[i];
      const speed = (0.18 + gearActivity * 2.4) * spec.dir * (gearSpecs[0].teeth / spec.teeth);
      gearAngles[i] += speed * dt;
      gear.rotation.z = gearAngles[i];
    });
    gearMat.emissiveIntensity = 0.3 + gearActivity * 0.9;

    // 命令执行粒子:0.64–0.74 之间飞出再飞回
    const sCmd = seg(p, 0.64, 0.74);
    if (sCmd > 0 && sCmd < 1) {
      command.visible = true;
      const out = Math.sin(sCmd * Math.PI);
      command.position.copy(commandFrom).addScaledVector(commandDir, out * 6.5);
      command.scale.setScalar(0.6 + out * 0.6);
    } else {
      command.visible = false;
    }

    // 迷你循环:环绕粒子沿光环快跑一整圈,表示 turn 继续
    if (sMini > 0 && sMini < 1) {
      orbiter.visible = true;
      const angle = sMini * Math.PI * 2 - Math.PI / 2;
      orbiter.position.set(Math.cos(angle) * RING_RADIUS, Math.sin(angle) * RING_RADIUS, 0);
      (orbiter.children[1] as THREE.Sprite).material.opacity = 0.9 * Math.sin(sMini * Math.PI);
    } else {
      orbiter.visible = false;
    }

    // 导管脉冲:常驻慢跑,工具阶段变快变亮
    conduitPulses.forEach((sprite, i) => {
      const u = (t * (0.12 + gearActivity * 0.35) + i * 0.5) % 1;
      sprite.position.copy(gearConduitCurve.getPointAt(u));
      (sprite.material as THREE.SpriteMaterial).opacity = 0.25 + gearActivity * 0.55;
    });

    // 运镜:缓慢环绕 + 轻微推近,视线始终落在核心与云团之间
    const angle = THREE.MathUtils.lerp(-0.55, 0.65, p);
    const radius = 45 - Math.sin(p * Math.PI) * 7;
    camera.position.set(
      Math.sin(angle) * radius,
      THREE.MathUtils.lerp(-2, 7, p) + Math.sin(t * 0.3) * 0.4,
      Math.cos(angle) * radius,
    );
    camera.lookAt(1.5, 4, -1);
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (p) => {
      progress = p;
    },
    dispose: () => {
      // 释放本场景自建的几何体与材质(共享的 Sprite 内部几何体除外)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose();
        }
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
          const material = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      stage.dispose();
    },
  };
};

export default createHeartScene;
