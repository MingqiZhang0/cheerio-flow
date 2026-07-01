use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;
use time::{format_description, OffsetDateTime};

const DATA_DIR_NAME: &str = "CheerioFlowData";
const BACKUPS_DIR_NAME: &str = "CheerioFlowBackups";
const GROUPS_FILE: &str = "groups.json";
const APP_STATE_FILE: &str = "app-state.json";
const BOOTSTRAP_FILE: &str = "cheerio-flow-bootstrap.json";
const LEGACY_DATA_VERSION: u32 = 1;
const CURRENT_DATA_VERSION: u32 = 2;

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
    #[serde(default)]
    custom_width: Option<f64>,
    #[serde(default)]
    custom_height: Option<f64>,
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
    #[serde(default = "legacy_data_version")]
    data_version: serde_json::Value,
    current_project_id: Option<String>,
    project_sidebar_collapsed: bool,
    properties_sidebar_collapsed: bool,
    #[serde(default = "default_left_sidebar_width")]
    left_sidebar_width: f64,
    #[serde(default = "default_right_sidebar_width")]
    right_sidebar_width: f64,
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
struct BackupReport {
    backup_id: String,
    created_at: String,
    source_data_dir: String,
    backup_dir: String,
    manifest_path: String,
    project_file_count: usize,
    copied_file_count: usize,
    total_bytes: u64,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    manifest_version: u32,
    backup_id: String,
    created_at: String,
    data_version: Option<serde_json::Value>,
    source_data_dir: String,
    backup_dir: String,
    project_file_count: usize,
    copied_file_count: usize,
    total_bytes: u64,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSummary {
    backup_id: String,
    created_at: String,
    backup_dir: String,
    manifest_path: String,
    project_file_count: usize,
    copied_file_count: usize,
    total_bytes: u64,
    data_version: Option<serde_json::Value>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreReport {
    restored_backup_id: String,
    restored_at: String,
    source_backup_dir: String,
    restored_data_dir: String,
    pre_restore_backup_dir: String,
    manifest_path: String,
    project_file_count: usize,
    copied_file_count: usize,
    total_bytes: u64,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrationDryRunSummary {
    project_file_count: usize,
    readable_project_count: usize,
    grouped_project_count: usize,
    ungrouped_project_count: usize,
    group_count: usize,
    planned_move_count: usize,
    blocker_count: usize,
    warning_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMigrationPlan {
    project_id: String,
    project_title: String,
    source_relative_path: String,
    target_relative_path: String,
    current_group_id: Option<String>,
    target_group_id: Option<String>,
    target_bucket: String,
    status: String,
    blockers: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroupMigrationPlan {
    group_id: String,
    title: String,
    target_relative_dir: String,
    project_ids: Vec<String>,
    existing_project_count: usize,
    missing_project_ids: Vec<String>,
    status: String,
    blockers: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrationPlannedOperation {
    operation_type: String,
    source_relative_path: String,
    target_relative_path: String,
    project_id: Option<String>,
    group_id: Option<String>,
    status: String,
    notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrationDryRunReport {
    report_version: u32,
    generated_at: String,
    source_data_dir: String,
    source_projects_dir: String,
    current_layout: String,
    target_layout: String,
    source_data_version: u32,
    target_data_version: u32,
    summary: MigrationDryRunSummary,
    project_plans: Vec<ProjectMigrationPlan>,
    group_plans: Vec<GroupMigrationPlan>,
    planned_operations: Vec<MigrationPlannedOperation>,
    blockers: Vec<String>,
    warnings: Vec<String>,
    dry_run_only: bool,
    already_migrated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrationApplyReport {
    migration_id: String,
    started_at: String,
    completed_at: String,
    source_data_dir: String,
    target_data_dir: String,
    backup_id: String,
    backup_dir: String,
    before_migration_dir: String,
    source_data_version: u32,
    target_data_version: u32,
    project_file_count: usize,
    migrated_project_count: usize,
    grouped_project_count: usize,
    ungrouped_project_count: usize,
    group_count: usize,
    warnings: Vec<String>,
    blockers: Vec<String>,
    already_migrated: bool,
    rollback_attempted: bool,
    rollback_succeeded: bool,
    rollback_message: Option<String>,
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
            data_version: current_data_version(),
            current_project_id: None,
            project_sidebar_collapsed: false,
            properties_sidebar_collapsed: true,
            left_sidebar_width: 320.0,
            right_sidebar_width: 340.0,
        }
    }
}

fn default_status() -> String {
    "enabled".to_string()
}

fn default_enabled() -> bool {
    true
}

fn legacy_data_version() -> serde_json::Value {
    serde_json::Value::from(LEGACY_DATA_VERSION)
}

fn current_data_version() -> serde_json::Value {
    serde_json::Value::from(CURRENT_DATA_VERSION)
}

fn default_left_sidebar_width() -> f64 {
    320.0
}

fn default_right_sidebar_width() -> f64 {
    340.0
}

fn now_string() -> String {
    let format =
        format_description::parse_borrowed::<3>("[year]-[month]-[day] [hour]:[minute]:[second]")
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
    serde_json::from_str(&text)
        .map_err(|err| format!("Failed to parse JSON {}: {err}", path.display()))
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

fn atomic_temp_path(target: &Path) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| {
            format!(
                "Atomic write target has no parent directory: {}",
                target.display()
            )
        })?;
    let file_name = target
        .file_name()
        .filter(|file_name| !file_name.is_empty())
        .ok_or_else(|| format!("Atomic write target has no file name: {}", target.display()))?;

    let mut temp_name = OsString::from(".");
    temp_name.push(file_name);
    temp_name.push(".tmp");
    Ok(parent.join(temp_name))
}

fn is_storage_temp_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|file_name| file_name.to_str())
        .map(|file_name| file_name.starts_with('.') && file_name.ends_with(".tmp"))
        .unwrap_or(false)
}

fn verify_any_json_value(value: &serde_json::Value) -> Result<(), String> {
    if value.is_null() {
        Err("JSON value must not be null".to_string())
    } else {
        Ok(())
    }
}

fn verify_project_json_value(
    expected_project_id: &str,
    value: &serde_json::Value,
) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Project JSON must be an object".to_string())?;
    let actual_project_id = object
        .get("id")
        .and_then(|item| item.as_str())
        .ok_or_else(|| "Project JSON must include a string id".to_string())?;
    if actual_project_id != expected_project_id {
        return Err(format!(
            "Project JSON id {actual_project_id} does not match expected {expected_project_id}"
        ));
    }
    Ok(())
}

fn verify_app_state_json_value(value: &serde_json::Value) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| "App state JSON must be an object".to_string())?;
    if let Some(data_version) = object.get("dataVersion") {
        let version = data_version
            .as_u64()
            .ok_or_else(|| "App state dataVersion must be 1 or 2".to_string())?;
        if version != u64::from(LEGACY_DATA_VERSION) && version != u64::from(CURRENT_DATA_VERSION) {
            return Err(format!("App state dataVersion {version} is not supported"));
        }
    }
    Ok(())
}

// AtomicWriteHelper protects the old target for failures before activation.
// Post-rename verification failure is detected and reported, but this first
// helper does not implement rollback after replacement.
fn atomic_write_json<T, F>(target: &Path, value: &T, verify: F) -> Result<(), String>
where
    T: Serialize,
    F: Fn(&serde_json::Value) -> Result<(), String>,
{
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| {
            format!(
                "Atomic write target has no parent directory: {}",
                target.display()
            )
        })?;
    fs::create_dir_all(parent)
        .map_err(|err| format!("Failed to create directory {}: {err}", parent.display()))?;

    let temp = atomic_temp_path(target)?;
    let text = serde_json::to_string_pretty(value)
        .map_err(|err| format!("Failed to serialize JSON for {}: {err}", target.display()))?;
    let mut file = fs::File::create(&temp)
        .map_err(|err| format!("Failed to create temp file {}: {err}", temp.display()))?;
    file.write_all(text.as_bytes())
        .map_err(|err| format!("Failed to write temp file {}: {err}", temp.display()))?;
    file.flush()
        .map_err(|err| format!("Failed to flush temp file {}: {err}", temp.display()))?;
    file.sync_all()
        .map_err(|err| format!("Failed to sync temp file {}: {err}", temp.display()))?;
    drop(file);

    let temp_text = fs::read_to_string(&temp)
        .map_err(|err| format!("Failed to read temp file {}: {err}", temp.display()))?;
    let temp_json = serde_json::from_str::<serde_json::Value>(&temp_text)
        .map_err(|err| format!("Failed to parse temp JSON {}: {err}", temp.display()))?;
    verify(&temp_json)?;

    fs::rename(&temp, target).map_err(|err| {
        format!(
            "Failed to activate atomic write {} -> {}: {err}",
            temp.display(),
            target.display()
        )
    })?;

    let target_text = fs::read_to_string(target)
        .map_err(|err| format!("Failed to read target file {}: {err}", target.display()))?;
    let target_json = serde_json::from_str::<serde_json::Value>(&target_text)
        .map_err(|err| format!("Failed to parse target JSON {}: {err}", target.display()))?;
    verify(&target_json)
}

fn default_project() -> Project {
    Project {
        id: format!(
            "project-{}",
            OffsetDateTime::now_utc().unix_timestamp_nanos()
        ),
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
    fs::create_dir_all(&config_dir).map_err(|err| {
        format!(
            "Failed to create app config directory {}: {err}",
            config_dir.display()
        )
    })?;
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

fn backups_root_for(storage_root: &Path) -> PathBuf {
    storage_root.join(BACKUPS_DIR_NAME)
}

fn ensure_data_dirs(data_root: &Path) -> Result<PathBuf, String> {
    let projects_dir = data_root.join("projects");
    fs::create_dir_all(&projects_dir).map_err(|err| {
        format!(
            "Failed to create projects directory {}: {err}",
            projects_dir.display()
        )
    })?;
    Ok(projects_dir)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DataRootClassification {
    NewEmptyWorkspace,
    ExistingV1Workspace,
    ExistingV2Workspace,
    ExistingLegacyV1Workspace,
    ExistingV2LikeWorkspace,
    AmbiguousLayout,
    UnsupportedVersion(u32),
    RecoveryNeeded(String),
}

fn count_top_level_project_json_files(projects_dir: &Path) -> Result<usize, String> {
    if !projects_dir.exists() {
        return Ok(0);
    }
    ensure_directory(projects_dir, "projects directory")?;
    let mut count = 0;
    for entry in fs::read_dir(projects_dir).map_err(|err| {
        format!(
            "Failed to scan projects directory {}: {err}",
            projects_dir.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("Failed to inspect projects entry {}: {err}", path.display()))?;
        if metadata.file_type().is_symlink() {
            return Err(format!("projects/ contains a symlink: {}", path.display()));
        }
        if metadata.file_type().is_file()
            && path.extension().and_then(|ext| ext.to_str()) == Some("json")
        {
            count += 1;
        }
    }
    Ok(count)
}

fn count_v2_project_json_files(projects_dir: &Path) -> Result<usize, String> {
    if !projects_dir.exists() {
        return Ok(0);
    }
    ensure_directory(projects_dir, "projects directory")?;
    let mut count = 0;
    let ungrouped_dir = projects_dir.join("ungrouped");
    if ungrouped_dir.exists() {
        count += count_project_json_files(&ungrouped_dir, &mut Vec::new())?;
    }
    let groups_dir = projects_dir.join("groups");
    if groups_dir.exists() {
        ensure_directory(&groups_dir, "project groups directory")?;
        for entry in fs::read_dir(&groups_dir).map_err(|err| {
            format!(
                "Failed to scan project groups directory {}: {err}",
                groups_dir.display()
            )
        })? {
            let entry =
                entry.map_err(|err| format!("Failed to read project groups entry: {err}"))?;
            let group_path = entry.path();
            let metadata = fs::symlink_metadata(&group_path).map_err(|err| {
                format!(
                    "Failed to inspect project group path {}: {err}",
                    group_path.display()
                )
            })?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Project group path is a symlink: {}",
                    group_path.display()
                ));
            }
            if metadata.file_type().is_dir() {
                count += count_project_json_files(&group_path, &mut Vec::new())?;
            }
        }
    }
    Ok(count)
}

fn classify_data_root(data_root: &Path) -> Result<DataRootClassification, String> {
    if !data_root.exists() {
        return Ok(DataRootClassification::NewEmptyWorkspace);
    }
    ensure_directory(data_root, "data directory")?;

    let app_state_path = data_root.join(APP_STATE_FILE);
    if app_state_path.exists() {
        ensure_regular_file(&app_state_path, APP_STATE_FILE)?;
        let value = read_json::<serde_json::Value>(&app_state_path)?;
        let Some(version_value) = value.get("dataVersion") else {
            return Ok(DataRootClassification::ExistingLegacyV1Workspace);
        };
        let Some(version) = version_value
            .as_u64()
            .and_then(|item| u32::try_from(item).ok())
        else {
            return Ok(DataRootClassification::ExistingLegacyV1Workspace);
        };
        return match version {
            LEGACY_DATA_VERSION => Ok(DataRootClassification::ExistingV1Workspace),
            CURRENT_DATA_VERSION => Ok(DataRootClassification::ExistingV2Workspace),
            version => Ok(DataRootClassification::UnsupportedVersion(version)),
        };
    }

    let projects_dir = data_root.join("projects");
    let flat_count = count_top_level_project_json_files(&projects_dir)?;
    let v2_count = count_v2_project_json_files(&projects_dir)?;
    if flat_count > 0 && v2_count > 0 {
        return Ok(DataRootClassification::AmbiguousLayout);
    }
    if flat_count > 0 {
        return Ok(DataRootClassification::ExistingLegacyV1Workspace);
    }
    if v2_count > 0 {
        return Ok(DataRootClassification::ExistingV2LikeWorkspace);
    }

    let project_json_count = count_project_json_files_readonly(&projects_dir);
    if project_json_count > 0 {
        return Ok(DataRootClassification::RecoveryNeeded(
            "app-state.json is missing and project JSON files exist outside supported v1/v2 layouts"
                .to_string(),
        ));
    }

    Ok(DataRootClassification::NewEmptyWorkspace)
}

fn classification_error(
    classification: DataRootClassification,
    data_root: &Path,
) -> Option<String> {
    match classification {
        DataRootClassification::UnsupportedVersion(version) => Some(format!(
            "Unsupported dataVersion {} in {}",
            version,
            data_root.join(APP_STATE_FILE).display()
        )),
        DataRootClassification::ExistingV2LikeWorkspace => Some(format!(
            "app-state.json is missing but v2-like project files exist under {}; recovery is required before loading or saving",
            data_root.display()
        )),
        DataRootClassification::AmbiguousLayout => Some(format!(
            "app-state.json is missing and both v1 flat and v2 group-folder project files exist under {}; refusing ambiguous layout",
            data_root.display()
        )),
        DataRootClassification::RecoveryNeeded(message) => Some(message),
        _ => None,
    }
}

fn count_project_json_files_readonly(path: &Path) -> usize {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return 0;
    };
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        return 0;
    }

    let mut count = 0;
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.filter_map(Result::ok) {
        let entry_path = entry.path();
        let Ok(entry_metadata) = fs::symlink_metadata(&entry_path) else {
            continue;
        };
        if entry_metadata.file_type().is_symlink() {
            continue;
        }
        if entry_metadata.file_type().is_dir() {
            count += count_project_json_files_readonly(&entry_path);
        } else if entry_metadata.file_type().is_file()
            && entry_path.extension().and_then(|ext| ext.to_str()) == Some("json")
        {
            count += 1;
        }
    }
    count
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

