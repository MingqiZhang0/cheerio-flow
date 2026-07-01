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
  useUpdateNodeInternals,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import katex from "katex";
import {
  Archive,
  Box,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  Diamond,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GripVertical,
  Hexagon,
  Layers3,
  MoreHorizontal,
  PanelRightOpen,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Save,
  Shapes,
  Square,
  Trash2,
  Triangle,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scanLightweightIntegrity, type LightweightIntegrityReport } from "./integrity";
import { applyGroupFolderMigration, chooseStorageRoot, createFullBackup, generateMigrationDryRunPlan, listFullBackups, loadDatabase, persistDatabase, removeProject, restoreFullBackup, switchStorageRoot } from "./storage";
import {
  ARROW_TYPES,
  MODULE_SHAPES,
  MODULE_TYPES,
  PROJECT_CATEGORIES,
  type AppState,
  type ArrowType,
  type BackupReport,
  type BackupSummary,
  type FlowArrow,
  type FlowArrowData,
  type FlowModule,
  type FlowModuleData,
  type MigrationApplyReport,
  type MigrationDryRunReport,
  type ModuleShape,
  type Project,
  type ProjectGroup,
  type RestoreReport,
  type SelectedElement,
  type PersistedData,
  type StorageReport,
} from "./types";
import {
  applyGroupMembership,
  applyModuleShapeSemantics,
  applyModuleTypeSemantics,
  createArrow,
  createEmptyGroup,
  createEmptyProject,
  createModule,
  getNextModuleShortId,
  normalizeModuleVisualSemantics,
  normalizeGroups,
  normalizeProjects,
  sortPinnedFirst,
} from "./utils";

type ModuleNodeType = Node<FlowModuleData, "module">;
type ArrowEdgeType = Edge<FlowArrowData>;
type SaveStatus = "saving" | "saved" | "error";
type BackupStatus = "idle" | "running" | "success" | "error";
type RestoreStatus = "idle" | "loading" | "running" | "success" | "error";
type MigrationDryRunStatus = "idle" | "running" | "success" | "error";
type MigrationApplyStatus = "idle" | "running" | "success" | "error";
type FolderPickerStatus = "idle" | "opening" | "error";
type CtrlWheelState = { x: number; y: number } | null;
type MoveMode = "x" | "y" | "free";
type ResizeEdge = "right" | "bottom" | "corner";
type SidebarResizeSide = "left" | "right";

const LEFT_SIDEBAR_DEFAULT_WIDTH = 320;
const LEFT_SIDEBAR_MIN_WIDTH = 240;
const LEFT_SIDEBAR_MAX_WIDTH = 560;
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 340;
const RIGHT_SIDEBAR_MIN_WIDTH = 280;
const RIGHT_SIDEBAR_MAX_WIDTH = 600;
const PROJECT_BROWSER_MIN_HEIGHT = 180;
const STORAGE_DRAWER_DEFAULT_HEIGHT = 360;
const STORAGE_DRAWER_MIN_HEIGHT = 160;
const STORAGE_DRAWER_MAX_RATIO = 0.65;
const MODULE_RESIZE_MIN_WIDTH = 170;
const MODULE_RESIZE_MAX_WIDTH = 2400;
const MODULE_RESIZE_MIN_HEIGHT = 96;
const MODULE_RESIZE_MAX_HEIGHT = 400;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampModuleWidth(value: number) {
  return clamp(value, MODULE_RESIZE_MIN_WIDTH, MODULE_RESIZE_MAX_WIDTH);
}

function clampModuleHeight(value: number) {
  return clamp(value, MODULE_RESIZE_MIN_HEIGHT, MODULE_RESIZE_MAX_HEIGHT);
}

function clampWithDefault(value: unknown, fallback: number, min: number, max: number) {
  return clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getPreviewItems<T>(items: T[], limit: number) {
  return {
    visible: items.slice(0, limit),
    remaining: Math.max(0, items.length - limit),
  };
}

function isCheerioFlowDataFolder(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] === "CheerioFlowData";
}

function normalizeWorkspacePath(path: string) {
  return path.trim().replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
}

function isResizableShape(shape: ModuleShape) {
  return shape === "rectangle" || shape === "ellipse";
}

function getPositiveDimension(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function getModuleNodeDimensions(node: ModuleNodeType) {
  const fallbackHeight = node.data.shape === "ellipse" ? 118 : 128;
  const width =
    getPositiveDimension(node.data.customWidth) ??
    getPositiveDimension(node.style?.width) ??
    getPositiveDimension(node.width) ??
    getPositiveDimension(node.measured?.width) ??
    MODULE_RESIZE_MIN_WIDTH;
  const height =
    getPositiveDimension(node.data.customHeight) ??
    getPositiveDimension(node.style?.height) ??
    getPositiveDimension(node.height) ??
    getPositiveDimension(node.measured?.height) ??
    fallbackHeight;
  return {
    width: clampModuleWidth(width),
    height: clampModuleHeight(height),
  };
}

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
  const style: React.CSSProperties = {};
  if (isResizableShape(module.data.shape) && typeof module.data.customWidth === "number" && module.data.customWidth > 0) {
    style.width = module.data.customWidth;
  }
  if (isResizableShape(module.data.shape) && typeof module.data.customHeight === "number" && module.data.customHeight > 0) {
    style.height = module.data.customHeight;
  }

  return {
    id: module.id,
    type: "module",
    position: module.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: module.data,
    style: Object.keys(style).length > 0 ? style : undefined,
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
      <svg className="module-shape-visual" viewBox="0 0 170 132" preserveAspectRatio="none" aria-hidden>
        <ellipse cx="85" cy="66" rx="76" ry="48" />
      </svg>
    );
  }

  return (
    <svg className="module-shape-visual" viewBox="0 0 170 132" preserveAspectRatio="none" aria-hidden>
      <rect x="9" y="18" width="152" height="96" rx="7" />
    </svg>
  );
}

const ModuleNode = memo(function ModuleNode({ id, data, selected }: NodeProps<ModuleNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const customStyle = useMemo(() => {
    const style: React.CSSProperties = {};
    if (isResizableShape(data.shape) && typeof data.customWidth === "number" && data.customWidth > 0) {
      style.width = data.customWidth;
    }
    if (isResizableShape(data.shape) && typeof data.customHeight === "number" && data.customHeight > 0) {
      style.height = data.customHeight;
    }
    return Object.keys(style).length > 0 ? style : undefined;
  }, [data.customHeight, data.customWidth, data.shape]);
  const hasCustomDimensions = Boolean(customStyle);
  const html = useMemo(() => {
    if (!data.latexEnabled) return "";
    try {
      return renderLatex(data.content);
    } catch {
      return "";
    }
  }, [data.content, data.latexEnabled]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updateNodeInternals(id));
    return () => window.cancelAnimationFrame(frame);
  }, [data.content, data.customHeight, data.customWidth, data.latexEnabled, data.moduleType, data.shape, id, updateNodeInternals]);

  return (
    <div
      className={`module-node shape-${SHAPE_CLASS[data.shape]} ${hasCustomDimensions ? "custom-sized" : ""} ${selected ? "selected" : ""} ${data.enabled ? "" : "disabled"}`}
      style={customStyle}
    >
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
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true'], [contenteditable='plaintext-only'], [role='button'], [role='dialog'], dialog, [aria-modal='true']"));
}

function isReactFlowTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(".react-flow"));
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
    <button className={`icon-button ${active ? "active" : ""}`} type="button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

