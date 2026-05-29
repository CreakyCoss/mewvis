use desktop_lib::db::setup::{
    default_config_db_path, initialize_config_database_path, rebuild_config_database_path,
    DatabaseRestoreReport,
};
use std::path::PathBuf;

enum ConfigDbCommand {
    Initialize,
    Rebuild,
    RebuildOnError,
}

struct InitConfigDbOptions {
    command: ConfigDbCommand,
    db_path: PathBuf,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let Some(options) = parse_args()? else {
        print_usage();
        return Ok(());
    };

    match options.command {
        ConfigDbCommand::Initialize => {
            initialize_config_database_path(&options.db_path)?;
            println!("initialized {}", options.db_path.display());
        }
        ConfigDbCommand::Rebuild => {
            let report = rebuild_config_database_path(&options.db_path)?;
            println!("rebuilt {}", options.db_path.display());
            print_rebuild_report(&report);
        }
        ConfigDbCommand::RebuildOnError => {
            match initialize_config_database_path(&options.db_path) {
                Ok(()) => {
                    println!("initialized {}", options.db_path.display());
                }
                Err(error) => {
                    eprintln!("initialize failed: {error}");
                    eprintln!("rebuilding {}", options.db_path.display());
                    let report = rebuild_config_database_path(&options.db_path)?;
                    println!("rebuilt {}", options.db_path.display());
                    print_rebuild_report(&report);
                }
            }
        }
    }

    Ok(())
}

fn parse_args() -> Result<Option<InitConfigDbOptions>, String> {
    let args = std::env::args()
        .skip(1)
        .filter(|arg| arg != "--")
        .collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "-h" || arg == "--help") {
        return Ok(None);
    }

    let mut command = ConfigDbCommand::Initialize;
    let mut command_set = false;
    let mut db_path = None;

    for arg in args {
        match arg.as_str() {
            "--rebuild" => {
                if command_set {
                    return Err("只能指定一个操作参数".to_string());
                }
                command = ConfigDbCommand::Rebuild;
                command_set = true;
            }
            "--rebuild-on-error" => {
                if command_set {
                    return Err("只能指定一个操作参数".to_string());
                }
                command = ConfigDbCommand::RebuildOnError;
                command_set = true;
            }
            value if value.starts_with('-') => {
                return Err(format!("未知参数：{value}"));
            }
            value => {
                if db_path.is_some() {
                    return Err("只能指定一个配置数据库路径".to_string());
                }
                db_path = Some(PathBuf::from(value));
            }
        }
    }

    Ok(Some(InitConfigDbOptions {
        command,
        db_path: db_path.map(Ok).unwrap_or_else(default_config_db_path)?,
    }))
}

fn print_rebuild_report(report: &DatabaseRestoreReport) {
    println!("restored rows: {}", report.restored_rows);
    println!("restored tables: {}", format_list(&report.restored_tables));
    println!("skipped tables: {}", format_list(&report.skipped_tables));

    if !report.warnings.is_empty() {
        println!("warnings:");
        for warning in &report.warnings {
            println!("- {warning}");
        }
    }
}

fn format_list(values: &[String]) -> String {
    if values.is_empty() {
        "none".to_string()
    } else {
        values.join(", ")
    }
}

fn print_usage() {
    println!("Usage: pnpm init:config-db [--rebuild | --rebuild-on-error] [config-db-path]");
    println!();
    println!("Commands:");
    println!("  pnpm init:config-db");
    println!("  pnpm init:config-db -- --rebuild");
    println!("  pnpm init:config-db -- --rebuild-on-error");
    println!("  pnpm rebuild:config-db");
    println!("  pnpm init:config-db:rebuild-on-error");
}
