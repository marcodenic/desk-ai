mod config;
mod logger;
mod ndjson;
mod providers;
mod tools;
mod types;

use anyhow::Result;
use ndjson::NdjsonBridge;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logger
    match logger::init_logger() {
        Ok(log_path) => {
            eprintln!("[RUST BACKEND] Logging to: {:?}", log_path);
            logger::info("Desk AI backend starting");
        }
        Err(e) => {
            eprintln!("[RUST BACKEND] Failed to initialize logger: {}", e);
        }
    }

    eprintln!("[RUST BACKEND] Starting desk-ai-backend");

    let mut bridge = NdjsonBridge::new();
    bridge.run().await?;

    logger::info("Desk AI backend shutting down");
    Ok(())
}
