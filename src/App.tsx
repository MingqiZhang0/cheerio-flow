import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import katex from "katex";
import {
  Box,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  Diamond,
  Eye,
  EyeOff,
  FilePlus2,
  FolderPlus,
  GitBranch,
  GripVertical,
  Hexagon,
  Layers3,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Save,
  Shapes,
  Square,
  Trash2,
  Triangle,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseStorageRoot, loadDatabase, persistDatabase, removeProject } from "./storage";
import {
  ARROW_TYPES,
  MODULE_SHAPES,
  MODULE_TYPES,
  PROJECT_CATEGORIES,
  type AppState,
  type ArrowType,
  type FlowArrow,
  type FlowArrowData,
  type FlowModule,
  type FlowModuleData,
  type ModuleShape,
  type Project,
  type ProjectGroup,
  type SelectedElement,
  type StorageReport,
} from "./types";
import {
  applyGroupMembership,
  createArrow,
  createEmptyGroup,
  createEmptyProject,
  createModule,
  getNextModuleShortId,
  normalizeGroups,
  normalizeProjects,
  sortPinnedFirst,
} from "./utils";

type ModuleNodeType = Node<FlowModuleData, "module">;
type ArrowEdgeType = Edge<FlowArrowData>;
type SaveStatus = "saving" | "saved" | "error";
type CtrlWheelState = { x: number; y: number } | null;
type MoveMode = "x" | "y" | "free";

const SHAPE_ICONS: Record<ModuleShape, typeof Square> = {
  rectangle: Square,
  triangle: Triangle,
  diamond: Diamond,
  circle: Circle,
  ellipse: Hexagon,
};

const SHAPE_CLASS: Record<ModuleShape, string> = {
  rectangle: "rectangle",
  triangle: "triangle",
  diamond: "diamond",
  circle: "circle",
  ellipse: "ellipse",
};

const COMMAND_KEYWORDS = ["arrow", "to", "type", ...ARROW_TYPES];

function moduleToNode(module: FlowModule, selected: boolean): ModuleNodeType {
  return {
    id: module.id,
    type: "module",
    position: module.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: module.data,
    selected,
    draggable: true,
  };
}

function arrowToEdge(arrow: FlowArrow, selected: boolean): ArrowEdgeType {
  return {
    id: arrow.id,
    source: arrow.source,
    target: arrow.target,
    data: arrow.data,
    label: arrow.data.arrowType,
    type: "smoothstep",
    selected,
    reconnectable: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: arrow.data.enabled ? "#355f63" : "#9da4a7",
    },
    style: {
      stroke: arrow.data.enabled ? "#355f63" : "#a8adaf",
      strokeWidth: 2.4,
      opacity: arrow.data.enabled ? 1 : 0.58,
    },
    labelStyle: {
      fill: arrow.data.enabled ? "#26494d" : "#7b8285",
      fontSize: 12,
      fontWeight: 650,
    },
    labelBgStyle: {
      fill: "#f8faf9",
      fillOpacity: 0.9,
    },
  };
}

function edgeToArrow(edge: ArrowEdgeType): FlowArrow {
  const status = edge.data?.status ?? (edge.data?.enabled === false ? "disabled" : "enabled");
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? "bottom",
    targetHandle: edge.targetHandle ?? "top",
    data: {
      arrowType: edge.data?.arrowType ?? "derivation",
      note: edge.data?.note ?? "",
      status,
      enabled: status === "enabled",
    },
  };
}

function renderLatex(content: string) {
  if (!content.trim()) return "";
  return katex.renderToString(content, {
    throwOnError: false,
    strict: false,
    displayMode: content.length > 24,
  });
}

function ShapeVisual({ shape }: { shape: ModuleShape }) {
  if (shape === "triangle") {
    return (
      <svg className="module-shape-visual" viewBox="0 0 170 132" aria-hidden>
        <polygon points="85,10 158,122 12,122" />
      </svg>
    );
  }

  if (shape === "diamond") {
    return (
      <svg className="module-shape-visual" viewBox="0 0 170 132" aria-hidden>
        <polygon points="85,8 160,66 85,124 10,66" />
      </svg>
    );
  }

  if (shape === "circle") {
    return (
      <svg className="module-shape-visual" viewBox="0 0 170 132" aria-hidden>
        <circle cx="85" cy="66" r="58" />
      </svg>
    );
  }

  if (shape === "ellipse") {
    return (
      <svg className="module-shape-visual" viewBox="0 0 170 132" aria-hidden>
        <ellipse cx="85" cy="66" rx="76" ry="48" />
      </svg>
    );
  }

  return (
    <svg className="module-shape-visual" viewBox="0 0 170 132" aria-hidden>
      <rect x="9" y="18" width="152" height="96" rx="7" />
    </svg>
  );
}

const ModuleNode = memo(function ModuleNode({ data, selected }: NodeProps<ModuleNodeType>) {
  const html = useMemo(() => {
    if (!data.latexEnabled) return "";
    try {
      return renderLatex(data.content);
    } catch {
      return "";
    }
  }, [data.content, data.latexEnabled]);

  return (
    <div className={`module-node ${selected ? "selected" : ""} ${data.enabled ? "" : "disabled"}`}>
      <Handle type="target" position={Position.Top} id="top" className="module-handle module-handle-top" />
      <div className={`module-body shape-${SHAPE_CLASS[data.shape]}`}>
        <ShapeVisual shape={data.shape} />
        <div className="module-short-id">{data.shortId}</div>
        <div className="module-meta">{data.moduleType}</div>
        <div className="module-content">
          {data.latexEnabled && html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{data.content || "Empty module"}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" className="module-handle module-handle-bottom" />
    </div>
  );
});

const nodeTypes = {
  module: ModuleNode,
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isConsoleToggle(event: KeyboardEvent) {
  return event.key === "~" || event.key === "`" || event.code === "Backquote";
}

function normalizeHandle(value: string | undefined, fallback: "top" | "bottom") {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "top" || normalized === "up") return "top";
  if (normalized === "bottom" || normalized === "down") return "bottom";
  return null;
}

function parseEndpoint(text: string, fallbackHandle: "top" | "bottom") {
  const match = /^(m\d+)(?:\.(top|up|bottom|down))?$/i.exec(text);
  if (!match) return null;
  const handle = normalizeHandle(match[2], fallbackHandle);
  if (!handle) return null;
  return { shortId: match[1].toUpperCase(), handle };
}

function parseArrowCommand(input: string, project: Project | null): { arrow?: FlowArrow; message?: string; error?: string } {
  if (!project) return { error: "No current project" };

  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 4 && tokens.length !== 6) return { error: "Use: arrow m1 to m2 [type support]" };
  if (tokens[0].toLowerCase() !== "arrow" || tokens[2].toLowerCase() !== "to") return { error: "Use: arrow m1 to m2" };
  if (tokens.length === 6 && tokens[4].toLowerCase() !== "type") return { error: "Use: type derivation/output/support/..." };

  const sourceEndpoint = parseEndpoint(tokens[1], "bottom");
  const targetEndpoint = parseEndpoint(tokens[3], "top");
  if (!sourceEndpoint || !targetEndpoint) return { error: "Unknown endpoint. Try m1.bottom to m2.top" };

  const arrowType = (tokens.length === 6 ? tokens[5].toLowerCase() : "derivation") as ArrowType;
  if (!ARROW_TYPES.includes(arrowType)) return { error: `Unknown arrow type: ${tokens[5]}` };

  const source = project.modules.find((module) => module.data.shortId.toUpperCase() === sourceEndpoint.shortId);
  const target = project.modules.find((module) => module.data.shortId.toUpperCase() === targetEndpoint.shortId);
  if (!source) return { error: `Module not found: ${sourceEndpoint.shortId}` };
  if (!target) return { error: `Module not found: ${targetEndpoint.shortId}` };
  if (source.id === target.id) return { error: "Arrow needs two different modules" };

  const arrow = createArrow(source.id, target.id, sourceEndpoint.handle, targetEndpoint.handle, arrowType);
  return { arrow, message: `Created arrow ${source.data.shortId} -> ${target.data.shortId}` };
}

