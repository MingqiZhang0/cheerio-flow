use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use time::{format_description, OffsetDateTime};

const DATA_DIR_NAME: &str = "CheerioFlowData";
const GROUPS_FILE: &str = "groups.json";
const APP_STATE_FILE: &str = "app-state.json";
const BOOTSTRAP_FILE: &str = "cheerio-flow-bootstrap.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowModuleData {
    #[serde(default)]
    short_id: String,
    module_type: String,
    shape: String,
    content: String,
    latex_enabled: bool,
    note: String,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default = "default_enabled")]
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowModule {
    id: String,
    position: CanvasPosition,
    data: FlowModuleData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowArrowData {
    arrow_type: String,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default = "default_enabled")]
    enabled: bool,
    note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowArrow {
    id: String,
    source: String,
    target: String,
    source_handle: Option<String>,
    target_handle: Option<String>,
    data: FlowArrowData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanvasPosition {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    title: String,
    category: String,
    created_at: String,
    pinned: bool,
    group_id: Option<String>,
    modules: Vec<FlowModule>,
    arrows: Vec<FlowArrow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectGroup {
    id: String,
    title: String,
    created_at: String,
    pinned: bool,
    project_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppState {
    current_project_id: Option<String>,
    project_sidebar_collapsed: bool,
    properties_sidebar_collapsed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageReport {
    storage_root: String,
    data_dir: String,
    bootstrap_path: String,
    projects_path: String,
    groups_path: String,
    app_state_path: String,
    project_count: usize,
    module_count: usize,
    arrow_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedData {
    data_dir: String,
    storage_root: String,
    bootstrap_path: String,
    projects: Vec<Project>,
    groups: Vec<ProjectGroup>,
    app_state: AppState,
    report: StorageReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DatabasePayload {
    projects: Vec<Project>,
    groups: Vec<ProjectGroup>,
    app_state: AppState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapConfig {
    active_storage_root: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_project_id: None,
            project_sidebar_collapsed: false,
            properties_sidebar_collapsed: true,
        }
    }
}

fn default_status() -> String {
    "enabled".to_string()
}

fn default_enabled() -> bool {
    true
}

fn now_string() -> String {
    let format = format_description::parse("[year]-[month]-[day] [hour]:[minute]:[second]")
        .expect("valid time format");
    OffsetDateTime::now_local()
        .unwrap_or_else(|_| OffsetDateTime::now_utc())
        .format(&format)
        .unwrap_or_else(|_| "1970-01-01 00:00:00".to_string())
}

fn read_json<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let text = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read file {}: {err}", path.display()))?;
    serde_json::from_str(&text).map_err(|err| format!("Failed to parse JSON {}: {err}", path.display()))
}

fn write_json<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create directory {}: {err}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(value)
        .map_err(|err| format!("Failed to serialize JSON for {}: {err}", path.display()))?;
    fs::write(path, text).map_err(|err| format!("Failed to write file {}: {err}", path.display()))
}

fn default_project() -> Project {
    Project {
        id: format!("project-{}", OffsetDateTime::now_utc().unix_timestamp_nanos()),
        title: "Empty Project".to_string(),
        category: "research".to_string(),
        created_at: now_string(),
        pinned: false,
        group_id: None,
        modules: vec![],
        arrows: vec![],
    }
}

fn bootstrap_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Failed to get app config directory: {err}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|err| format!("Failed to create app config directory {}: {err}", config_dir.display()))?;
    Ok(config_dir.join(BOOTSTRAP_FILE))
}

fn default_storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| format!("Failed to get default app data directory: {err}"))
}

fn active_storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let bootstrap = bootstrap_path(app)?;
    if !bootstrap.exists() {
        return default_storage_root(app);
    }

    let config = read_json::<BootstrapConfig>(&bootstrap)?;
    let root = config.active_storage_root.trim();
    if root.is_empty() {
        return default_storage_root(app);
    }
    Ok(PathBuf::from(root))
}

fn write_bootstrap(app: &tauri::AppHandle, storage_root: &Path) -> Result<PathBuf, String> {
    let path = bootstrap_path(app)?;
    let config = BootstrapConfig {
        active_storage_root: storage_root.to_string_lossy().to_string(),
    };
    write_json(&path, &config)?;
    Ok(path)
}

fn data_root_for(storage_root: &Path) -> PathBuf {
    storage_root.join(DATA_DIR_NAME)
}

fn ensure_data_dirs(data_root: &Path) -> Result<PathBuf, String> {
    let projects_dir = data_root.join("projects");
    fs::create_dir_all(&projects_dir)
        .map_err(|err| format!("Failed to create projects directory {}: {err}", projects_dir.display()))?;
    Ok(projects_dir)
}

fn storage_has_any_data(data_root: &Path) -> bool {
    let projects_dir = data_root.join("projects");
    let has_project_json = projects_dir
        .read_dir()
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .any(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("json"));

    data_root.exists()
        && (has_project_json || data_root.join(GROUPS_FILE).exists() || data_root.join(APP_STATE_FILE).exists())
}

fn build_report(
    storage_root: &Path,
    data_root: &Path,
    bootstrap: &Path,
    projects: &[Project],
) -> StorageReport {
    StorageReport {
        storage_root: storage_root.to_string_lossy().to_string(),
        data_dir: data_root.to_string_lossy().to_string(),
        bootstrap_path: bootstrap.to_string_lossy().to_string(),
        projects_path: data_root.join("projects").to_string_lossy().to_string(),
        groups_path: data_root.join(GROUPS_FILE).to_string_lossy().to_string(),
        app_state_path: data_root.join(APP_STATE_FILE).to_string_lossy().to_string(),
        project_count: projects.len(),
        module_count: projects.iter().map(|project| project.modules.len()).sum(),
        arrow_count: projects.iter().map(|project| project.arrows.len()).sum(),
    }
}

