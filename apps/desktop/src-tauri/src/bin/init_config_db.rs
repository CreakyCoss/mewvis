use desktop_lib::db::setup::{default_config_db_path, initialize_config_database_path};
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = std::env::args()
        .skip(1)
        .filter(|arg| arg != "--")
        .collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "-h" || arg == "--help") {
        print_usage();
        return Ok(());
    }

    let db_path = args
        .into_iter()
        .next()
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(default_config_db_path)?;

    initialize_config_database_path(&db_path)?;
    println!("initialized {}", db_path.display());
    Ok(())
}

fn print_usage() {
    println!("Usage: pnpm init:config-db [config-db-path]");
}