fn data_version_from_value(value: &serde_json::Value) -> u32 {
    value
        .as_u64()
        .and_then(|item| u32::try_from(item).ok())
        .unwrap_or(LEGACY_DATA_VERSION)
}

fn data_version_from_app_state(app_state: &AppState) -> u32 {
    data_version_from_value(&app_state.data_version)
}

fn ensure_project_id_safe(project_id: &str) -> Result<(), String> {
    validate_path_segment_for_migration(project_id, "project id")
}

fn ensure_group_id_safe(group_id: &str) -> Result<(), String> {
    validate_path_segment_for_migration(group_id, "group id")
}

fn v2_project_path(
    data_root: &Path,
    project: &Project,
    valid_group_ids: &HashSet<String>,
) -> Result<PathBuf, String> {
    ensure_project_id_safe(&project.id)?;
    if let Some(group_id) = project
        .group_id
        .as_ref()
        .filter(|group_id| valid_group_ids.contains(*group_id))
    {
        ensure_group_id_safe(group_id)?;
        Ok(data_root
            .join("projects")
            .join("groups")
            .join(group_id)
            .join(format!("{}.json", project.id)))
    } else {
        Ok(data_root
            .join("projects")
            .join("ungrouped")
            .join(format!("{}.json", project.id)))
    }
}

fn register_loaded_project(
    projects: &mut Vec<Project>,
    seen_project_ids: &mut HashMap<String, String>,
    project: Project,
    relative_path: String,
) -> Result<(), String> {
    if let Some(previous_path) = seen_project_ids.insert(project.id.clone(), relative_path.clone())
    {
        return Err(format!(
            "Duplicate project id {} found at {} and {}",
            project.id, previous_path, relative_path
        ));
    }
    projects.push(project);
    Ok(())
}

fn load_project_file(
    data_root: &Path,
    path: &Path,
    projects: &mut Vec<Project>,
    seen_project_ids: &mut HashMap<String, String>,
) -> Result<(), String> {
    ensure_regular_file(path, "project JSON")?;
    let project = read_json::<Project>(path)?;
    ensure_project_id_safe(&project.id)?;
    let relative_path = relative_to_data_root(data_root, path);
    register_loaded_project(projects, seen_project_ids, project, relative_path)
}

fn load_v1_project_files(data_root: &Path, projects_dir: &Path) -> Result<Vec<Project>, String> {
    let mut projects = Vec::new();
    let mut seen_project_ids = HashMap::new();
    if !projects_dir.exists() {
        return Ok(projects);
    }
    ensure_directory(projects_dir, "projects directory")?;
    for entry in fs::read_dir(projects_dir).map_err(|err| {
        format!(
            "Failed to scan projects directory {}: {err}",
            projects_dir.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("Failed to inspect project path {}: {err}", path.display()))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Project path is a symlink: {}",
                relative_to_data_root(data_root, &path)
            ));
        }
        if !metadata.file_type().is_file()
            || path.extension().and_then(|ext| ext.to_str()) != Some("json")
        {
            continue;
        }
        load_project_file(data_root, &path, &mut projects, &mut seen_project_ids)?;
    }
    Ok(projects)
}

fn load_v2_project_files(data_root: &Path, projects_dir: &Path) -> Result<Vec<Project>, String> {
    let mut projects = Vec::new();
    let mut seen_project_ids = HashMap::new();
    if !projects_dir.exists() {
        return Ok(projects);
    }
    ensure_directory(projects_dir, "projects directory")?;

    let ungrouped_dir = projects_dir.join("ungrouped");
    if ungrouped_dir.exists() {
        ensure_directory(&ungrouped_dir, "ungrouped projects directory")?;
        for entry in fs::read_dir(&ungrouped_dir).map_err(|err| {
            format!(
                "Failed to scan ungrouped projects directory {}: {err}",
                ungrouped_dir.display()
            )
        })? {
            let entry = entry.map_err(|err| {
                format!("Failed to read ungrouped projects directory entry: {err}")
            })?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|err| {
                format!("Failed to inspect project path {}: {err}", path.display())
            })?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Project path is a symlink: {}",
                    relative_to_data_root(data_root, &path)
                ));
            }
            if !metadata.file_type().is_file()
                || path.extension().and_then(|ext| ext.to_str()) != Some("json")
            {
                continue;
            }
            load_project_file(data_root, &path, &mut projects, &mut seen_project_ids)?;
        }
    }

    let grouped_root = projects_dir.join("groups");
    if grouped_root.exists() {
        ensure_directory(&grouped_root, "grouped projects directory")?;
        for group_entry in fs::read_dir(&grouped_root).map_err(|err| {
            format!(
                "Failed to scan grouped projects directory {}: {err}",
                grouped_root.display()
            )
        })? {
            let group_entry = group_entry
                .map_err(|err| format!("Failed to read grouped directory entry: {err}"))?;
            let group_path = group_entry.path();
            let group_metadata = fs::symlink_metadata(&group_path).map_err(|err| {
                format!(
                    "Failed to inspect group path {}: {err}",
                    group_path.display()
                )
            })?;
            if group_metadata.file_type().is_symlink() {
                return Err(format!(
                    "Group project path is a symlink: {}",
                    relative_to_data_root(data_root, &group_path)
                ));
            }
            if !group_metadata.file_type().is_dir() {
                continue;
            }
            let group_id = group_path
                .file_name()
                .and_then(|item| item.to_str())
                .unwrap_or_default();
            ensure_group_id_safe(group_id)?;
            for entry in fs::read_dir(&group_path).map_err(|err| {
                format!(
                    "Failed to scan group projects directory {}: {err}",
                    group_path.display()
                )
            })? {
                let entry =
                    entry.map_err(|err| format!("Failed to read group project entry: {err}"))?;
                let path = entry.path();
                let metadata = fs::symlink_metadata(&path).map_err(|err| {
                    format!("Failed to inspect project path {}: {err}", path.display())
                })?;
                if metadata.file_type().is_symlink() {
                    return Err(format!(
                        "Project path is a symlink: {}",
                        relative_to_data_root(data_root, &path)
                    ));
                }
                if !metadata.file_type().is_file()
                    || path.extension().and_then(|ext| ext.to_str()) != Some("json")
                {
                    continue;
                }
                load_project_file(data_root, &path, &mut projects, &mut seen_project_ids)?;
            }
        }
    }

    Ok(projects)
}

fn collect_project_file_paths(path: &Path, results: &mut Vec<PathBuf>) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    ensure_directory(path, "project search directory")?;
    for entry in fs::read_dir(path).map_err(|err| {
        format!(
            "Failed to scan project search directory {}: {err}",
            path.display()
        )
    })? {
        let entry = entry.map_err(|err| format!("Failed to read project search entry: {err}"))?;
        let entry_path = entry.path();
        let metadata = fs::symlink_metadata(&entry_path).map_err(|err| {
            format!(
                "Failed to inspect project search path {}: {err}",
                entry_path.display()
            )
        })?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Project search path is a symlink: {}",
                entry_path.display()
            ));
        }
        if metadata.file_type().is_dir() {
            collect_project_file_paths(&entry_path, results)?;
        } else if metadata.file_type().is_file()
            && entry_path.extension().and_then(|ext| ext.to_str()) == Some("json")
        {
            results.push(entry_path);
        }
    }
    Ok(())
}

fn quarantine_noncanonical_project_files(
    data_root: &Path,
    project_id: &str,
    canonical_path: &Path,
) -> Result<(), String> {
    ensure_project_id_safe(project_id)?;
    let projects_dir = data_root.join("projects");
    let mut paths = Vec::new();
    collect_project_file_paths(&projects_dir, &mut paths)?;
    let mut moved_count = 0usize;
    let mut quarantine_dir: Option<PathBuf> = None;

    for path in paths {
        if path == canonical_path {
            continue;
        }
        if path.file_stem().and_then(|item| item.to_str()) != Some(project_id) {
            continue;
        }
        let dir = match &quarantine_dir {
            Some(dir) => dir.clone(),
            None => {
                let dir = data_root
                    .join(".cheerio")
                    .join("stale-project-files")
                    .join(backup_timestamp());
                fs::create_dir_all(&dir).map_err(|err| {
                    format!(
                        "Failed to create stale project quarantine directory {}: {err}",
                        dir.display()
                    )
                })?;
                quarantine_dir = Some(dir.clone());
                dir
            }
        };
        let relative = relative_to_data_root(data_root, &path);
        let target = relative
            .split('/')
            .fold(dir.clone(), |target, segment| target.join(segment));
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|err| {
                format!(
                    "Failed to create stale project quarantine parent {}: {err}",
                    parent.display()
                )
            })?;
        }
        fs::rename(&path, &target).map_err(|err| {
            format!(
                "Failed to move stale project file {} to {}: {err}",
                path.display(),
                target.display()
            )
        })?;
        moved_count += 1;
    }

    if moved_count > 0 {
        println!(
            "Cheerio Flow moved {moved_count} stale project file(s) for {project_id} to {}",
            quarantine_dir
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default()
        );
    }
    Ok(())
}

