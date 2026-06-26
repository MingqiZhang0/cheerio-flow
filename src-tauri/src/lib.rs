use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use time::{format_description, OffsetDateTime};

const DATA_DIR_NAME: &str = "CheerioFlowData";
const GROUPS_FILE: &str = "groups.json";
const APP_STATE_FILE: &str = "app-state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowModuleData {
    module_type: String,
    shape: String,
    content: String,
    latex_enabled: bool,
    note: String,
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
struct PersistedData {
    data_dir: String,
    projects: Vec<Project>,
    groups: Vec<ProjectGroup>,
    app_state: AppState,
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

fn now_string() -> String {
    let format = format_description::parse("[year]-[month]-[day] [hour]:[minute]:[second]")
        .expect("valid time format");
    OffsetDateTime::now_local()
        .unwrap_or_else(|_| OffsetDateTime::now_utc())
        .format(&format)
        .unwrap_or_else(|_| "1970-01-01 00:00:00".to_string())
}

fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("无法获取应用数据目录: {err}"))?
        .join(DATA_DIR_NAME);
    fs::create_dir_all(root.join("projects"))
        .map_err(|err| format!("无法创建项目数据目录: {err}"))?;
    Ok(root)
}

fn read_json<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let text = fs::read_to_string(path).map_err(|err| format!("读取文件失败 {}: {err}", path.display()))?;
    serde_json::from_str(&text).map_err(|err| format!("解析 JSON 失败 {}: {err}", path.display()))
}

fn write_json<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建目录失败 {}: {err}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|err| format!("序列化 JSON 失败: {err}"))?;
    fs::write(path, text).map_err(|err| format!("写入文件失败 {}: {err}", path.display()))
}

fn default_project() -> Project {
    Project {
        id: format!("project-{}", OffsetDateTime::now_utc().unix_timestamp_nanos()),
        title: "空项目".to_string(),
        category: "科研".to_string(),
        created_at: now_string(),
        pinned: false,
        group_id: None,
        modules: vec![],
        arrows: vec![],
    }
}

#[tauri::command]
fn load_database(app: tauri::AppHandle) -> Result<PersistedData, String> {
    let root = data_root(&app)?;
    let projects_dir = root.join("projects");

    let mut projects = Vec::new();
    if projects_dir.exists() {
        for entry in fs::read_dir(&projects_dir)
            .map_err(|err| format!("扫描项目目录失败 {}: {err}", projects_dir.display()))?
        {
            let entry = entry.map_err(|err| format!("读取项目目录项失败: {err}"))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                projects.push(read_json::<Project>(&path)?);
            }
        }
    }

    let groups_path = root.join(GROUPS_FILE);
    let mut groups = if groups_path.exists() {
        read_json::<Vec<ProjectGroup>>(&groups_path)?
    } else {
        vec![]
    };

    let app_state_path = root.join(APP_STATE_FILE);
    let mut app_state = if app_state_path.exists() {
        read_json::<AppState>(&app_state_path)?
    } else {
        AppState::default()
    };

    if projects.is_empty() {
        let project = default_project();
        app_state.current_project_id = Some(project.id.clone());
        write_json(&projects_dir.join(format!("{}.json", project.id)), &project)?;
        projects.push(project);
    }

    let known_project_ids: Vec<String> = projects.iter().map(|project| project.id.clone()).collect();
    groups.iter_mut().for_each(|group| {
        group
            .project_ids
            .retain(|project_id| known_project_ids.iter().any(|known_id| known_id == project_id));
    });

    if app_state
        .current_project_id
        .as_ref()
        .is_none_or(|id| !projects.iter().any(|project| &project.id == id))
    {
        app_state.current_project_id = projects.first().map(|project| project.id.clone());
    }

    write_json(&groups_path, &groups)?;
    write_json(&app_state_path, &app_state)?;

    projects.sort_by(|a, b| a.created_at.cmp(&b.created_at));

    Ok(PersistedData {
        data_dir: root.to_string_lossy().to_string(),
        projects,
        groups,
        app_state,
    })
}

#[tauri::command]
fn save_project(app: tauri::AppHandle, project: Project) -> Result<(), String> {
    let root = data_root(&app)?;
    write_json(&root.join("projects").join(format!("{}.json", project.id)), &project)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let root = data_root(&app)?;
    let path = root.join("projects").join(format!("{}.json", project_id));
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("删除项目失败 {}: {err}", path.display()))?;
    }
    Ok(())
}

#[tauri::command]
fn save_groups(app: tauri::AppHandle, groups: Vec<ProjectGroup>) -> Result<(), String> {
    let root = data_root(&app)?;
    write_json(&root.join(GROUPS_FILE), &groups)
}

#[tauri::command]
fn save_app_state(app: tauri::AppHandle, app_state: AppState) -> Result<(), String> {
    let root = data_root(&app)?;
    write_json(&root.join(APP_STATE_FILE), &app_state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_database,
            save_project,
            delete_project,
            save_groups,
            save_app_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
