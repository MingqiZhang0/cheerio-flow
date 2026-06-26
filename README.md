# Cheerio Flow

Cheerio Flow 是一个本地桌面的科研流程规划软件第一版原型，使用 Tauri + React + TypeScript 实现。

## 当前环境检查

本次开发环境中已按要求运行以下命令：

- `node -v`：不可用，`node` 不在 PATH。
- `npm -v`：不可用，`npm` 不在 PATH。
- `pnpm -v`：可用，版本 `11.7.0`。
- `cargo --version`：不可用，`cargo` 不在 PATH。
- `rustc --version`：不可用，`rustc` 不在 PATH。
- Codex 自带 Node 可用：`v24.14.0`。

因此，本仓库已完成完整代码与前端构建检查；Tauri 桌面构建需要在安装 Rust 工具链后运行。当前环境尝试 `pnpm desktop:build` 的真实失败原因是：Tauri CLI 无法运行 `cargo metadata`，因为 `cargo` program not found。

## 安装依赖

推荐本机安装：

- Node.js LTS
- pnpm
- Rust stable toolchain
- Windows 上还需要 Tauri 要求的 Microsoft C++ Build Tools / WebView2 运行环境

安装依赖：

```bash
pnpm install
```

如果只安装了 npm，也可以改用：

```bash
npm install
```

## 运行开发版

前端浏览器开发版：

```bash
pnpm dev
```

桌面开发版：

```bash
pnpm desktop:dev
```

桌面开发版会启动 Tauri，因此必须能运行 `cargo` 和 `rustc`。

## 打包桌面软件

```bash
pnpm desktop:build
```

打包同样依赖完整 Rust/Tauri 环境。

## 本地存档

Tauri 模式下，数据保存在应用数据目录中的 `CheerioFlowData`：

```text
CheerioFlowData/
  projects/
    project-xxx.json
  groups.json
  app-state.json
```

浏览器/Vite 模式下，为了方便前端开发，会使用 `localStorage` 作为临时回退存档。

## 主要文件

- `src/App.tsx`：主界面、项目栏、分组、画布、模块、箭头、属性栏。
- `src/types.ts`：项目、分组、模块、箭头和界面状态类型。
- `src/storage.ts`：Tauri 命令调用和浏览器回退存档。
- `src/utils.ts`：ID、时间、默认项目/分组/模块/箭头创建工具。
- `src/styles.css`：整体布局、项目栏、画布节点、属性栏样式。
- `src-tauri/src/lib.rs`：本地应用数据目录读写、项目扫描、分组和界面状态保存。
- `src-tauri/tauri.conf.json`：Tauri 应用配置。

## 第一版完成范围

已实现：

- 首次启动自动创建空项目。
- 左侧项目栏显示、创建、删除、切换项目。
- 项目标题、类别、置顶、分组可编辑，创建时间只读。
- 创建、编辑、删除分组，分组可置顶，项目可加入/移出分组。
- 项目栏可隐藏和重新显示。
- 中间画布可创建长方形、三角形、菱形、圆形、椭圆形模块。
- 模块可拖动，拖动时连接箭头跟随。
- 模块可编辑类型、形状、内容、LaTeX 渲染开关、备注和启用状态。
- 模块启用 LaTeX 时使用 KaTeX 渲染内容。
- 模块上下中心有连接点。
- 可通过连接点创建箭头，未连接到目标时 React Flow 会取消临时连线。
- 箭头可编辑类型、启用状态和备注。
- 属性栏可关闭、重新打开，并显示模块/箭头关联信息。
- 箭头方向由 source/target 决定，属性栏显示方向并支持反转方向。
- 本地保存项目、分组、模块、箭头和界面状态。

简化实现：

- 图像类型模块目前是模块类型之一，第一版尚未提供图片文件导入和缩略图资产管理。
- 组的折叠状态只保存在当前运行时，未写入 `app-state.json`。
- 模块创建时的半透明跟随预览由前端浮层实现，不作为真实画布节点保存。

尚未实现：

- CSV 读取和数据表预览。
- 图像节点的图片导入、复制、归档和画布显示。
- 组会展示模式。

## 后续扩展入口

- CSV 读取：从 `src/types.ts` 增加数据模块字段，从 `src/App.tsx` 的属性栏和模块渲染开始接入；Tauri 文件读取命令放在 `src-tauri/src/lib.rs`。
- 图像节点：先扩展 `FlowModuleData`，在 `src-tauri/src/lib.rs` 增加图片复制到应用数据目录的命令，再修改 `ModuleNode` 渲染缩略图。
- 组会展示模式：从 `src/App.tsx` 新增只读展示状态，隐藏左右栏和编辑控件，并按模块/箭头关系提供画布漫游或聚焦视图。
