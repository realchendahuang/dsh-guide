// 静态站全部内容由 ASSETS 直接服务;这里只把裸 /dsh 归一到带斜杠的形式,
// 与 playbook 系列子路径站的做法保持一致。
const BASE_PATH = '/dsh';

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === BASE_PATH) {
      url.pathname = `${BASE_PATH}/`;
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
