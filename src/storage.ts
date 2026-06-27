import { invoke } from "@tauri-apps/api/core";
import type { AppState, PersistedData, Project, ProjectGroup, StorageReport } from "./types";
import { DEFAULT_APP_STATE, createEmptyProject, normalizeGroups, normalizeProjects } from "./utils";

const LOCAL_STORAGE_KEY = "cheerio-flow-browser-fallback";

function isProbablyNotTauriError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return (
    message.includes("__TAURI_INTERNALS__") ||
    message.includes("__TAURI__") ||
    message.includes("not available") ||
    message.includes("is not a function")
  );
}

function createBrowserReport(data: PersistedData): StorageReport {
  return {
    storageRoot: data.storageRoot,
    dataDir: data.dataDir,
    bootstrapPath: "browser-localStorage",
    projectsPath: "browser-localStorage/projects",
    groupsPath: "browser-localStorage/groups",
    appStatePath: "browser-localStorage/app-state",
    projectCount: data.projects.length,
    moduleCount: data.projects.reduce((total, project) => total + project.modules.length, 0),
    arrowCount: data.projects.reduce((total, project) => total + project.arrows.length, 0),
  };
}

function normalizePersistedData(data: PersistedData): PersistedData {
  const projects = normalizeProjects(data.projects);
  const groups = normalizeGroups(data.groups ?? [], projects);
  const normalized = {
    ...data,
    storageRoot: data.storageRoot ?? data.dataDir,
    projects,
    groups,
    appState: { ...DEFAULT_APP_STATE, ...data.appState },
  };
  return {
    ...normalized,
    report: data.report ?? createBrowserReport(normalized),
  };
}

function readBrowserFallback(): PersistedData {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw) as PersistedData;
      if (Array.isArray(data.projects) && data.projects.length > 0) {
        return normalizePersistedData(data);
      }
    } catch (error) {
      console.error("Failed to read browser fallback storage", error);
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  const firstProject = createEmptyProject();
  const data: PersistedData = {
    dataDir: "browser-localStorage/CheerioFlowData",
    storageRoot: "browser-localStorage",
    bootstrapPath: "browser-localStorage/bootstrap",
    projects: [firstProject],
    groups: [],
    appState: {
      ...DEFAULT_APP_STATE,
      currentProjectId: firstProject.id,
    },
  };
  const withReport = { ...data, report: createBrowserReport(data) };
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(withReport));
  return withReport;
}

function writeBrowserFallback(data: PersistedData) {
  const normalized = normalizePersistedData(data);
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
  return createBrowserReport(normalized);
}

function buildPayload(projects: Project[], groups: ProjectGroup[], appState: AppState) {
  return { projects, groups, appState };
}

export async function loadDatabase(): Promise<PersistedData> {
  try {
    const data = await invoke<PersistedData>("load_database");
    return normalizePersistedData(data);
  } catch (reason: unknown) {
    if (isProbablyNotTauriError(reason)) return readBrowserFallback();
    console.error("Failed to load Tauri database", reason);
    throw reason;
  }
}

export async function persistDatabase(projects: Project[], groups: ProjectGroup[], appState: AppState): Promise<StorageReport> {
  try {
    const report = await invoke<StorageReport>("save_database", {
      payload: buildPayload(projects, groups, appState),
    });
    return report;
  } catch (reason: unknown) {
    if (!isProbablyNotTauriError(reason)) {
      console.error("Failed to save Tauri database", reason);
      throw reason;
    }
    const current = readBrowserFallback();
    return writeBrowserFallback({
      ...current,
      projects,
      groups,
      appState,
    });
  }
}

export async function chooseStorageRoot(
  storageRoot: string,
  projects: Project[],
  groups: ProjectGroup[],
  appState: AppState,
): Promise<PersistedData> {
  try {
    const data = await invoke<PersistedData>("set_storage_root", {
      storageRoot,
      payload: buildPayload(projects, groups, appState),
    });
    return normalizePersistedData(data);
  } catch (reason: unknown) {
    if (!isProbablyNotTauriError(reason)) {
      console.error("Failed to set Tauri storage root", reason);
      throw reason;
    }
    const current = readBrowserFallback();
    const data = normalizePersistedData({
      ...current,
      storageRoot: storageRoot.trim() || current.storageRoot,
      dataDir: `${storageRoot.trim() || current.storageRoot}/CheerioFlowData`,
      projects,
      groups,
      appState,
    });
    writeBrowserFallback(data);
    return data;
  }
}

export async function removeProject(projectId: string) {
  try {
    await invoke("delete_project", { projectId });
    return;
  } catch (reason: unknown) {
    if (!isProbablyNotTauriError(reason)) {
      console.error("Failed to delete Tauri project", reason);
      throw reason;
    }
    const current = readBrowserFallback();
    writeBrowserFallback({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      groups: current.groups.map((group) => ({
        ...group,
        projectIds: group.projectIds.filter((id) => id !== projectId),
      })),
    });
  }
}
