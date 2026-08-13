// 插件宇宙的数据源:6 个星团、54 颗插件星。
// 每颗星对应 DeepSeek Harness 的一个真实插件包,duty 是给 hover tooltip 用的一句话职责。

export interface UniverseStar {
  name: string;
  duty: string;
}

export interface UniverseCluster {
  id: string;
  color: string;
  /** 星团中心(世界坐标),星团内星星在其附近散布成紧凑星云。 */
  center: [number, number, number];
  stars: UniverseStar[];
}

export const UNIVERSE_CLUSTERS: UniverseCluster[] = [
  {
    id: 'core',
    color: '#ffd43b',
    center: [0, 2, 0],
    stars: [
      { name: 'agent', duty: '一个 Agent 的完整装配:模型、工具、记忆的合体' },
      { name: 'agent-loop', duty: 'Agent 的心跳:想—做—看结果—再想的循环' },
      { name: 'session', duty: '会话的账本:每条消息、每次工具调用都记录在案' },
      { name: 'tools', duty: '工具注册台:模型伸手能够到的所有能力' },
      { name: 'system-prompt', duty: '系统提示词装配间:给模型立规矩' },
      { name: 'typert-generator', duty: '从 TypeScript 类型生成跨进程调用图谱' },
      { name: 'typert-loader', duty: '把类型图谱装进运行时' },
      { name: 'typert-registry', duty: '运行时的类型图谱登记表' },
      { name: 'boot', duty: '应用启动的总装车间' },
    ],
  },
  {
    id: 'llm',
    color: '#ffa94d',
    center: [-27, 13, -14],
    stars: [
      { name: 'llm', duty: '模型能力的标准插座:换模型不改上层' },
      { name: 'llm-deepseek', duty: 'DeepSeek 模型的供电插头' },
    ],
  },
  {
    id: 'exec',
    color: '#8ce99a',
    center: [30, 9, -10],
    stars: [
      { name: 'shell', duty: 'shell 能力的标准插座' },
      { name: 'shell-local', duty: '本机 bash 的执行引擎' },
      { name: 'shell-pwsh', duty: 'PowerShell 的执行引擎' },
      { name: 'tool-bash', duty: '模型手里的 bash 工具' },
      { name: 'subprocess', duty: '子进程的统一调度台' },
      { name: 'fs', duty: '文件系统能力:读写都有政策把关' },
      { name: 'tool-fs', duty: '模型手里的文件工具' },
      { name: 'lsp', duty: '语言服务器:代码的显微镜' },
      { name: 'terminal', duty: '持久终端会话:命令也有上下文记忆' },
      { name: 'e2b', duty: '云端沙箱试验田' },
      { name: 'web-search', duty: '联网搜索能力' },
      { name: 'web-fetch', duty: '抓取网页内容的能力' },
      { name: 'tool-web', duty: '模型手里的上网工具' },
    ],
  },
  {
    id: 'memory',
    color: '#63e6be',
    center: [-30, -13, 7],
    stars: [
      { name: 'compaction', duty: '上下文瘦身:长对话压缩不丢重点' },
      { name: 'session-persistence', duty: '会话落盘:关掉也能接着聊' },
      { name: 'session-projection', duty: '把会话流水账投影成可读的时间线' },
      { name: 'session-titles', duty: '给每个会话自动起名字' },
      { name: 'session-telemetry', duty: '会话仪表盘:耗时与 token 全记录' },
      { name: 'context', duty: '请求上下文:一次任务里的全局信使' },
      { name: 'identity', duty: '匿名身份:不注册也认得你' },
    ],
  },
  {
    id: 'collab',
    color: '#b197fc',
    center: [27, -12, 11],
    stars: [
      { name: 'subagent', duty: '派生子代理:大任务拆给小弟并行做' },
      { name: 'workflow', duty: '工作流编排:多步骤任务的流水线' },
      { name: 'approval', duty: '危险操作的审批闸口' },
      { name: 'permission', duty: '权限裁判:每个动作先过规则' },
      { name: 'plan', duty: '计划模式:先画图纸再动工' },
      { name: 'todo', duty: '任务清单:进度一目了然' },
      { name: 'ask-user', duty: '反问用户:不确定就开口问' },
      { name: 'commands', duty: '斜杠命令的收发室' },
      { name: 'hooks-claude', duty: 'Claude Code 钩子的翻译官' },
      { name: 'hooks-codex', duty: 'Codex 钩子的翻译官' },
      { name: 'hooks-wire', duty: '钩子协议的电线' },
      { name: 'guard', duty: '循环卫生员:防死循环、防工具超时' },
      { name: 'preset', duty: '按配方组装 Agent:一份 yml 一套班子' },
      { name: 'self-modification', duty: 'Agent 照镜子:查看并挂载自己的插件' },
    ],
  },
  {
    id: 'entry',
    color: '#7cc7ff',
    center: [0, -1, -36],
    stars: [
      { name: 'cli', duty: '命令行大门:用户最常走的入口' },
      { name: 'sdk', duty: '给程序用的遥控器:JSON-RPC 驱动 Agent' },
      { name: 'acp', duty: '编辑器协议:IDE 里的自动化通道' },
      { name: 'api', duty: '远程调用的 BFF 网关' },
      { name: 'bundle', duty: '可安装的补丁层打包' },
      { name: 'skill-registry', duty: '技能登记表:插件式能力上架' },
      { name: 'skill-local', duty: '本地技能的货架' },
      { name: 'settings', duty: '用户设置:口味偏好存在这里' },
      { name: 'credentials', duty: '凭据管家:密钥只引用、不落地' },
    ],
  },
];
