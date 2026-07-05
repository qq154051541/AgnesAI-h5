# 绘境 DrawScape

> 一言绘境，万象由生

基于 Agnes AI API 的移动端 H5 创意生成工具，支持 AI 图片生成、视频生成及图转提示词三大功能。

## 功能特性

### 🖼️ 图片生成

- 支持多模型切换（Agnes Image 2.0 Flash / 2.1 Flash）
- 多种尺寸选择，涵盖竖屏、横屏、方形、4K 等
- 批量生成（1/3/6/9 张）
- 图生图：支持添加多张参考图
- 生成结果支持单张下载、批量下载、复制地址
- 历史记录管理，支持分页、查看详情、复用提示词

### 🎬 视频生成

- 多种尺寸选择（横屏 / 竖屏）
- 时长选择（约 5s / 10s / 15s）
- 图生视频：支持添加参考图
- 关键帧模式：多张参考图作为关键帧，AI 生成帧间过渡动画
- 实时轮询任务进度，支持终止生成
- 历史记录管理

### 🔍 图转提示词

- 上传图片或输入图片 URL，AI 自动生成适配 Agnes Image 的提示词
- 支持中文 / English 两种语言输出
- 一键将生成的提示词填入图片生成模块
- 历史记录管理

## 技术栈

| 技术 | 说明 |
|------|------|
| React 18 | 前端框架 |
| TypeScript | 类型安全 |
| Vite 5 | 构建工具 |
| animal-island-ui | UI 组件库 |

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

1. 前往 [platform.agnes-ai.com](https://platform.agnes-ai.com/) 注册登录
2. 进入 **设置 → API 秘钥 → 创建新的秘钥**
3. 将获取到的 API Key 填入应用首页的输入框中

API Key 会自动保存在浏览器本地存储中，下次访问无需重复输入。

## 项目结构

```
AgnesAI-h5/
├── src/
│   ├── App.tsx                    # 应用主组件（头部、API Key 输入、Tab 切换）
│   ├── main.tsx                   # 应用入口
│   ├── components/
│   │   ├── ImageGenerate.tsx      # 图片生成模块
│   │   ├── VideoGenerate.tsx      # 视频生成模块
│   │   └── Img2Prompt.tsx         # 图转提示词模块
│   ├── config/
│   │   └── api.ts                 # API 配置（接口地址、模型、尺寸、存储 key 等）
│   ├── services/
│   │   └── api.ts                 # API 服务层（图片生成、视频生成、图转提示词、图片上传）
│   ├── types/
│   │   └── index.ts               # TypeScript 类型定义
│   ├── utils/
│   │   └── helpers.ts             # 工具函数（时间格式化、剪贴板、下载、本地存储等）
│   └── styles/
│       └── App.css                # 全局样式（基于 animal-island-ui 设计变量）
├── public/
│   └── logo.webp                  # 应用 Logo
├── vite.config.ts                 # Vite 配置（含图片代理）
├── tsconfig.json                  # TypeScript 配置
└── package.json
```

## API 接口

本项目调用 [Agnes AI API](https://apihub.agnes-ai.com) 提供以下接口：

| 接口 | 路径 | 说明 |
|------|------|------|
| 图片生成 | `POST /v1/images/generations` | 根据提示词生成图片 |
| 视频生成 | `POST /v1/videos` | 创建视频生成任务 |
| 视频查询 | `GET /agnesapi?video_id=xxx` | 轮询视频生成进度 |
| 图转提示词 | `POST /v1/chat/completions` | 多模态对话，根据图片生成提示词 |

## 设计系统

项目样式基于 `animal-island-ui` 框架的设计变量体系，统一使用以下 CSS 变量：

- **主色**：`--animal-primary-color`（#19c8b9 薄荷绿）
- **文字**：`--animal-text-color`（#794f27 暖棕）
- **背景**：`--animal-bg-color`（#f8f8f0 米白）
- **圆角**：`--animal-border-radius-sm` / `--animal-border-radius-base`
- **间距**：`--animal-spacing-xs/sm/md/lg/xl`
- **阴影**：`--animal-shadow-sm/base/lg`

所有自定义样式通过 `--agnes-*` 变量引用框架变量，确保视觉一致性。
