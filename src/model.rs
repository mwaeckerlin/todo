use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use utoipa::ToSchema;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ToSchema)]
pub struct Task {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: String,
    pub details: String,
    pub status: String,
    pub priority: String,
    pub complexity: u8,
    pub due_date: Option<String>,
    pub owners: Vec<String>,
    pub reference: String,
    pub next_week: bool,
    pub archived: bool,
    pub order: i64,
    pub version: u64,
    pub updated_at: String,
    #[serde(default)]
    pub sprint_id: Option<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
}

impl Default for Task {
    fn default() -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        Self {
            reference: format!("task-{id}"), id, parent_id: None,
            title: String::new(), description: String::new(), details: String::new(),
            status: "open".into(), priority: "M".into(), complexity: 1,
            due_date: None, owners: vec![], next_week: false, archived: false,
            order: 0, version: 0, updated_at: String::new(), sprint_id:None, depends_on:vec![],
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ProjectState {
    pub tasks: Vec<Task>,
    pub members: BTreeMap<String, String>,
    pub preamble: String,
    #[serde(default)]
    pub sprints: Vec<Sprint>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct User { pub id: String, pub username: String, #[serde(default)] pub role:String }

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Sprint { pub id:String, pub title:String, pub goal:String, pub start_date:String, pub end_date:String, pub status:String }

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct History {
    pub id: String,
    pub project_id: String,
    pub sequence: i64,
    pub task_id: String,
    pub actor: User,
    pub at: String,
    pub action: String,
    pub fields: Vec<String>,
    pub before: serde_json::Value,
    pub after: serde_json::Value,
    #[serde(default)]
    pub imported_by: Option<User>,
    #[serde(default)]
    pub source_revision_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Project { pub id: String, pub name: String, pub role: String, pub sequence: i64 }

#[derive(Clone, Serialize, Deserialize)]
pub struct Session { pub user: User, pub csrf: String, pub subject:String, pub groups:Vec<String> }

pub const STATUSES: [&str; 7] = ["open", "planned", "in_work", "merged", "done", "waiting", "dropped"];
pub const ICONS: [&str; 7] = ["⬜", "📄", "⏳", "🔀", "✅", "⏸", "❌"];

pub fn stamp() -> String { chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }
