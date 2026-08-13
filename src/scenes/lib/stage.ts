import * as THREE from 'three';

/** 每幕通用的渲染台:renderer/相机/尺寸自适应/帧循环,场景只管往里面放东西。 */
export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** 注册每帧回调(t 为秒),返回渲染循环控制器。 */
  run(tick: (t: number, dt: number) => void): { start(): void; stop(): void };
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 0, 40);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  let running = false;
  const clock = new THREE.Clock();

  const run = (tick: (t: number, dt: number) => void): { start(): void; stop(): void } => {
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.1);
      tick(clock.elapsedTime, dt);
      renderer.render(scene, camera);
    };
    return {
      start() {
        if (running) return;
        running = true;
        clock.getDelta();
        frame();
      },
      stop() {
        running = false;
        cancelAnimationFrame(raf);
      },
    };
  };

  return {
    scene,
    camera,
    renderer,
    run,
    dispose() {
      ro.disconnect();
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}

/** 生成一片随机星点的几何体,供各幕作为背景。 */
export function starPoints(count: number, radius: number, color: THREE.ColorRepresentation, size = 0.6): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.35 + 0.65 * Math.random()));
    positions.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}
