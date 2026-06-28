import type {
  AppState,
  ArrowType,
  ElementStatus,
  FlowArrow,
  FlowModule,
  ModuleShape,
  ModuleType,
  Project,
  ProjectCategory,
  ProjectGroup,
} from "./types";
import { ARROW_TYPES, MODULE_SHAPES, MODULE_TYPES, PROJECT_CATEGORIES } from "./types";

export const DEFAULT_APP_STATE: AppState = {
  dataVersion: 1,
  currentProjectId: null,
  projectSidebarCollapsed: false,
  propertiesSidebarCollapsed: true,
  leftSidebarWidth: 320,
  rightSidebarWidth: 340,
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

export function createEmptyProject(title = "Empty Project"): Project {
  return {
    id: createId("project"),
    title,
    category: "research",
    createdAt: formatLocalDateTime(),
    pinned: false,
    groupId: null,
    modules: [],
    arrows: [],
  };
}

export function createEmptyGroup(title = "New Group"): ProjectGroup {
  return {
    id: createId("group"),
    title,
    createdAt: formatLocalDateTime(),
    pinned: false,
    projectIds: [],
  };
}

export function createModule(shape: ModuleShape, x: number, y: number, shortId: string): FlowModule {
  return {
    id: createId("module"),
    position: { x, y },
    data: normalizeModuleVisualSemantics({
      shortId,
      moduleType: "formula",
      shape,
      content: "New Module",
      latexEnabled: true,
      note: "",
      status: "enabled",
      enabled: true,
    }),
  };
}

export function createArrow(
  source: string,
  target: string,
  sourceHandle: string | null = "bottom",
  targetHandle: string | null = "top",
  arrowType: ArrowType = "derivation",
): FlowArrow {
  return {
    id: createId("arrow"),
    source,
    target,
    sourceHandle,
    targetHandle,
    data: {
      arrowType,
      status: "enabled",
      enabled: true,
      note: "",
    },
  };
}

export function getNextModuleShortId(modules: FlowModule[]) {
  const used = new Set(
    modules
      .map((module) => module.data.shortId)
      .filter((shortId): shortId is string => /^M\d+$/i.test(shortId ?? ""))
      .map((shortId) => Number(shortId.slice(1))),
  );

  let next = 1;
  while (used.has(next)) next += 1;
  return `M${next}`;
}

function normalizeStatus(value: unknown, enabled: unknown): ElementStatus {
  if (value === "disabled" || enabled === false) return "disabled";
  return "enabled";
}

function normalizeByAlias<T extends string>(value: unknown, values: readonly T[], aliases: Record<string, T>, fallback: T): T {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    const found = values.find((item) => item.toLowerCase() === lowered);
    if (found) return found;
    if (aliases[value]) return aliases[value];
    if (aliases[lowered]) return aliases[lowered];
  }
  return fallback;
}

export function normalizeModuleVisualSemantics(data: FlowModule["data"]): FlowModule["data"] {
  if (data.moduleType === "error") {
    return { ...data, shape: "triangle" };
  }
  if (data.shape === "triangle") {
    return { ...data, moduleType: "error" };
  }
  return data;
}

export function applyModuleTypeSemantics(data: FlowModule["data"], moduleType: ModuleType): FlowModule["data"] {
  if (moduleType === "error") {
    return { ...data, moduleType, shape: "triangle" };
  }
  return {
    ...data,
    moduleType,
    shape: data.shape === "triangle" ? "rectangle" : data.shape,
  };
}

export function applyModuleShapeSemantics(data: FlowModule["data"], shape: ModuleShape): FlowModule["data"] {
  if (shape === "triangle") {
    return { ...data, shape, moduleType: "error" };
  }
  return {
    ...data,
    shape,
    moduleType: data.moduleType === "error" ? "formula" : data.moduleType,
  };
}

const categoryAliases: Record<string, ProjectCategory> = {
  "\u79d1\u7814": "research",
  "\u7b14\u8bb0": "note",
};

