use todo::service;

#[tokio::main]
async fn main() {
    if std::env::args().any(|a| a == "--openapi") {
        println!("{}", service::openapi()); return;
    }
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::from_default_env()).init();
    if let Err(error) = service::run().await {
        eprintln!("Task service failed: {error}"); std::process::exit(1);
    }
}
