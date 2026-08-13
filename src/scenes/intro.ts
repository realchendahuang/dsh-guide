import * as THREE from 'three';
import type { SceneFactory } from './types';
import { createStage, starPoints } from './lib/stage';

// 序章:星海深处,一颗发光的消息粒子随着滚动启程,飞向宇宙深处。

/** Sprite 没有贴图时会渲染成实心方块,所以光晕用程序生成的径向渐变。 */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(160,190,255,0.55)');
  g.addColorStop(1, 'rgba(160,190,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const createIntroScene: SceneFactory = (canvas) => {
  const stage = createStage(canvas);
  const { scene, camera } = stage;

  scene.add(starPoints(900, 260, '#8fb4ff', 0.55));
  scene.add(starPoints(300, 160, '#b78cff', 0.4));

  // 消息粒子:一个加光晕的亮点,滚动时沿 Z 轴远去。
  const message = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 24),
    new THREE.MeshBasicMaterial({ color: '#cfe3ff' }),
  );
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: '#6ea8ff',
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(9);
  message.add(halo);
  message.position.set(0, -2, 20);
  scene.add(message);

  // 粒子身后拖一条淡淡的光轨。
  const trailGeo = new THREE.BufferGeometry();
  const TRAIL = 60;
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: '#6ea8ff', transparent: true, opacity: 0.35 }),
  );
  scene.add(trail);

  let progress = 0;
  const loop = stage.run((t) => {
    // 粒子沿一条轻微摆动的路径向深处飞,进度 1 时没入星海。
    const z = THREE.MathUtils.lerp(20, -180, progress);
    const sway = Math.sin(t * 1.2) * (1 - progress) * 1.5;
    message.position.set(sway, -2 + progress * 6, z);

    const pos = trailGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = TRAIL - 1; i > 0; i--) {
      pos.setXYZ(i, pos.getX(i - 1), pos.getY(i - 1), pos.getZ(i - 1));
    }
    pos.setXYZ(0, message.position.x, message.position.y, message.position.z + 1.5);
    pos.needsUpdate = true;

    halo.material.opacity = 0.3 + Math.sin(t * 3) * 0.08;
    camera.position.z = 40 - progress * 6;
    camera.lookAt(0, 0, -40);
  });

  return {
    start: loop.start,
    stop: loop.stop,
    setProgress: (p) => {
      progress = p;
    },
    dispose: stage.dispose,
  };
};

export default createIntroScene;
