use std::{collections::VecDeque, sync::Arc, time::Duration};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::{io::AsyncWriteExt, process::Command, sync::Mutex};

#[derive(Deserialize)]
pub struct Drawing { pub svg: String, pub html: String }

pub struct Renderer {
    cache: Mutex<VecDeque<(Vec<u8>, Arc<Drawing>)>>,
    worker: Mutex<()>,
    capacity: usize,
    timeout: Duration,
}
impl Default for Renderer {
    fn default() -> Self {
        Self { cache: Mutex::new(VecDeque::new()), worker: Mutex::new(()), capacity: 8, timeout: Duration::from_secs(60) }
    }
}
impl Renderer {
    pub async fn draw(&self, input: &Value) -> Result<Arc<Drawing>, String> {
        let bytes = serde_json::to_vec(input).map_err(|e| e.to_string())?;
        let key = Sha256::digest(&bytes).to_vec();
        let _permit = self.worker.lock().await;
        if let Some((_, drawing)) = self.cache.lock().await.iter().find(|(id, _)| id == &key) { return Ok(drawing.clone()); }
        let mut command = Command::new(std::env::var("RENDERER_PYTHON").unwrap_or_else(|_| "python3".into()));
        command.arg("renderer/render.py").env("PYTHONDONTWRITEBYTECODE", "1")
            .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
        let mut child = command.spawn().map_err(|e| format!("The task-tree renderer could not start: {e}"))?;
        let mut stdin = child.stdin.take().ok_or("The task-tree renderer has no input channel.")?;
        let operation = async {
            stdin.write_all(&bytes).await.map_err(|e| e.to_string())?;
            drop(stdin);
            let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
            if !output.status.success() || !output.stderr.is_empty() { return Err(format!("The task-tree renderer failed: {}", String::from_utf8_lossy(&output.stderr))); }
            serde_json::from_slice::<Drawing>(&output.stdout).map_err(|e| format!("The task-tree renderer returned invalid data: {e}"))
        };
        let drawing = Arc::new(tokio::time::timeout(self.timeout, operation).await.map_err(|_| "The task-tree renderer exceeded its time limit.")??);
        let mut cache = self.cache.lock().await;
        cache.push_back((key, drawing.clone()));
        while cache.len() > self.capacity { cache.pop_front(); }
        Ok(drawing)
    }
}
