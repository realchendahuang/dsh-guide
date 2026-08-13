import * as THREE from 'three';
import type { SceneFactory } from '../types';
import { createStage, starPoints } from '../lib/stage';

// 占位场景工厂:正式场景由后续里程碑替换。滚动驱动相机环绕一个发光基元,
// 保证骨架阶段每一幕都可构建、可滚动、不空白。
export function placeholderScene(accent: string, build: () => THREE.Object3D): SceneFactory {
  return (canvas) => {
    const stage = createStage(canvas);
    const { scene, camera } = stage;
    scene.add(starPoints(500, 220, accent, 0.4));
    const subject = build();
    scene.add(subject);

    let progress = 0;
    const loop = stage.run((t) => {
      subject.rotation.y = t * 0.15 + progress * Math.PI * 1.5;
      subject.rotation.x = progress * 0.6;
      camera.position.set(
        Math.sin(progress * Math.PI) * 18,
        (progress - 0.5) * 14,
        40 - progress * 10,
      );
      camera.lookAt(0, 0, 0);
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
}

export function glowingCore(color: string): THREE.Object3D {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(6, 1),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.8 }),
  );
  const inner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 }),
  );
  group.add(core, inner);
  return group;
}
