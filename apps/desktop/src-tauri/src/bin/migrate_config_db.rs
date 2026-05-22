use desktop_lib::db::migrate::{default_config_db_path, migrate_config_database_path};
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let db_path = std::env::args()
        .skip(1)
        .find(|arg| arg != "--")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(default_config_db_path)?;

    migrate_config_database_path(&db_path)?;
    println!("migrated {}", db_path.display());
    Ok(())
}
