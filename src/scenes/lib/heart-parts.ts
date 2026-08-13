import * as THREE from 'three';

// 「主循环之心」的共享零件:发光贴图、菲涅尔外壳、齿轮几何体、心跳波形。
// 全部 procedural,不引入任何外部纹理。

let cachedGlowTexture: THREE.CanvasTexture | null = null;

/** 径向渐变白色光斑贴图(共享一份),配合材质 color 着色,用来代替 Bloom 后期的软发光。 */
export function glowTexture(): THREE.CanvasTexture {
  if (cachedGlowTexture) return cachedGlowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cachedGlowTexture = new THREE.CanvasTexture(canvas);
  return cachedGlowTexture;
}

/** 加法混合的光晕 Sprite,是本站所有「发光体」的基本单元。 */
export function makeGlowSprite(color: THREE.ColorRepresentation, size: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

/**
 * 菲涅尔边缘发光外壳:视角越贴近边缘越亮,模拟玻璃罩 + 内部能量透出,
 * 比 MeshPhysicalMaterial 便宜得多且不受光照配置影响。
 */
export function makeFresnelShell(radius: number, color: THREE.ColorRepresentation): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal;
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
        gl_FragColor = vec4(uColor * f * uIntensity, f);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material);
}

/** 梯形齿的齿轮截面 + 中心轴孔,挤出成实体;齿数决定周长,便于按齿数比配对转速。 */
export function makeGearGeometry(teeth: number, radius: number, toothDepth: number, thickness: number): THREE.ExtrudeGeometry {
  const root = radius - toothDepth;
  const step = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // 每齿 4 个角点:齿根 → 齿顶升沿 → 齿顶降沿 → 齿根,形成梯形齿
    const corners: Array<[number, number]> = [
      [root, a],
      [radius, a + step * 0.16],
      [radius, a + step * 0.44],
      [root, a + step * 0.6],
    ];
    for (const [r, angle] of corners) {
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0 && r === root && angle === a) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

/**
 * 心跳波形(双搏):phase ∈ [0,1),主搏 + 一次较弱的二搏,
 * 用高斯包络拼出「扑-扑通」的泵动感,驱动核心缩放与发光。
 */
export function heartbeat(phase: number): number {
  const d1 = phase - 0.12;
  const d2 = phase - 0.34;
  return Math.exp(-(d1 * d1) / 0.0028) + 0.55 * Math.exp(-(d2 * d2) / 0.006);
}