function getCommandSuggestion(input: string, project: Project | null) {
  const lower = input.toLowerCase();
  if (lower === "ar") return "row";

  const sourceOnly = /^arrow\s+(m\d+)$/i.exec(input.trim());
  if (sourceOnly && project) {
    const source = sourceOnly[1].toUpperCase();
    const target = project.modules.find((module) => module.data.shortId.toUpperCase() !== source);
    if (target) return ` to ${target.data.shortId.toLowerCase()}`;
  }

  if (/^arrow\s+m\d+(?:\.(?:top|up|bottom|down))?\s+to\s+m\d+(?:\.(?:top|up|bottom|down))?\s+type\s+$/i.test(input)) {
    return "derivation";
  }

  const tokenMatch = /(^|\s)(\S*)$/.exec(input);
  const token = tokenMatch?.[2]?.toLowerCase() ?? "";
  if (!token) return "";
  const keyword = COMMAND_KEYWORDS.find((item) => item.startsWith(token) && item !== token);
  return keyword ? keyword.slice(token.length) : "";
}

function SidebarButton({
  title,
  children,
  onClick,
  active = false,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button className={`icon-button ${active ? "active" : ""}`} type="button" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function AppShell() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false);
  const [propertiesSidebarCollapsed, setPropertiesSidebarCollapsed] = useState(true);
  const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [pendingShape, setPendingShape] = useState<ModuleShape | null>(null);
  const [ghostPoint, setGhostPoint] = useState<{ x: number; y: number } | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ModuleNodeType, ArrowEdgeType> | null>(null);
  const [flowNodes, setFlowNodesState] = useState<ModuleNodeType[]>([]);
  const [flowEdges, setFlowEdges] = useState<ArrowEdgeType[]>([]);
  const [viewport, setViewportState] = useState({ x: 0, y: 0, zoom: 1 });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [storageReport, setStorageReport] = useState<StorageReport | null>(null);
  const [storageRootInput, setStorageRootInput] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleMessage, setConsoleMessage] = useState("");
  const [consoleError, setConsoleError] = useState("");
  const [ctrlWheel, setCtrlWheel] = useState<CtrlWheelState>(null);
  const consoleInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const isVisualDraggingRef = useRef(false);
  const flowNodesRef = useRef<ModuleNodeType[]>([]);
  const hydratedProjectIdRef = useRef<string | null>(null);
  const capturedPointerRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const resetInteractionStateRef = useRef<(options?: { clearPlacement?: boolean; clearSelection?: boolean }) => void>(() => undefined);
  const gizmoDragRef = useRef<{
    nodeId: string;
    mode: MoveMode;
    startPointer: { x: number; y: number };
    startPosition: { x: number; y: number };
    frame: number | null;
    lastPointer: { x: number; y: number };
  } | null>(null);
  const loadedRef = useRef(false);
  const projectsRef = useRef<Project[]>([]);
  const groupsRef = useRef<ProjectGroup[]>([]);
  const appStateRef = useRef<AppState>({
    currentProjectId: null,
    projectSidebarCollapsed: false,
    propertiesSidebarCollapsed: true,
  });
  const lastPointerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null,
    [currentProjectId, projects],
  );

  const appState = useMemo<AppState>(
    () => ({
      currentProjectId: currentProject?.id ?? null,
      projectSidebarCollapsed,
      propertiesSidebarCollapsed,
    }),
    [currentProject?.id, projectSidebarCollapsed, propertiesSidebarCollapsed],
  );

  const setFlowNodes = useCallback((nextOrUpdater: ModuleNodeType[] | ((previous: ModuleNodeType[]) => ModuleNodeType[])) => {
    setFlowNodesState((previous) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(previous) : nextOrUpdater;
      flowNodesRef.current = next;
      return next;
    });
  }, []);

  const mergeLatestFlowPositions = useCallback((modules: FlowModule[]) => {
    const positions = new Map(flowNodesRef.current.map((node) => [node.id, node.position]));
    return modules.map((module) => {
      const position = positions.get(module.id);
      return position ? { ...module, position: { x: position.x, y: position.y } } : module;
    });
  }, []);

  const updateProjects = useCallback((updater: (previous: Project[]) => Project[]) => {
    setProjects((previous) => {
      const next = updater(previous);
      projectsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  const saveAllNow = useCallback(async (projectsOverride?: Project[]) => {
    if (!loadedRef.current) return;
    setSaveStatus("saving");
    try {
      const currentProjects = projectsOverride ?? projectsRef.current;
      const currentGroups = groupsRef.current;
      const currentAppState = appStateRef.current;
      const report = await persistDatabase(currentProjects, currentGroups, currentAppState);
      setStorageReport(report);
      setDataDir(report.dataDir);
      setStorageRootInput(report.storageRoot);
      console.info("Cheerio Flow saved to", report);
      setSaveStatus("saved");
    } catch (reason: unknown) {
      console.error("Failed to save Cheerio Flow data", reason);
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDatabase()
      .then((data) => {
        if (cancelled) return;
        const normalizedProjects = normalizeProjects(data.projects);
        const normalizedGroups = normalizeGroups(data.groups, normalizedProjects);
        const hydratedProjects = applyGroupMembership(normalizedProjects, normalizedGroups);
        const firstProject = hydratedProjects[0] ?? createEmptyProject();
        const nextProjects = hydratedProjects.length > 0 ? hydratedProjects : [firstProject];
        groupsRef.current = normalizedGroups;
        setDataDir(data.dataDir);
        setStorageReport(data.report ?? null);
        setStorageRootInput(data.storageRoot ?? "");
        setGroups(normalizedGroups);
        updateProjects(() => nextProjects);
        setCurrentProjectId(data.appState.currentProjectId ?? firstProject.id);
        setProjectSidebarCollapsed(data.appState.projectSidebarCollapsed);
        setPropertiesSidebarCollapsed(data.appState.propertiesSidebarCollapsed);
        setLoaded(true);
        loadedRef.current = true;
      })
      .catch((reason: unknown) => {
        console.error("Failed to load Cheerio Flow data", reason);
        setError(reason instanceof Error ? reason.message : String(reason));
        updateProjects(() => []);
        setCurrentProjectId(null);
        setLoaded(true);
        loadedRef.current = true;
        setSaveStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [updateProjects]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveAllNow();
    }, 350);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [appState, groups, loaded, projects, saveAllNow]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      void saveAllNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveAllNow]);

  useEffect(() => {
    if (consoleOpen) {
      window.setTimeout(() => consoleInputRef.current?.focus(), 0);
    }
  }, [consoleOpen]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (gizmoDragRef.current && !capturedPointerRef.current) {
        resetInteractionStateRef.current();
      }
      if (gizmoDragRef.current) return;
      if (isConsoleToggle(event)) {
        event.preventDefault();
        setConsoleOpen((open) => !open);
        return;
      }

      if (event.key === "Escape") {
        resetInteractionStateRef.current({ clearPlacement: true });
        setPropertiesSidebarCollapsed(true);
        return;
      }

      if (event.key === "Control" && !event.repeat && !consoleOpen && !isEditableTarget(event.target)) {
        setCtrlWheel({ ...lastPointerRef.current });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") setCtrlWheel(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [consoleOpen]);

  useEffect(() => {
    if (!loaded || projects.length === 0) return;
    if (!currentProjectId || !projects.some((project) => project.id === currentProjectId)) {
      setCurrentProjectId(projects[0].id);
    }
  }, [currentProjectId, loaded, projects]);

  const updateProject = useCallback((projectId: string, updater: (project: Project) => Project) => {
    const applyProject = (previous: Project[]) => previous.map((project) => (project.id === projectId ? updater(project) : project));
    updateProjects(applyProject);
  }, [updateProjects]);

  const updateCurrentProject = useCallback(
    (updater: (project: Project) => Project) => {
      if (!currentProjectId) return;
      updateProject(currentProjectId, updater);
    },
    [currentProjectId, updateProject],
  );

  const selectElement = useCallback((element: SelectedElement) => {
    setSelectedElement(element);
  }, []);

  const openElementProperties = useCallback((element: SelectedElement) => {
    setSelectedElement(element);
    if (element) setPropertiesSidebarCollapsed(false);
  }, []);

  const resetInteractionState = useCallback(
    (options: { clearPlacement?: boolean; clearSelection?: boolean } = {}) => {
      const activeGizmo = gizmoDragRef.current;
      if (activeGizmo?.frame !== null && activeGizmo?.frame !== undefined) {
        window.cancelAnimationFrame(activeGizmo.frame);
      }
      const captured = capturedPointerRef.current;
      if (captured?.element.hasPointerCapture?.(captured.pointerId)) {
        captured.element.releasePointerCapture(captured.pointerId);
      }
      capturedPointerRef.current = null;
      gizmoDragRef.current = null;
      isVisualDraggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.body.style.overflow = "";
      document.body.style.pointerEvents = "";
      setCtrlWheel(null);
      setGhostPoint(null);
      if (options.clearPlacement) {
        setPendingShape(null);
        setShapeMenuOpen(false);
      }
      if (options.clearSelection) setSelectedElement(null);
    },
    [],
  );

  resetInteractionStateRef.current = resetInteractionState;

  useEffect(() => {
    const resetStaleDrag = () => {
      if (!gizmoDragRef.current && isVisualDraggingRef.current) resetInteractionState();
    };
    window.addEventListener("pointerup", resetStaleDrag);
    window.addEventListener("pointercancel", resetStaleDrag);
    window.addEventListener("blur", resetStaleDrag);
    document.addEventListener("mouseup", resetStaleDrag);
    document.addEventListener("pointerup", resetStaleDrag);
    return () => {
      window.removeEventListener("pointerup", resetStaleDrag);
      window.removeEventListener("pointercancel", resetStaleDrag);
      window.removeEventListener("blur", resetStaleDrag);
      document.removeEventListener("mouseup", resetStaleDrag);
      document.removeEventListener("pointerup", resetStaleDrag);
    };
  }, [resetInteractionState]);

  const commitNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const finalPosition = { x: position.x, y: position.y };
      setFlowNodes((previous) =>
        previous.map((node) => (node.id === nodeId ? { ...node, position: finalPosition } : node)),
      );
      const applyPosition = (previous: Project[]) =>
        previous.map((project) =>
          project.id === currentProjectId
            ? {
                ...project,
                modules: project.modules.map((module) =>
                  module.id === nodeId ? { ...module, position: finalPosition } : module,
                ),
              }
            : project,
        );
      updateProjects(applyPosition);
    },
    [currentProjectId, setFlowNodes, updateProjects],
  );

  const commitFlowNodePositionsToProject = useCallback(() => {
    const applyPositions = (previous: Project[]) =>
      previous.map((project) =>
        project.id === currentProjectId ? { ...project, modules: mergeLatestFlowPositions(project.modules) } : project,
      );
    const nextProjects = applyPositions(projectsRef.current);
    updateProjects(applyPositions);
    return nextProjects;
  }, [currentProjectId, mergeLatestFlowPositions, updateProjects]);

  const projectEdges = useMemo(
    () => currentProject?.arrows.map((arrow) => arrowToEdge(arrow, selectedElement?.kind === "arrow" && selectedElement.id === arrow.id)) ?? [],
    [currentProject?.arrows, selectedElement],
  );

  useEffect(() => {
    if (!loaded) return;
    const projectId = currentProjectId ?? projectsRef.current[0]?.id ?? null;
    if (!projectId) {
      hydratedProjectIdRef.current = null;
      setFlowNodes([]);
      return;
    }

    if (hydratedProjectIdRef.current === projectId) return;
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    resetInteractionState({ clearPlacement: true });
    hydratedProjectIdRef.current = projectId;
    setFlowNodes(project.modules.map((module) => moduleToNode(module, false)));
  }, [currentProjectId, loaded, resetInteractionState, setFlowNodes]);

  useEffect(() => {
    setFlowNodes((previous) =>
      previous.map((node) => {
        const selected = selectedElement?.kind === "module" && selectedElement.id === node.id;
        return node.selected === selected ? node : { ...node, selected };
      }),
    );
  }, [selectedElement, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(projectEdges);
  }, [projectEdges]);

  const createProject = useCallback(() => {
    resetInteractionState({ clearPlacement: true, clearSelection: true });
    const project = createEmptyProject(`Project ${projects.length + 1}`);
    const applyProject = (previous: Project[]) => [...previous, project];
    updateProjects(applyProject);
    setCurrentProjectId(project.id);
    setSelectedElement(null);
    setPropertiesSidebarCollapsed(true);
  }, [projects.length, resetInteractionState, updateProjects]);

  const selectProject = useCallback(
    async (projectId: string) => {
      if (projectId === currentProject?.id) return;
      resetInteractionState({ clearPlacement: true });
      const projectsForSave = commitFlowNodePositionsToProject();
      await saveAllNow(projectsForSave);
      setCurrentProjectId(projectId);
      setSelectedElement(null);
      setPropertiesSidebarCollapsed(true);
    },
    [commitFlowNodePositionsToProject, currentProject?.id, resetInteractionState, saveAllNow],
  );

  const deleteCurrentProject = useCallback(() => {
    if (!currentProject) return;
    resetInteractionState({ clearPlacement: true, clearSelection: true });
    const projectId = currentProject.id;
    const remaining = projects.filter((project) => project.id !== projectId);
    const fallback = remaining.length === 0 ? createEmptyProject() : null;
    const nextProjects = fallback ? [fallback] : remaining;
    updateProjects(() => nextProjects);
    setGroups((previous) =>
      previous.map((group) => ({
        ...group,
        projectIds: group.projectIds.filter((id) => id !== projectId),
      })),
    );
    setCurrentProjectId(nextProjects[0]?.id ?? null);
    setSelectedElement(null);
    removeProject(projectId).catch((reason: unknown) => {
      console.error("Failed to delete project", reason);
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [currentProject, projects, resetInteractionState, updateProjects]);

  const createGroup = useCallback(() => {
    const group = createEmptyGroup(`Group ${groups.length + 1}`);
    setGroups((previous) => [...previous, group]);
  }, [groups.length]);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups((previous) => previous.filter((group) => group.id !== groupId));
    updateProjects((previous) => previous.map((project) => (project.groupId === groupId ? { ...project, groupId: null } : project)));
  }, [updateProjects]);

  const updateGroup = useCallback((groupId: string, updater: (group: ProjectGroup) => ProjectGroup) => {
    setGroups((previous) => previous.map((group) => (group.id === groupId ? updater(group) : group)));
  }, []);

  const moveProjectToGroup = useCallback((projectId: string, groupId: string | null) => {
    updateProjects((previous) => previous.map((project) => (project.id === projectId ? { ...project, groupId } : project)));
    setGroups((previous) =>
      previous.map((group) => {
        const withoutProject = group.projectIds.filter((id) => id !== projectId);
        return {
          ...group,
          projectIds: group.id === groupId ? Array.from(new Set([...withoutProject, projectId])) : withoutProject,
        };
      }),
    );
  }, [updateProjects]);

  const applyStorageRoot = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const data = await chooseStorageRoot(storageRootInput, projectsRef.current, groupsRef.current, appStateRef.current);
      const normalizedProjects = normalizeProjects(data.projects);
      const normalizedGroups = normalizeGroups(data.groups, normalizedProjects);
      const hydratedProjects = applyGroupMembership(normalizedProjects, normalizedGroups);
      groupsRef.current = normalizedGroups;
      hydratedProjectIdRef.current = null;
      updateProjects(() => hydratedProjects);
      setGroups(normalizedGroups);
      setCurrentProjectId(data.appState.currentProjectId ?? hydratedProjects[0]?.id ?? null);
      setDataDir(data.dataDir);
      setStorageRootInput(data.storageRoot ?? "");
      setStorageReport(data.report ?? null);
      setSaveStatus("saved");
      setError(null);
      console.info("Cheerio Flow storage root set", data.report);
    } catch (reason: unknown) {
      console.error("Failed to apply storage root", reason);
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [storageRootInput, updateProjects]);

  const createModuleAt = useCallback(
    (shape: ModuleShape, clientX: number, clientY: number) => {
      if (!currentProjectId || !flowInstance) {
        resetInteractionState({ clearPlacement: true });
        return;
      }
      const project = projectsRef.current.find((item) => item.id === currentProjectId);
      if (!project) {
        resetInteractionState({ clearPlacement: true });
        return;
      }
      const position = flowInstance.screenToFlowPosition({ x: clientX, y: clientY });
      const modulesWithLatestPositions = mergeLatestFlowPositions(project.modules);
      const module = createModule(shape, position.x - 85, position.y - 66, getNextModuleShortId(modulesWithLatestPositions));
      const applyModule = (previous: Project[]) =>
        previous.map((item) =>
          item.id === currentProjectId
            ? {
                ...item,
                modules: [...mergeLatestFlowPositions(item.modules), module],
              }
            : item,
        );
      updateProjects(applyModule);
      setFlowNodes((previous) => {
        const previousById = new Map(previous.map((node) => [node.id, node]));
        return [
          ...modulesWithLatestPositions.map((item) => {
            const existing = previousById.get(item.id);
            return existing ? { ...existing, position: item.position, selected: false } : moduleToNode(item, false);
          }),
          moduleToNode(module, true),
        ];
      });
      resetInteractionState({ clearPlacement: true });
      selectElement({ kind: "module", id: module.id });
    },
    [currentProjectId, flowInstance, mergeLatestFlowPositions, resetInteractionState, selectElement, setFlowNodes, updateProjects],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<ModuleNodeType>[]) => {
      const nextNodes = applyNodeChanges(changes, flowNodesRef.current);
      setFlowNodes(nextNodes);
      const nextById = new Map(nextNodes.map((node) => [node.id, node]));
      const removedIds = new Set(
        changes
          .filter((change) => change.type === "remove")
          .map((change) => ("id" in change ? change.id : null))
          .filter((id): id is string => Boolean(id)),
      );

      changes.forEach((change) => {
        if (change.type !== "position" || change.dragging !== false) return;
        const finalPosition = change.position ?? nextById.get(change.id)?.position;
        if (finalPosition) commitNodePosition(change.id, finalPosition);
      });

      if (removedIds.size > 0) {
        updateCurrentProject((project) => ({
          ...project,
          modules: project.modules.filter((module) => !removedIds.has(module.id)),
          arrows: project.arrows.filter((arrow) => !removedIds.has(arrow.source) && !removedIds.has(arrow.target)),
        }));
        if (selectedElement?.kind === "module" && removedIds.has(selectedElement.id)) setSelectedElement(null);
      }
    },
    [commitNodePosition, selectedElement, setFlowNodes, updateCurrentProject],
  );

  const onNodeDragStart = useCallback(() => {
    isVisualDraggingRef.current = true;
    setCtrlWheel(null);
  }, []);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: ModuleNodeType) => {
      commitNodePosition(node.id, node.position);
      resetInteractionState();
    },
    [commitNodePosition, resetInteractionState],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ArrowEdgeType>[]) => {
      const nextEdges = applyEdgeChanges(changes, flowEdges);
      const keptEdgeIds = new Set(nextEdges.map((edge) => edge.id));
      setFlowEdges(nextEdges);
      if (changes.some((change) => change.type === "remove")) {
        updateCurrentProject((project) => ({
          ...project,
          arrows: project.arrows.filter((arrow) => keptEdgeIds.has(arrow.id)),
        }));
      }
      if (selectedElement?.kind === "arrow" && !keptEdgeIds.has(selectedElement.id)) setSelectedElement(null);
    },
    [flowEdges, selectedElement, updateCurrentProject],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (pendingShape) {
        createModuleAt(pendingShape, event.clientX, event.clientY);
        return;
      }
      if (!isEditableTarget(event.target)) setSelectedElement(null);
    },
    [createModuleAt, pendingShape],
  );

  const startGizmoDrag = useCallback(
    (event: React.PointerEvent, mode: MoveMode) => {
      if (!flowInstance || selectedElement?.kind !== "module") return;
      event.preventDefault();
      event.stopPropagation();

      const selectedNode = flowNodes.find((node) => node.id === selectedElement.id);
      if (!selectedNode) return;

      const dragState = {
        nodeId: selectedNode.id,
        mode,
        startPointer: { x: event.clientX, y: event.clientY },
        startPosition: { ...selectedNode.position },
        frame: null,
        lastPointer: { x: event.clientX, y: event.clientY },
      };
      gizmoDragRef.current = dragState;
      isVisualDraggingRef.current = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = mode === "x" ? "ew-resize" : mode === "y" ? "ns-resize" : "move";
      const pointerTarget = event.currentTarget as HTMLElement;
      pointerTarget.setPointerCapture?.(event.pointerId);
      capturedPointerRef.current = { element: pointerTarget, pointerId: event.pointerId };

      const applyDrag = () => {
        const active = gizmoDragRef.current;
        if (!active) return;
        active.frame = null;
        const startFlow = flowInstance.screenToFlowPosition(active.startPointer);
        const currentFlow = flowInstance.screenToFlowPosition(active.lastPointer);
        const dx = currentFlow.x - startFlow.x;
        const dy = currentFlow.y - startFlow.y;
        const nextPosition = {
          x: active.mode === "y" ? active.startPosition.x : active.startPosition.x + dx,
          y: active.mode === "x" ? active.startPosition.y : active.startPosition.y + dy,
        };
        setFlowNodes((previous) =>
          previous.map((node) => (node.id === active.nodeId ? { ...node, position: nextPosition } : node)),
        );
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        const active = gizmoDragRef.current;
        if (!active) return;
        active.lastPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (active.frame === null) active.frame = window.requestAnimationFrame(applyDrag);
      };

      const finishDrag = () => {
        const active = gizmoDragRef.current;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finishDrag);
        window.removeEventListener("pointercancel", finishDrag);
        window.removeEventListener("blur", finishDrag);
        document.removeEventListener("mouseup", finishDrag);
        document.removeEventListener("pointerup", finishDrag);
        if (!active) {
          resetInteractionState();
          return;
        }
        if (active.frame !== null) window.cancelAnimationFrame(active.frame);
        const startFlow = flowInstance.screenToFlowPosition(active.startPointer);
        const currentFlow = flowInstance.screenToFlowPosition(active.lastPointer);
        const dx = currentFlow.x - startFlow.x;
        const dy = currentFlow.y - startFlow.y;
        const finalPosition = {
          x: active.mode === "y" ? active.startPosition.x : active.startPosition.x + dx,
          y: active.mode === "x" ? active.startPosition.y : active.startPosition.y + dy,
        };
        setFlowNodes((previous) =>
          previous.map((node) => (node.id === active.nodeId ? { ...node, position: finalPosition } : node)),
        );
        commitNodePosition(active.nodeId, finalPosition);
        resetInteractionState();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finishDrag);
      window.addEventListener("pointercancel", finishDrag);
      window.addEventListener("blur", finishDrag);
      document.addEventListener("mouseup", finishDrag);
      document.addEventListener("pointerup", finishDrag);
    },
    [commitNodePosition, flowInstance, flowNodes, resetInteractionState, selectedElement, setFlowNodes],
  );

  const commandSuggestion = useMemo(() => getCommandSuggestion(consoleInput, currentProject), [consoleInput, currentProject]);

  const executeConsoleCommand = useCallback(() => {
    const parsed = parseArrowCommand(consoleInput, currentProject);
    if (parsed.error || !parsed.arrow) {
      setConsoleError(parsed.error ?? "Command failed");
      setConsoleMessage("");
      return;
    }

    const arrow = parsed.arrow;
    updateCurrentProject((project) => ({
      ...project,
      arrows: [...project.arrows, arrow],
    }));
    openElementProperties({ kind: "arrow", id: arrow.id });
    setConsoleMessage(parsed.message ?? "Created arrow");
    setConsoleError("");
    setConsoleInput("");
  }, [consoleInput, currentProject, openElementProperties, updateCurrentProject]);

  const selectedModule = useMemo(() => {
    if (selectedElement?.kind !== "module" || !currentProject) return null;
    return currentProject.modules.find((module) => module.id === selectedElement.id) ?? null;
  }, [currentProject, selectedElement]);

  const selectedArrow = useMemo(() => {
    if (selectedElement?.kind !== "arrow" || !currentProject) return null;
    return currentProject.arrows.find((arrow) => arrow.id === selectedElement.id) ?? null;
  }, [currentProject, selectedElement]);

  const selectedGizmoNode = useMemo(() => {
    if (selectedElement?.kind !== "module") return null;
    return flowNodes.find((node) => node.id === selectedElement.id) ?? null;
  }, [flowNodes, selectedElement]);

  const updateModuleInCurrentProject = useCallback(
    (moduleId: string, updater: (module: FlowModule) => FlowModule) => {
      const project = projectsRef.current.find((item) => item.id === currentProjectId);
      const currentModule = project?.modules.find((module) => module.id === moduleId);
      if (!project || !currentModule) return;
      const nextModule = updater(currentModule);
      updateProjects((previous) =>
        previous.map((item) =>
          item.id === project.id
            ? {
                ...item,
                modules: item.modules.map((module) => (module.id === moduleId ? nextModule : module)),
              }
            : item,
        ),
      );
      setFlowNodes((previous) =>
        previous.map((node) => (node.id === moduleId ? { ...node, data: nextModule.data } : node)),
      );
    },
    [currentProjectId, setFlowNodes, updateProjects],
  );

  const currentProjectGroups = useMemo(() => sortPinnedFirst(groups), [groups]);
  const ungroupedProjects = useMemo(
    () => sortPinnedFirst(projects.filter((project) => !project.groupId || !groups.some((group) => group.id === project.groupId))),
    [groups, projects],
  );

  if (!loaded) {
    return (
      <main className="boot-screen">
        <Layers3 size={32} />
        <span>Cheerio Flow is loading local data...</span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className={`project-sidebar ${projectSidebarCollapsed ? "collapsed" : ""}`}>
        {projectSidebarCollapsed ? (
          <SidebarButton title="Show projects" onClick={() => setProjectSidebarCollapsed(false)}>
            <ChevronsRight size={18} />
          </SidebarButton>
        ) : (
          <>
            <div className="sidebar-header">
              <div>
                <div className="app-name">Cheerio Flow</div>
                <div className="app-subtitle">Research flow workspace</div>
              </div>
              <SidebarButton title="Hide projects" onClick={() => setProjectSidebarCollapsed(true)}>
                <ChevronsLeft size={18} />
              </SidebarButton>
            </div>

            <div className="sidebar-actions">
              <button type="button" className="action-button" onClick={createProject}>
                <FilePlus2 size={16} />
                New Project
              </button>
              <button type="button" className="action-button" onClick={createGroup}>
                <FolderPlus size={16} />
                New Group
              </button>
            </div>

            <div className="project-list">
              {currentProjectGroups.map((group) => {
                const GroupIcon = group.pinned ? Pin : PinOff;
                const groupProjects = sortPinnedFirst(projects.filter((project) => project.groupId === group.id));
                const collapsed = collapsedGroupIds.has(group.id);
                return (
                  <section className="project-group" key={group.id}>
                    <div className="group-header">
                      <button
                        className="collapse-button"
                        type="button"
                        onClick={() =>
                          setCollapsedGroupIds((previous) => {
                            const next = new Set(previous);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                      >
                        {collapsed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <input value={group.title} onChange={(event) => updateGroup(group.id, (item) => ({ ...item, title: event.target.value }))} />
                      <button className="tiny-button" type="button" onClick={() => updateGroup(group.id, (item) => ({ ...item, pinned: !item.pinned }))}>
                        <GroupIcon size={14} />
                      </button>
                      <button className="tiny-button danger" type="button" onClick={() => deleteGroup(group.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="group-meta">Created {group.createdAt}</div>
                    {!collapsed && (
                      <div className="project-stack">
                        {groupProjects.length === 0 ? (
                          <div className="empty-hint">Empty group</div>
                        ) : (
                          groupProjects.map((project) => (
                            <ProjectListItem
                              key={project.id}
                              project={project}
                              active={project.id === currentProject?.id}
                              onSelect={() => selectProject(project.id)}
                              onTogglePin={() => updateProject(project.id, (item) => ({ ...item, pinned: !item.pinned }))}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

              <section className="project-group">
                <div className="group-header simple">
                  <GripVertical size={15} />
                  <span>Ungrouped</span>
                </div>
                <div className="project-stack">
                  {ungroupedProjects.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      active={project.id === currentProject?.id}
                      onSelect={() => selectProject(project.id)}
                      onTogglePin={() => updateProject(project.id, (item) => ({ ...item, pinned: !item.pinned }))}
                    />
                  ))}
                </div>
              </section>
            </div>

            {currentProject && (
              <section className="project-editor">
                <div className="editor-title">Current Project</div>
                <label>
                  Title
                  <input value={currentProject.title} onChange={(event) => updateCurrentProject((project) => ({ ...project, title: event.target.value }))} />
                </label>
                <label>
                  Category
                  <select
                    value={currentProject.category}
                    onChange={(event) => updateCurrentProject((project) => ({ ...project, category: event.target.value as Project["category"] }))}
                  >
                    {PROJECT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Group
                  <select value={currentProject.groupId ?? ""} onChange={(event) => moveProjectToGroup(currentProject.id, event.target.value || null)}>
                    <option value="">Ungrouped</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="readonly-row">
                  <span>Created</span>
                  <strong>{currentProject.createdAt}</strong>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={currentProject.pinned}
                    onChange={(event) => updateCurrentProject((project) => ({ ...project, pinned: event.target.checked }))}
                  />
                  Pinned
                </label>
                <button className="delete-button" type="button" onClick={deleteCurrentProject}>
                  <Trash2 size={16} />
                  Delete Current Project
                </button>
                <label>
                  Storage root
                  <input value={storageRootInput} onChange={(event) => setStorageRootInput(event.target.value)} />
                </label>
                <button className="action-button" type="button" onClick={() => void applyStorageRoot()}>
                  <Save size={15} />
                  Apply Storage Path
                </button>
                <div className="readonly-row">
                  <span>Active data directory</span>
                  <strong>{dataDir || "unavailable"}</strong>
                </div>
              </section>
            )}
          </>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="title-area">
            <input
              className="project-title-input"
              value={currentProject?.title ?? ""}
              onChange={(event) => updateCurrentProject((project) => ({ ...project, title: event.target.value }))}
              aria-label="Project title"
            />
            <span className="project-context">
              {currentProject?.category ?? "research"} / {currentProject?.createdAt ?? ""}
            </span>
          </div>
          <div className="topbar-actions">
            <button className="toolbar-button" type="button" onClick={() => setShapeMenuOpen((open) => !open)}>
              <Shapes size={17} />
              Module
            </button>
            <SidebarButton
              title={propertiesSidebarCollapsed ? "Show properties" : "Hide properties"}
              onClick={() => setPropertiesSidebarCollapsed((collapsed) => !collapsed)}
            >
              {propertiesSidebarCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
            </SidebarButton>
          </div>
          {shapeMenuOpen && (
            <div className="shape-menu">
              {MODULE_SHAPES.map((shape) => {
                const ShapeIcon = SHAPE_ICONS[shape];
                return (
                  <button
                    type="button"
                    key={shape}
                    className={pendingShape === shape ? "active" : ""}
                    onClick={() => {
                      setPendingShape(shape);
                      setShapeMenuOpen(false);
                    }}
                  >
                    <ShapeIcon size={18} />
                    {shape}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        <div className="canvas-wrap">
          {pendingShape && ghostPoint && (
            <div className={`ghost-module shape-${SHAPE_CLASS[pendingShape]}`} style={{ left: ghostPoint.x, top: ghostPoint.y }}>
              {pendingShape}
            </div>
          )}
          {ctrlWheel && (
            <CtrlWheel
              center={ctrlWheel}
              onPick={(shape) => createModuleAt(shape, ctrlWheel.x, ctrlWheel.y)}
            />
          )}
          {consoleOpen && (
            <CommandConsole
              inputRef={consoleInputRef}
              value={consoleInput}
              suggestion={commandSuggestion}
              message={consoleMessage}
              error={consoleError}
              onChange={(value) => {
                setConsoleInput(value);
                setConsoleError("");
                setConsoleMessage("");
              }}
              onComplete={() => {
                if (commandSuggestion) setConsoleInput((value) => value + commandSuggestion);
              }}
              onExecute={executeConsoleCommand}
            />
          )}
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={onPaneClick}
            onMove={(_, nextViewport) => setViewportState(nextViewport)}
            onPaneMouseMove={(event) => {
              if (pendingShape) setGhostPoint({ x: event.clientX, y: event.clientY });
            }}
            onPaneMouseLeave={() => setGhostPoint(null)}
            onNodeClick={(_, node) => selectElement({ kind: "module", id: node.id })}
            onNodeDoubleClick={(_, node) => openElementProperties({ kind: "module", id: node.id })}
            onEdgeClick={(_, edge) => selectElement({ kind: "arrow", id: edge.id })}
            onEdgeDoubleClick={(_, edge) => openElementProperties({ kind: "arrow", id: edge.id })}
            zoomOnDoubleClick={false}
            nodesDraggable
            nodesConnectable={false}
            edgesFocusable
            edgesReconnectable={false}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color="#d7dfdc" gap={24} size={1} />
            <Controls />
          </ReactFlow>
          {selectedGizmoNode && (
            <MoveGizmo
              node={selectedGizmoNode}
              viewport={viewport}
              onPointerDown={startGizmoDrag}
            />
          )}
        </div>

        <footer className="statusbar">
          <span>
            <Save size={14} />
            Local data: {dataDir || "unavailable"}
          </span>
          {storageReport && (
            <span>
              Disk {storageReport.projectCount}/{storageReport.moduleCount}/{storageReport.arrowCount}
            </span>
          )}
          {pendingShape ? <strong>Click the canvas to create a {pendingShape} module. Esc cancels.</strong> : <span>Modules {flowNodes.length} / Arrows {flowEdges.length}</span>}
          <span className={`save-status save-status-${saveStatus}`}>{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save failed"}</span>
          {error && <span className="error-text">{error}</span>}
        </footer>
      </section>

      <PropertiesPanel
        collapsed={propertiesSidebarCollapsed}
        currentProject={currentProject}
        selectedModule={selectedModule}
        selectedArrow={selectedArrow}
        onClose={() => setPropertiesSidebarCollapsed(true)}
        onUpdateModule={(moduleId, updater) =>
          updateModuleInCurrentProject(moduleId, updater)
        }
        onUpdateArrow={(arrowId, updater) =>
          updateCurrentProject((project) => ({
            ...project,
            arrows: project.arrows.map((arrow) => (arrow.id === arrowId ? updater(arrow) : arrow)),
          }))
        }
      />
    </main>
  );
}

function CtrlWheel({ center, onPick }: { center: { x: number; y: number }; onPick: (shape: ModuleShape) => void }) {
  const radius = 82;
  return (
    <div className="ctrl-wheel" style={{ left: center.x, top: center.y }}>
      {MODULE_SHAPES.map((shape, index) => {
        const angle = -Math.PI / 2 + (index / MODULE_SHAPES.length) * Math.PI * 2;
        const ShapeIcon = SHAPE_ICONS[shape];
        return (
          <button
            type="button"
            key={shape}
            className="ctrl-wheel-option"
            style={{
              transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) translate(-50%, -50%)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onPick(shape);
            }}
            title={shape}
          >
            <ShapeIcon size={18} />
            <span>{shape}</span>
          </button>
        );
      })}
    </div>
  );
}

function MoveGizmo({
  node,
  viewport,
  onPointerDown,
}: {
  node: ModuleNodeType;
  viewport: { x: number; y: number; zoom: number };
  onPointerDown: (event: React.PointerEvent, mode: MoveMode) => void;
}) {
  const left = viewport.x + (node.position.x + 85) * viewport.zoom;
  const top = viewport.y + (node.position.y + 66) * viewport.zoom;

  return (
    <div className="move-gizmo" style={{ left, top }}>
      <button
        type="button"
        className="move-gizmo-axis move-gizmo-x"
        aria-label="Move on X axis"
        onPointerDown={(event) => onPointerDown(event, "x")}
      />
      <button
        type="button"
        className="move-gizmo-axis move-gizmo-y"
        aria-label="Move on Y axis"
        onPointerDown={(event) => onPointerDown(event, "y")}
      />
      <button
        type="button"
        className="move-gizmo-center"
        aria-label="Move freely"
        onPointerDown={(event) => onPointerDown(event, "free")}
      />
    </div>
  );
}

function CommandConsole({
  inputRef,
  value,
  suggestion,
  message,
  error,
  onChange,
  onComplete,
  onExecute,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  suggestion: string;
  message: string;
  error: string;
  onChange: (value: string) => void;
  onComplete: () => void;
  onExecute: () => void;
}) {
  return (
    <div className="command-console">
      <div className="command-input-frame">
        <span className="command-ghost-line" aria-hidden>
          <span className="command-typed">{value}</span>
          <span className="command-ghost">{suggestion}</span>
        </span>
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          placeholder="arrow m1 to m2 type support"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onExecute();
            }
            if (event.key === "Tab") {
              event.preventDefault();
              onComplete();
            }
          }}
        />
      </div>
      <div className="command-feedback">{error ? <span className="command-error">{error}</span> : message ? <span>{message}</span> : <span>~ toggles console. Enter runs. Tab completes.</span>}</div>
    </div>
  );
}

function ProjectListItem({
  project,
  active,
  onSelect,
  onTogglePin,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const PinIcon = project.pinned ? Pin : PinOff;
  return (
    <div className={`project-item ${active ? "active" : ""}`}>
      <button type="button" className="project-pick" onClick={onSelect}>
        <span>{project.title || "Untitled Project"}</span>
        <small>
          {project.category} / {project.createdAt}
        </small>
      </button>
      <button type="button" className="tiny-button" title={project.pinned ? "Unpin project" : "Pin project"} onClick={onTogglePin}>
        <PinIcon size={14} />
      </button>
    </div>
  );
}

function PropertiesPanel({
  collapsed,
  currentProject,
  selectedModule,
  selectedArrow,
  onClose,
  onUpdateModule,
  onUpdateArrow,
}: {
  collapsed: boolean;
  currentProject: Project | null;
  selectedModule: FlowModule | null;
  selectedArrow: FlowArrow | null;
  onClose: () => void;
  onUpdateModule: (moduleId: string, updater: (module: FlowModule) => FlowModule) => void;
  onUpdateArrow: (arrowId: string, updater: (arrow: FlowArrow) => FlowArrow) => void;
}) {
  const relatedForModule = useMemo(() => {
    if (!currentProject || !selectedModule) return [];
    return currentProject.arrows
      .filter((arrow) => arrow.source === selectedModule.id || arrow.target === selectedModule.id)
      .map((arrow) => {
        const otherId = arrow.source === selectedModule.id ? arrow.target : arrow.source;
        const other = currentProject.modules.find((module) => module.id === otherId);
        return { arrow, other, direction: arrow.source === selectedModule.id ? "out" : "in" };
      });
  }, [currentProject, selectedModule]);

  const sourceModule = currentProject?.modules.find((module) => module.id === selectedArrow?.source) ?? null;
  const targetModule = currentProject?.modules.find((module) => module.id === selectedArrow?.target) ?? null;

  if (collapsed) {
    return (
      <aside className="properties-sidebar collapsed">
        <PanelRightOpen size={18} />
      </aside>
    );
  }

  return (
    <aside className="properties-sidebar">
      <div className="properties-header">
        <div>
          <div className="editor-title">Properties</div>
          <span>{selectedModule ? `Module ${selectedModule.data.shortId}` : selectedArrow ? "Arrow" : "No selection"}</span>
        </div>
        <button type="button" className="icon-button" title="Close properties" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {!selectedModule && !selectedArrow && (
        <div className="empty-panel">
          <Box size={24} />
          <p>Click or double-click a module or arrow to edit its properties.</p>
        </div>
      )}

      {selectedModule && (
        <div className="property-form">
          <label>
            Short ID
            <input value={selectedModule.data.shortId} readOnly />
          </label>

          <label>
            Type
            <select
              value={selectedModule.data.moduleType}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => ({
                  ...module,
                  data: { ...module.data, moduleType: event.target.value as FlowModuleData["moduleType"] },
                }))
              }
            >
              {MODULE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            Shape
            <select
              value={selectedModule.data.shape}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => ({
                  ...module,
                  data: { ...module.data, shape: event.target.value as FlowModuleData["shape"] },
                }))
              }
            >
              {MODULE_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
          </label>

          <label>
            Content
            <textarea
              rows={7}
              value={selectedModule.data.content}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => ({
                  ...module,
                  data: { ...module.data, content: event.target.value },
                }))
              }
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={selectedModule.data.latexEnabled}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => ({
                  ...module,
                  data: { ...module.data, latexEnabled: event.target.checked },
                }))
              }
            />
            Render LaTeX
          </label>

          <label>
            Status
            <select
              value={selectedModule.data.status}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => {
                  const status = event.target.value as FlowModuleData["status"];
                  return { ...module, data: { ...module.data, status, enabled: status === "enabled" } };
                })
              }
            >
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </label>

          <label>
            Note
            <textarea
              rows={5}
              value={selectedModule.data.note}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => ({
                  ...module,
                  data: { ...module.data, note: event.target.value },
                }))
              }
            />
          </label>

          <section className="related-section">
            <div className="editor-title">Related Arrows</div>
            {relatedForModule.length === 0 ? (
              <div className="empty-hint">No arrows</div>
            ) : (
              relatedForModule.map(({ arrow, other, direction }) => (
                <div className="related-item" key={arrow.id}>
                  <GitBranch size={14} />
                  <span>
                    {direction} / {arrow.data.arrowType} / {arrow.data.status}
                    <small>{other ? `${other.data.shortId} / ${other.data.moduleType}` : "Missing module"}</small>
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {selectedArrow && (
        <div className="property-form">
          <label>
            Type
            <select
              value={selectedArrow.data.arrowType}
              onChange={(event) =>
                onUpdateArrow(selectedArrow.id, (arrow) => ({
                  ...arrow,
                  data: { ...arrow.data, arrowType: event.target.value as FlowArrowData["arrowType"] },
                }))
              }
            >
              {ARROW_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={selectedArrow.data.status}
              onChange={(event) =>
                onUpdateArrow(selectedArrow.id, (arrow) => {
                  const status = event.target.value as FlowArrowData["status"];
                  return { ...arrow, data: { ...arrow.data, status, enabled: status === "enabled" } };
                })
              }
            >
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </label>

          <div className="direction-box">
            <div>
              <span>Direction</span>
              <strong>
                {sourceModule?.data.shortId ?? "missing"} {"->"} {targetModule?.data.shortId ?? "missing"}
              </strong>
            </div>
            <button
              type="button"
              className="action-button"
              onClick={() =>
                onUpdateArrow(selectedArrow.id, (arrow) => ({
                  ...arrow,
                  source: arrow.target,
                  target: arrow.source,
                  sourceHandle: arrow.targetHandle,
                  targetHandle: arrow.sourceHandle,
                }))
              }
            >
              <GitBranch size={15} />
              Reverse
            </button>
          </div>

          <label>
            Note
            <textarea
              rows={6}
              value={selectedArrow.data.note}
              onChange={(event) =>
                onUpdateArrow(selectedArrow.id, (arrow) => ({
                  ...arrow,
                  data: { ...arrow.data, note: event.target.value },
                }))
              }
            />
          </label>
        </div>
      )}
    </aside>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}
