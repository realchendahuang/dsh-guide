import * as THREE from 'three';

/** 径向渐变发光纹理:全 procedural,用 Sprite 柔光替代 Bloom 后期,移动端更稳。 */
export function makeGlowTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 确定性伪随机。帧循环里不能用 Math.random:ScrollTrigger scrub 会来回倒退,
 * 所有视觉效果必须是 progress 的纯函数,否则回滚时粒子位置会穿帮。
 */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** smoothstep(0, 1, v)。 */
export function smooth(v: number): number {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
}

/** 诞生/入场用的回弹缓出。 */
export function easeOutBack(v: number): number {
  const x = clamp01(v);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}