function AppShell() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [loadedStorageRoot, setLoadedStorageRoot] = useState("");
  const [integrityReport, setIntegrityReport] = useState<LightweightIntegrityReport | null>(null);
  const [integrityBannerDismissed, setIntegrityBannerDismissed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [dataVersion, setDataVersion] = useState(2);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState(false);
  const [projectActionMenuId, setProjectActionMenuId] = useState<string | null>(null);
  const [isStorageDrawerOpen, setIsStorageDrawerOpen] = useState(false);
  const [storageDrawerHeight, setStorageDrawerHeight] = useState(STORAGE_DRAWER_DEFAULT_HEIGHT);
  const [lastStorageDrawerHeight, setLastStorageDrawerHeight] = useState(STORAGE_DRAWER_DEFAULT_HEIGHT);
  const [isDraggingStorageDrawer, setIsDraggingStorageDrawer] = useState(false);
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false);
  const [propertiesSidebarCollapsed, setPropertiesSidebarCollapsed] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(RIGHT_SIDEBAR_DEFAULT_WIDTH);
  const [savedLeftSidebarWidth, setSavedLeftSidebarWidth] = useState(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const [savedRightSidebarWidth, setSavedRightSidebarWidth] = useState(RIGHT_SIDEBAR_DEFAULT_WIDTH);
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
  const [folderPickerStatus, setFolderPickerStatus] = useState<FolderPickerStatus>("idle");
  const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
  const [storageRootInputWarning, setStorageRootInputWarning] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>("idle");
  const [backupReport, setBackupReport] = useState<BackupReport | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>("idle");
  const [restoreBackups, setRestoreBackups] = useState<BackupSummary[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreReport, setRestoreReport] = useState<RestoreReport | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [migrationDryRunStatus, setMigrationDryRunStatus] = useState<MigrationDryRunStatus>("idle");
  const [migrationDryRunReport, setMigrationDryRunReport] = useState<MigrationDryRunReport | null>(null);
  const [migrationDryRunContext, setMigrationDryRunContext] = useState<{ storageRoot: string; dataDir: string } | null>(null);
  const [migrationDryRunError, setMigrationDryRunError] = useState<string | null>(null);
  const [migrationApplyStatus, setMigrationApplyStatus] = useState<MigrationApplyStatus>("idle");
  const [migrationApplyReport, setMigrationApplyReport] = useState<MigrationApplyReport | null>(null);
  const [migrationApplyError, setMigrationApplyError] = useState<string | null>(null);
  const [migrationConfirmation, setMigrationConfirmation] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleMessage, setConsoleMessage] = useState("");
  const [consoleError, setConsoleError] = useState("");
  const [ctrlWheel, setCtrlWheel] = useState<CtrlWheelState>(null);
  const [isPointerOverCanvas, setIsPointerOverCanvas] = useState(false);
  const consoleInputRef = useRef<HTMLInputElement | null>(null);
  const projectSidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const isVisualDraggingRef = useRef(false);
  const flowNodesRef = useRef<ModuleNodeType[]>([]);
  const hydratedProjectIdRef = useRef<string | null>(null);
  const capturedPointerRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const resetInteractionStateRef = useRef<(options?: { clearPlacement?: boolean; clearSelection?: boolean }) => void>(() => undefined);
  const sidebarResizeRef = useRef<{
    side: SidebarResizeSide;
    startX: number;
    startWidth: number;
    latestWidth: number;
    pointerId: number;
    element: HTMLElement;
  } | null>(null);
  const storageDrawerDragRef = useRef<{
    startY: number;
    startHeight: number;
    latestHeight: number;
    pointerId: number;
    element: HTMLElement;
  } | null>(null);
  const gizmoDragRef = useRef<{
    nodeId: string;
    mode: MoveMode;
    startPointer: { x: number; y: number };
    startPosition: { x: number; y: number };
    frame: number | null;
    lastPointer: { x: number; y: number };
  } | null>(null);
  const resizeDragRef = useRef<{
    nodeId: string;
    edge: ResizeEdge;
    pointerId: number;
    startClient: { x: number; y: number };
    startDimensions: { width: number; height: number };
    lastClient: { x: number; y: number };
    frame: number | null;
    target: HTMLElement | null;
    viewportZoom: number;
  } | null>(null);
  const loadedRef = useRef(false);
  const canPersistRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const projectsRef = useRef<Project[]>([]);
  const groupsRef = useRef<ProjectGroup[]>([]);
  const appStateRef = useRef<AppState>({
    dataVersion: 2,
    currentProjectId: null,
    projectSidebarCollapsed: false,
    propertiesSidebarCollapsed: true,
    leftSidebarWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
    rightSidebarWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
  });
  const lastPointerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const lastPointerTargetRef = useRef<EventTarget | null>(null);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null,
    [currentProjectId, projects],
  );
  const selectedBackup = useMemo(
    () => restoreBackups.find((backup) => backup.backupId === selectedBackupId) ?? null,
    [restoreBackups, selectedBackupId],
  );

  const invalidateMigrationState = useCallback(() => {
    setMigrationDryRunStatus("idle");
    setMigrationDryRunReport(null);
    setMigrationDryRunContext(null);
    setMigrationDryRunError(null);
    setMigrationApplyStatus("idle");
    setMigrationApplyReport(null);
    setMigrationApplyError(null);
    setMigrationConfirmation("");
  }, []);

  const appState = useMemo<AppState>(
    () => ({
      dataVersion,
      currentProjectId: currentProject?.id ?? null,
      projectSidebarCollapsed,
      propertiesSidebarCollapsed,
      leftSidebarWidth: savedLeftSidebarWidth,
      rightSidebarWidth: savedRightSidebarWidth,
    }),
    [currentProject?.id, dataVersion, projectSidebarCollapsed, propertiesSidebarCollapsed, savedLeftSidebarWidth, savedRightSidebarWidth],
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
    if (!loadedRef.current || !canPersistRef.current) return;
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

  const refreshBackups = useCallback(async () => {
    setRestoreStatus("loading");
    setRestoreError(null);
    try {
      const backups = await listFullBackups();
      setRestoreBackups(backups);
      setSelectedBackupId((current) => (current && backups.some((backup) => backup.backupId === current) ? current : backups[0]?.backupId ?? ""));
      setRestoreStatus("idle");
    } catch (reason: unknown) {
      setRestoreStatus("error");
      setRestoreError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const hydrateLoadedData = useCallback(
    (data: PersistedData) => {
      invalidateMigrationState();
      const normalizedProjects = normalizeProjects(data.projects);
      const loadedGroups = data.groups ?? [];
      const nextIntegrityReport = scanLightweightIntegrity(normalizedProjects, loadedGroups, data.appState);
      setIntegrityReport(nextIntegrityReport);
      setIntegrityBannerDismissed(false);
      if (nextIntegrityReport.ok) {
        console.info("Lightweight integrity scan passed.");
      } else {
        console.warn("Lightweight integrity scan found issues.", nextIntegrityReport.issues);
      }
      const normalizedGroups = normalizeGroups(loadedGroups, normalizedProjects);
      const hydratedProjects = applyGroupMembership(normalizedProjects, normalizedGroups);
      const firstProject = hydratedProjects[0] ?? createEmptyProject();
      const nextProjects = hydratedProjects.length > 0 ? hydratedProjects : [firstProject];
      groupsRef.current = normalizedGroups;
      hydratedProjectIdRef.current = null;
      setDataDir(data.dataDir);
      setLoadedStorageRoot(data.storageRoot ?? "");
      setStorageReport(data.report ?? null);
      setStorageRootInput(data.storageRoot ?? "");
      setDataVersion(data.appState.dataVersion);
      setGroups(normalizedGroups);
      updateProjects(() => nextProjects);
      setCurrentProjectId(data.appState.currentProjectId ?? firstProject.id);
      setProjectSidebarCollapsed(data.appState.projectSidebarCollapsed);
      setPropertiesSidebarCollapsed(data.appState.propertiesSidebarCollapsed);
      const nextLeftWidth = clampWithDefault(data.appState.leftSidebarWidth, LEFT_SIDEBAR_DEFAULT_WIDTH, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH);
      const nextRightWidth = clampWithDefault(data.appState.rightSidebarWidth, RIGHT_SIDEBAR_DEFAULT_WIDTH, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH);
      setLeftSidebarWidth(nextLeftWidth);
      setRightSidebarWidth(nextRightWidth);
      setSavedLeftSidebarWidth(nextLeftWidth);
      setSavedRightSidebarWidth(nextRightWidth);
      skipNextAutosaveRef.current = true;
      canPersistRef.current = true;
      loadedRef.current = true;
      setLoaded(true);
    },
    [invalidateMigrationState, updateProjects],
  );

  useEffect(() => {
    let cancelled = false;
    loadDatabase()
      .then((data) => {
        if (cancelled) return;
        hydrateLoadedData(data);
        void refreshBackups();
      })
      .catch((reason: unknown) => {
        console.error("Failed to load Cheerio Flow data", reason);
        setError(reason instanceof Error ? reason.message : String(reason));
        setIntegrityReport(null);
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        skipNextAutosaveRef.current = false;
        canPersistRef.current = false;
        loadedRef.current = false;
        invalidateMigrationState();
        setDataDir("");
        setLoadedStorageRoot("");
        setSaveStatus("error");
        setLoaded(true);
        void refreshBackups();
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateLoadedData, invalidateMigrationState, refreshBackups]);

  useEffect(() => {
    if (!loaded || !canPersistRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
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
      lastPointerTargetRef.current = event.target;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (sidebarResizeRef.current) return;
      if (storageDrawerDragRef.current) return;
      if (resizeDragRef.current) return;
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
        if (!isPointerOverCanvas || !isReactFlowTarget(lastPointerTargetRef.current) || isEditableTarget(lastPointerTargetRef.current)) return;
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
  }, [consoleOpen, isPointerOverCanvas]);

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
      const activeResize = resizeDragRef.current;
      if (activeResize?.frame !== null && activeResize?.frame !== undefined) {
        window.cancelAnimationFrame(activeResize.frame);
      }
      if (activeResize?.target?.hasPointerCapture?.(activeResize.pointerId)) {
        activeResize.target.releasePointerCapture(activeResize.pointerId);
      }
      const captured = capturedPointerRef.current;
      if (captured?.element.hasPointerCapture?.(captured.pointerId)) {
        captured.element.releasePointerCapture(captured.pointerId);
      }
      const sidebarResize = sidebarResizeRef.current;
      if (sidebarResize?.element.hasPointerCapture?.(sidebarResize.pointerId)) {
        sidebarResize.element.releasePointerCapture(sidebarResize.pointerId);
      }
      const storageDrawerDrag = storageDrawerDragRef.current;
      if (storageDrawerDrag?.element.hasPointerCapture?.(storageDrawerDrag.pointerId)) {
        storageDrawerDrag.element.releasePointerCapture(storageDrawerDrag.pointerId);
      }
      sidebarResizeRef.current = null;
      storageDrawerDragRef.current = null;
      capturedPointerRef.current = null;
      gizmoDragRef.current = null;
      resizeDragRef.current = null;
      isVisualDraggingRef.current = false;
      setIsDraggingStorageDrawer(false);
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
      if (!gizmoDragRef.current && !resizeDragRef.current && !storageDrawerDragRef.current && isVisualDraggingRef.current) resetInteractionState();
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

  const commitNodeDimensions = useCallback(
    (nodeId: string, customWidth: number, customHeight: number) => {
      const width = clampModuleWidth(customWidth);
      const height = clampModuleHeight(customHeight);

      setFlowNodes((previous) => {
        const next = previous.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                style: {
                  ...node.style,
                  width,
                  height,
                },
                data: {
                  ...node.data,
                  customWidth: width,
                  customHeight: height,
                },
              }
            : node,
        );
        flowNodesRef.current = next;
        return next;
      });

      updateProjects((previous) =>
        previous.map((project) =>
          project.id === currentProjectId
            ? {
                ...project,
                modules: project.modules.map((module) =>
                  module.id === nodeId
                    ? {
                        ...module,
                        data: {
                          ...module.data,
                          customWidth: width,
                          customHeight: height,
                        },
                      }
                    : module,
                ),
              }
            : project,
        ),
      );
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

  const startSidebarResize = useCallback((event: React.PointerEvent, side: SidebarResizeSide) => {
    event.preventDefault();
    event.stopPropagation();
    resetInteractionState();

    const pointerTarget = event.currentTarget as HTMLElement;
    const startWidth = side === "left" ? leftSidebarWidth : rightSidebarWidth;
    sidebarResizeRef.current = {
      side,
      startX: event.clientX,
      startWidth,
      latestWidth: startWidth,
      pointerId: event.pointerId,
      element: pointerTarget,
    };
    pointerTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const active = sidebarResizeRef.current;
      if (!active) return;
      const delta = moveEvent.clientX - active.startX;
      if (active.side === "left") {
        const nextWidth = clamp(active.startWidth + delta, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH);
        active.latestWidth = nextWidth;
        setLeftSidebarWidth(nextWidth);
      } else {
        const nextWidth = clamp(active.startWidth - delta, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH);
        active.latestWidth = nextWidth;
        setRightSidebarWidth(nextWidth);
      }
    };

    const finishResize = () => {
      const active = sidebarResizeRef.current;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("blur", finishResize);
      document.removeEventListener("mouseup", finishResize);
      document.removeEventListener("pointerup", finishResize);
      if (active?.element.hasPointerCapture?.(active.pointerId)) {
        active.element.releasePointerCapture(active.pointerId);
      }
      if (active?.side === "left") {
        setSavedLeftSidebarWidth(active.latestWidth);
      }
      if (active?.side === "right") {
        setSavedRightSidebarWidth(active.latestWidth);
      }
      sidebarResizeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("blur", finishResize);
    document.addEventListener("mouseup", finishResize);
    document.addEventListener("pointerup", finishResize);
  }, [leftSidebarWidth, resetInteractionState, rightSidebarWidth]);

  const getStorageDrawerMaxHeight = useCallback(() => {
    const bodyHeight = projectSidebarBodyRef.current?.clientHeight ?? window.innerHeight;
    const detailsPanel = projectSidebarBodyRef.current?.querySelector<HTMLElement>(".project-details-panel");
    const detailsHeight = detailsPanel?.offsetHeight ?? 0;
    const maxByRatio = Math.floor(bodyHeight * STORAGE_DRAWER_MAX_RATIO);
    const maxByAvailableSpace = Math.floor(bodyHeight - PROJECT_BROWSER_MIN_HEIGHT - detailsHeight);
    return Math.max(STORAGE_DRAWER_MIN_HEIGHT, Math.min(maxByRatio, maxByAvailableSpace));
  }, []);

  const clampStorageDrawerHeight = useCallback(
    (height: number) => clamp(height, STORAGE_DRAWER_MIN_HEIGHT, getStorageDrawerMaxHeight()),
    [getStorageDrawerMaxHeight],
  );

  const hideStorageDrawer = useCallback(() => {
    const nextHeight = clampStorageDrawerHeight(storageDrawerHeight);
    setLastStorageDrawerHeight(nextHeight);
    setIsStorageDrawerOpen(false);
    setIsDraggingStorageDrawer(false);
  }, [clampStorageDrawerHeight, storageDrawerHeight]);

  const showStorageDrawer = useCallback(() => {
    const nextHeight = clampStorageDrawerHeight(lastStorageDrawerHeight || STORAGE_DRAWER_DEFAULT_HEIGHT);
    setStorageDrawerHeight(nextHeight);
    setLastStorageDrawerHeight(nextHeight);
    setIsStorageDrawerOpen(true);
  }, [clampStorageDrawerHeight, lastStorageDrawerHeight]);

  const startStorageDrawerResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resetInteractionState();

      const pointerTarget = event.currentTarget as HTMLElement;
      const startHeight = clampStorageDrawerHeight(storageDrawerHeight);
      storageDrawerDragRef.current = {
        startY: event.clientY,
        startHeight,
        latestHeight: startHeight,
        pointerId: event.pointerId,
        element: pointerTarget,
      };
      pointerTarget.setPointerCapture?.(event.pointerId);
      setIsDraggingStorageDrawer(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ns-resize";

      const onPointerMove = (moveEvent: PointerEvent) => {
        const active = storageDrawerDragRef.current;
        if (!active) return;
        const delta = moveEvent.clientY - active.startY;
        const nextHeight = clampStorageDrawerHeight(active.startHeight - delta);
        active.latestHeight = nextHeight;
        setStorageDrawerHeight(nextHeight);
      };

      const finishResize = () => {
        const active = storageDrawerDragRef.current;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
        window.removeEventListener("blur", finishResize);
        document.removeEventListener("mouseup", finishResize);
        document.removeEventListener("pointerup", finishResize);
        if (active?.element.hasPointerCapture?.(active.pointerId)) {
          active.element.releasePointerCapture(active.pointerId);
        }
        if (active) {
          setLastStorageDrawerHeight(active.latestHeight);
        }
        storageDrawerDragRef.current = null;
        setIsDraggingStorageDrawer(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finishResize);
      window.addEventListener("pointercancel", finishResize);
      window.addEventListener("blur", finishResize);
      document.addEventListener("mouseup", finishResize);
      document.addEventListener("pointerup", finishResize);
    },
    [clampStorageDrawerHeight, resetInteractionState, storageDrawerHeight],
  );

  const startResizeDrag = useCallback(
    (event: React.PointerEvent, edge: ResizeEdge) => {
      event.preventDefault();
      event.stopPropagation();
      if (gizmoDragRef.current || resizeDragRef.current || isVisualDraggingRef.current) return;
      if (selectedElement?.kind !== "module") return;

      const selectedNode = flowNodes.find((node) => node.id === selectedElement.id);
      if (!selectedNode || !isResizableShape(selectedNode.data.shape)) return;

      const startDimensions = getModuleNodeDimensions(selectedNode);
      const pointerTarget = event.currentTarget as HTMLElement;
      resizeDragRef.current = {
        nodeId: selectedNode.id,
        edge,
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startDimensions,
        lastClient: { x: event.clientX, y: event.clientY },
        frame: null,
        target: pointerTarget,
        viewportZoom: viewport.zoom || 1,
      };
      isVisualDraggingRef.current = true;
      setCtrlWheel(null);
      pointerTarget.setPointerCapture?.(event.pointerId);
      document.body.style.userSelect = "none";
      document.body.style.cursor = edge === "right" ? "ew-resize" : edge === "bottom" ? "ns-resize" : "nwse-resize";

      const getResizeDimensions = (active: NonNullable<typeof resizeDragRef.current>) => {
        const deltaX = (active.lastClient.x - active.startClient.x) / active.viewportZoom;
        const deltaY = (active.lastClient.y - active.startClient.y) / active.viewportZoom;
        const nextWidth = active.edge === "bottom" ? active.startDimensions.width : active.startDimensions.width + deltaX;
        const nextHeight = active.edge === "right" ? active.startDimensions.height : active.startDimensions.height + deltaY;
        return {
          width: clampModuleWidth(nextWidth),
          height: clampModuleHeight(nextHeight),
        };
      };

      const applyResize = () => {
        const active = resizeDragRef.current;
        if (!active) return;
        active.frame = null;
        const nextDimensions = getResizeDimensions(active);
        setFlowNodes((previous) => {
          const next = previous.map((node) =>
            node.id === active.nodeId
              ? {
                  ...node,
                  style: {
                    ...node.style,
                    width: nextDimensions.width,
                    height: nextDimensions.height,
                  },
                  data: {
                    ...node.data,
                    customWidth: nextDimensions.width,
                    customHeight: nextDimensions.height,
                  },
                }
              : node,
          );
          flowNodesRef.current = next;
          return next;
        });
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        const active = resizeDragRef.current;
        if (!active || moveEvent.pointerId !== active.pointerId) return;
        active.lastClient = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (active.frame === null) active.frame = window.requestAnimationFrame(applyResize);
      };

      let resizeFinished = false;
      const finishResize = (finishEvent?: Event) => {
        const active = resizeDragRef.current;
        if (finishEvent instanceof PointerEvent && active && finishEvent.pointerId !== active.pointerId) return;
        if (resizeFinished) return;
        resizeFinished = true;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
        window.removeEventListener("blur", finishResize);
        document.removeEventListener("mouseup", finishResize);
        document.removeEventListener("pointerup", finishResize);
        if (!active) {
          resetInteractionState();
          return;
        }
        if (active.frame !== null) window.cancelAnimationFrame(active.frame);
        const finalDimensions = getResizeDimensions(active);
        if (active.target?.hasPointerCapture?.(active.pointerId)) {
          active.target.releasePointerCapture(active.pointerId);
        }
        resizeDragRef.current = null;
        isVisualDraggingRef.current = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        commitNodeDimensions(active.nodeId, finalDimensions.width, finalDimensions.height);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finishResize);
      window.addEventListener("pointercancel", finishResize);
      window.addEventListener("blur", finishResize);
      document.addEventListener("mouseup", finishResize);
      document.addEventListener("pointerup", finishResize);
    },
    [commitNodeDimensions, flowNodes, resetInteractionState, selectedElement, setFlowNodes, viewport.zoom],
  );

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
    setProjectActionMenuId(null);
    setSelectedElement(null);
    setPropertiesSidebarCollapsed(true);
  }, [projects.length, resetInteractionState, updateProjects]);

  const selectProject = useCallback(
    async (projectId: string) => {
      setProjectActionMenuId(null);
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
    setIsProjectDetailsOpen(false);
    setProjectActionMenuId(null);
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

  const handleStorageRootInputChange = useCallback((value: string) => {
    setStorageRootInput(value);
    setStorageRootInputWarning(isCheerioFlowDataFolder(value) ? "You selected a folder named CheerioFlowData. Choose its parent folder so the app can create/use CheerioFlowData inside it." : null);
    if (normalizeWorkspacePath(value) !== normalizeWorkspacePath(loadedStorageRoot)) {
      invalidateMigrationState();
    }
  }, [invalidateMigrationState, loadedStorageRoot]);

  const handleBrowseStorageRoot = useCallback(async () => {
    setFolderPickerStatus("opening");
    setFolderPickerError(null);

    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose storage parent folder",
      });
      const selectedPath = Array.isArray(selected) ? selected[0] ?? "" : selected ?? "";

      if (!selectedPath) {
        setFolderPickerStatus("idle");
        return;
      }

      if (normalizeWorkspacePath(selectedPath) !== normalizeWorkspacePath(loadedStorageRoot)) {
        invalidateMigrationState();
      }
      setStorageRootInput(selectedPath);
      setStorageRootInputWarning(isCheerioFlowDataFolder(selectedPath) ? "You selected a folder named CheerioFlowData. Choose its parent folder so the app can create/use CheerioFlowData inside it." : null);
      setFolderPickerStatus("idle");
    } catch (reason: unknown) {
      setFolderPickerStatus("error");
      setFolderPickerError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [invalidateMigrationState, loadedStorageRoot]);

  const openProjectDetails = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
    setIsProjectDetailsOpen(true);
    setProjectActionMenuId(null);
  }, []);

  const applyStorageRoot = useCallback(async () => {
    invalidateMigrationState();
    setSaveStatus("saving");
    const shouldSaveCurrentData = canPersistRef.current;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    canPersistRef.current = false;
    loadedRef.current = false;
    try {
      const data = shouldSaveCurrentData
        ? await chooseStorageRoot(storageRootInput, projectsRef.current, groupsRef.current, appStateRef.current)
        : await switchStorageRoot(storageRootInput);
      hydrateLoadedData(data);
      void refreshBackups();
      setSaveStatus("saved");
      setError(null);
      console.info(shouldSaveCurrentData ? "Cheerio Flow storage root set" : "Cheerio Flow storage root switched", data.report);
    } catch (reason: unknown) {
      console.error("Failed to apply storage root", reason);
      loadedRef.current = false;
      canPersistRef.current = false;
      invalidateMigrationState();
      setDataDir("");
      setLoadedStorageRoot("");
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [hydrateLoadedData, invalidateMigrationState, refreshBackups, storageRootInput]);

  const handleCreateFullBackup = useCallback(async () => {
    if (!canPersistRef.current) {
      setBackupStatus("error");
      setBackupReport(null);
      setBackupError("Cannot create backup because local data did not load successfully.");
      return;
    }

    setBackupStatus("running");
    setBackupError(null);
    try {
      const report = await createFullBackup();
      setBackupReport(report);
      setBackupStatus("success");
    } catch (reason: unknown) {
      setBackupReport(null);
      setBackupStatus("error");
      setBackupError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const handleRefreshFullBackups = useCallback(async () => {
    await refreshBackups();
  }, [refreshBackups]);

  const handleRestoreFullBackup = useCallback(async () => {
    if (!selectedBackupId) {
      setRestoreStatus("error");
      setRestoreError("Choose a backup before restoring.");
      return;
    }
    if (restoreConfirmation !== "RESTORE") {
      setRestoreStatus("error");
      setRestoreError("Type RESTORE to confirm this recovery operation.");
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    invalidateMigrationState();
    canPersistRef.current = false;
    loadedRef.current = false;
    setRestoreStatus("running");
    setRestoreError(null);
    setRestoreReport(null);
    try {
      const report = await restoreFullBackup(selectedBackupId);
      setRestoreReport(report);
      const data = await loadDatabase();
      hydrateLoadedData(data);
      setRestoreConfirmation("");
      setSaveStatus("saved");
      setError(null);
      setRestoreStatus("success");
    } catch (reason: unknown) {
      setRestoreStatus("error");
      const restoreMessage = reason instanceof Error ? reason.message : String(reason);
      invalidateMigrationState();
      setRestoreError(restoreMessage);
      setSaveStatus("error");
      try {
        const data = await loadDatabase();
        hydrateLoadedData(data);
        setError(restoreMessage);
      } catch (loadReason: unknown) {
        canPersistRef.current = false;
        loadedRef.current = false;
        invalidateMigrationState();
        setDataDir("");
        setLoadedStorageRoot("");
        const loadMessage = loadReason instanceof Error ? loadReason.message : String(loadReason);
        setError(`${restoreMessage} Reload also failed: ${loadMessage}`);
      }
    }
  }, [hydrateLoadedData, invalidateMigrationState, restoreConfirmation, selectedBackupId]);

  const handleGenerateMigrationDryRunPlan = useCallback(async () => {
    invalidateMigrationState();
    if (!loadedRef.current || !canPersistRef.current) {
      setMigrationDryRunStatus("error");
      setMigrationDryRunError("Load failed. Fix or restore the workspace before running migration dry-run.");
      return;
    }
    setMigrationDryRunStatus("running");
    setMigrationDryRunError(null);
    try {
      const report = await generateMigrationDryRunPlan();
      setMigrationDryRunReport(report);
      setMigrationDryRunContext({ storageRoot: loadedStorageRoot, dataDir });
      setMigrationDryRunStatus("success");
    } catch (reason: unknown) {
      setMigrationDryRunReport(null);
      setMigrationDryRunContext(null);
      setMigrationDryRunStatus("error");
      setMigrationDryRunError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [dataDir, invalidateMigrationState, loadedStorageRoot]);

  const isCurrentMigrationReport = useCallback(
    (report: MigrationDryRunReport | null) => {
      if (!report || !migrationDryRunContext || !loadedRef.current || !canPersistRef.current) return false;
      return (
        normalizeWorkspacePath(migrationDryRunContext.storageRoot) === normalizeWorkspacePath(loadedStorageRoot) &&
        normalizeWorkspacePath(migrationDryRunContext.dataDir) === normalizeWorkspacePath(dataDir) &&
        normalizeWorkspacePath(report.sourceDataDir) === normalizeWorkspacePath(dataDir)
      );
    },
    [dataDir, loadedStorageRoot, migrationDryRunContext],
  );

  const handleApplyGroupFolderMigration = useCallback(async () => {
    if (!migrationDryRunReport) {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Run a migration dry-run before applying migration.");
      return;
    }
    if (!isCurrentMigrationReport(migrationDryRunReport)) {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Run dry-run again for the current workspace.");
      setMigrationConfirmation("");
      return;
    }
    if (!loadedRef.current || !canPersistRef.current) {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Load failed. Fix or restore the workspace before applying migration.");
      setMigrationConfirmation("");
      return;
    }
    if (migrationApplyStatus === "running" || restoreStatus === "running" || saveStatus === "saving") {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Wait for the current storage operation to finish, then run dry-run again.");
      setMigrationConfirmation("");
      return;
    }
    if (migrationDryRunReport.alreadyMigrated || migrationDryRunReport.sourceDataVersion === 2) {
      setMigrationApplyStatus("success");
      setMigrationApplyError(null);
      return;
    }
    if (migrationDryRunReport.sourceDataVersion !== 1 || migrationDryRunReport.targetDataVersion !== 2) {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Only dataVersion 1 can be migrated to dataVersion 2.");
      return;
    }
    if (migrationDryRunReport.summary.blockerCount > 0) {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Resolve dry-run blockers before applying migration.");
      return;
    }
    if (migrationConfirmation !== "MIGRATE") {
      setMigrationApplyStatus("error");
      setMigrationApplyError("Type MIGRATE to confirm this migration.");
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    invalidateMigrationState();
    canPersistRef.current = false;
    loadedRef.current = false;
    setMigrationApplyStatus("running");
    setMigrationApplyError(null);
    setMigrationApplyReport(null);
    try {
      const report = await applyGroupFolderMigration();
      if (report.blockers.length > 0) {
        throw new Error(report.blockers.join(" | "));
      }
      let data: PersistedData;
      try {
        data = await loadDatabase();
      } catch (loadReason: unknown) {
        canPersistRef.current = false;
        loadedRef.current = false;
        invalidateMigrationState();
        setDataDir("");
        setLoadedStorageRoot("");
        const loadMessage = loadReason instanceof Error ? loadReason.message : String(loadReason);
        setSaveStatus("error");
        setMigrationApplyStatus("error");
        setMigrationApplyError(`Migration applied, but reload failed: ${loadMessage}`);
        setError(`Migration applied, but reload failed: ${loadMessage}`);
        return;
      }
      hydrateLoadedData(data);
      void refreshBackups();
      setMigrationApplyReport(report);
      setMigrationConfirmation("");
      setSaveStatus("saved");
      setError(null);
      setMigrationApplyStatus("success");
    } catch (reason: unknown) {
      const migrationMessage = reason instanceof Error ? reason.message : String(reason);
      invalidateMigrationState();
      setSaveStatus("error");
      try {
        const data = await loadDatabase();
        hydrateLoadedData(data);
        setError(migrationMessage);
        setMigrationApplyStatus("error");
        setMigrationApplyError(migrationMessage);
      } catch (loadReason: unknown) {
        canPersistRef.current = false;
        loadedRef.current = false;
        invalidateMigrationState();
        setDataDir("");
        setLoadedStorageRoot("");
        const loadMessage = loadReason instanceof Error ? loadReason.message : String(loadReason);
        setMigrationApplyStatus("error");
        setMigrationApplyError(`${migrationMessage} Reload also failed: ${loadMessage}`);
        setError(`${migrationMessage} Reload also failed: ${loadMessage}`);
      }
    }
  }, [hydrateLoadedData, invalidateMigrationState, isCurrentMigrationReport, migrationApplyStatus, migrationConfirmation, migrationDryRunReport, refreshBackups, restoreStatus, saveStatus]);

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
    if (resizeDragRef.current) return;
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
      if (resizeDragRef.current) return;
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
      const rawModule = updater(currentModule);
      const nextData =
        rawModule.data.moduleType !== currentModule.data.moduleType && rawModule.data.shape === currentModule.data.shape
          ? applyModuleTypeSemantics(rawModule.data, rawModule.data.moduleType)
          : rawModule.data.shape !== currentModule.data.shape && rawModule.data.moduleType === currentModule.data.moduleType
            ? applyModuleShapeSemantics(rawModule.data, rawModule.data.shape)
            : normalizeModuleVisualSemantics(rawModule.data);
      const nextModule = { ...rawModule, data: nextData };
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
  const showIntegrityBanner = Boolean(integrityReport && !integrityReport.ok && !integrityBannerDismissed);
  const currentMigrationDryRunReport = isCurrentMigrationReport(migrationDryRunReport) ? migrationDryRunReport : null;
  const migrationBlockerPreview = currentMigrationDryRunReport ? getPreviewItems(currentMigrationDryRunReport.blockers, 10) : null;
  const migrationWarningPreview = currentMigrationDryRunReport ? getPreviewItems(currentMigrationDryRunReport.warnings, 10) : null;
  const migrationOperationPreview = currentMigrationDryRunReport ? getPreviewItems(currentMigrationDryRunReport.plannedOperations, 20) : null;
  const migrationStorageOperationRunning = migrationApplyStatus === "running" || restoreStatus === "running" || saveStatus === "saving";
  const migrationCanRunDryRun = loadedRef.current && canPersistRef.current && !migrationStorageOperationRunning;
  const migrationCanUseDryRun = Boolean(
    currentMigrationDryRunReport &&
      !currentMigrationDryRunReport.alreadyMigrated &&
      currentMigrationDryRunReport.sourceDataVersion === 1 &&
      currentMigrationDryRunReport.targetDataVersion === 2 &&
      currentMigrationDryRunReport.summary.blockerCount === 0 &&
      migrationCanRunDryRun,
  );
  const migrationCanApply = migrationCanUseDryRun && migrationConfirmation === "MIGRATE";
  const effectiveStorageDrawerHeight = clampStorageDrawerHeight(storageDrawerHeight);
  const storageRootControls = (
    <>
      <label>
        Storage parent folder
        <input value={storageRootInput} onChange={(event) => handleStorageRootInputChange(event.target.value)} />
      </label>
      <div className="empty-hint">Choose a parent folder. CheerioFlowData will be created inside it.</div>
      {storageRootInputWarning && (
        <div className="backup-result backup-result-warning">
          <span>{storageRootInputWarning}</span>
        </div>
      )}
      {folderPickerStatus === "error" && folderPickerError && (
        <div className="backup-result backup-result-error">
          <strong>Could not open folder picker: {folderPickerError}</strong>
        </div>
      )}
    </>
  );
  const storageRootActions = (applyLabel: string) => (
    <div className="storage-root-actions">
      <button className="action-button" type="button" onClick={() => void handleBrowseStorageRoot()} disabled={folderPickerStatus === "opening"}>
        <FolderOpen size={15} />
        {folderPickerStatus === "opening" ? "Opening..." : "Browse..."}
      </button>
      <button className="action-button" type="button" onClick={() => void applyStorageRoot()}>
        <Save size={15} />
        {applyLabel}
      </button>
    </div>
  );
  const backupRestorePanel = (
    <>
      <button className="action-button" type="button" onClick={() => void handleCreateFullBackup()} disabled={backupStatus === "running" || !canPersistRef.current}>
        <Archive size={15} />
        {backupStatus === "running" ? "Creating Backup..." : "Create Full Backup"}
      </button>
      {backupStatus === "success" && backupReport && (
        <div className="backup-result backup-result-panel backup-result-success">
          <strong className="backup-path">Backup created: {backupReport.backupDir}</strong>
          <span>
            Copied {backupReport.copiedFileCount} files, including {backupReport.projectFileCount} project files.
          </span>
          <span>Total size: {formatBytes(backupReport.totalBytes)}</span>
        </div>
      )}
      {backupStatus === "error" && backupError && (
        <div className="backup-result backup-result-error">
          <strong>Backup failed: {backupError}</strong>
        </div>
      )}

      <div className="restore-panel">
        <div className="restore-title-row">
          <strong>Restore from Backup</strong>
          <button className="tiny-button" type="button" onClick={() => void handleRefreshFullBackups()} disabled={restoreStatus === "loading" || restoreStatus === "running"}>
            <RefreshCw size={14} />
          </button>
        </div>
        {!canPersistRef.current && (
          <div className="empty-hint">Current local data is unavailable. Restore can still attempt recovery from a saved backup.</div>
        )}
        <label>
          Backup
          <select
            value={selectedBackupId}
            onChange={(event) => {
              setSelectedBackupId(event.target.value);
              setRestoreConfirmation("");
            }}
            disabled={restoreStatus === "running" || restoreBackups.length === 0}
          >
            {restoreBackups.length === 0 ? (
              <option value="">No backups loaded</option>
            ) : (
              restoreBackups.map((backup) => (
                <option key={backup.backupId} value={backup.backupId}>
                  {backup.backupId}
                </option>
              ))
            )}
          </select>
        </label>
        {selectedBackup && (
          <div className="backup-result">
            <strong className="backup-path">{selectedBackup.backupId}</strong>
            <span>Created: {selectedBackup.createdAt || "unknown"}</span>
            <span>
              {selectedBackup.projectFileCount} project files, {formatBytes(selectedBackup.totalBytes)}
            </span>
            {selectedBackup.warnings.length > 0 && <span>Warnings: {selectedBackup.warnings.join(" | ")}</span>}
          </div>
        )}
        <div className="backup-result backup-result-warning">
          <strong>Restore will replace the current saved local data. A pre-restore backup will be created first.</strong>
        </div>
        <label>
          Type RESTORE to confirm
          <input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} disabled={restoreStatus === "running"} />
        </label>
        <button
          className="action-button restore-button"
          type="button"
          onClick={() => void handleRestoreFullBackup()}
          disabled={restoreStatus === "running" || !selectedBackupId || restoreConfirmation !== "RESTORE"}
        >
          <RotateCcw size={15} />
          {restoreStatus === "running" ? "Restoring..." : "Restore Selected Backup"}
        </button>
        {restoreStatus === "loading" && (
          <div className="backup-result">
            <span>Loading backups...</span>
          </div>
        )}
        {restoreStatus === "success" && restoreReport && (
          <div className="backup-result backup-result-success">
            <strong>Restored: {restoreReport.restoredBackupId}</strong>
            <span className="backup-path">Pre-restore backup: {restoreReport.preRestoreBackupDir}</span>
            <span className="backup-path">Restored data: {restoreReport.restoredDataDir}</span>
            {restoreReport.warnings.length > 0 && <span>Warnings: {restoreReport.warnings.join(" | ")}</span>}
          </div>
        )}
        {restoreStatus === "error" && restoreError && (
          <div className="backup-result backup-result-error">
            <strong>Restore failed: {restoreError}</strong>
          </div>
        )}
      </div>

      <div className="migration-dry-run-panel">
        <div className="restore-title-row">
          <strong>Migration dry-run</strong>
        </div>
        <div className="empty-hint">Dry-run is read-only. Apply creates a full backup first, stages the v2 layout, verifies it, then activates by rename.</div>
        <button className="action-button" type="button" onClick={() => void handleGenerateMigrationDryRunPlan()} disabled={migrationDryRunStatus === "running" || !migrationCanRunDryRun}>
          <GitBranch size={15} />
          {migrationDryRunStatus === "running" ? "Previewing..." : "Preview group-folder migration"}
        </button>
        {migrationDryRunStatus !== "running" && !currentMigrationDryRunReport && (
          <div className="empty-hint">
            {canPersistRef.current ? "Run dry-run to preview migration for the current workspace." : "Load failed. Fix or restore the workspace before running migration dry-run."}
          </div>
        )}
        {migrationDryRunStatus === "error" && migrationDryRunError && (
          <div className="backup-result backup-result-error">
            <strong>Migration dry-run failed: {migrationDryRunError}</strong>
          </div>
        )}
        {migrationDryRunStatus === "success" && currentMigrationDryRunReport && (
          <div className="migration-report">
            <div className={currentMigrationDryRunReport.summary.blockerCount > 0 ? "backup-result backup-result-warning" : "backup-result backup-result-success"}>
              <strong>
                {currentMigrationDryRunReport.alreadyMigrated
                  ? "This workspace is already migrated to the group-folder layout."
                  : currentMigrationDryRunReport.summary.blockerCount > 0
                  ? "Migration preview found blocking issues. Real migration should not run until these are resolved."
                  : "Migration preview found no blocking issues."}
              </strong>
              <span>This is a dry-run report only.</span>
              <span>dataVersion: {currentMigrationDryRunReport.sourceDataVersion} -&gt; {currentMigrationDryRunReport.targetDataVersion}</span>
              <span>No folders were created.</span>
            </div>
            <div className="migration-summary-grid">
              <span>Project files: {currentMigrationDryRunReport.summary.projectFileCount}</span>
              <span>Grouped: {currentMigrationDryRunReport.summary.groupedProjectCount}</span>
              <span>Ungrouped: {currentMigrationDryRunReport.summary.ungroupedProjectCount}</span>
              <span>Groups: {currentMigrationDryRunReport.summary.groupCount}</span>
              <span>Planned moves: {currentMigrationDryRunReport.summary.plannedMoveCount}</span>
              <span>Blockers: {currentMigrationDryRunReport.summary.blockerCount}</span>
              <span>Warnings: {currentMigrationDryRunReport.summary.warningCount}</span>
            </div>
            {migrationBlockerPreview && migrationBlockerPreview.visible.length > 0 && (
              <div className="backup-result backup-result-error">
                <strong>Blockers</strong>
                {migrationBlockerPreview.visible.map((item, index) => (
                  <span key={`${item}-${index}`}>{item}</span>
                ))}
                {migrationBlockerPreview.remaining > 0 && <span>+{migrationBlockerPreview.remaining} more</span>}
              </div>
            )}
            {migrationWarningPreview && migrationWarningPreview.visible.length > 0 && (
              <div className="backup-result backup-result-warning">
                <strong>Warnings</strong>
                {migrationWarningPreview.visible.map((item, index) => (
                  <span key={`${item}-${index}`}>{item}</span>
                ))}
                {migrationWarningPreview.remaining > 0 && <span>+{migrationWarningPreview.remaining} more</span>}
              </div>
            )}
            {migrationOperationPreview && migrationOperationPreview.visible.length > 0 && (
              <div className="backup-result">
                <strong>Planned operations</strong>
                {migrationOperationPreview.visible.map((operation, index) => (
                  <span className="migration-operation" key={`${operation.operationType}-${index}`}>
                    {operation.operationType}: {operation.sourceRelativePath || "(new directory)"} -&gt; {operation.targetRelativePath || "(blocked)"} [{operation.status}]
                  </span>
                ))}
                {migrationOperationPreview.remaining > 0 && <span>+{migrationOperationPreview.remaining} more</span>}
              </div>
            )}
            {currentMigrationDryRunReport.alreadyMigrated && (
              <div className="backup-result backup-result-success">
                <strong>Already migrated</strong>
                <span>No migration is needed for dataVersion 2.</span>
              </div>
            )}
            {!currentMigrationDryRunReport.alreadyMigrated && (
              <div className="migration-apply-panel">
                <div className="backup-result backup-result-warning">
                  <strong>Apply Migration will modify saved local data and is not reversible through normal undo.</strong>
                  <span>A full backup will be created first. If needed, restore that backup from Storage Recovery.</span>
                  <span>The current CheerioFlowData folder will be preserved as a before-migration directory.</span>
                </div>
                <label>
                  Type MIGRATE to confirm
                  <input value={migrationConfirmation} onChange={(event) => setMigrationConfirmation(event.target.value)} disabled={migrationApplyStatus === "running" || !migrationCanUseDryRun} />
                </label>
                <button
                  className="action-button restore-button"
                  type="button"
                  onClick={() => void handleApplyGroupFolderMigration()}
                  disabled={!migrationCanApply}
                >
                  <GitBranch size={15} />
                  {migrationApplyStatus === "running" ? "Migrating..." : "Apply Migration"}
                </button>
              </div>
            )}
          </div>
        )}
        {migrationApplyStatus === "running" && (
          <div className="backup-result">
            <span>Applying migration...</span>
          </div>
        )}
        {migrationApplyStatus === "success" && migrationApplyReport && (
          <div className="backup-result backup-result-success">
            <strong>{migrationApplyReport.alreadyMigrated ? "Already migrated" : "Migration applied and reloaded"}</strong>
            {migrationApplyReport.backupDir && <span className="backup-path">Backup: {migrationApplyReport.backupDir}</span>}
            {migrationApplyReport.beforeMigrationDir && <span className="backup-path">Before migration: {migrationApplyReport.beforeMigrationDir}</span>}
            <span>
              Migrated {migrationApplyReport.migratedProjectCount} of {migrationApplyReport.projectFileCount} project files to dataVersion {migrationApplyReport.targetDataVersion}.
            </span>
            {migrationApplyReport.warnings.length > 0 && <span>Warnings: {migrationApplyReport.warnings.join(" | ")}</span>}
          </div>
        )}
        {migrationApplyStatus === "error" && migrationApplyError && (
          <div className="backup-result backup-result-error">
            <strong>Migration failed: {migrationApplyError}</strong>
            {migrationApplyReport?.rollbackMessage && <span>{migrationApplyReport.rollbackMessage}</span>}
          </div>
        )}
      </div>
    </>
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
      <aside
        className={`project-sidebar ${projectSidebarCollapsed ? "collapsed" : ""}`}
        style={projectSidebarCollapsed ? undefined : { width: leftSidebarWidth }}
      >
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

            <div className="project-sidebar-body" ref={projectSidebarBodyRef}>
              <section className="project-browser-panel">
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
                                  menuOpen={projectActionMenuId === project.id}
                                  onSelect={() => selectProject(project.id)}
                                  onTogglePin={() => updateProject(project.id, (item) => ({ ...item, pinned: !item.pinned }))}
                                  onToggleMenu={() => setProjectActionMenuId((current) => (current === project.id ? null : project.id))}
                                  onOpenDetails={() => openProjectDetails(project.id)}
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
                          menuOpen={projectActionMenuId === project.id}
                          onSelect={() => selectProject(project.id)}
                          onTogglePin={() => updateProject(project.id, (item) => ({ ...item, pinned: !item.pinned }))}
                          onToggleMenu={() => setProjectActionMenuId((current) => (current === project.id ? null : project.id))}
                          onOpenDetails={() => openProjectDetails(project.id)}
                        />
                      ))}
                    </div>
                  </section>
                </div>
              </section>

              <div className="sidebar-lower-area">
                {currentProject && isProjectDetailsOpen && (
                  <section className="project-editor project-details-panel">
                    <div className="restore-title-row">
                      <strong>Project Details</strong>
                      <button className="tiny-button" type="button" onClick={() => setIsProjectDetailsOpen(false)}>
                        <X size={14} />
                      </button>
                    </div>
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
                  </section>
                )}

                {isStorageDrawerOpen ? (
                  <section
                    className={`sidebar-utility-drawer ${isDraggingStorageDrawer ? "dragging" : ""}`}
                    style={{ "--storage-drawer-height": `${effectiveStorageDrawerHeight}px` } as React.CSSProperties}
                  >
                    <div
                      className="storage-drawer-resize-handle"
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize storage drawer"
                      onPointerDown={startStorageDrawerResize}
                    />
                    <button className="storage-drawer-toggle" type="button" onClick={hideStorageDrawer}>
                      <ChevronDown size={15} />
                      Hide Storage
                    </button>
                    <div className="project-editor sidebar-utility-scroll">
                      <div className="editor-title">{canPersistRef.current ? "Storage" : "Storage Recovery"}</div>
                      {storageRootControls}
                      {storageRootActions(canPersistRef.current ? "Apply Storage Path" : "Switch and Reload")}
                      <div className="readonly-row">
                        <span>Data directory</span>
                        <strong className="path-text">{dataDir || "unavailable"}</strong>
                      </div>
                      {backupRestorePanel}
                    </div>
                  </section>
                ) : (
                  <button className="storage-drawer-collapsed-button" type="button" onClick={showStorageDrawer}>
                    <ChevronUp size={15} />
                    Storage
                  </button>
                )}
              </div>
            </div>
            <div
              className="sidebar-resizer sidebar-resizer-left"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize project sidebar"
              onPointerDown={(event) => startSidebarResize(event, "left")}
            />
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

        <div
          className="canvas-wrap"
          onMouseEnter={() => setIsPointerOverCanvas(true)}
          onMouseLeave={() => {
            setIsPointerOverCanvas(false);
            setCtrlWheel(null);
          }}
        >
          {showIntegrityBanner && integrityReport && (
            <div className="integrity-banner integrity-banner-warning">
              <span>Data integrity warnings found: {integrityReport.issueCount} issue(s). The scan is read-only and did not write changes to disk.</span>
              <button className="integrity-banner-dismiss" type="button" onClick={() => setIntegrityBannerDismissed(true)} aria-label="Dismiss integrity warning">
                <X size={15} />
              </button>
            </div>
          )}
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
            <>
              <ResizeHandles
                node={selectedGizmoNode}
                viewport={viewport}
                onResizeStart={startResizeDrag}
              />
              <MoveGizmo
                node={selectedGizmoNode}
                viewport={viewport}
                onPointerDown={startGizmoDrag}
              />
            </>
          )}
        </div>

        <footer className="statusbar">
          <span>
            <Save size={14} />
            Data directory: {dataDir || "unavailable"}
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
        width={rightSidebarWidth}
        onResizeStart={(event) => startSidebarResize(event, "right")}
        onOpen={() => setPropertiesSidebarCollapsed(false)}
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
  const width = node.measured?.width ?? node.width ?? 170;
  const height = node.measured?.height ?? node.height ?? 132;
  const left = viewport.x + (node.position.x + width / 2) * viewport.zoom;
  const top = viewport.y + (node.position.y + height / 2) * viewport.zoom;

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

function ResizeHandles({
  node,
  viewport,
  onResizeStart,
}: {
  node: ModuleNodeType;
  viewport: { x: number; y: number; zoom: number };
  onResizeStart: (event: React.PointerEvent, edge: ResizeEdge) => void;
}) {
  if (node.data.shape !== "rectangle" && node.data.shape !== "ellipse") return null;

  const { width, height } = getModuleNodeDimensions(node);
  const left = viewport.x + node.position.x * viewport.zoom;
  const top = viewport.y + node.position.y * viewport.zoom;

  const handlePointerDown = (event: React.PointerEvent, edge: ResizeEdge) => {
    event.preventDefault();
    event.stopPropagation();
    onResizeStart(event, edge);
  };

  return (
    <div
      className="resize-handles"
      style={{
        left,
        top,
        width: width * viewport.zoom,
        height: height * viewport.zoom,
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize width"
        className="resize-handle resize-right"
        onPointerDown={(event) => handlePointerDown(event, "right")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize height"
        className="resize-handle resize-bottom"
        onPointerDown={(event) => handlePointerDown(event, "bottom")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize width and height"
        className="resize-handle resize-corner"
        onPointerDown={(event) => handlePointerDown(event, "corner")}
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
  menuOpen,
  onSelect,
  onTogglePin,
  onToggleMenu,
  onOpenDetails,
}: {
  project: Project;
  active: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onToggleMenu: () => void;
  onOpenDetails: () => void;
}) {
  const PinIcon = project.pinned ? Pin : PinOff;
  return (
    <div className={`project-item ${active ? "active" : ""}`}>
      <div className="project-list-row-main">
        <button type="button" className="project-pick" onClick={onSelect}>
          <span>{project.title || "Untitled Project"}</span>
          <small>
            {project.category} / {project.createdAt}
          </small>
        </button>
        <button type="button" className="tiny-button" title={project.pinned ? "Unpin project" : "Pin project"} onClick={onTogglePin}>
          <PinIcon size={14} />
        </button>
        <button
          type="button"
          className="tiny-button"
          title="Project actions"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      {menuOpen && (
        <div className="project-row-menu">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
          >
            Details
          </button>
        </div>
      )}
    </div>
  );
}

function PropertiesPanel({
  collapsed,
  currentProject,
  selectedModule,
  selectedArrow,
  width,
  onResizeStart,
  onOpen,
  onClose,
  onUpdateModule,
  onUpdateArrow,
}: {
  collapsed: boolean;
  currentProject: Project | null;
  selectedModule: FlowModule | null;
  selectedArrow: FlowArrow | null;
  width: number;
  onResizeStart: (event: React.PointerEvent) => void;
  onOpen: () => void;
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
        <button type="button" className="icon-button" title="Show properties" aria-label="Show properties" onClick={onOpen}>
          <PanelRightOpen size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="properties-sidebar" style={{ width, minWidth: width }}>
      <div
        className="sidebar-resizer sidebar-resizer-right"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize properties sidebar"
        onPointerDown={onResizeStart}
      />
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
                  data: applyModuleTypeSemantics(module.data, event.target.value as FlowModuleData["moduleType"]),
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
                  data: applyModuleShapeSemantics(module.data, event.target.value as FlowModuleData["shape"]),
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