const moduleTypeAliases: Record<string, ModuleType> = {
  "\u516c\u5f0f": "formula",
  "\u63a8\u5bfc": "derivation",
  "\u4ee3\u7801": "code",
  "\u6570\u636e": "data",
  "\u56fe\u50cf": "image",
  "\u7ed3\u8bba": "conclusion",
  "\u9519\u8bef": "error",
  "\u5f85\u89e3\u51b3\u95ee\u9898": "open-question",
};

const shapeAliases: Record<string, ModuleShape> = {
  "\u957f\u65b9\u5f62": "rectangle",
  "\u4e09\u89d2\u5f62": "triangle",
  "\u83f1\u5f62": "diamond",
  "\u5706\u5f62": "circle",
  "\u692d\u5706\u5f62": "ellipse",
};

const arrowTypeAliases: Record<string, ArrowType> = {
  "\u63a8\u5bfc": "derivation",
  "\u8f93\u51fa": "output",
  "\u8bc1\u660e": "proof",
  "\u53ef\u89c6\u5316": "visualization",
  "\u652f\u6301": "support",
  "\u731c\u6d4b": "conjecture",
  "\u4fee\u590d": "fix",
};

export function normalizeProject(project: Project): Project {
  const usedShortIds = new Set<string>();
  const modules = (project.modules ?? []).map((module) => {
    const rawShortId = typeof module.data?.shortId === "string" ? module.data.shortId.toUpperCase() : "";
    const shortId = /^M\d+$/.test(rawShortId) && !usedShortIds.has(rawShortId) ? rawShortId : "";
    const fallbackShortId = shortId || getNextModuleShortId([...usedShortIds].map((id) => ({ data: { shortId: id } }) as FlowModule));
    usedShortIds.add(fallbackShortId);
    const status = normalizeStatus(module.data?.status, module.data?.enabled);

    return {
      ...module,
      position: {
        x: Number.isFinite(module.position?.x) ? module.position.x : 0,
        y: Number.isFinite(module.position?.y) ? module.position.y : 0,
      },
      data: normalizeModuleVisualSemantics({
        ...module.data,
        shortId: fallbackShortId,
        moduleType: normalizeByAlias(module.data?.moduleType, MODULE_TYPES, moduleTypeAliases, "formula"),
        shape: normalizeByAlias(module.data?.shape, MODULE_SHAPES, shapeAliases, "rectangle"),
        content: typeof module.data?.content === "string" ? module.data.content : "New Module",
        latexEnabled: module.data?.latexEnabled !== false,
        note: typeof module.data?.note === "string" ? module.data.note : "",
        status,
        enabled: status === "enabled",
        customWidth: typeof module.data?.customWidth === "number" && module.data.customWidth > 0 ? module.data.customWidth : undefined,
        customHeight: typeof module.data?.customHeight === "number" && module.data.customHeight > 0 ? module.data.customHeight : undefined,
      }),
    };
  });

  const moduleIds = new Set(modules.map((module) => module.id));
  const arrows = (project.arrows ?? [])
    .filter((arrow) => moduleIds.has(arrow.source) && moduleIds.has(arrow.target))
    .map((arrow) => {
      const status = normalizeStatus(arrow.data?.status, arrow.data?.enabled);
      return {
        ...arrow,
        sourceHandle: arrow.sourceHandle ?? "bottom",
        targetHandle: arrow.targetHandle ?? "top",
        data: {
          ...arrow.data,
          arrowType: normalizeByAlias(arrow.data?.arrowType, ARROW_TYPES, arrowTypeAliases, "derivation"),
          status,
          enabled: status === "enabled",
          note: typeof arrow.data?.note === "string" ? arrow.data.note : "",
        },
      };
    });

  return {
    ...project,
    category: normalizeByAlias(project.category, PROJECT_CATEGORIES, categoryAliases, "research"),
    pinned: Boolean(project.pinned),
    groupId: project.groupId ?? null,
    modules,
    arrows,
  };
}

export function normalizeProjects(projects: Project[]) {
  return projects.map(normalizeProject);
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
    groupId: membership.get(project.id) ?? project.groupId ?? null,
  }));
}
