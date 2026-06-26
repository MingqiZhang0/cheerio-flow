import { invoke } from "@tauri-apps/api/core";
import type { AppState, PersistedData, Project, ProjectGroup } from "./types";
import { DEFAULT_APP_STATE, createEmptyProject, normalizeGroups } from "./utils";

const LOCAL_STORAGE_KEY = "cheerio-flow-browser-fallback";

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function readBrowserFallback(): PersistedData {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw) as PersistedData;
      if (Array.isArray(data.projects) && data.projects.length > 0) return data;
    } catch {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  const firstProject = createEmptyProject();
  const data: PersistedData = {
    dataDir: "browser-localStorage",
    projects: [firstProject],
    groups: [],
    appState: {
      ...DEFAULT_APP_STATE,
      currentProjectId: firstProject.id,
    },
  };
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  return data;
}

function writeBrowserFallback(patch: Partial<PersistedData>) {
  const current = readBrowserFallback();
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}

export async function loadDatabase(): Promise<PersistedData> {
  if (isTauriRuntime()) {
    const data = await invoke<PersistedData>("load_database");
    return {
      ...data,
      groups: normalizeGroups(data.groups, data.projects),
    };
  }
  return readBrowserFallback();
}

export async function persistProject(project: Project) {
  if (isTauriRuntime()) {
    await invoke("save_project", { project });
    return;
  }
  const current = readBrowserFallback();
  const projects = current.projects.some((item) => item.id === project.id)
    ? current.projects.map((item) => (item.id === project.id ? project : item))
    : [...current.projects, project];
  writeBrowserFallback({ projects });
}

export async function removeProject(projectId: string) {
  if (isTauriRuntime()) {
    await invoke("delete_project", { projectId });
    return;
  }
  const current = readBrowserFallback();
  writeBrowserFallback({
    projects: current.projects.filter((project) => project.id !== projectId),
    groups: current.groups.map((group) => ({
      ...group,
      projectIds: group.projectIds.filter((id) => id !== projectId),
    })),
  });
}

export async function persistGroups(groups: ProjectGroup[]) {
  if (isTauriRuntime()) {
    await invoke("save_groups", { groups });
    return;
  }
  writeBrowserFallback({ groups });
}

export async function persistAppState(appState: AppState) {
  if (isTauriRuntime()) {
    await invoke("save_app_state", { appState });
    return;
  }
  writeBrowserFallback({ appState });
}
