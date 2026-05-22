use uuid::{Uuid, Version};

pub fn new_record_id() -> String {
    Uuid::now_v7().simple().to_string()
}

pub fn is_record_id(value: &str) -> bool {
    Uuid::parse_str(value)
        .is_ok_and(|id| value.len() == 32 && id.get_version() == Some(Version::SortRand))
}
