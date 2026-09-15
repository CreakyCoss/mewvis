#![allow(dead_code)]
// Compile the production Rust schema/migrations/vector store directly, without launching Tauri.
mod db {
    pub mod sqlite { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../../desktop/src-tauri/src/db/sqlite.rs")); }
    pub mod schema { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../../desktop/src-tauri/src/db/schema.rs")); }
    pub mod migrations {
        pub mod version { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../../desktop/src-tauri/src/db/migrations/version.rs")); }
        pub mod config { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../../desktop/src-tauri/src/db/migrations/config.rs")); }
    }
}
mod vector_store { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../../desktop/src-tauri/src/services/vector_store.rs")); }
use rusqlite::{Connection,types::ValueRef};
use vector_store::{KnowledgeVectorStore,SqliteVecStore,VectorEmbedding};
use std::io::{self,Read,Write};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args[1] == "lock" {
        let file = std::fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(&args[2]).unwrap();
        if file.try_lock().is_err() {std::process::exit(2);}
        println!("locked");io::stdout().flush().unwrap();
        io::stdin().read_to_end(&mut Vec::new()).unwrap();
        return;
    }
    SqliteVecStore.register();
    let conn = Connection::open(&args[2]).unwrap();
    match args[1].as_str() {
        "config" => {
            let fresh = !db::sqlite::database_has_user_tables(&conn).unwrap();
            db::schema::create_config_schema(&conn).unwrap();
            db::migrations::config::run_config_migrations(&conn,fresh).unwrap();
            db::schema::validate_config_schema(&conn).unwrap();
        }
        "exec" => {conn.execute_batch(&args[3]).unwrap();}
        "query" => {
            let mut stmt = conn.prepare(&args[3]).unwrap();
            let names = stmt.column_names().into_iter().map(str::to_string).collect::<Vec<_>>();
            let result = stmt.query_map([],|row| {
                let mut object=serde_json::Map::new();
                for (i,name) in names.iter().enumerate() {
                    let value = match row.get_ref(i)? {
                        ValueRef::Null => serde_json::Value::Null,
                        ValueRef::Integer(v) => serde_json::json!(v),
                        ValueRef::Real(v) => serde_json::json!(v),
                        ValueRef::Text(v) => serde_json::json!(String::from_utf8_lossy(v)),
                        ValueRef::Blob(v) => serde_json::json!(v),
                    };object.insert(name.clone(),value);
                }
                Ok(serde_json::Value::Object(object))
            }).unwrap().collect::<Result<Vec<_>,_>>().unwrap();
            println!("{}",serde_json::to_string(&result).unwrap());
        }
        "vector-write" => {
            vector_store::initialize_vector_metadata_schema(&conn).unwrap();
            SqliteVecStore.ensure_schema(&conn,&args[3],"fixture",3).unwrap();
            SqliteVecStore.insert_embeddings(&conn,&[VectorEmbedding {
                chunk_id:args[4].clone(),source_id:args[5].clone(),model_id:"fixture".into(),
                embedding_profile_id:args[3].clone(),dimensions:3,vector:vec![1.0,0.0,0.0],
            }]).unwrap();
        }
        "vector-search" => {
            let hits = SqliteVecStore.search(&conn,&args[3],"fixture",&[1.0,0.0,0.0],&[args[4].clone()],8).unwrap();
            println!("{}",serde_json::json!(hits.iter().map(|h|serde_json::json!({"chunkId":h.chunk_id,"score":h.score})).collect::<Vec<_>>()));
        }
        _ => panic!("unknown command")
    }
}
