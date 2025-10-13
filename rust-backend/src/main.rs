mod config;
mod ndjson;
mod providers;
mod tools;
mod types;

use anyhow::Result;
use ndjson::NdjsonBridge;

#[tokio::main]
async fn main() -> Result<()> {
    eprintln!("[RUST BACKEND] Starting desk-ai-backend");
    
    let mut bridge = NdjsonBridge::new();
    bridge.run().await?;
    
    Ok(())
}
