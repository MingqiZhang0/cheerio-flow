import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
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
  Plus,
  Save,
  Shapes,
  Square,
  Trash2,
  Triangle,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDatabase, persistAppState, persistGroups, persistProject, removeProject } from "./storage";
import {
  ARROW_TYPES,
  MODULE_SHAPES,
  MODULE_TYPES,
  PROJECT_CATEGORIES,
  type AppState,
  type FlowArrow,
  type FlowArrowData,
  type FlowModule,
  type FlowModuleData,
  type ModuleShape,
  type Project,
  type ProjectGroup,
  type SelectedElement,
} from "./types";
import {
  applyGroupMembership,
  createArrow,
  createEmptyGroup,
  createEmptyProject,
  createModule,
  normalizeGroups,
  sortPinnedFirst,
} from "./utils";

type ModuleNodeType = Node<FlowModuleData, "module">;
type ArrowEdgeType = Edge<FlowArrowData>;

const SHAPE_ICONS: Record<ModuleShape, typeof Square> = {
  长方形: Square,
  三角形: Triangle,
  菱形: Diamond,
  圆形: Circle,
  椭圆形: Hexagon,
};

const SHAPE_CLASS: Record<ModuleShape, string> = {
  长方形: "rectangle",
  三角形: "triangle",
  菱形: "diamond",
  圆形: "circle",
  椭圆形: "ellipse",
};

function moduleToNode(module: FlowModule): ModuleNodeType {
  return {
    id: module.id,
    type: "module",
    position: module.position,
    data: module.data,
    draggable: true,
  };
}

