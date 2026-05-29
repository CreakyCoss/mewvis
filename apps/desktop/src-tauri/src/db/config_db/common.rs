use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::id::{is_record_id, new_record_id};

pub(super) fn now_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}

pub(super) fn normalize_record_id(id: Option<&str>) -> String {
    id.map(str::trim)
        .filter(|value| is_record_id(value))
        .map(ToOwned::to_owned)
        .unwrap_or_else(new_record_id)
}

pub(super) fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
