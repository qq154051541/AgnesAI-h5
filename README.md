# 绘境 DrawScape

> 一言绘境，万象由生

基于三大 AI 平台（Agnes AI、SenseNova、智谱 AI）的移动端 H5 创意生成工具，一站式集成 AI 对话、图片生成、视频生成与图转提示词等能力，覆盖图像、视频、对话与智能编码全场景。

## 功能特性

应用首页以卡片入口形式呈现三大创作平台，点击卡片从右侧滑出抽屉面板，各平台独立管理 API Key 与功能 Tab。

### 🎨 Agnes AI 创作工坊

基于 [Agnes AI API](https://apihub.agnes-ai.com)，提供图片与视频生成能力。

#### 🖼️ 图片生成

- 多模型切换：Agnes Image 2.0 Flash / 2.1 Flash
- 多种尺寸：竖屏、横屏、方形、4K 等 10 种规格
- 批量生成：1 / 3 / 6 / 9 张
- 图生图：支持添加多张参考图
- 结果支持单张下载、批量下载、复制地址
- 历史记录管理：分页、查看详情、复用提示词

#### 🎬 视频生成

- 多种尺寸：横屏 / 竖屏 4 种规格
- 时长选择：约 3s / 5s / 10s / 17s
- 图生视频：支持添加参考图
- 关键帧模式：多张参考图作为关键帧，AI 生成帧间过渡动画
- 实时轮询任务进度，支持终止生成
- 历史记录管理

#### 🔍 图转提示词

- 上传图片或输入图片 URL，AI 自动生成适配 Agnes Image 的提示词
- 支持中文 / English 两种语言输出
- 一键将生成的提示词填入图片生成模块
- 历史记录管理

---

### 🧠 SenseNova 实验室

基于 [SenseNova 平台](https://platform.sensenova.cn)，提供多模态对话、信息图生成与图转提示词能力。

#### 🔍 图转提示词

- 使用 SenseNova 6.7 Flash-Lite 多模态视觉模型
- 上传图片，AI 自动生成适配 U1 Fast 的结构化提示词
- 支持中文 / English 两种语言输出
- 一键将生成的提示词填入 U1 生图模块
- 历史记录管理

#### 🧩 DeepSeek V4

- 使用 DeepSeek V4 Flash 对话模型，支持 1M 上下文
- SSE 流式输出，实时展示推理过程（思考模式）
- 推理力度可调：关闭 / 低 / 中 / 高
- 自定义系统提示词
- 会话管理：新建会话、连续对话自动归并为单条历史记录
- 历史记录管理，支持查看详情与复用

#### 📊 U1 生图

- 使用 SenseNova U1 Fast 信息图（Infographics）生成加速版
- 2K 分辨率，11 种比例（9:16、16:9、21:9、1:1、3:2、4:3 等）
- 批量生成
- 结果支持下载、复制地址
- 历史记录管理

---

### 🚀 智谱 AI 智能体

基于 [智谱 AI（BigModel）平台](https://open.bigmodel.cn)，提供 Agentic Coding 对话、文生图、视频生成与图转提示词能力。

#### 🚀 GLM-4.7-Flash

- 30B 级 SOTA 模型，面向 Agentic Coding 场景强化编码与工具协同
- 200K 上下文，128K 最大输出
- SSE 流式输出，实时展示深度思考过程
- 自定义系统提示词
- 会话管理：新建会话、连续对话自动归并为单条历史记录
- 历史记录管理，支持查看详情与复用

#### 🎬 cogvideox-flash

- 异步视频生成，支持文生视频、图生视频、首尾帧生视频
- 最高支持 4K 分辨率，可选 30 / 60 FPS
- 时长选择：约 5s / 10s
- 输出模式：速度优先 / 质量优先
- 支持 AI 音效生成
- 实时轮询任务进度，支持终止生成
- 历史记录管理

#### 🎨 CogView-3-Flash

- 免费文生图模型，根据文本描述生成高质量图像
- 多种分辨率：1:1、9:16、16:9、3:4、4:3、2:1、1:2
- 批量生成（内置滑动窗口限流与指数退避重试，避免 429）
- 结果支持下载、复制地址
- 历史记录管理

#### 🔍 图转提示词

- 使用 GLM-4.6V-Flash 多模态视觉模型
- 上传图片，AI 自动生成适配 CogView-3-Flash 的结构化提示词
- 支持中文 / English 两种语言输出
- 一键将生成的提示词填入 CogView 生图模块
- 历史记录管理

## 技术栈

| 技术 | 说明 |
|------|------|
| React 18 | 前端框架（Hooks、forwardRef、useImperativeHandle） |
| TypeScript | 类型安全 |
| Vite 5 | 构建工具（含开发代理） |
| animal-island-ui | UI 组件库（Drawer、Tabs、Card、Input、Notification 等） |
| Fetch + AbortController | 网络请求与可中止控制 |
| SSE 流式解析 | 实时对话流式输出（data: 行解析） |
| localStorage | API Key 与历史记录持久化 |
| createPortal | 弹窗渲染脱离组件层级 |

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或其他包管理器

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

开发服务器默认运行在 `http://localhost:5174`。

### 获取 API Key

三大平台各自独立使用 API Key，在对应抽屉面板中输入后自动保存到浏览器本地存储。

| 平台 | 获取地址 | 路径 |
|------|----------|------|
| Agnes AI | [platform.agnes-ai.com](https://platform.agnes-ai.com/) | 注册登录 → 设置 → API 秘钥 → 创建新的秘钥 |
| SenseNova | [platform.sensenova.cn](https://platform.sensenova.cn/) | 注册登录 → 控制台 → API Keys → 创建密钥（sk- 开头） |
| 智谱 AI | [open.bigmodel.cn](https://open.bigmodel.cn/) | 注册登录 → API Keys → 创建密钥 |

## 项目结构

```
AgnesAI-h5/
├── src/
│   ├── App.tsx                         # 应用主组件（首页卡片、三平台抽屉、API Key 管理）
│   ├── main.tsx                        # 应用入口
│   ├── components/
│   │   ├── ImageGenerate.tsx           # Agnes AI - 图片生成
│   │   ├── VideoGenerate.tsx           # Agnes AI - 视频生成
│   │   ├── Img2Prompt.tsx              # Agnes AI - 图转提示词
│   │   ├── ImagePreview.tsx            # 图片预览组件（通用）
│   │   ├── SenseNovaChat.tsx           # SenseNova - DeepSeek V4 对话
│   │   ├── SenseNovaImage.tsx          # SenseNova - U1 Fast 生图
│   │   ├── SenseNovaImg2Prompt.tsx     # SenseNova - 图转提示词
│   │   ├── ZhipuChat.tsx               # 智谱 - GLM-4.7-Flash 对话
│   │   ├── ZhipuImage.tsx              # 智谱 - CogView-3-Flash 文生图
│   │   ├── ZhipuVideo.tsx              # 智谱 - cogvideox-flash 视频生成
│   │   └── ZhipuImg2Prompt.tsx         # 智谱 - 图转提示词
│   ├── config/
│   │   ├── api.ts                      # Agnes AI 配置（接口、模型、尺寸、存储 key、提示词）
│   │   ├── sensenova.ts                # SenseNova 配置（接口、模型、尺寸、推理力度、存储 key、提示词）
│   │   └── zhipu.ts                    # 智谱 AI 配置（接口、模型、尺寸、思考模式、限流、存储 key、提示词）
│   ├── services/
│   │   ├── api.ts                      # Agnes AI 服务层（图片/视频生成、图转提示词、图片上传）
│   │   ├── sensenova.ts                # SenseNova 服务层（对话流式、U1 生图、图转提示词、图片上传）
│   │   └── zhipu.ts                    # 智谱 AI 服务层（对话流式、CogView 生图、视频异步任务、图转提示词、图片上传）
│   ├── types/
│   │   └── index.ts                    # TypeScript 类型定义
│   ├── utils/
│   │   └── helpers.ts                  # 工具函数（时间格式化、剪贴板、下载、本地存储等）
│   └── styles/
│       └── App.css                     # 全局样式（基于 animal-island-ui 设计变量）
├── public/
│   └── logo.webp                       # 应用 Logo
├── nginx.conf                          # Nginx 部署配置（含三平台 API 代理）
├── vite.config.ts                      # Vite 配置（含开发代理）
├── tsconfig.json                       # TypeScript 配置
└── package.json
```

## API 接口

### Agnes AI

接口地址：`https://apihub.agnes-ai.com`

| 接口 | 路径 | 说明 |
|------|------|------|
| 图片生成 | `POST /v1/images/generations` | 根据提示词生成图片 |
| 视频生成 | `POST /v1/videos` | 创建视频生成任务 |
| 视频查询 | `GET /agnesapi?video_id=xxx` | 轮询视频生成进度 |
| 图转提示词 | `POST /v1/chat/completions` | 多模态对话，根据图片生成提示词 |

### SenseNova

接口地址：`https://token.sensenova.cn/v1`（通过 `/sensenova-api` 代理）

| 接口 | 路径 | 说明 |
|------|------|------|
| 对话补全 | `POST /chat/completions` | DeepSeek V4 对话（支持 SSE 流式） |
| 图像生成 | `POST /images/generations` | U1 Fast 信息图生成 |
| 图转提示词 | `POST /chat/completions` | Flash-Lite 多模态视觉理解 |

### 智谱 AI

接口地址：`https://open.bigmodel.cn/api/paas/v4`（通过 `/zhipu-api` 代理）

| 接口 | 路径 | 说明 |
|------|------|------|
| 对话补全 | `POST /chat/completions` | GLM-4.7-Flash 对话（支持 SSE 流式） |
| 图片生成 | `POST /images/generations` | CogView-3-Flash 文生图 |
| 视频生成 | `POST /videos/generations` | cogvideox-flash 异步视频生成 |
| 任务查询 | `GET /async-result/{id}` | 查询异步任务结果 |
| 图转提示词 | `POST /chat/completions` | GLM-4.6V-Flash 多模态视觉理解 |

## 代理配置

由于浏览器跨域限制，SenseNova 与智谱 AI 的接口需通过代理转发。开发环境在 `vite.config.ts` 中配置，生产环境在 `nginx.conf` 中配置相同的代理规则。

| 代理路径 | 目标地址 | 用途 |
|----------|----------|------|
| `/sensenova-api` | `https://token.sensenova.cn` | SenseNova API |
| `/zhipu-api` | `https://open.bigmodel.cn` | 智谱 AI API |
| `/image-proxy` | `https://platform-outputs.agnes-ai.space` | Agnes AI 图片下载（绕过跨域） |

### 生产部署（Nginx）

项目已附带 `nginx.conf`，关键配置：

```nginx
# SenseNova API 代理
location /sensenova-api/ {
    proxy_pass https://token.sensenova.cn/;
    proxy_set_header Host token.sensenova.cn;
    proxy_set_header Authorization $http_authorization;
    proxy_ssl_server_name on;
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
}

# 智谱 AI API 代理
location /zhipu-api/ {
    proxy_pass https://open.bigmodel.cn/;
    proxy_set_header Host open.bigmodel.cn;
    proxy_set_header Authorization $http_authorization;
    proxy_ssl_server_name on;
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
}

# SPA 回退
location / {
    try_files $uri $uri/ /index.html;
}
```

## 设计系统

项目样式基于 `animal-island-ui` 框架的设计变量体系，统一使用以下 CSS 变量：

- **主色**：`--animal-primary-color`（#19c8b9 薄荷绿）
- **文字**：`--animal-text-color`（#794f27 暖棕）
- **背景**：`--animal-bg-color`（#f8f8f0 米白）
- **圆角**：`--animal-border-radius-sm` / `--animal-border-radius-base`
- **间距**：`--animal-spacing-xs/sm/md/lg/xl`
- **阴影**：`--animal-shadow-sm/base/lg`

所有自定义样式通过 `--agnes-*` 变量引用框架变量，确保视觉一致性。
