// 每幕的 3D 场景契约:框架负责懒加载、离屏暂停与滚动驱动,
// 场景自己只管渲染和响应进度。

/** 场景实例句柄。 */
export interface SceneHandle {
  /** 进入视口后开始渲染循环。 */
  start(): void;
  /** 离开视口后暂停渲染循环(省电、省 GPU)。 */
  stop(): void;
  /** 滚动进度 0..1,由 ScrollTrigger scrub 驱动,用于运镜与阶段切换。 */
  setProgress(progress: number): void;
  /** 释放 WebGL 资源。 */
  dispose(): void;
}

/** 场景工厂:传入画布,返回句柄(可异步,例如等待纹理)。 */
export type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle | Promise<SceneHandle>;