fn load_database_from(app: &tauri::AppHandle, storage_root: PathBuf) -> Result<PersistedData, String> {
    let bootstrap = bootstrap_path(app)?;
    let data_root = data_root_for(&storage_root);
    let projects_dir = data_root.join("projects");
    let had_data = storage_has_any_data(&data_root);

    let mut projects = Vec::new();
    if projects_dir.exists() {
        for entry in fs::read_dir(&projects_dir)
            .map_err(|err| format!("Failed to scan projects directory {}: {err}", projects_dir.display()))?
        {
            let entry = entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                projects.push(read_json::<Project>(&path)?);
            }
        }
    }

    let groups_path = data_root.join(GROUPS_FILE);
    let mut groups = if groups_path.exists() {
        read_json::<Vec<ProjectGroup>>(&groups_path)?
    } else {
        vec![]
    };

    let app_state_path = data_root.join(APP_STATE_FILE);
    let mut app_state = if app_state_path.exists() {
        read_json::<AppState>(&app_state_path)?
    } else {
        AppState::default()
    };

    if projects.is_empty() {
        if had_data {
            return Err(format!(
                "Storage at {} contains metadata but no valid project JSON files; refusing to overwrite it with an empty project",
                data_root.display()
            ));
        }
        let project = default_project();
        app_state.current_project_id = Some(project.id.clone());
        ensure_data_dirs(&data_root)?;
        write_json(&projects_dir.join(format!("{}.json", project.id)), &project)?;
        projects.push(project);
    }

    let known_project_ids: HashSet<String> = projects.iter().map(|project| project.id.clone()).collect();
    groups.iter_mut().for_each(|group| {
        group.project_ids.retain(|project_id| known_project_ids.contains(project_id));
    });

    if app_state
        .current_project_id
        .as_ref()
        .is_none_or(|id| !projects.iter().any(|project| &project.id == id))
    {
        app_state.current_project_id = projects.first().map(|project| project.id.clone());
    }

    ensure_data_dirs(&data_root)?;
    write_json(&groups_path, &groups)?;
    write_json(&app_state_path, &app_state)?;

    projects.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    let report = build_report(&storage_root, &data_root, &bootstrap, &projects);

    Ok(PersistedData {
        data_dir: report.data_dir.clone(),
        storage_root: report.storage_root.clone(),
        bootstrap_path: report.bootstrap_path.clone(),
        projects,
        groups,
        app_state,
        report,
    })
}

fn save_database_to(
    app: &tauri::AppHandle,
    storage_root: PathBuf,
    payload: DatabasePayload,
) -> Result<StorageReport, String> {
    let bootstrap = bootstrap_path(app)?;
    let data_root = data_root_for(&storage_root);
    let projects_dir = ensure_data_dirs(&data_root)?;

    let current_ids: HashSet<String> = payload.projects.iter().map(|project| project.id.clone()).collect();
    if projects_dir.exists() {
        for entry in fs::read_dir(&projects_dir)
            .map_err(|err| format!("Failed to scan projects directory {}: {err}", projects_dir.display()))?
        {
            let entry = entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or_default();
                if !current_ids.contains(stem) {
                    fs::remove_file(&path)
                        .map_err(|err| format!("Failed to delete stale project file {}: {err}", path.display()))?;
                }
            }
        }
    }

    for project in &payload.projects {
        write_json(&projects_dir.join(format!("{}.json", project.id)), project)?;
    }
    write_json(&data_root.join(GROUPS_FILE), &payload.groups)?;
    write_json(&data_root.join(APP_STATE_FILE), &payload.app_state)?;

    let report = build_report(&storage_root, &data_root, &bootstrap, &payload.projects);
    println!(
        "Cheerio Flow saved {} projects, {} modules, {} arrows to {}",
        report.project_count, report.module_count, report.arrow_count, report.data_dir
    );
    Ok(report)
}

#[tauri::command]
fn load_database(app: tauri::AppHandle) -> Result<PersistedData, String> {
    let storage_root = active_storage_root(&app)?;
    load_database_from(&app, storage_root)
}

#[tauri::command]
fn save_database(app: tauri::AppHandle, payload: DatabasePayload) -> Result<StorageReport, String> {
    let storage_root = active_storage_root(&app)?;
    save_database_to(&app, storage_root, payload)
}

#[tauri::command]
fn set_storage_root(
    app: tauri::AppHandle,
    storage_root: String,
    payload: DatabasePayload,
) -> Result<PersistedData, String> {
    let next_root = if storage_root.trim().is_empty() {
        default_storage_root(&app)?
    } else {
        PathBuf::from(storage_root.trim())
    };

    fs::create_dir_all(&next_root)
        .map_err(|err| format!("Failed to create storage root {}: {err}", next_root.display()))?;
    write_bootstrap(&app, &next_root)?;
    save_database_to(&app, next_root.clone(), payload)?;
    load_database_from(&app, next_root)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<StorageReport, String> {
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    let path = data_root.join("projects").join(format!("{}.json", project_id));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|err| format!("Failed to delete project file {}: {err}", path.display()))?;
    }
    let loaded = load_database_from(&app, storage_root)?;
    Ok(loaded.report)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_database,
            save_database,
            set_storage_root,
            delete_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