fn load_database_from_paths(
    storage_root: PathBuf,
    bootstrap: PathBuf,
) -> Result<PersistedData, String> {
    let data_root = data_root_for(&storage_root);
    let projects_dir = data_root.join("projects");
    let classification = classify_data_root(&data_root)?;
    if let Some(error) = classification_error(classification.clone(), &data_root) {
        return Err(error);
    }

    let groups_path = data_root.join(GROUPS_FILE);
    let groups = if groups_path.exists() {
        read_json::<Vec<ProjectGroup>>(&groups_path)?
    } else {
        vec![]
    };

    let app_state_path = data_root.join(APP_STATE_FILE);
    let mut app_state = match &classification {
        DataRootClassification::NewEmptyWorkspace => AppState::default(),
        DataRootClassification::ExistingLegacyV1Workspace => {
            if app_state_path.exists() {
                read_json::<AppState>(&app_state_path)?
            } else {
                let mut legacy_app_state = AppState::default();
                legacy_app_state.data_version = serde_json::Value::from(LEGACY_DATA_VERSION);
                legacy_app_state
            }
        }
        DataRootClassification::ExistingV1Workspace
        | DataRootClassification::ExistingV2Workspace => read_json::<AppState>(&app_state_path)?,
        DataRootClassification::UnsupportedVersion(_)
        | DataRootClassification::ExistingV2LikeWorkspace
        | DataRootClassification::AmbiguousLayout
        | DataRootClassification::RecoveryNeeded(_) => {
            unreachable!("blocked classifications returned before load")
        }
    };
    let data_version = data_version_from_app_state(&app_state);

    let mut projects = match data_version {
        LEGACY_DATA_VERSION => load_v1_project_files(&data_root, &projects_dir)?,
        CURRENT_DATA_VERSION => load_v2_project_files(&data_root, &projects_dir)?,
        _ => {
            return Err(format!(
                "Unsupported dataVersion {} in {}",
                data_version,
                app_state_path.display()
            ))
        }
    };

    if projects.is_empty() {
        if classification != DataRootClassification::NewEmptyWorkspace {
            return Err(format!(
                "Storage at {} contains metadata but no valid project JSON files; refusing to overwrite it with an empty project",
                data_root.display()
            ));
        }
        let project = default_project();
        app_state.current_project_id = Some(project.id.clone());
        write_json(
            &v2_project_path(&data_root, &project, &HashSet::new())?,
            &project,
        )?;
        write_json(&data_root.join(GROUPS_FILE), &groups)?;
        write_json(&data_root.join(APP_STATE_FILE), &app_state)?;
        projects.push(project);
    }

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

fn load_database_from(
    app: &tauri::AppHandle,
    storage_root: PathBuf,
) -> Result<PersistedData, String> {
    let bootstrap = bootstrap_path(app)?;
    load_database_from_paths(storage_root, bootstrap)
}

fn save_database_to(
    app: &tauri::AppHandle,
    storage_root: PathBuf,
    payload: DatabasePayload,
) -> Result<StorageReport, String> {
    if payload.projects.is_empty() {
        return Err("Refusing to save empty project list because it could overwrite or orphan existing project files".to_string());
    }

    let bootstrap = bootstrap_path(app)?;
    let data_root = data_root_for(&storage_root);
    let data_version = data_version_from_app_state(&payload.app_state);
    match data_version {
        LEGACY_DATA_VERSION => {
            let projects_dir = ensure_data_dirs(&data_root)?;
            for project in &payload.projects {
                ensure_project_id_safe(&project.id)?;
                write_json(&projects_dir.join(format!("{}.json", project.id)), project)?;
            }
        }
        CURRENT_DATA_VERSION => {
            let valid_group_ids = payload
                .groups
                .iter()
                .map(|group| {
                    ensure_group_id_safe(&group.id)?;
                    Ok(group.id.clone())
                })
                .collect::<Result<HashSet<_>, String>>()?;
            for project in &payload.projects {
                let canonical_path = v2_project_path(&data_root, project, &valid_group_ids)?;
                write_json(&canonical_path, project)?;
                quarantine_noncanonical_project_files(&data_root, &project.id, &canonical_path)?;
            }
        }
        _ => {
            return Err(format!(
                "Refusing to save unsupported dataVersion {}",
                data_version
            ))
        }
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

fn backup_timestamp() -> String {
    let format =
        format_description::parse_borrowed::<3>("[year][month][day]-[hour][minute][second]")
            .expect("valid backup id time format");
    OffsetDateTime::now_local()
        .unwrap_or_else(|_| OffsetDateTime::now_utc())
        .format(&format)
        .unwrap_or_else(|_| "19700101-000000".to_string())
}

fn allocate_backup_dir(backups_root: &Path) -> Result<(String, PathBuf), String> {
    allocate_backup_dir_with_suffix(backups_root, None)
}

fn allocate_backup_dir_with_suffix(
    backups_root: &Path,
    suffix: Option<&str>,
) -> Result<(String, PathBuf), String> {
    fs::create_dir_all(backups_root).map_err(|err| {
        format!(
            "Failed to create backups directory {}: {err}",
            backups_root.display()
        )
    })?;

    let timestamp = backup_timestamp();
    for index in 0..1000 {
        let base = match suffix {
            Some(suffix) if !suffix.is_empty() => format!("backup-{timestamp}-{suffix}"),
            _ => format!("backup-{timestamp}"),
        };
        let backup_id = if index == 0 {
            base
        } else {
            format!("{base}-{index:03}")
        };
        let backup_dir = backups_root.join(&backup_id);
        match fs::create_dir(&backup_dir) {
            Ok(()) => return Ok((backup_id, backup_dir)),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => {
                return Err(format!(
                    "Failed to create backup directory {}: {err}",
                    backup_dir.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to allocate a unique backup directory under {}",
        backups_root.display()
    ))
}

fn should_skip_backup_entry(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|item| item.to_str()) else {
        return false;
    };
    matches!(
        name,
        BACKUPS_DIR_NAME | ".DS_Store" | "Thumbs.db" | "desktop.ini"
    ) || name.ends_with(".lock")
        || name.ends_with(".tmp")
}

fn copy_backup_tree(
    source: &Path,
    destination: &Path,
    copied_file_count: &mut usize,
    total_bytes: &mut u64,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|err| {
        format!(
            "Failed to create backup directory {}: {err}",
            destination.display()
        )
    })?;

    for entry in fs::read_dir(source).map_err(|err| {
        format!(
            "Failed to scan source data directory {}: {err}",
            source.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read source data directory entry: {err}"))?;
        let source_path = entry.path();
        if should_skip_backup_entry(&source_path) {
            continue;
        }

        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path).map_err(|err| {
            format!(
                "Failed to inspect source path {}: {err}",
                source_path.display()
            )
        })?;
        let file_type = metadata.file_type();

        if file_type.is_symlink() {
            warnings.push(format!("Skipped symlink {}", source_path.display()));
        } else if file_type.is_dir() {
            copy_backup_tree(
                &source_path,
                &destination_path,
                copied_file_count,
                total_bytes,
                warnings,
            )?;
        } else if file_type.is_file() {
            let bytes = fs::copy(&source_path, &destination_path).map_err(|err| {
                format!(
                    "Failed to copy {} to {}: {err}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
            *copied_file_count += 1;
            *total_bytes += bytes;
        } else {
            warnings.push(format!(
                "Skipped unsupported file type {}",
                source_path.display()
            ));
        }
    }

    Ok(())
}

fn count_project_json_files(
    projects_dir: &Path,
    warnings: &mut Vec<String>,
) -> Result<usize, String> {
    if !projects_dir.exists() {
        return Ok(0);
    }
    let projects_metadata = fs::symlink_metadata(projects_dir).map_err(|err| {
        format!(
            "Failed to inspect projects directory {}: {err}",
            projects_dir.display()
        )
    })?;
    if projects_metadata.file_type().is_symlink() || !projects_metadata.file_type().is_dir() {
        warnings.push(format!(
            "Projects path is not a directory: {}",
            projects_dir.display()
        ));
        return Ok(0);
    }

    let mut count = 0;
    for entry in fs::read_dir(projects_dir).map_err(|err| {
        format!(
            "Failed to scan projects directory {}: {err}",
            projects_dir.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("Failed to inspect project path {}: {err}", path.display()))?;
        if metadata.file_type().is_symlink() {
            warnings.push(format!("Skipped symlink {}", path.display()));
        } else if metadata.file_type().is_dir() {
            count += count_project_json_files(&path, warnings)?;
        } else if metadata.file_type().is_file()
            && path.extension().and_then(|ext| ext.to_str()) == Some("json")
        {
            count += 1;
        }
    }
    Ok(count)
}

fn read_app_data_version(
    data_root: &Path,
    warnings: &mut Vec<String>,
) -> Option<serde_json::Value> {
    let app_state_path = data_root.join(APP_STATE_FILE);
    if !app_state_path.exists() {
        return None;
    }

    match read_json::<serde_json::Value>(&app_state_path) {
        Ok(value) => value.get("dataVersion").cloned(),
        Err(err) => {
            warnings.push(format!(
                "Could not read data version from app-state.json: {err}"
            ));
            None
        }
    }
}

fn validate_backup_id(backup_id: &str) -> Result<(), String> {
    let trimmed = backup_id.trim();
    if trimmed.is_empty() {
        return Err("Backup id cannot be empty".to_string());
    }
    if trimmed != backup_id {
        return Err("Backup id cannot contain leading or trailing whitespace".to_string());
    }
    if !trimmed.starts_with("backup-") {
        return Err("Backup id must start with backup-".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Backup id cannot contain path separators".to_string());
    }
    if trimmed.contains("..") {
        return Err("Backup id cannot contain ..".to_string());
    }
    if Path::new(trimmed).is_absolute() {
        return Err("Backup id cannot be an absolute path".to_string());
    }
    Ok(())
}

fn ensure_regular_file(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|err| format!("Failed to inspect {label} {}: {err}", path.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("{label} cannot be a symlink: {}", path.display()));
    }
    if !metadata.file_type().is_file() {
        return Err(format!("{label} is not a file: {}", path.display()));
    }
    Ok(())
}

fn ensure_directory(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|err| format!("Failed to inspect {label} {}: {err}", path.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("{label} cannot be a symlink: {}", path.display()));
    }
    if !metadata.file_type().is_dir() {
        return Err(format!("{label} is not a directory: {}", path.display()));
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct MigrationProjectRecord {
    project_id: String,
    project_title: String,
    source_relative_path: String,
    current_group_id: Option<String>,
    blockers: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct MigrationGroupRecord {
    group_id: String,
    title: String,
    project_ids: Vec<String>,
    blockers: Vec<String>,
    warnings: Vec<String>,
}

fn relative_to_data_root(data_root: &Path, path: &Path) -> String {
    path.strip_prefix(data_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn validate_path_segment_for_migration(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if value.trim() != value {
        return Err(format!(
            "{label} cannot contain leading or trailing whitespace: {value}"
        ));
    }
    if value.contains('/') || value.contains('\\') {
        return Err(format!("{label} cannot contain path separators: {value}"));
    }
    if value.contains("..") {
        return Err(format!("{label} cannot contain ..: {value}"));
    }
    if value.contains('\0') {
        return Err(format!("{label} cannot contain NUL: {value}"));
    }
    if Path::new(value).is_absolute() {
        return Err(format!("{label} cannot be an absolute path: {value}"));
    }
    let bytes = value.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return Err(format!(
            "{label} cannot contain a Windows drive prefix: {value}"
        ));
    }
    Ok(())
}

fn migration_status(blockers: &[String], warnings: &[String]) -> String {
    if !blockers.is_empty() {
        "blocked".to_string()
    } else if !warnings.is_empty() {
        "warning".to_string()
    } else {
        "planned".to_string()
    }
}

fn push_unique(items: &mut Vec<String>, item: String) {
    if !items.iter().any(|existing| existing == &item) {
        items.push(item);
    }
}

fn string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|item| item.as_str())
        .map(|item| item.to_string())
}

fn string_array_field(value: &serde_json::Value, key: &str) -> Result<Vec<String>, String> {
    let Some(raw_items) = value.get(key) else {
        return Ok(vec![]);
    };
    let Some(items) = raw_items.as_array() else {
        return Err(format!("{key} is not an array"));
    };
    let mut result = Vec::new();
    for item in items {
        let Some(text) = item.as_str() else {
            return Err(format!("{key} contains a non-string value"));
        };
        result.push(text.to_string());
    }
    Ok(result)
}

fn read_source_data_version_for_migration(
    app_state_path: &Path,
    blockers: &mut Vec<String>,
) -> u32 {
    if !app_state_path.exists() {
        push_unique(
            blockers,
            format!(
                "app-state.json does not exist: {}",
                app_state_path.display()
            ),
        );
        return 1;
    }
    match ensure_regular_file(app_state_path, APP_STATE_FILE)
        .and_then(|_| read_json::<serde_json::Value>(app_state_path))
    {
        Ok(value) => value
            .get("dataVersion")
            .and_then(|item| item.as_u64())
            .and_then(|item| u32::try_from(item).ok())
            .unwrap_or(1),
        Err(err) => {
            push_unique(blockers, err);
            1
        }
    }
}

fn read_groups_for_migration(
    groups_path: &Path,
    blockers: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> (Vec<MigrationGroupRecord>, bool) {
    if !groups_path.exists() {
        push_unique(
            blockers,
            format!("groups.json does not exist: {}", groups_path.display()),
        );
        return (vec![], false);
    }

    let value = match ensure_regular_file(groups_path, GROUPS_FILE)
        .and_then(|_| read_json::<serde_json::Value>(groups_path))
    {
        Ok(value) => value,
        Err(err) => {
            push_unique(blockers, err);
            return (vec![], false);
        }
    };

    let Some(items) = value.as_array() else {
        push_unique(
            blockers,
            format!("groups.json is not an array: {}", groups_path.display()),
        );
        return (vec![], false);
    };

    let mut seen_group_ids = HashSet::new();
    let mut records = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let mut group_blockers = Vec::new();
        let mut group_warnings = Vec::new();
        let group_id = string_field(item, "id").unwrap_or_default();
        if let Err(err) = validate_path_segment_for_migration(&group_id, "group id") {
            group_blockers.push(format!("Group at index {index}: {err}"));
        }
        if !group_id.is_empty() && !seen_group_ids.insert(group_id.clone()) {
            group_blockers.push(format!("Duplicate group id: {group_id}"));
        }

        let title = string_field(item, "title").unwrap_or_default();
        if title.trim().is_empty() {
            group_warnings.push(format!("Group {group_id} has a missing title"));
        }

        let project_ids = match string_array_field(item, "projectIds") {
            Ok(project_ids) => {
                let mut seen_project_ids = HashSet::new();
                for project_id in &project_ids {
                    if !seen_project_ids.insert(project_id.clone()) {
                        group_warnings.push(format!(
                            "Group {group_id} lists duplicate project id {project_id}"
                        ));
                    }
                }
                project_ids
            }
            Err(err) => {
                group_blockers.push(format!("Group {group_id}: {err}"));
                vec![]
            }
        };

        for blocker in &group_blockers {
            push_unique(blockers, blocker.clone());
        }
        for warning in &group_warnings {
            push_unique(warnings, warning.clone());
        }
        records.push(MigrationGroupRecord {
            group_id,
            title,
            project_ids,
            blockers: group_blockers,
            warnings: group_warnings,
        });
    }
    (records, true)
}

fn read_projects_for_migration(
    data_root: &Path,
    projects_dir: &Path,
    blockers: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<(Vec<MigrationProjectRecord>, usize), String> {
    if !projects_dir.exists() {
        push_unique(
            blockers,
            format!(
                "projects directory does not exist: {}",
                projects_dir.display()
            ),
        );
        return Ok((vec![], 0));
    }
    if let Err(err) = ensure_directory(projects_dir, "projects directory") {
        push_unique(blockers, err);
        return Ok((vec![], 0));
    }

    let mut records = Vec::new();
    let mut source_project_file_count = 0;
    for entry in fs::read_dir(projects_dir).map_err(|err| {
        format!(
            "Failed to scan projects directory {}: {err}",
            projects_dir.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
        let path = entry.path();
        let source_relative_path = relative_to_data_root(data_root, &path);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("Failed to inspect project path {}: {err}", path.display()))?;
        let file_type = metadata.file_type();

        if file_type.is_symlink() {
            push_unique(
                blockers,
                format!("Project path is a symlink: {source_relative_path}"),
            );
            continue;
        }
        if file_type.is_dir() {
            push_unique(
                warnings,
                format!(
                "projects/ contains a subdirectory, suggesting mixed layout: {source_relative_path}"
            ),
            );
            continue;
        }
        if !file_type.is_file() {
            push_unique(
                warnings,
                format!("projects/ contains an unsupported entry: {source_relative_path}"),
            );
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            push_unique(
                warnings,
                format!("projects/ contains a non-JSON file: {source_relative_path}"),
            );
            continue;
        }
        source_project_file_count += 1;

        let file_stem = path
            .file_stem()
            .and_then(|item| item.to_str())
            .unwrap_or_default()
            .to_string();
        let mut project_blockers = Vec::new();
        let mut project_warnings = Vec::new();
        let value = match read_json::<serde_json::Value>(&path) {
            Ok(value) => value,
            Err(err) => {
                project_blockers.push(err);
                if let Err(err) =
                    validate_path_segment_for_migration(&file_stem, "project file stem")
                {
                    project_blockers.push(format!("{source_relative_path}: {err}"));
                }
                for blocker in &project_blockers {
                    push_unique(blockers, blocker.clone());
                }
                records.push(MigrationProjectRecord {
                    project_id: file_stem.clone(),
                    project_title: String::new(),
                    source_relative_path,
                    current_group_id: None,
                    blockers: project_blockers,
                    warnings: project_warnings,
                });
                continue;
            }
        };

        let project_id = string_field(&value, "id").unwrap_or_default();
        if let Err(err) = validate_path_segment_for_migration(&project_id, "project id") {
            project_blockers.push(format!("{source_relative_path}: {err}"));
        }
        if project_id != file_stem {
            project_blockers.push(format!(
                "Project id {project_id} does not match file stem {file_stem} at {source_relative_path}"
            ));
        }
        let current_group_id = string_field(&value, "groupId").filter(|item| !item.is_empty());
        if let Some(group_id) = &current_group_id {
            if let Err(err) = validate_path_segment_for_migration(group_id, "project groupId") {
                project_blockers.push(format!("{source_relative_path}: {err}"));
            }
        }

        let project_title = string_field(&value, "title").unwrap_or_default();
        if project_title.trim().is_empty() {
            project_warnings.push(format!("Project {project_id} has a missing title"));
        }

        for blocker in &project_blockers {
            push_unique(blockers, blocker.clone());
        }
        for warning in &project_warnings {
            push_unique(warnings, warning.clone());
        }
        records.push(MigrationProjectRecord {
            project_id,
            project_title,
            source_relative_path,
            current_group_id,
            blockers: project_blockers,
            warnings: project_warnings,
        });
    }
    Ok((records, source_project_file_count))
}

fn path_exists_for_migration(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(format!("Failed to inspect path {}: {err}", path.display())),
    }
}

fn data_relative_path(data_root: &Path, relative_path: &str) -> PathBuf {
    relative_path
        .split('/')
        .fold(data_root.to_path_buf(), |path, segment| path.join(segment))
}

fn inspect_projects_layout_for_migration(
    data_root: &Path,
    projects_dir: &Path,
    blockers: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<String, String> {
    if !data_root.exists() || !projects_dir.exists() {
        return Ok("missing".to_string());
    }
    if let Err(err) = ensure_directory(data_root, "data directory") {
        push_unique(blockers, err);
        return Ok("unknown".to_string());
    }
    if let Err(err) = ensure_directory(projects_dir, "projects directory") {
        push_unique(blockers, err);
        return Ok("unknown".to_string());
    }

    let mut has_subdir = false;
    for reserved in ["ungrouped", "groups"] {
        let path = projects_dir.join(reserved);
        if path_exists_for_migration(&path)? {
            has_subdir = true;
            push_unique(
                blockers,
                format!(
                    "Reserved future target directory already exists: {}",
                    relative_to_data_root(data_root, &path)
                ),
            );
        }
    }

    for entry in fs::read_dir(projects_dir).map_err(|err| {
        format!(
            "Failed to scan projects directory {}: {err}",
            projects_dir.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("Failed to inspect projects entry {}: {err}", path.display()))?;
        if metadata.file_type().is_symlink() {
            push_unique(
                blockers,
                format!(
                    "projects/ contains a symlink: {}",
                    relative_to_data_root(data_root, &path)
                ),
            );
        } else if metadata.file_type().is_dir() {
            has_subdir = true;
            push_unique(
                warnings,
                format!(
                    "projects/ contains a subdirectory: {}",
                    relative_to_data_root(data_root, &path)
                ),
            );
        }
    }

    if has_subdir {
        Ok("mixed".to_string())
    } else {
        Ok("flat".to_string())
    }
}

fn validate_data_dir(data_root: &Path) -> Result<usize, String> {
    if !data_root.exists() {
        return Err(format!(
            "Data directory does not exist: {}",
            data_root.display()
        ));
    }
    ensure_directory(data_root, "data directory")?;

    let groups_path = data_root.join(GROUPS_FILE);
    ensure_regular_file(&groups_path, GROUPS_FILE)?;
    read_json::<Vec<ProjectGroup>>(&groups_path)?;

    let app_state_path = data_root.join(APP_STATE_FILE);
    ensure_regular_file(&app_state_path, APP_STATE_FILE)?;
    let app_state = read_json::<AppState>(&app_state_path)?;
    let data_version = data_version_from_app_state(&app_state);

    let projects_dir = data_root.join("projects");
    if !projects_dir.exists() {
        return Err(format!(
            "Projects directory does not exist: {}",
            projects_dir.display()
        ));
    }
    ensure_directory(&projects_dir, "projects directory")?;

    let projects = match data_version {
        LEGACY_DATA_VERSION => load_v1_project_files(data_root, &projects_dir)?,
        CURRENT_DATA_VERSION => load_v2_project_files(data_root, &projects_dir)?,
        _ => {
            return Err(format!(
                "Unsupported dataVersion {} in {}",
                data_version,
                app_state_path.display()
            ))
        }
    };
    let project_file_count = projects.len();

    if project_file_count == 0 {
        return Err(format!(
            "Projects directory contains no project JSON files: {}",
            projects_dir.display()
        ));
    }

    Ok(project_file_count)
}

fn validate_backup_for_restore(
    backups_root: &Path,
    backup_id: &str,
) -> Result<(PathBuf, PathBuf, PathBuf, BackupManifest, usize), String> {
    validate_backup_id(backup_id)?;
    let backup_dir = backups_root.join(backup_id);
    if !backup_dir.exists() {
        return Err(format!(
            "Backup directory does not exist: {}",
            backup_dir.display()
        ));
    }
    ensure_directory(&backup_dir, "backup directory")?;

    let backup_data_dir = backup_dir.join(DATA_DIR_NAME);
    if !backup_data_dir.exists() {
        return Err(format!(
            "Backup data directory does not exist: {}",
            backup_data_dir.display()
        ));
    }
    ensure_directory(&backup_data_dir, "backup data directory")?;

    let manifest_path = backup_dir.join("backup-manifest.json");
    ensure_regular_file(&manifest_path, "backup manifest")?;
    let manifest = read_json::<BackupManifest>(&manifest_path)?;
    if manifest.backup_id != backup_id {
        return Err(format!(
            "Backup manifest id {} does not match requested backup id {}",
            manifest.backup_id, backup_id
        ));
    }
    let project_file_count = validate_data_dir(&backup_data_dir)?;
    Ok((
        backup_dir,
        backup_data_dir,
        manifest_path,
        manifest,
        project_file_count,
    ))
}

fn create_pre_restore_backup(
    storage_root: &Path,
    data_root: &Path,
    warnings: &mut Vec<String>,
) -> Result<PathBuf, String> {
    let backups_root = backups_root_for(storage_root);
    let (backup_id, backup_dir) =
        allocate_backup_dir_with_suffix(&backups_root, Some("pre-restore"))?;
    let backup_data_dir = backup_dir.join(DATA_DIR_NAME);
    let manifest_path = backup_dir.join("backup-manifest.json");
    let mut backup_warnings = Vec::new();
    let mut copied_file_count = 0;
    let mut total_bytes = 0;
    let mut project_file_count = 0;
    let mut data_version = None;

    if data_root.exists() {
        ensure_directory(data_root, "current data directory")?;
        project_file_count =
            count_project_json_files(&data_root.join("projects"), &mut backup_warnings)?;
        data_version = read_app_data_version(data_root, &mut backup_warnings);
        copy_backup_tree(
            data_root,
            &backup_data_dir,
            &mut copied_file_count,
            &mut total_bytes,
            &mut backup_warnings,
        )?;
    } else {
        fs::create_dir_all(&backup_data_dir).map_err(|err| {
            format!(
                "Failed to create empty pre-restore data directory {}: {err}",
                backup_data_dir.display()
            )
        })?;
        backup_warnings.push(format!(
            "Current data directory did not exist before restore: {}",
            data_root.display()
        ));
    }

    let created_at = now_string();
    let manifest = BackupManifest {
        manifest_version: 1,
        backup_id,
        created_at,
        data_version,
        source_data_dir: data_root.to_string_lossy().to_string(),
        backup_dir: backup_dir.to_string_lossy().to_string(),
        project_file_count,
        copied_file_count,
        total_bytes,
        warnings: backup_warnings.clone(),
    };
    write_json(&manifest_path, &manifest)?;
    warnings.extend(backup_warnings);
    Ok(backup_dir)
}

fn allocate_restore_staging_dir(storage_root: &Path) -> Result<PathBuf, String> {
    let timestamp = backup_timestamp();
    for index in 0..1000 {
        let staging_name = if index == 0 {
            format!(".restore-staging-{timestamp}")
        } else {
            format!(".restore-staging-{timestamp}-{index:03}")
        };
        let staging_dir = storage_root.join(staging_name);
        match fs::create_dir(&staging_dir) {
            Ok(()) => return Ok(staging_dir),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => {
                return Err(format!(
                    "Failed to create restore staging directory {}: {err}",
                    staging_dir.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to allocate a unique restore staging directory under {}",
        storage_root.display()
    ))
}

fn rename_current_data_to_before_restore(data_root: &Path) -> Result<PathBuf, String> {
    let parent = data_root.parent().ok_or_else(|| {
        format!(
            "Cannot determine parent directory for current data directory {}",
            data_root.display()
        )
    })?;
    let timestamp = backup_timestamp();
    for index in 0..1000 {
        let name = if index == 0 {
            format!("{DATA_DIR_NAME}.before-restore-{timestamp}")
        } else {
            format!("{DATA_DIR_NAME}.before-restore-{timestamp}-{index:03}")
        };
        let candidate = parent.join(name);
        match fs::rename(data_root, &candidate) {
            Ok(()) => return Ok(candidate),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => {
                return Err(format!(
                    "Failed to move current data directory {} to {}: {err}",
                    data_root.display(),
                    candidate.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to allocate a before-restore directory under {}",
        parent.display()
    ))
}

fn allocate_migration_staging_dir(storage_root: &Path) -> Result<PathBuf, String> {
    let timestamp = backup_timestamp();
    for index in 0..1000 {
        let staging_name = if index == 0 {
            format!(".migration-staging-{timestamp}")
        } else {
            format!(".migration-staging-{timestamp}-{index:03}")
        };
        let staging_dir = storage_root.join(staging_name);
        match fs::create_dir(&staging_dir) {
            Ok(()) => return Ok(staging_dir),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => {
                return Err(format!(
                    "Failed to create migration staging directory {}: {err}",
                    staging_dir.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to allocate a unique migration staging directory under {}",
        storage_root.display()
    ))
}

fn rename_current_data_to_before_migration(data_root: &Path) -> Result<PathBuf, String> {
    let parent = data_root.parent().ok_or_else(|| {
        format!(
            "Cannot determine parent directory for current data directory {}",
            data_root.display()
        )
    })?;
    let timestamp = backup_timestamp();
    for index in 0..1000 {
        let name = if index == 0 {
            format!("{DATA_DIR_NAME}.before-migration-{timestamp}")
        } else {
            format!("{DATA_DIR_NAME}.before-migration-{timestamp}-{index:03}")
        };
        let candidate = parent.join(name);
        match fs::rename(data_root, &candidate) {
            Ok(()) => return Ok(candidate),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => {
                return Err(format!(
                    "Failed to move current data directory {} to {}: {err}",
                    data_root.display(),
                    candidate.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to allocate a before-migration directory under {}",
        parent.display()
    ))
}

fn build_v2_staging_data(
    source_data_root: &Path,
    staging_data_root: &Path,
    dry_run: &MigrationDryRunReport,
) -> Result<(), String> {
    fs::create_dir_all(staging_data_root).map_err(|err| {
        format!(
            "Failed to create staging data directory {}: {err}",
            staging_data_root.display()
        )
    })?;

    let groups_path = source_data_root.join(GROUPS_FILE);
    ensure_regular_file(&groups_path, GROUPS_FILE)?;
    fs::copy(&groups_path, staging_data_root.join(GROUPS_FILE)).map_err(|err| {
        format!("Failed to copy groups.json into migration staging directory: {err}")
    })?;

    let app_state_path = source_data_root.join(APP_STATE_FILE);
    ensure_regular_file(&app_state_path, APP_STATE_FILE)?;
    let mut app_state_value = read_json::<serde_json::Value>(&app_state_path)?;
    let Some(app_state_object) = app_state_value.as_object_mut() else {
        return Err(format!(
            "app-state.json is not an object: {}",
            app_state_path.display()
        ));
    };
    app_state_object.insert(
        "dataVersion".to_string(),
        serde_json::Value::from(CURRENT_DATA_VERSION),
    );
    write_json(&staging_data_root.join(APP_STATE_FILE), &app_state_value)?;

    for plan in &dry_run.project_plans {
        if plan.status == "blocked" || plan.target_relative_path.is_empty() {
            return Err(format!(
                "Refusing to stage blocked migration project plan for {}",
                plan.project_id
            ));
        }
        ensure_project_id_safe(&plan.project_id)?;
        if let Some(group_id) = &plan.target_group_id {
            ensure_group_id_safe(group_id)?;
        }
        let source_path = data_relative_path(source_data_root, &plan.source_relative_path);
        ensure_regular_file(&source_path, "source project JSON")?;
        read_json::<Project>(&source_path)?;
        let target_path = data_relative_path(staging_data_root, &plan.target_relative_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|err| {
                format!(
                    "Failed to create staging project directory {}: {err}",
                    parent.display()
                )
            })?;
        }
        fs::copy(&source_path, &target_path).map_err(|err| {
            format!(
                "Failed to copy project {} to migration staging target {}: {err}",
                source_path.display(),
                target_path.display()
            )
        })?;
    }

    Ok(())
}

fn verify_v2_staging_data(
    staging_data_root: &Path,
    dry_run: &MigrationDryRunReport,
) -> Result<(), String> {
    ensure_directory(staging_data_root, "migration staging data directory")?;
    let groups_path = staging_data_root.join(GROUPS_FILE);
    ensure_regular_file(&groups_path, GROUPS_FILE)?;
    read_json::<Vec<ProjectGroup>>(&groups_path)?;

    let app_state_path = staging_data_root.join(APP_STATE_FILE);
    ensure_regular_file(&app_state_path, APP_STATE_FILE)?;
    let app_state = read_json::<AppState>(&app_state_path)?;
    if data_version_from_app_state(&app_state) != CURRENT_DATA_VERSION {
        return Err(format!(
            "Staged app-state.json dataVersion is not {}",
            CURRENT_DATA_VERSION
        ));
    }

    for plan in &dry_run.project_plans {
        if plan.status == "blocked" || plan.target_relative_path.is_empty() {
            continue;
        }
        let target_path = data_relative_path(staging_data_root, &plan.target_relative_path);
        ensure_regular_file(&target_path, "staged project JSON")?;
        read_json::<Project>(&target_path)?;
    }

    let projects = load_v2_project_files(staging_data_root, &staging_data_root.join("projects"))?;
    if projects.len() != dry_run.summary.project_file_count {
        return Err(format!(
            "Staged project count {} does not match expected {}",
            projects.len(),
            dry_run.summary.project_file_count
        ));
    }
    Ok(())
}

#[tauri::command]
fn generate_migration_dry_run_plan(app: tauri::AppHandle) -> Result<MigrationDryRunReport, String> {
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    let projects_dir = data_root.join("projects");
    let groups_path = data_root.join(GROUPS_FILE);
    let app_state_path = data_root.join(APP_STATE_FILE);
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    let source_data_version =
        read_source_data_version_for_migration(&app_state_path, &mut blockers);
    if source_data_version == CURRENT_DATA_VERSION {
        let groups = if groups_path.exists() {
            match ensure_regular_file(&groups_path, GROUPS_FILE)
                .and_then(|_| read_json::<Vec<ProjectGroup>>(&groups_path))
            {
                Ok(groups) => groups,
                Err(err) => {
                    push_unique(&mut blockers, err);
                    vec![]
                }
            }
        } else {
            vec![]
        };
        let projects = match load_v2_project_files(&data_root, &projects_dir) {
            Ok(projects) => projects,
            Err(err) => {
                push_unique(&mut blockers, err);
                vec![]
            }
        };
        let grouped_project_count = projects
            .iter()
            .filter(|project| {
                project
                    .group_id
                    .as_ref()
                    .is_some_and(|group_id| groups.iter().any(|group| group.id == *group_id))
            })
            .count();
        let ungrouped_project_count = projects.len().saturating_sub(grouped_project_count);
        return Ok(MigrationDryRunReport {
            report_version: 1,
            generated_at: now_string(),
            source_data_dir: data_root.to_string_lossy().to_string(),
            source_projects_dir: projects_dir.to_string_lossy().to_string(),
            current_layout: "group-folder-v2".to_string(),
            target_layout: "group-folder-v2".to_string(),
            source_data_version,
            target_data_version: CURRENT_DATA_VERSION,
            summary: MigrationDryRunSummary {
                project_file_count: projects.len(),
                readable_project_count: projects.len(),
                grouped_project_count,
                ungrouped_project_count,
                group_count: groups.len(),
                planned_move_count: 0,
                blocker_count: blockers.len(),
                warning_count: warnings.len(),
            },
            project_plans: vec![],
            group_plans: vec![],
            planned_operations: vec![],
            blockers,
            warnings,
            dry_run_only: true,
            already_migrated: true,
        });
    }
    if source_data_version != LEGACY_DATA_VERSION {
        push_unique(
            &mut blockers,
            format!(
                "Unsupported source dataVersion {}; only dataVersion 1 can migrate to 2",
                source_data_version
            ),
        );
    }

    let current_layout = inspect_projects_layout_for_migration(
        &data_root,
        &projects_dir,
        &mut blockers,
        &mut warnings,
    )?;
    let (group_records, groups_metadata_trustworthy) =
        read_groups_for_migration(&groups_path, &mut blockers, &mut warnings);
    let (project_records, source_project_file_count) =
        read_projects_for_migration(&data_root, &projects_dir, &mut blockers, &mut warnings)?;

    let mut project_id_counts: HashMap<String, usize> = HashMap::new();
    let mut present_project_ids = HashSet::new();
    for project in &project_records {
        if !project.project_id.is_empty() {
            *project_id_counts
                .entry(project.project_id.clone())
                .or_insert(0) += 1;
            present_project_ids.insert(project.project_id.clone());
        }
    }

    let mut group_id_counts: HashMap<String, usize> = HashMap::new();
    let mut group_index_by_id: HashMap<String, usize> = HashMap::new();
    let mut group_memberships: HashMap<String, Vec<String>> = HashMap::new();
    for (index, group) in group_records.iter().enumerate() {
        if !group.group_id.is_empty() {
            *group_id_counts.entry(group.group_id.clone()).or_insert(0) += 1;
            group_index_by_id
                .entry(group.group_id.clone())
                .or_insert(index);
        }
        for project_id in &group.project_ids {
            group_memberships
                .entry(project_id.clone())
                .or_default()
                .push(group.group_id.clone());
        }
    }

    let mut group_plans = Vec::new();
    for group in &group_records {
        let mut group_blockers = group.blockers.clone();
        let group_warnings = group.warnings.clone();
        if group_id_counts.get(&group.group_id).copied().unwrap_or(0) > 1 {
            group_blockers.push(format!("Duplicate group id: {}", group.group_id));
        }
        let missing_project_ids = group
            .project_ids
            .iter()
            .filter(|project_id| !present_project_ids.contains(*project_id))
            .cloned()
            .collect::<Vec<_>>();
        if !missing_project_ids.is_empty() {
            group_blockers.push(format!(
                "Group {} references missing projects: {}",
                group.group_id,
                missing_project_ids.join(", ")
            ));
        }

        for project_id in &group.project_ids {
            for project in project_records
                .iter()
                .filter(|project| project.project_id == *project_id)
            {
                if project.current_group_id.as_deref() != Some(group.group_id.as_str()) {
                    group_blockers.push(format!(
                        "Group {} lists project {}, but project.groupId is {:?}",
                        group.group_id, project_id, project.current_group_id
                    ));
                }
            }
        }

        let target_relative_dir =
            if validate_path_segment_for_migration(&group.group_id, "group id").is_ok() {
                format!("projects/groups/{}", group.group_id)
            } else {
                String::new()
            };
        let status = migration_status(&group_blockers, &group_warnings);
        for blocker in &group_blockers {
            push_unique(&mut blockers, blocker.clone());
        }
        for warning in &group_warnings {
            push_unique(&mut warnings, warning.clone());
        }
        group_plans.push(GroupMigrationPlan {
            group_id: group.group_id.clone(),
            title: group.title.clone(),
            target_relative_dir,
            project_ids: group.project_ids.clone(),
            existing_project_count: group
                .project_ids
                .iter()
                .filter(|project_id| present_project_ids.contains(*project_id))
                .count(),
            missing_project_ids,
            status,
            blockers: group_blockers,
            warnings: group_warnings,
        });
    }

    let invalid_group_ids = group_plans
        .iter()
        .filter(|group| group.status == "blocked")
        .map(|group| group.group_id.clone())
        .collect::<HashSet<_>>();
    let valid_group_ids = group_plans
        .iter()
        .filter(|group| group.status != "blocked")
        .map(|group| group.group_id.clone())
        .collect::<HashSet<_>>();

    let mut project_plans = Vec::new();
    for project in &project_records {
        let mut project_blockers = project.blockers.clone();
        let project_warnings = project.warnings.clone();
        if project_id_counts
            .get(&project.project_id)
            .copied()
            .unwrap_or(0)
            > 1
        {
            project_blockers.push(format!("Duplicate project id: {}", project.project_id));
        }

        let memberships = group_memberships
            .get(&project.project_id)
            .cloned()
            .unwrap_or_default();
        if memberships.len() > 1 {
            project_blockers.push(format!(
                "Project {} appears in multiple group.projectIds lists: {}",
                project.project_id,
                memberships.join(", ")
            ));
        }

        match &project.current_group_id {
            Some(group_id) => {
                if !groups_metadata_trustworthy {
                    project_blockers.push(format!(
                        "Project {} has groupId {}, but groups.json is not trustworthy",
                        project.project_id, group_id
                    ));
                } else if !group_index_by_id.contains_key(group_id) {
                    project_blockers.push(format!(
                        "Project {} references missing group {}",
                        project.project_id, group_id
                    ));
                } else if invalid_group_ids.contains(group_id) {
                    project_blockers.push(format!(
                        "Project {} references blocked group {}",
                        project.project_id, group_id
                    ));
                } else if !memberships.iter().any(|item| item == group_id) {
                    project_blockers.push(format!(
                        "Project {} has groupId {}, but that group.projectIds does not include it",
                        project.project_id, group_id
                    ));
                }
            }
            None => {
                if !memberships.is_empty() {
                    project_blockers.push(format!(
                        "Project {} is listed by group.projectIds but has no project.groupId: {}",
                        project.project_id,
                        memberships.join(", ")
                    ));
                }
            }
        }

        let (target_bucket, target_group_id, target_relative_path) = if !project_blockers.is_empty()
        {
            ("blocked".to_string(), None, String::new())
        } else if let Some(group_id) = &project.current_group_id {
            if valid_group_ids.contains(group_id) {
                (
                    "grouped".to_string(),
                    Some(group_id.clone()),
                    format!("projects/groups/{}/{}.json", group_id, project.project_id),
                )
            } else {
                ("blocked".to_string(), None, String::new())
            }
        } else {
            (
                "ungrouped".to_string(),
                None,
                format!("projects/ungrouped/{}.json", project.project_id),
            )
        };

        if !target_relative_path.is_empty() {
            let target_path = data_relative_path(&data_root, &target_relative_path);
            match path_exists_for_migration(&target_path) {
                Ok(true) => project_blockers.push(format!(
                    "Target path already exists and would collide: {target_relative_path}"
                )),
                Ok(false) => {}
                Err(err) => project_blockers.push(err),
            }
        }

        let status = migration_status(&project_blockers, &project_warnings);
        for blocker in &project_blockers {
            push_unique(&mut blockers, blocker.clone());
        }
        for warning in &project_warnings {
            push_unique(&mut warnings, warning.clone());
        }
        project_plans.push(ProjectMigrationPlan {
            project_id: project.project_id.clone(),
            project_title: project.project_title.clone(),
            source_relative_path: project.source_relative_path.clone(),
            target_relative_path,
            current_group_id: project.current_group_id.clone(),
            target_group_id,
            target_bucket: if status == "blocked" {
                "blocked".to_string()
            } else {
                target_bucket
            },
            status,
            blockers: project_blockers,
            warnings: project_warnings,
        });
    }

    let mut target_path_indexes: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, plan) in project_plans.iter().enumerate() {
        if !plan.target_relative_path.is_empty() {
            target_path_indexes
                .entry(plan.target_relative_path.clone())
                .or_default()
                .push(index);
        }
    }
    for (target_path, indexes) in target_path_indexes {
        if indexes.len() <= 1 {
            continue;
        }
        let message = format!("Multiple projects would target the same path: {target_path}");
        push_unique(&mut blockers, message.clone());
        for index in indexes {
            let plan = &mut project_plans[index];
            push_unique(&mut plan.blockers, message.clone());
            plan.status = "blocked".to_string();
            plan.target_bucket = "blocked".to_string();
        }
    }

    let mut planned_operations = Vec::new();
    let mut directory_operations = HashSet::new();
    for plan in &project_plans {
        if plan.status != "planned" {
            if !plan.source_relative_path.is_empty() {
                let op_notes = if plan.status == "blocked" {
                    plan.blockers.clone()
                } else {
                    plan.warnings.clone()
                };
                planned_operations.push(MigrationPlannedOperation {
                    operation_type: "moveProjectFile".to_string(),
                    source_relative_path: plan.source_relative_path.clone(),
                    target_relative_path: plan.target_relative_path.clone(),
                    project_id: Some(plan.project_id.clone()),
                    group_id: plan.target_group_id.clone(),
                    status: plan.status.clone(),
                    notes: op_notes,
                });
            }
            continue;
        }

        let directory = if plan.target_bucket == "grouped" {
            plan.target_group_id
                .as_ref()
                .map(|group_id| format!("projects/groups/{group_id}"))
        } else {
            Some("projects/ungrouped".to_string())
        };
        if let Some(directory) = directory {
            if directory_operations.insert(directory.clone()) {
                planned_operations.push(MigrationPlannedOperation {
                    operation_type: "createDirectory".to_string(),
                    source_relative_path: String::new(),
                    target_relative_path: directory.clone(),
                    project_id: None,
                    group_id: plan.target_group_id.clone(),
                    status: "planned".to_string(),
                    notes: vec!["Planned only; no directory was created.".to_string()],
                });
            }
        }
        planned_operations.push(MigrationPlannedOperation {
            operation_type: "moveProjectFile".to_string(),
            source_relative_path: plan.source_relative_path.clone(),
            target_relative_path: plan.target_relative_path.clone(),
            project_id: Some(plan.project_id.clone()),
            group_id: plan.target_group_id.clone(),
            status: "planned".to_string(),
            notes: vec!["Planned only; no file was moved.".to_string()],
        });
    }

    for operation in &planned_operations {
        if operation.status == "blocked" {
            for note in &operation.notes {
                push_unique(&mut blockers, note.clone());
            }
        } else if operation.status == "warning" {
            for note in &operation.notes {
                push_unique(&mut warnings, note.clone());
            }
        }
    }

    let planned_move_count = planned_operations
        .iter()
        .filter(|operation| {
            operation.operation_type == "moveProjectFile" && operation.status == "planned"
        })
        .count();
    let grouped_project_count = project_plans
        .iter()
        .filter(|plan| plan.status == "planned" && plan.target_bucket == "grouped")
        .count();
    let ungrouped_project_count = project_plans
        .iter()
        .filter(|plan| plan.status == "planned" && plan.target_bucket == "ungrouped")
        .count();
    let blocker_count = blockers.len();
    let warning_count = warnings.len();

    Ok(MigrationDryRunReport {
        report_version: 1,
        generated_at: now_string(),
        source_data_dir: data_root.to_string_lossy().to_string(),
        source_projects_dir: projects_dir.to_string_lossy().to_string(),
        current_layout,
        target_layout: "group-folder-v2".to_string(),
        source_data_version,
        target_data_version: CURRENT_DATA_VERSION,
        summary: MigrationDryRunSummary {
            project_file_count: source_project_file_count,
            readable_project_count: project_records
                .iter()
                .filter(|project| !project.project_id.is_empty())
                .count(),
            grouped_project_count,
            ungrouped_project_count,
            group_count: group_records.len(),
            planned_move_count,
            blocker_count,
            warning_count,
        },
        project_plans,
        group_plans,
        planned_operations,
        blockers,
        warnings,
        dry_run_only: true,
        already_migrated: false,
    })
}

#[tauri::command]
fn apply_group_folder_migration(app: tauri::AppHandle) -> Result<MigrationApplyReport, String> {
    let started_at = now_string();
    let migration_id = format!("migration-{}", backup_timestamp());
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    let dry_run = generate_migration_dry_run_plan(app.clone())?;

    if dry_run.already_migrated || dry_run.source_data_version == CURRENT_DATA_VERSION {
        return Ok(MigrationApplyReport {
            migration_id,
            started_at,
            completed_at: now_string(),
            source_data_dir: data_root.to_string_lossy().to_string(),
            target_data_dir: data_root.to_string_lossy().to_string(),
            backup_id: String::new(),
            backup_dir: String::new(),
            before_migration_dir: String::new(),
            source_data_version: dry_run.source_data_version,
            target_data_version: CURRENT_DATA_VERSION,
            project_file_count: dry_run.summary.project_file_count,
            migrated_project_count: 0,
            grouped_project_count: dry_run.summary.grouped_project_count,
            ungrouped_project_count: dry_run.summary.ungrouped_project_count,
            group_count: dry_run.summary.group_count,
            warnings: dry_run.warnings,
            blockers: vec![],
            already_migrated: true,
            rollback_attempted: false,
            rollback_succeeded: false,
            rollback_message: None,
        });
    }

    if dry_run.source_data_version != LEGACY_DATA_VERSION {
        return Err(format!(
            "Cannot migrate unsupported dataVersion {}; only dataVersion 1 can migrate to {}",
            dry_run.source_data_version, CURRENT_DATA_VERSION
        ));
    }
    if !dry_run.blockers.is_empty() {
        return Err(format!(
            "Cannot apply group-folder migration because dry-run found blockers: {}",
            dry_run.blockers.join(" | ")
        ));
    }
    if dry_run.summary.planned_move_count != dry_run.summary.project_file_count {
        return Err(format!(
            "Dry-run planned {} project moves for {} project files; refusing migration",
            dry_run.summary.planned_move_count, dry_run.summary.project_file_count
        ));
    }

    let backup_report = create_full_backup(app.clone())?;

    let staging_dir = allocate_migration_staging_dir(&storage_root)?;
    let staging_data_dir = staging_dir.join(DATA_DIR_NAME);
    build_v2_staging_data(&data_root, &staging_data_dir, &dry_run)?;
    verify_v2_staging_data(&staging_data_dir, &dry_run)?;

    let before_migration_dir = rename_current_data_to_before_migration(&data_root)?;
    let mut warnings = dry_run.warnings.clone();
    warnings.push(format!(
        "Full backup was created before migration at {}",
        backup_report.backup_dir
    ));

    if let Err(activation_err) = fs::rename(&staging_data_dir, &data_root) {
        let mut rollback_attempted = false;
        let mut rollback_succeeded = false;
        let rollback_message;
        if data_root.exists() {
            rollback_message = Some(format!(
                "Activation failed after {} appeared; rollback was not attempted to avoid overwriting active data: {activation_err}",
                data_root.display()
            ));
        } else {
            rollback_attempted = true;
            match fs::rename(&before_migration_dir, &data_root) {
                Ok(()) => {
                    rollback_succeeded = true;
                    rollback_message = Some(format!(
                        "Activation failed and rollback restored {} from {}: {activation_err}",
                        data_root.display(),
                        before_migration_dir.display()
                    ));
                }
                Err(rollback_err) => {
                    rollback_message = Some(format!(
                        "Activation failed and rollback from {} to {} also failed: {activation_err}; rollback error: {rollback_err}",
                        before_migration_dir.display(),
                        data_root.display()
                    ));
                }
            }
        }
        let blocker = rollback_message
            .clone()
            .unwrap_or_else(|| format!("Activation failed: {activation_err}"));
        return Ok(MigrationApplyReport {
            migration_id,
            started_at,
            completed_at: now_string(),
            source_data_dir: before_migration_dir.to_string_lossy().to_string(),
            target_data_dir: data_root.to_string_lossy().to_string(),
            backup_id: backup_report.backup_id,
            backup_dir: backup_report.backup_dir,
            before_migration_dir: before_migration_dir.to_string_lossy().to_string(),
            source_data_version: dry_run.source_data_version,
            target_data_version: CURRENT_DATA_VERSION,
            project_file_count: dry_run.summary.project_file_count,
            migrated_project_count: 0,
            grouped_project_count: dry_run.summary.grouped_project_count,
            ungrouped_project_count: dry_run.summary.ungrouped_project_count,
            group_count: dry_run.summary.group_count,
            warnings,
            blockers: vec![blocker],
            already_migrated: false,
            rollback_attempted,
            rollback_succeeded,
            rollback_message,
        });
    }

    warnings.push(format!(
        "Previous data directory was preserved at {}",
        before_migration_dir.display()
    ));

    Ok(MigrationApplyReport {
        migration_id,
        started_at,
        completed_at: now_string(),
        source_data_dir: before_migration_dir.to_string_lossy().to_string(),
        target_data_dir: data_root.to_string_lossy().to_string(),
        backup_id: backup_report.backup_id,
        backup_dir: backup_report.backup_dir,
        before_migration_dir: before_migration_dir.to_string_lossy().to_string(),
        source_data_version: dry_run.source_data_version,
        target_data_version: CURRENT_DATA_VERSION,
        project_file_count: dry_run.summary.project_file_count,
        migrated_project_count: dry_run.summary.planned_move_count,
        grouped_project_count: dry_run.summary.grouped_project_count,
        ungrouped_project_count: dry_run.summary.ungrouped_project_count,
        group_count: dry_run.summary.group_count,
        warnings,
        blockers: vec![],
        already_migrated: false,
        rollback_attempted: false,
        rollback_succeeded: false,
        rollback_message: None,
    })
}

#[tauri::command]
fn create_full_backup(app: tauri::AppHandle) -> Result<BackupReport, String> {
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    if !data_root.exists() {
        return Err(format!(
            "Source data directory does not exist: {}",
            data_root.display()
        ));
    }
    if !data_root.is_dir() {
        return Err(format!(
            "Source data path is not a directory: {}",
            data_root.display()
        ));
    }

    let backups_root = backups_root_for(&storage_root);
    let (backup_id, backup_dir) = allocate_backup_dir(&backups_root)?;
    let backup_data_dir = backup_dir.join(DATA_DIR_NAME);
    let manifest_path = backup_dir.join("backup-manifest.json");
    let mut warnings = Vec::new();
    let project_file_count = count_project_json_files(&data_root.join("projects"), &mut warnings)?;
    let data_version = read_app_data_version(&data_root, &mut warnings);
    let mut copied_file_count = 0;
    let mut total_bytes = 0;

    copy_backup_tree(
        &data_root,
        &backup_data_dir,
        &mut copied_file_count,
        &mut total_bytes,
        &mut warnings,
    )?;

    let created_at = now_string();
    let report = BackupReport {
        backup_id: backup_id.clone(),
        created_at: created_at.clone(),
        source_data_dir: data_root.to_string_lossy().to_string(),
        backup_dir: backup_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        project_file_count,
        copied_file_count,
        total_bytes,
        warnings: warnings.clone(),
    };
    let manifest = BackupManifest {
        manifest_version: 1,
        backup_id,
        created_at,
        data_version,
        source_data_dir: report.source_data_dir.clone(),
        backup_dir: report.backup_dir.clone(),
        project_file_count,
        copied_file_count,
        total_bytes,
        warnings,
    };
    write_json(&manifest_path, &manifest)?;
    Ok(report)
}

#[tauri::command]
fn list_full_backups(app: tauri::AppHandle) -> Result<Vec<BackupSummary>, String> {
    let storage_root = active_storage_root(&app)?;
    let backups_root = backups_root_for(&storage_root);
    if !backups_root.exists() {
        return Ok(vec![]);
    }
    ensure_directory(&backups_root, "backups directory")?;

    let mut summaries = Vec::new();
    for entry in fs::read_dir(&backups_root).map_err(|err| {
        format!(
            "Failed to scan backups directory {}: {err}",
            backups_root.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read backups directory entry: {err}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("Failed to inspect backup path {}: {err}", path.display()))?;
        if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
            continue;
        }
        let Some(backup_id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !backup_id.starts_with("backup-") {
            continue;
        }

        let manifest_path = path.join("backup-manifest.json");
        let backup_data_dir = path.join(DATA_DIR_NAME);
        let mut warnings = Vec::new();
        if !backup_data_dir.exists() {
            warnings.push(format!(
                "Missing backup data directory: {}",
                backup_data_dir.display()
            ));
        } else if let Err(err) = ensure_directory(&backup_data_dir, "backup data directory") {
            warnings.push(err);
        }

        let manifest = if manifest_path.exists() {
            match ensure_regular_file(&manifest_path, "backup manifest")
                .and_then(|_| read_json::<BackupManifest>(&manifest_path))
            {
                Ok(manifest) => Some(manifest),
                Err(err) => {
                    warnings.push(err);
                    None
                }
            }
        } else {
            warnings.push(format!(
                "Missing backup manifest: {}",
                manifest_path.display()
            ));
            None
        };

        let counted_project_files =
            count_project_json_files(&backup_data_dir.join("projects"), &mut warnings)
                .unwrap_or_else(|err| {
                    warnings.push(err);
                    0
                });

        let summary = BackupSummary {
            backup_id: backup_id.to_string(),
            created_at: manifest
                .as_ref()
                .map(|item| item.created_at.clone())
                .unwrap_or_default(),
            backup_dir: path.to_string_lossy().to_string(),
            manifest_path: manifest_path.to_string_lossy().to_string(),
            project_file_count: manifest
                .as_ref()
                .map(|item| item.project_file_count)
                .unwrap_or(counted_project_files),
            copied_file_count: manifest
                .as_ref()
                .map(|item| item.copied_file_count)
                .unwrap_or(0),
            total_bytes: manifest.as_ref().map(|item| item.total_bytes).unwrap_or(0),
            data_version: manifest.as_ref().and_then(|item| item.data_version.clone()),
            warnings: {
                if let Some(manifest) = &manifest {
                    warnings.extend(manifest.warnings.clone());
                }
                warnings
            },
        };
        summaries.push(summary);
    }

    summaries.sort_by(|a, b| b.backup_id.cmp(&a.backup_id));
    Ok(summaries)
}

#[tauri::command]
fn restore_full_backup(app: tauri::AppHandle, backup_id: String) -> Result<RestoreReport, String> {
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    let backups_root = backups_root_for(&storage_root);
    let (backup_dir, backup_data_dir, manifest_path, manifest, validated_project_file_count) =
        validate_backup_for_restore(&backups_root, &backup_id)?;
    let mut warnings = manifest.warnings.clone();

    let pre_restore_backup_dir =
        create_pre_restore_backup(&storage_root, &data_root, &mut warnings)?;

    let staging_dir = allocate_restore_staging_dir(&storage_root)?;
    let staging_data_dir = staging_dir.join(DATA_DIR_NAME);
    let mut copied_file_count = 0;
    let mut total_bytes = 0;
    copy_backup_tree(
        &backup_data_dir,
        &staging_data_dir,
        &mut copied_file_count,
        &mut total_bytes,
        &mut warnings,
    )?;
    let staged_project_file_count = validate_data_dir(&staging_data_dir)?;

    let before_restore_dir = if data_root.exists() {
        Some(rename_current_data_to_before_restore(&data_root)?)
    } else {
        warnings.push(format!(
            "Current data directory did not exist when restore replaced data: {}",
            data_root.display()
        ));
        None
    };

    if let Err(restore_err) = fs::rename(&staging_data_dir, &data_root) {
        if let Some(before_restore_dir) = &before_restore_dir {
            if let Err(rollback_err) = fs::rename(before_restore_dir, &data_root) {
                return Err(format!(
                    "Failed to restore {} to {}; rollback from {} also failed: {restore_err}; rollback error: {rollback_err}",
                    staging_data_dir.display(),
                    data_root.display(),
                    before_restore_dir.display()
                ));
            }
        }
        return Err(format!(
            "Failed to restore {} to {}: {restore_err}",
            staging_data_dir.display(),
            data_root.display()
        ));
    }

    if let Some(before_restore_dir) = &before_restore_dir {
        warnings.push(format!(
            "Previous data directory was preserved at {}",
            before_restore_dir.display()
        ));
    }
    warnings.push(format!(
        "Pre-restore backup was created at {}",
        pre_restore_backup_dir.display()
    ));

    Ok(RestoreReport {
        restored_backup_id: backup_id,
        restored_at: now_string(),
        source_backup_dir: backup_dir.to_string_lossy().to_string(),
        restored_data_dir: data_root.to_string_lossy().to_string(),
        pre_restore_backup_dir: pre_restore_backup_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        project_file_count: staged_project_file_count.max(validated_project_file_count),
        copied_file_count,
        total_bytes,
        warnings,
    })
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

    fs::create_dir_all(&next_root).map_err(|err| {
        format!(
            "Failed to create storage root {}: {err}",
            next_root.display()
        )
    })?;
    drop(payload);
    let loaded = load_database_from(&app, next_root.clone())?;
    write_bootstrap(&app, &next_root)?;
    Ok(loaded)
}

#[tauri::command]
fn switch_storage_root(
    app: tauri::AppHandle,
    storage_root: String,
) -> Result<PersistedData, String> {
    let next_root = if storage_root.trim().is_empty() {
        default_storage_root(&app)?
    } else {
        PathBuf::from(storage_root.trim())
    };

    fs::create_dir_all(&next_root).map_err(|err| {
        format!(
            "Failed to create storage root {}: {err}",
            next_root.display()
        )
    })?;
    let loaded = load_database_from(&app, next_root.clone())?;
    write_bootstrap(&app, &next_root)?;
    Ok(loaded)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<StorageReport, String> {
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    let path = data_root
        .join("projects")
        .join(format!("{}.json", project_id));
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_database,
            save_database,
            set_storage_root,
            switch_storage_root,
            delete_project,
            create_full_backup,
            list_full_backups,
            restore_full_backup,
            generate_migration_dry_run_plan,
            apply_group_folder_migration
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("cheerio-flow-{label}-{unique}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn sample_project(id: &str, group_id: Option<&str>) -> Project {
        Project {
            id: id.to_string(),
            title: id.to_string(),
            category: "research".to_string(),
            created_at: "2026-06-30 00:00:00".to_string(),
            pinned: false,
            group_id: group_id.map(|item| item.to_string()),
            modules: vec![],
            arrows: vec![],
        }
    }

    fn sample_group(id: &str, project_ids: Vec<&str>) -> ProjectGroup {
        ProjectGroup {
            id: id.to_string(),
            title: id.to_string(),
            created_at: "2026-06-30 00:00:00".to_string(),
            pinned: false,
            project_ids: project_ids
                .into_iter()
                .map(|item| item.to_string())
                .collect(),
        }
    }

    fn sample_dry_run(data_root: &Path) -> MigrationDryRunReport {
        MigrationDryRunReport {
            report_version: 1,
            generated_at: now_string(),
            source_data_dir: data_root.to_string_lossy().to_string(),
            source_projects_dir: data_root.join("projects").to_string_lossy().to_string(),
            current_layout: "flat".to_string(),
            target_layout: "group-folder-v2".to_string(),
            source_data_version: LEGACY_DATA_VERSION,
            target_data_version: CURRENT_DATA_VERSION,
            summary: MigrationDryRunSummary {
                project_file_count: 2,
                readable_project_count: 2,
                grouped_project_count: 1,
                ungrouped_project_count: 1,
                group_count: 1,
                planned_move_count: 2,
                blocker_count: 0,
                warning_count: 0,
            },
            project_plans: vec![
                ProjectMigrationPlan {
                    project_id: "project-a".to_string(),
                    project_title: "project-a".to_string(),
                    source_relative_path: "projects/project-a.json".to_string(),
                    target_relative_path: "projects/groups/group-a/project-a.json".to_string(),
                    current_group_id: Some("group-a".to_string()),
                    target_group_id: Some("group-a".to_string()),
                    target_bucket: "grouped".to_string(),
                    status: "planned".to_string(),
                    blockers: vec![],
                    warnings: vec![],
                },
                ProjectMigrationPlan {
                    project_id: "project-b".to_string(),
                    project_title: "project-b".to_string(),
                    source_relative_path: "projects/project-b.json".to_string(),
                    target_relative_path: "projects/ungrouped/project-b.json".to_string(),
                    current_group_id: None,
                    target_group_id: None,
                    target_bucket: "ungrouped".to_string(),
                    status: "planned".to_string(),
                    blockers: vec![],
                    warnings: vec![],
                },
            ],
            group_plans: vec![],
            planned_operations: vec![],
            blockers: vec![],
            warnings: vec![],
            dry_run_only: true,
            already_migrated: false,
        }
    }

    #[test]
    fn atomic_temp_path_keeps_temp_in_same_directory() {
        let dir = temp_test_dir("atomic-temp-same-dir");
        let target = dir.join("project-a.json");
        let temp = atomic_temp_path(&target).expect("temp path");

        assert_eq!(temp.parent(), Some(dir.as_path()));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn atomic_temp_path_creates_leading_dot_tmp_filename() {
        let dir = temp_test_dir("atomic-temp-name");
        let target = dir.join("project-a.json");
        let temp = atomic_temp_path(&target).expect("temp path");

        assert_eq!(
            temp.file_name().and_then(|item| item.to_str()),
            Some(".project-a.json.tmp")
        );

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn is_storage_temp_file_detects_atomic_temp_file() {
        assert!(is_storage_temp_file(Path::new(".project-a.json.tmp")));
    }

    #[test]
    fn is_storage_temp_file_does_not_classify_project_json() {
        assert!(!is_storage_temp_file(Path::new("project-a.json")));
    }

    #[test]
    fn atomic_write_json_success_writes_valid_json() {
        let dir = temp_test_dir("atomic-write-success");
        let target = dir.join("project-a.json");

        atomic_write_json(
            &target,
            &serde_json::json!({ "id": "project-a", "title": "Project A" }),
            verify_any_json_value,
        )
        .expect("atomic write");

        let value = read_json::<serde_json::Value>(&target).expect("read target");
        assert_eq!(value["id"], "project-a");

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn atomic_write_json_overwrites_existing_target_with_valid_new_json() {
        let dir = temp_test_dir("atomic-write-overwrite");
        let target = dir.join("project-a.json");
        fs::write(&target, r#"{"id":"project-a","title":"Old"}"#).expect("write old target");

        atomic_write_json(
            &target,
            &serde_json::json!({ "id": "project-a", "title": "New" }),
            |value| verify_project_json_value("project-a", value),
        )
        .expect("atomic overwrite");

        let value = read_json::<serde_json::Value>(&target).expect("read target");
        assert_eq!(value["title"], "New");

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn verify_project_json_value_passes_matching_id() {
        let value = serde_json::json!({ "id": "project-a" });

        verify_project_json_value("project-a", &value).expect("matching project id");
    }

    #[test]
    fn verify_project_json_value_rejects_mismatched_id() {
        let value = serde_json::json!({ "id": "project-b" });

        let error = verify_project_json_value("project-a", &value).expect_err("mismatched id");
        assert!(error.contains("does not match expected"));
    }

    #[test]
    fn verify_app_state_json_value_allows_missing_data_version() {
        let value = serde_json::json!({
            "currentProjectId": "project-a",
            "projectSidebarCollapsed": false,
            "propertiesSidebarCollapsed": true
        });

        verify_app_state_json_value(&value).expect("missing dataVersion remains compatible");
    }

    #[test]
    fn verify_app_state_json_value_rejects_unsupported_data_version() {
        let value = serde_json::json!({ "dataVersion": 99 });

        let error = verify_app_state_json_value(&value).expect_err("unsupported dataVersion");
        assert!(error.contains("not supported"));
    }

    #[test]
    fn atomic_write_json_verify_failure_before_rename_preserves_old_target() {
        let dir = temp_test_dir("atomic-write-verify-failure");
        let target = dir.join("project-a.json");
        fs::write(&target, r#"{"id":"project-a","title":"Old"}"#).expect("write old target");

        let error = atomic_write_json(
            &target,
            &serde_json::json!({ "id": "project-b", "title": "New" }),
            |value| verify_project_json_value("project-a", value),
        )
        .expect_err("verify failure");

        assert!(error.contains("does not match expected"));
        let value = read_json::<serde_json::Value>(&target).expect("old target remains readable");
        assert_eq!(value["id"], "project-a");
        assert_eq!(value["title"], "Old");
        assert!(atomic_temp_path(&target).expect("temp path").exists());

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn atomic_write_json_rejects_target_without_parent() {
        let target = Path::new("project-a.json");

        let error = atomic_write_json(
            target,
            &serde_json::json!({ "id": "project-a" }),
            verify_any_json_value,
        )
        .expect_err("target without parent");

        assert!(error.contains("no parent directory"));
    }

    fn bootstrap_path_for_test(root: &Path) -> PathBuf {
        root.join("bootstrap.json")
    }

    #[test]
    fn app_state_defaults_keep_legacy_missing_version_but_new_default_is_current() {
        let missing_version: AppState = serde_json::from_value(serde_json::json!({
            "currentProjectId": null,
            "projectSidebarCollapsed": false,
            "propertiesSidebarCollapsed": true,
            "leftSidebarWidth": 320.0,
            "rightSidebarWidth": 340.0
        }))
        .expect("deserialize legacy app state");

        assert_eq!(
            data_version_from_app_state(&missing_version),
            LEGACY_DATA_VERSION
        );
        assert_eq!(
            data_version_from_app_state(&AppState::default()),
            CURRENT_DATA_VERSION
        );
    }

    #[test]
    fn v1_loader_reads_only_top_level_project_json() {
        let data_root = temp_test_dir("v1-loader");
        let projects_dir = data_root.join("projects");
        write_json(
            &projects_dir.join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write v1 project");
        write_json(
            &projects_dir
                .join("groups")
                .join("group-a")
                .join("project-b.json"),
            &sample_project("project-b", Some("group-a")),
        )
        .expect("write nested project ignored by v1 loader");

        let projects = load_v1_project_files(&data_root, &projects_dir).expect("load v1");
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, "project-a");

        fs::remove_dir_all(data_root).ok();
    }

    #[test]
    fn missing_app_state_with_existing_data_is_treated_as_legacy() {
        let storage_root = temp_test_dir("missing-app-state");
        let data_root = storage_root.join(DATA_DIR_NAME);
        let projects_dir = data_root.join("projects");
        write_json(
            &projects_dir.join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write legacy project");

        assert_eq!(
            classify_data_root(&data_root).expect("classify missing app-state flat workspace"),
            DataRootClassification::ExistingLegacyV1Workspace
        );
        let loaded =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect("load legacy missing app state");
        assert_eq!(
            data_version_from_app_state(&loaded.app_state),
            LEGACY_DATA_VERSION
        );
        assert_eq!(loaded.projects.len(), 1);
        assert_eq!(loaded.projects[0].id, "project-a");

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn missing_data_dir_creates_current_v2_workspace() {
        let storage_root = temp_test_dir("missing-data-dir");
        let data_root = storage_root.join(DATA_DIR_NAME);
        assert!(!data_root.exists());
        assert_eq!(
            classify_data_root(&data_root).expect("classify missing data dir"),
            DataRootClassification::NewEmptyWorkspace
        );

        let loaded =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect("create missing workspace");
        assert_eq!(
            data_version_from_app_state(&loaded.app_state),
            CURRENT_DATA_VERSION
        );
        let project_id = &loaded.projects[0].id;
        assert!(data_root
            .join("projects")
            .join("ungrouped")
            .join(format!("{project_id}.json"))
            .exists());
        assert!(!data_root
            .join("projects")
            .join(format!("{project_id}.json"))
            .exists());

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn empty_data_dir_creates_current_v2_workspace() {
        let storage_root = temp_test_dir("empty-data-dir");
        let data_root = storage_root.join(DATA_DIR_NAME);
        fs::create_dir_all(&data_root).expect("create empty data root");
        assert_eq!(
            classify_data_root(&data_root).expect("classify empty data dir"),
            DataRootClassification::NewEmptyWorkspace
        );

        let loaded =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect("create empty workspace");
        assert_eq!(
            data_version_from_app_state(&loaded.app_state),
            CURRENT_DATA_VERSION
        );
        let project_id = &loaded.projects[0].id;
        assert!(data_root
            .join("projects")
            .join("ungrouped")
            .join(format!("{project_id}.json"))
            .exists());
        assert!(!data_root
            .join("projects")
            .join(format!("{project_id}.json"))
            .exists());

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn existing_app_state_missing_data_version_is_legacy_v1() {
        let storage_root = temp_test_dir("app-state-missing-version");
        let data_root = storage_root.join(DATA_DIR_NAME);
        write_json(
            &data_root.join("projects").join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write legacy project");
        write_json(&data_root.join(GROUPS_FILE), &Vec::<ProjectGroup>::new())
            .expect("write groups");
        write_json(
            &data_root.join(APP_STATE_FILE),
            &serde_json::json!({
                "currentProjectId": "project-a",
                "projectSidebarCollapsed": false,
                "propertiesSidebarCollapsed": true,
                "leftSidebarWidth": 320.0,
                "rightSidebarWidth": 340.0
            }),
        )
        .expect("write legacy app state without dataVersion");

        let loaded =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect("load legacy missing dataVersion");
        assert_eq!(
            data_version_from_app_state(&loaded.app_state),
            LEGACY_DATA_VERSION
        );
        assert_eq!(loaded.projects.len(), 1);

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn missing_app_state_with_v2_like_projects_is_rejected() {
        let storage_root = temp_test_dir("missing-app-state-v2-like");
        let data_root = storage_root.join(DATA_DIR_NAME);
        write_json(
            &data_root
                .join("projects")
                .join("ungrouped")
                .join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write v2-like project");

        assert_eq!(
            classify_data_root(&data_root).expect("classify v2-like missing app-state"),
            DataRootClassification::ExistingV2LikeWorkspace
        );
        let error =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect_err("v2-like missing app-state should be rejected");
        assert!(error.contains("v2-like project files"));

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn missing_app_state_with_flat_and_v2_projects_is_ambiguous() {
        let storage_root = temp_test_dir("missing-app-state-ambiguous");
        let data_root = storage_root.join(DATA_DIR_NAME);
        write_json(
            &data_root.join("projects").join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write flat project");
        write_json(
            &data_root
                .join("projects")
                .join("ungrouped")
                .join("project-b.json"),
            &sample_project("project-b", None),
        )
        .expect("write v2 canonical project");

        assert_eq!(
            classify_data_root(&data_root).expect("classify ambiguous missing app-state"),
            DataRootClassification::AmbiguousLayout
        );
        let error =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect_err("ambiguous missing app-state should be rejected");
        assert!(error.contains("both v1 flat and v2 group-folder"));

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn unsupported_future_data_version_is_rejected() {
        let storage_root = temp_test_dir("unsupported-version");
        let data_root = storage_root.join(DATA_DIR_NAME);
        write_json(
            &data_root.join("projects").join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write project");
        let mut app_state = AppState::default();
        app_state.data_version = serde_json::Value::from(CURRENT_DATA_VERSION + 1);
        write_json(&data_root.join(APP_STATE_FILE), &app_state).expect("write future app state");

        let error =
            load_database_from_paths(storage_root.clone(), bootstrap_path_for_test(&storage_root))
                .expect_err("future dataVersion should be rejected");
        assert!(error.contains("Unsupported dataVersion"));

        fs::remove_dir_all(storage_root).ok();
    }

    #[test]
    fn v2_loader_reads_only_group_folder_layout() {
        let data_root = temp_test_dir("v2-loader");
        let projects_dir = data_root.join("projects");
        write_json(
            &projects_dir.join("project-flat.json"),
            &sample_project("project-flat", None),
        )
        .expect("write top level project ignored by v2 loader");
        write_json(
            &data_root
                .join(".cheerio")
                .join("stale-project-files")
                .join("stamp")
                .join("projects")
                .join("project-stale.json"),
            &sample_project("project-stale", None),
        )
        .expect("write stale project ignored by v2 loader");
        write_json(
            &projects_dir.join("ungrouped").join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write ungrouped project");
        write_json(
            &projects_dir
                .join("groups")
                .join("group-a")
                .join("project-b.json"),
            &sample_project("project-b", Some("group-a")),
        )
        .expect("write grouped project");

        let mut ids = load_v2_project_files(&data_root, &projects_dir)
            .expect("load v2")
            .into_iter()
            .map(|project| project.id)
            .collect::<Vec<_>>();
        ids.sort();
        assert_eq!(ids, vec!["project-a".to_string(), "project-b".to_string()]);

        fs::remove_dir_all(data_root).ok();
    }

    #[test]
    fn v2_loader_detects_duplicate_project_ids() {
        let data_root = temp_test_dir("v2-duplicate-loader");
        let projects_dir = data_root.join("projects");
        write_json(
            &projects_dir.join("ungrouped").join("project-a.json"),
            &sample_project("project-a", None),
        )
        .expect("write ungrouped project");
        write_json(
            &projects_dir
                .join("groups")
                .join("group-a")
                .join("project-a.json"),
            &sample_project("project-a", Some("group-a")),
        )
        .expect("write duplicate grouped project");

        let result = load_v2_project_files(&data_root, &projects_dir);
        assert!(result
            .expect_err("duplicate ids should fail")
            .contains("Duplicate project id"));

        fs::remove_dir_all(data_root).ok();
    }

    #[test]
    fn staging_build_updates_version_and_preserves_project_count() {
        let source_root = temp_test_dir("staging-source");
        let staging_parent = temp_test_dir("staging-target");
        let staging_root = staging_parent.join(DATA_DIR_NAME);
        write_json(
            &source_root.join("projects").join("project-a.json"),
            &sample_project("project-a", Some("group-a")),
        )
        .expect("write grouped v1 source project");
        write_json(
            &source_root.join("projects").join("project-b.json"),
            &sample_project("project-b", None),
        )
        .expect("write ungrouped v1 source project");
        write_json(
            &source_root.join(GROUPS_FILE),
            &vec![sample_group("group-a", vec!["project-a"])],
        )
        .expect("write groups");
        let mut app_state = AppState::default();
        app_state.data_version = serde_json::Value::from(LEGACY_DATA_VERSION);
        write_json(&source_root.join(APP_STATE_FILE), &app_state).expect("write app state");

        let dry_run = sample_dry_run(&source_root);
        build_v2_staging_data(&source_root, &staging_root, &dry_run).expect("build staging");
        verify_v2_staging_data(&staging_root, &dry_run).expect("verify staging");

        let staged_app_state = read_json::<AppState>(&staging_root.join(APP_STATE_FILE))
            .expect("read staged app state");
        assert_eq!(
            data_version_from_app_state(&staged_app_state),
            CURRENT_DATA_VERSION
        );
        assert!(staging_root
            .join("projects")
            .join("groups")
            .join("group-a")
            .join("project-a.json")
            .exists());
        assert!(staging_root
            .join("projects")
            .join("ungrouped")
            .join("project-b.json")
            .exists());

        fs::remove_dir_all(source_root).ok();
        fs::remove_dir_all(staging_parent).ok();
    }
}
