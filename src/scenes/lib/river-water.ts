import * as THREE from 'three';

// 第 4 幕的河流几何:一条从左侧远方(s=0)蜿蜒流向右侧近处(s=1)的曲线,
// 河面贴 y=0。晶体落水、相机运镜都复用同一条曲线,保证「河岸」语义一致。

let cachedGlow: THREE.CanvasTexture | null = null;

/** 径向渐变光斑贴图:Sprite/Points 不给 map 会渲染成实心方块,必须用它做软发光。 */
export function glowTexture(): THREE.CanvasTexture {
  if (cachedGlow) return cachedGlow;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cachedGlow = new THREE.CanvasTexture(c);
  return cachedGlow;
}

/** 河流曲线上 s∈[0,1] 处的中心点。 */
export function riverPoint(s: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const x = THREE.MathUtils.lerp(-170, 125, s);
  const z = THREE.MathUtils.lerp(-95, 10, s) + Math.sin(s * Math.PI * 3) * 11;
  return out.set(x, 0, z);
}

/** 河流曲线在 s 处的切线(指向下游)。 */
export function riverTangent(s: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const a = riverPoint(Math.max(0, s - 0.004), new THREE.Vector3());
  const b = riverPoint(Math.min(1, s + 0.004), new THREE.Vector3());
  return out.subVectors(b, a).normalize();
}

export interface RiverWater {
  group: THREE.Group;
  update(t: number, dt: number): void;
  dispose(): void;
}

const RIVER_VERT = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
void main() {
  vUv = uv;
  vec3 p = position;
  // 轻微起伏让河面不像死平面
  p.y += sin(uv.x * 40.0 + uTime * 2.0) * 0.22;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const RIVER_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
void main() {
  float edge = 1.0 - abs(vUv.y - 0.5) * 2.0; // 0=河岸 1=河心
  float flow = vUv.x * 90.0 - uTime * 1.6;
  // 顺流移动的亮纹,叠一层细波纹
  float streak = pow(0.5 + 0.5 * sin(flow + sin(vUv.y * 12.0 + uTime) * 0.8), 3.0);
  float ripple = 0.5 + 0.5 * sin(vUv.x * 260.0 - uTime * 3.0 + vUv.y * 20.0);
  // 低角度跟拍下河面接近侧视,整体亮度要给足,河才能成为画面主角
  float a = pow(edge, 1.6) * (0.34 + 0.60 * streak + 0.10 * ripple);
  vec3 col = uColor * (0.9 + streak * 1.2) + vec3(1.0) * pow(edge, 5.0) * 0.55;
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * 发光河面 = 沿曲线铺的带状网格(流动 UV shader)+ 顺流漂移的亮点粒子。
 * 全部 AdditiveBlending,不做后期,移动端也只是一次透明叠加。
 */
export function createRiver(accent: THREE.ColorRepresentation): RiverWater {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  // --- 带状网格:每段两个顶点(左岸/右岸),uv.x 沿流向 ---
  const SEGMENTS = 180;
  const WIDTH = 17;
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
  const indices: number[] = [];
  const c = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    riverPoint(s, c);
    riverTangent(s, tan);
    // 法向取切线的水平垂线
    const nx = -tan.z;
    const nz = tan.x;
    const o = i * 6;
    positions[o] = c.x - (nx * WIDTH) / 2;
    positions[o + 1] = 0;
    positions[o + 2] = c.z - (nz * WIDTH) / 2;
    positions[o + 3] = c.x + (nx * WIDTH) / 2;
    positions[o + 4] = 0;
    positions[o + 5] = c.z + (nz * WIDTH) / 2;
    const ou = i * 4;
    uvs[ou] = s;
    uvs[ou + 1] = 0;
    uvs[ou + 2] = s;
    uvs[ou + 3] = 1;
    if (i < SEGMENTS) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  ribbonGeo.setIndex(indices);
  const ribbonMat = new THREE.ShaderMaterial({
    vertexShader: RIVER_VERT,
    fragmentShader: RIVER_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(accent) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(ribbonGeo, ribbonMat);
  group.add(new THREE.Mesh(ribbonGeo, ribbonMat));

  // --- 顺流粒子:各自携带 s 位置,随时间向下游推进并回绕 ---
  const COUNT = 1500;
  const flowS = new Float32Array(COUNT);
  const flowLat = new Float32Array(COUNT);
  const flowSpeed = new Float32Array(COUNT);
  const flowPos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    flowS[i] = Math.random();
    flowLat[i] = (Math.random() - 0.5) * WIDTH * 0.85;
    flowSpeed[i] = 0.02 + Math.random() * 0.025;
  }
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
  const flowMat = new THREE.PointsMaterial({
    map: glowTexture(), // 无贴图的点会渲染成小方块
    color: accent,
    size: 1.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(flowGeo, flowMat);
  group.add(new THREE.Points(flowGeo, flowMat));

  const nrm = new THREE.Vector3();
  const update = (t: number, dt: number): void => {
    ribbonMat.uniforms.uTime.value = t;
    for (let i = 0; i < COUNT; i++) {
      flowS[i] = (flowS[i] + dt * flowSpeed[i]) % 1;
      riverPoint(flowS[i], c);
      riverTangent(flowS[i], tan);
      nrm.set(-tan.z, 0, tan.x);
      const o = i * 3;
      flowPos[o] = c.x + nrm.x * flowLat[i];
      flowPos[o + 1] = 0.55 + Math.sin(t * 2 + i * 1.7) * 0.2;
      flowPos[o + 2] = c.z + nrm.z * flowLat[i];
    }
    flowGeo.attributes.position.needsUpdate = true;
  };

  return {
    group,
    update,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
