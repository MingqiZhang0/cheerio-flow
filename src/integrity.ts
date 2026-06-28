import type { AppState, Project, ProjectGroup } from "./types";

export type IntegritySeverity = "info" | "warning" | "error";

export type IntegrityIssueCode =
  | "invalid_current_project"
  | "duplicate_project_id"
  | "duplicate_group_id"
  | "group_references_missing_project"
  | "project_references_missing_group"
  | "membership_mismatch"
  | "invalid_data_version"
  | "invalid_group_id"
  | "invalid_group_title"
  | "invalid_group_project_ids";

export interface LightweightIntegrityIssue {
  code: IntegrityIssueCode;
  severity: IntegritySeverity;
  message: string;
  projectId?: string;
  projectTitle?: string;
  groupId?: string;
  groupTitle?: string;
  groupIndex?: number;
  expectedGroupId?: string | null;
  actualGroupId?: string | null;
}

export interface LightweightIntegrityReport {
  dataVersion: unknown;
  projectCount: number;
  groupCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  ok: boolean;
  issues: LightweightIntegrityIssue[];
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readProjectIds(value: unknown) {
  return Array.isArray(value) ? value.filter((projectId): projectId is string => typeof projectId === "string") : [];
}

function readGroupField(group: Partial<ProjectGroup> | null | undefined, key: keyof ProjectGroup) {
  return group && typeof group === "object" ? group[key] : undefined;
}

function addDuplicateIssues<T>(
  items: T[],
  getId: (item: T) => string,
  getTitle: (item: T) => string,
  code: "duplicate_project_id" | "duplicate_group_id",
  message: string,
  issues: LightweightIntegrityIssue[],
) {
  const seen = new Set<string>();
  const reported = new Set<string>();
  items.forEach((item) => {
    const id = getId(item);
    if (!id) return;
    if (!seen.has(id)) {
      seen.add(id);
      return;
    }
    if (reported.has(id)) return;
    reported.add(id);
    const title = getTitle(item);
    issues.push({
      code,
      severity: "error",
      message,
      ...(code === "duplicate_project_id" ? { projectId: id, projectTitle: title } : { groupId: id, groupTitle: title }),
    });
  });
}

export function scanLightweightIntegrity(projects: Project[], groups: ProjectGroup[], appState: AppState): LightweightIntegrityReport {
  const issues: LightweightIntegrityIssue[] = [];
  const scannedGroups: Array<Partial<ProjectGroup> | null | undefined> = Array.isArray(groups) ? groups : [];
  const dataVersion = (appState as Partial<AppState> | null | undefined)?.dataVersion;
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const groupById = new Map<string, Partial<ProjectGroup> | null | undefined>();
  scannedGroups.forEach((group) => {
    const groupId = readString(readGroupField(group, "id"));
    if (groupId) groupById.set(groupId, group);
  });

  if (appState?.currentProjectId && !projectById.has(appState.currentProjectId)) {
    issues.push({
      code: "invalid_current_project",
      severity: "warning",
      message: "Current project id does not match any loaded project.",
      projectId: appState.currentProjectId,
    });
  }

  addDuplicateIssues(projects, (project) => project.id, (project) => project.title, "duplicate_project_id", "Duplicate project id found.", issues);
  addDuplicateIssues(
    scannedGroups,
    (group) => readString(readGroupField(group, "id")),
    (group) => readString(readGroupField(group, "title")),
    "duplicate_group_id",
    "Duplicate group id found.",
    issues,
  );

  scannedGroups.forEach((group, groupIndex) => {
    const rawGroupId = readGroupField(group, "id");
    const rawGroupTitle = readGroupField(group, "title");
    const rawProjectIds = readGroupField(group, "projectIds");
    const groupId = readString(rawGroupId);
    const groupTitle = readString(rawGroupTitle);

    if (typeof rawGroupId !== "string" || rawGroupId.trim() === "") {
      issues.push({
        code: "invalid_group_id",
        severity: "warning",
        message: "Group has a missing or invalid id.",
        groupIndex,
      });
    }

    if (typeof rawGroupTitle !== "string") {
      issues.push({
        code: "invalid_group_title",
        severity: "warning",
        message: "Group has a missing or invalid title.",
        groupId,
        groupIndex,
      });
    }

    if (!Array.isArray(rawProjectIds) || rawProjectIds.some((projectId) => typeof projectId !== "string")) {
      issues.push({
        code: "invalid_group_project_ids",
        severity: "warning",
        message: "Group projectIds should be an array of project id strings.",
        groupId,
        groupTitle,
        groupIndex,
      });
    }

    readProjectIds(rawProjectIds).forEach((projectId) => {
      const project = projectById.get(projectId);
      if (!project) {
        issues.push({
          code: "group_references_missing_project",
          severity: "warning",
          message: "Group references a project id that was not loaded.",
          groupId,
          groupTitle,
          projectId,
        });
        return;
      }

      const actualGroupId = project.groupId ?? null;
      if (actualGroupId !== groupId) {
        issues.push({
          code: "membership_mismatch",
          severity: "warning",
          message: "Group membership does not match the project's group id.",
          projectId: project.id,
          projectTitle: project.title,
          groupId,
          groupTitle,
          expectedGroupId: groupId,
          actualGroupId,
        });
      }
    });
  });

  projects.forEach((project) => {
    const groupId = project.groupId ?? null;
    if (!groupId) return;

    const group = groupById.get(groupId);
    if (!group) {
      issues.push({
        code: "project_references_missing_group",
        severity: "warning",
        message: "Project references a group id that was not loaded.",
        projectId: project.id,
        projectTitle: project.title,
        groupId,
      });
      return;
    }

    if (!readProjectIds(readGroupField(group, "projectIds")).includes(project.id)) {
      issues.push({
        code: "membership_mismatch",
        severity: "warning",
        message: "Project group id is missing from the matching group's project id list.",
        projectId: project.id,
        projectTitle: project.title,
        groupId: readString(readGroupField(group, "id")),
        groupTitle: readString(readGroupField(group, "title")),
        expectedGroupId: readString(readGroupField(group, "id")),
        actualGroupId: null,
      });
    }
  });

  if (typeof dataVersion !== "number" || !Number.isFinite(dataVersion) || dataVersion <= 0) {
    issues.push({
      code: "invalid_data_version",
      severity: "warning",
      message: "App state dataVersion is invalid and should be treated as 1.",
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    dataVersion,
    projectCount: projects.length,
    groupCount: groups.length,
    issueCount: issues.length,
    errorCount,
    warningCount,
    ok: issues.length === 0,
    issues,
  };
}