function arrowToEdge(arrow: FlowArrow): ArrowEdgeType {
  return {
    id: arrow.id,
    source: arrow.source,
    target: arrow.target,
    sourceHandle: arrow.sourceHandle ?? undefined,
    targetHandle: arrow.targetHandle ?? undefined,
    data: arrow.data,
    label: arrow.data.arrowType,
    type: "smoothstep",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: arrow.data.enabled ? "#355f63" : "#9da4a7",
    },
    reconnectable: true,
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
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    data: edge.data ?? {
      arrowType: "推导",
      enabled: true,
      note: "",
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

function ModuleNode({ data, selected }: NodeProps<ModuleNodeType>) {
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
      <Handle type="source" position={Position.Top} id="top" className="module-handle module-handle-top" />
      <div className={`module-body shape-${SHAPE_CLASS[data.shape]}`}>
        <div className="module-meta">{data.moduleType}</div>
        <div className="module-content">
          {data.latexEnabled && html ? (
            <span dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span>{data.content || "空模块"}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" className="module-handle module-handle-bottom" />
    </div>
  );
}

const nodeTypes = {
  module: ModuleNode,
};

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
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDatabase()
      .then((data) => {
        if (cancelled) return;
        const normalized = normalizeGroups(data.groups, data.projects);
        const hydratedProjects = applyGroupMembership(data.projects, normalized);
        const firstProject = hydratedProjects[0] ?? createEmptyProject();
        setDataDir(data.dataDir);
        setGroups(normalized);
        setProjects(hydratedProjects.length > 0 ? hydratedProjects : [firstProject]);
        setCurrentProjectId(data.appState.currentProjectId ?? firstProject.id);
        setProjectSidebarCollapsed(data.appState.projectSidebarCollapsed);
        setPropertiesSidebarCollapsed(data.appState.propertiesSidebarCollapsed);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        const firstProject = createEmptyProject();
        setProjects([firstProject]);
        setCurrentProjectId(firstProject.id);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null,
    [currentProjectId, projects],
  );

  useEffect(() => {
    if (!loaded || projects.length === 0) return;
    if (!currentProjectId || !projects.some((project) => project.id === currentProjectId)) {
      setCurrentProjectId(projects[0].id);
    }
  }, [currentProjectId, loaded, projects]);

  const appState = useMemo<AppState>(
    () => ({
      currentProjectId: currentProject?.id ?? null,
      projectSidebarCollapsed,
      propertiesSidebarCollapsed,
    }),
    [currentProject?.id, projectSidebarCollapsed, propertiesSidebarCollapsed],
  );

  useEffect(() => {
    if (!loaded) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      Promise.all([
        ...projects.map((project) => persistProject(project)),
        persistGroups(groups),
        persistAppState(appState),
      ]).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, 350);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [appState, groups, loaded, projects]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingShape(null);
        setShapeMenuOpen(false);
        setGhostPoint(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const nodes = useMemo(() => currentProject?.modules.map(moduleToNode) ?? [], [currentProject?.modules]);
  const edges = useMemo(() => currentProject?.arrows.map(arrowToEdge) ?? [], [currentProject?.arrows]);

  const updateProject = useCallback((projectId: string, updater: (project: Project) => Project) => {
    setProjects((previous) => previous.map((project) => (project.id === projectId ? updater(project) : project)));
  }, []);

  const updateCurrentProject = useCallback(
    (updater: (project: Project) => Project) => {
      if (!currentProject) return;
      updateProject(currentProject.id, updater);
    },
    [currentProject, updateProject],
  );

  const selectElement = useCallback((element: SelectedElement) => {
    setSelectedElement(element);
    setPropertiesSidebarCollapsed(false);
  }, []);

  const createProject = useCallback(() => {
    const project = createEmptyProject(`新项目 ${projects.length + 1}`);
    setProjects((previous) => [...previous, project]);
    setCurrentProjectId(project.id);
    setSelectedElement(null);
    setPropertiesSidebarCollapsed(true);
  }, [projects.length]);

  const deleteCurrentProject = useCallback(() => {
    if (!currentProject) return;
    const projectId = currentProject.id;
    const remaining = projects.filter((project) => project.id !== projectId);
    const fallback = remaining.length === 0 ? createEmptyProject() : null;
    const nextProjects = fallback ? [fallback] : remaining;
    setProjects(nextProjects);
    setGroups((previous) =>
      previous.map((group) => ({
        ...group,
        projectIds: group.projectIds.filter((id) => id !== projectId),
      })),
    );
    setCurrentProjectId(nextProjects[0]?.id ?? null);
    setSelectedElement(null);
    removeProject(projectId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [currentProject, projects]);

  const createGroup = useCallback(() => {
    const group = createEmptyGroup(`新分组 ${groups.length + 1}`);
    setGroups((previous) => [...previous, group]);
  }, [groups.length]);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups((previous) => previous.filter((group) => group.id !== groupId));
    setProjects((previous) => previous.map((project) => (project.groupId === groupId ? { ...project, groupId: null } : project)));
  }, []);

  const updateGroup = useCallback((groupId: string, updater: (group: ProjectGroup) => ProjectGroup) => {
    setGroups((previous) => previous.map((group) => (group.id === groupId ? updater(group) : group)));
  }, []);

  const moveProjectToGroup = useCallback((projectId: string, groupId: string | null) => {
    setProjects((previous) => previous.map((project) => (project.id === projectId ? { ...project, groupId } : project)));
    setGroups((previous) =>
      previous.map((group) => {
        const withoutProject = group.projectIds.filter((id) => id !== projectId);
        return {
          ...group,
          projectIds: group.id === groupId ? Array.from(new Set([...withoutProject, projectId])) : withoutProject,
        };
      }),
    );
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<ModuleNodeType>[]) => {
      if (!currentProject) return;
      const nextNodes = applyNodeChanges(changes, nodes);
      const keptNodeIds = new Set(nextNodes.map((node) => node.id));
      updateCurrentProject((project) => ({
        ...project,
        modules: nextNodes.map((node) => ({
          id: node.id,
          position: node.position,
          data: node.data,
        })),
        arrows: project.arrows.filter((arrow) => keptNodeIds.has(arrow.source) && keptNodeIds.has(arrow.target)),
      }));
      if (selectedElement?.kind === "module" && !keptNodeIds.has(selectedElement.id)) setSelectedElement(null);
    },
    [currentProject, nodes, selectedElement, updateCurrentProject],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ArrowEdgeType>[]) => {
      if (!currentProject) return;
      const nextEdges = applyEdgeChanges(changes, edges);
      const keptEdgeIds = new Set(nextEdges.map((edge) => edge.id));
      updateCurrentProject((project) => ({
        ...project,
        arrows: nextEdges.map(edgeToArrow),
      }));
      if (selectedElement?.kind === "arrow" && !keptEdgeIds.has(selectedElement.id)) setSelectedElement(null);
    },
    [currentProject, edges, selectedElement, updateCurrentProject],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const arrow = createArrow(connection.source, connection.target, connection.sourceHandle, connection.targetHandle);
      updateCurrentProject((project) => ({
        ...project,
        arrows: [...project.arrows, arrow],
      }));
      selectElement({ kind: "arrow", id: arrow.id });
    },
    [selectElement, updateCurrentProject],
  );

  const onReconnect = useCallback(
    (oldEdge: ArrowEdgeType, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      updateCurrentProject((project) => ({
        ...project,
        arrows: project.arrows.map((arrow) =>
          arrow.id === oldEdge.id
            ? {
                ...arrow,
                source: connection.source ?? arrow.source,
                target: connection.target ?? arrow.target,
                sourceHandle: connection.sourceHandle ?? null,
                targetHandle: connection.targetHandle ?? null,
              }
            : arrow,
        ),
      }));
      selectElement({ kind: "arrow", id: oldEdge.id });
    },
    [selectElement, updateCurrentProject],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!pendingShape || !flowInstance) return;
      const position = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const module = createModule(pendingShape, position.x - 85, position.y - 48);
      updateCurrentProject((project) => ({
        ...project,
        modules: [...project.modules, module],
      }));
      setPendingShape(null);
      setGhostPoint(null);
      selectElement({ kind: "module", id: module.id });
    },
    [flowInstance, pendingShape, selectElement, updateCurrentProject],
  );

  const selectedModule = useMemo(() => {
    if (selectedElement?.kind !== "module" || !currentProject) return null;
    return currentProject.modules.find((module) => module.id === selectedElement.id) ?? null;
  }, [currentProject, selectedElement]);

  const selectedArrow = useMemo(() => {
    if (selectedElement?.kind !== "arrow" || !currentProject) return null;
    return currentProject.arrows.find((arrow) => arrow.id === selectedElement.id) ?? null;
  }, [currentProject, selectedElement]);

  const currentProjectGroups = useMemo(() => sortPinnedFirst(groups), [groups]);
  const ungroupedProjects = useMemo(
    () => sortPinnedFirst(projects.filter((project) => !project.groupId || !groups.some((group) => group.id === project.groupId))),
    [groups, projects],
  );

  if (!loaded) {
    return (
      <main className="boot-screen">
        <Layers3 size={32} />
        <span>Cheerio Flow 正在读取本地存档...</span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className={`project-sidebar ${projectSidebarCollapsed ? "collapsed" : ""}`}>
        {projectSidebarCollapsed ? (
          <SidebarButton title="显示项目栏" onClick={() => setProjectSidebarCollapsed(false)}>
            <ChevronsRight size={18} />
          </SidebarButton>
        ) : (
          <>
            <div className="sidebar-header">
              <div>
                <div className="app-name">Cheerio Flow</div>
                <div className="app-subtitle">科研流程工作台</div>
              </div>
              <SidebarButton title="隐藏项目栏" onClick={() => setProjectSidebarCollapsed(true)}>
                <ChevronsLeft size={18} />
              </SidebarButton>
            </div>

            <div className="sidebar-actions">
              <button type="button" className="action-button" onClick={createProject}>
                <FilePlus2 size={16} />
                新项目
              </button>
              <button type="button" className="action-button" onClick={createGroup}>
                <FolderPlus size={16} />
                新组
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
                      <input
                        value={group.title}
                        onChange={(event) => updateGroup(group.id, (item) => ({ ...item, title: event.target.value }))}
                        aria-label="分组标题"
                      />
                      <button
                        className="tiny-button"
                        type="button"
                        title={group.pinned ? "取消置顶分组" : "置顶分组"}
                        onClick={() => updateGroup(group.id, (item) => ({ ...item, pinned: !item.pinned }))}
                      >
                        <GroupIcon size={14} />
                      </button>
                      <button className="tiny-button danger" type="button" title="删除分组" onClick={() => deleteGroup(group.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="group-meta">创建于 {group.createdAt}</div>
                    {!collapsed && (
                      <div className="project-stack">
                        {groupProjects.length === 0 ? (
                          <div className="empty-hint">空组</div>
                        ) : (
                          groupProjects.map((project) => (
                            <ProjectListItem
                              key={project.id}
                              project={project}
                              active={project.id === currentProject?.id}
                              onSelect={() => setCurrentProjectId(project.id)}
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
                  <span>未分组</span>
                </div>
                <div className="project-stack">
                  {ungroupedProjects.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      active={project.id === currentProject?.id}
                      onSelect={() => setCurrentProjectId(project.id)}
                      onTogglePin={() => updateProject(project.id, (item) => ({ ...item, pinned: !item.pinned }))}
                    />
                  ))}
                </div>
              </section>
            </div>

            {currentProject && (
              <section className="project-editor">
                <div className="editor-title">当前项目</div>
                <label>
                  标题
                  <input
                    value={currentProject.title}
                    onChange={(event) => updateCurrentProject((project) => ({ ...project, title: event.target.value }))}
                  />
                </label>
                <label>
                  类别
                  <select
                    value={currentProject.category}
                    onChange={(event) =>
                      updateCurrentProject((project) => ({
                        ...project,
                        category: event.target.value as Project["category"],
                      }))
                    }
                  >
                    {PROJECT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  分组
                  <select value={currentProject.groupId ?? ""} onChange={(event) => moveProjectToGroup(currentProject.id, event.target.value || null)}>
                    <option value="">未分组</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="readonly-row">
                  <span>创建时间</span>
                  <strong>{currentProject.createdAt}</strong>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={currentProject.pinned}
                    onChange={(event) => updateCurrentProject((project) => ({ ...project, pinned: event.target.checked }))}
                  />
                  置顶项目
                </label>
                <button className="delete-button" type="button" onClick={deleteCurrentProject}>
                  <Trash2 size={16} />
                  删除当前项目
                </button>
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
              aria-label="项目标题"
            />
            <span className="project-context">
              {currentProject?.category ?? "科研"} · {currentProject?.createdAt ?? ""}
            </span>
          </div>
          <div className="topbar-actions">
            <button className="toolbar-button" type="button" onClick={() => setShapeMenuOpen((open) => !open)}>
              <Shapes size={17} />
              模块
            </button>
            <SidebarButton
              title={propertiesSidebarCollapsed ? "显示属性栏" : "隐藏属性栏"}
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
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onPaneClick={onPaneClick}
            onPaneMouseMove={(event) => {
              if (pendingShape) setGhostPoint({ x: event.clientX, y: event.clientY });
            }}
            onPaneMouseLeave={() => setGhostPoint(null)}
            onNodeClick={(_, node) => selectElement({ kind: "module", id: node.id })}
            onNodeDoubleClick={(_, node) => selectElement({ kind: "module", id: node.id })}
            onEdgeClick={(_, edge) => selectElement({ kind: "arrow", id: edge.id })}
            onEdgeDoubleClick={(_, edge) => selectElement({ kind: "arrow", id: edge.id })}
            connectionMode={ConnectionMode.Loose}
            fitView
            nodesDraggable
            nodesConnectable
            edgesFocusable
            edgesReconnectable
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color="#d7dfdc" gap={24} size={1} />
            <MiniMap pannable zoomable nodeColor={(node) => ((node.data as FlowModuleData).enabled ? "#8ab8a8" : "#b8bec0")} />
            <Controls />
          </ReactFlow>
        </div>

        <footer className="statusbar">
          <span>
            <Save size={14} />
            本地存档: {dataDir || "未获取"}
          </span>
          {pendingShape ? <strong>选择画布位置以创建「{pendingShape}」模块，Esc 取消</strong> : <span>模块 {nodes.length} · 箭头 {edges.length}</span>}
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
          updateCurrentProject((project) => ({
            ...project,
            modules: project.modules.map((module) => (module.id === moduleId ? updater(module) : module)),
          }))
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
        <span>{project.title || "未命名项目"}</span>
        <small>
          {project.category} · {project.createdAt}
        </small>
      </button>
      <button type="button" className="tiny-button" title={project.pinned ? "取消置顶项目" : "置顶项目"} onClick={onTogglePin}>
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
        return { arrow, other, direction: arrow.source === selectedModule.id ? "输出" : "输入" };
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
          <div className="editor-title">属性栏</div>
          <span>{selectedModule ? "模块属性" : selectedArrow ? "箭头属性" : "未选择对象"}</span>
        </div>
        <button type="button" className="icon-button" title="关闭属性栏" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {!selectedModule && !selectedArrow && (
        <div className="empty-panel">
          <Box size={24} />
          <p>单击或双击画布中的模块、箭头后可编辑属性。</p>
        </div>
      )}

      {selectedModule && (
        <div className="property-form">
          <label>
            类型
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
            形状
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
            内容
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
            启用 LaTeX 渲染
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={selectedModule.data.enabled}
              onChange={(event) =>
                onUpdateModule(selectedModule.id, (module) => ({
                  ...module,
                  data: { ...module.data, enabled: event.target.checked },
                }))
              }
            />
            启用模块
          </label>

          <label>
            备注
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
            <div className="editor-title">关联模块</div>
            {relatedForModule.length === 0 ? (
              <div className="empty-hint">暂无连接</div>
            ) : (
              relatedForModule.map(({ arrow, other, direction }) => (
                <div className="related-item" key={arrow.id}>
                  <GitBranch size={14} />
                  <span>
                    {direction} · {arrow.data.arrowType} · {arrow.data.enabled ? "启用" : "停用"}
                    <small>{other ? `关联 ${other.data.moduleType} / ${other.data.enabled ? "启用" : "停用"}` : "关联模块缺失"}</small>
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
            类型
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

          <label className="check-row">
            <input
              type="checkbox"
              checked={selectedArrow.data.enabled}
              onChange={(event) =>
                onUpdateArrow(selectedArrow.id, (arrow) => ({
                  ...arrow,
                  data: { ...arrow.data, enabled: event.target.checked },
                }))
              }
            />
            启用箭头
          </label>

          <div className="direction-box">
            <div>
              <span>方向</span>
              <strong>
                {sourceModule?.data.moduleType ?? "未知模块"} → {targetModule?.data.moduleType ?? "未知模块"}
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
              反转方向
            </button>
          </div>

          <label>
            备注
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

          <section className="related-section">
            <div className="editor-title">关联模块</div>
            <div className="related-item">
              <GitBranch size={14} />
              <span>
                Source
                <small>{sourceModule ? `${sourceModule.data.moduleType} / ${sourceModule.data.enabled ? "启用" : "停用"}` : "缺失"}</small>
              </span>
            </div>
            <div className="related-item">
              <GitBranch size={14} />
              <span>
                Target
                <small>{targetModule ? `${targetModule.data.moduleType} / ${targetModule.data.enabled ? "启用" : "停用"}` : "缺失"}</small>
              </span>
            </div>
          </section>
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
