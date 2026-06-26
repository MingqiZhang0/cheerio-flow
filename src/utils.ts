import type {
  AppState,
  ArrowType,
  FlowArrow,
  FlowModule,
  ModuleShape,
  ModuleType,
  Project,
  ProjectCategory,
  ProjectGroup,
} from "./types";

export const DEFAULT_APP_STATE: AppState = {
  currentProjectId: null,
  projectSidebarCollapsed: false,
  propertiesSidebarCollapsed: true,
};

export function createId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

export function formatLocalDateTime(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");
}

export function createEmptyProject(title = "空项目"): Project {
  return {
    id: createId("project"),
    title,
    category: "科研",
    createdAt: formatLocalDateTime(),
    pinned: false,
    groupId: null,
    modules: [],
    arrows: [],
  };
}

export function createEmptyGroup(title = "新分组"): ProjectGroup {
  return {
    id: createId("group"),
    title,
    createdAt: formatLocalDateTime(),
    pinned: false,
    projectIds: [],
  };
}

export function createModule(shape: ModuleShape, x: number, y: number): FlowModule {
  return {
    id: createId("module"),
    position: { x, y },
    data: {
      moduleType: "公式" satisfies ModuleType,
      shape,
      content: shape === "长方形" ? "E = mc^2" : "",
      latexEnabled: true,
      note: "",
      enabled: true,
    },
  };
}

export function createArrow(source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null): FlowArrow {
  return {
    id: createId("arrow"),
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: targetHandle ?? null,
    data: {
      arrowType: "推导" satisfies ArrowType,
      enabled: true,
      note: "",
    },
  };
}

export function normalizeGroups(groups: ProjectGroup[], projects: Project[]) {
  const projectIds = new Set(projects.map((project) => project.id));
  return groups.map((group) => ({
    ...group,
    projectIds: Array.from(new Set(group.projectIds.filter((projectId) => projectIds.has(projectId)))),
  }));
}

export function sortPinnedFirst<T extends { pinned: boolean; createdAt: string; title: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.title.localeCompare(b.title, "zh-Hans-CN");
  });
}

export function applyGroupMembership(projects: Project[], groups: ProjectGroup[]) {
  const membership = new Map<string, string>();
  groups.forEach((group) => {
    group.projectIds.forEach((projectId) => membership.set(projectId, group.id));
  });
  return projects.map((project) => ({
    ...project,
    groupId: membership.get(project.id) ?? null,
  }));
}
