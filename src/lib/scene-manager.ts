import type { SceneHandle } from '../scenes/types';

type Loader = () => Promise<{ default: (canvas: HTMLCanvasElement) => SceneHandle | Promise<SceneHandle> }>;

// 显式注册表而不是模板字符串 import:保证 Vite 按幕切包,
// 每幕的 three.js 场景只在滚到附近时才下载。
const loaders: Record<string, Loader> = {
  intro: () => import('../scenes/intro'),
  universe: () => import('../scenes/universe'),
  assembly: () => import('../scenes/assembly'),
  heart: () => import('../scenes/heart'),
  river: () => import('../scenes/river'),
  forge: () => import('../scenes/forge'),
  fleet: () => import('../scenes/fleet'),
};

/** 挂载一幕:懒加载场景、按可见性启停渲染、把滚动进度喂给场景。 */
export async function mountAct(section: HTMLElement): Promise<void> {
  const name = section.dataset.scene ?? '';
  const canvas = section.querySelector<HTMLCanvasElement>('canvas[data-scene-canvas]');
  const load = loaders[name];
  if (!canvas || !load) return;

  // 用户偏好减动效时直接走 CSS 静态背景,不碰 WebGL。
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    section.classList.add('scene-static');
    return;
  }

  let handle: SceneHandle | null = null;
  let starting = false;
  let queuedProgress = 0;

  const ensureStarted = async (): Promise<void> => {
    if (handle || starting) return;
    starting = true;
    try {
      handle = await (await load()).default(canvas);
    } catch {
      // WebGL 不可用 / GPU 拒绝:降级为静态背景,内容永远可读。
      section.classList.add('scene-static');
      return;
    }
    handle.setProgress(queuedProgress);
    handle.start();
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) void ensureStarted();
        else handle?.stop();
      }
    },
    { rootMargin: '15% 0px' },
  );
  io.observe(section);

  const { gsap } = await import('gsap');
  const { ScrollTrigger } = await import('gsap/ScrollTrigger');
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      queuedProgress = self.progress;
      handle?.setProgress(self.progress);
    },
  });
}

export function mountAll(): void {
  document.querySelectorAll<HTMLElement>('[data-scene]').forEach((section) => {
    void mountAct(section);
  });
}
