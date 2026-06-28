import type { XYPosition } from "@xyflow/react";

export const PROJECT_CATEGORIES = ["research", "note"] as const;
export const MODULE_TYPES = ["formula", "derivation", "code", "data", "image", "conclusion", "error", "open-question"] as const;
export const MODULE_SHAPES = ["rectangle", "triangle", "diamond", "circle", "ellipse"] as const;
export const ARROW_TYPES = ["derivation", "output", "proof", "visualization", "support", "conjecture", "fix"] as const;
export const ELEMENT_STATUSES = ["enabled", "disabled"] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type ModuleType = (typeof MODULE_TYPES)[number];
export type ModuleShape = (typeof MODULE_SHAPES)[number];
export type ArrowType = (typeof ARROW_TYPES)[number];
export type ElementStatus = (typeof ELEMENT_STATUSES)[number];

export interface FlowModuleData extends Record<string, unknown> {
  shortId: string;
  moduleType: ModuleType;
  shape: ModuleShape;
  content: string;
  latexEnabled: boolean;
  note: string;
  status: ElementStatus;
  enabled: boolean;
  customWidth?: number;
  customHeight?: number;
}

export interface FlowModule {
  id: string;
  position: XYPosition;
  data: FlowModuleData;
}

export interface FlowArrowData extends Record<string, unknown> {
  arrowType: ArrowType;
  status: ElementStatus;
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
  dataVersion: number;
  currentProjectId: string | null;
  projectSidebarCollapsed: boolean;
  propertiesSidebarCollapsed: boolean;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
}

export interface StorageReport {
  storageRoot: string;
  dataDir: string;
  bootstrapPath: string;
  projectsPath: string;
  groupsPath: string;
  appStatePath: string;
  projectCount: number;
  moduleCount: number;
  arrowCount: number;
}

export interface BackupReport {
  backupId: string;
  createdAt: string;
  sourceDataDir: string;
  backupDir: string;
  manifestPath: string;
  projectFileCount: number;
  copiedFileCount: number;
  totalBytes: number;
  warnings: string[];
}

export interface PersistedData {
  dataDir: string;
  storageRoot: string;
  bootstrapPath: string;
  projects: Project[];
  groups: ProjectGroup[];
  appState: AppState;
  report?: StorageReport;
}

export type SelectedElement =
  | { kind: "module"; id: string }
  | { kind: "arrow"; id: string }
  | null;
