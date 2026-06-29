use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use time::{format_description, OffsetDateTime};

const DATA_DIR_NAME: &str = "CheerioFlowData";
const BACKUPS_DIR_NAME: &str = "CheerioFlowBackups";
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
    #[serde(default = "default_data_version")]
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
            data_version: default_data_version(),
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

fn default_data_version() -> serde_json::Value {
    serde_json::Value::from(1)
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
        && (has_project_json
            || data_root.join(GROUPS_FILE).exists()
            || data_root.join(APP_STATE_FILE).exists())
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

fn load_database_from(
    app: &tauri::AppHandle,
    storage_root: PathBuf,
) -> Result<PersistedData, String> {
    let bootstrap = bootstrap_path(app)?;
    let data_root = data_root_for(&storage_root);
    let projects_dir = data_root.join("projects");
    let had_data = storage_has_any_data(&data_root);

    let mut projects = Vec::new();
    if projects_dir.exists() {
        for entry in fs::read_dir(&projects_dir).map_err(|err| {
            format!(
                "Failed to scan projects directory {}: {err}",
                projects_dir.display()
            )
        })? {
            let entry =
                entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                projects.push(read_json::<Project>(&path)?);
            }
        }
    }

    let groups_path = data_root.join(GROUPS_FILE);
    let groups = if groups_path.exists() {
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
    if payload.projects.is_empty() {
        return Err("Refusing to save empty project list because it could overwrite or orphan existing project files".to_string());
    }

    let bootstrap = bootstrap_path(app)?;
    let data_root = data_root_for(&storage_root);
    let projects_dir = ensure_data_dirs(&data_root)?;

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
        if metadata.file_type().is_file()
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
    read_json::<AppState>(&app_state_path)?;

    let projects_dir = data_root.join("projects");
    if !projects_dir.exists() {
        return Err(format!(
            "Projects directory does not exist: {}",
            projects_dir.display()
        ));
    }
    ensure_directory(&projects_dir, "projects directory")?;

    let mut project_file_count = 0;
    for entry in fs::read_dir(&projects_dir).map_err(|err| {
        format!(
            "Failed to scan projects directory {}: {err}",
            projects_dir.display()
        )
    })? {
        let entry =
            entry.map_err(|err| format!("Failed to read projects directory entry: {err}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        ensure_regular_file(&path, "project JSON")?;
        read_json::<Project>(&path)?;
        project_file_count += 1;
    }

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

#[tauri::command]
fn generate_migration_dry_run_plan(app: tauri::AppHandle) -> Result<MigrationDryRunReport, String> {
    let storage_root = active_storage_root(&app)?;
    let data_root = data_root_for(&storage_root);
    let projects_dir = data_root.join("projects");
    let groups_path = data_root.join(GROUPS_FILE);
    let app_state_path = data_root.join(APP_STATE_FILE);
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    let current_layout = inspect_projects_layout_for_migration(
        &data_root,
        &projects_dir,
        &mut blockers,
        &mut warnings,
    )?;
    let source_data_version =
        read_source_data_version_for_migration(&app_state_path, &mut blockers);
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
        target_data_version: 2,
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
    save_database_to(&app, next_root.clone(), payload)?;
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
            generate_migration_dry_run_plan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
