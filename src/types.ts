import type { XYPosition } from "@xyflow/react";

export const PROJECT_CATEGORIES = ["科研", "笔记"] as const;
export const MODULE_TYPES = ["公式", "推导", "代码", "数据", "图像", "结论", "错误", "待解决问题"] as const;
export const MODULE_SHAPES = ["长方形", "三角形", "菱形", "圆形", "椭圆形"] as const;
export const ARROW_TYPES = ["推导", "输出", "证明", "可视化", "支持", "猜测", "修复"] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type ModuleType = (typeof MODULE_TYPES)[number];
export type ModuleShape = (typeof MODULE_SHAPES)[number];
export type ArrowType = (typeof ARROW_TYPES)[number];

export interface FlowModuleData extends Record<string, unknown> {
  moduleType: ModuleType;
  shape: ModuleShape;
  content: string;
  latexEnabled: boolean;
  note: string;
  enabled: boolean;
}

export interface FlowModule {
  id: string;
  position: XYPosition;
  data: FlowModuleData;
}

export interface FlowArrowData extends Record<string, unknown> {
  arrowType: ArrowType;
  enabled: boolean;
  note: string;
}

export interface FlowArrow {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data: FlowArrowData;
}

export interface Project {
  id: string;
  title: string;
  category: ProjectCategory;
  createdAt: string;
  pinned: boolean;
  groupId?: string | null;
  modules: FlowModule[];
  arrows: FlowArrow[];
}

export interface ProjectGroup {
  id: string;
  title: string;
  createdAt: string;
  pinned: boolean;
  projectIds: string[];
}

export interface AppState {
  currentProjectId: string | null;
  projectSidebarCollapsed: boolean;
  propertiesSidebarCollapsed: boolean;
}

export interface PersistedData {
  dataDir: string;
  projects: Project[];
  groups: ProjectGroup[];
  appState: AppState;
}

export type SelectedElement =
  | { kind: "module"; id: string }
  | { kind: "arrow"; id: string }
  | null;
