import { defineConfig } from 'astro/config';

// 部署在 chendahuang.com/dsh 子路径下(Workers Static Assets 按 URL 路径直读 dist),
// 所以页面与静态资源全部带 /dsh 前缀输出。
export default defineConfig({
  site: 'https://chendahuang.com',
  base: '/dsh',
  trailingSlash: 'ignore',
  build: {
    assets: 'assets',
  },
});
