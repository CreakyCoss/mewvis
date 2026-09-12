use std::path::{Path, PathBuf};

/// Keep package scopes; escape other names without collisions or path traversal.
pub(crate) fn application_directory(root: &Path, id: &str) -> PathBuf {
    fn component(value: &str) -> String {
        let reserved = matches!(
            value,
            "data" | "packages" | "pnpm-store" | "con" | "prn" | "aux" | "nul"
        ) || (value.len() == 4
            && (value.starts_with("com") || value.starts_with("lpt"))
            && matches!(value.as_bytes()[3], b'1'..=b'9'));
        value
            .bytes()
            .enumerate()
            .map(|(index, byte)| {
                if (byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || matches!(byte, b'-' | b'_'))
                    && !(index == 0 && reserved)
                {
                    (byte as char).to_string()
                } else {
                    format!("%{byte:02x}")
                }
            })
            .collect()
    }
    let parts = match id.strip_prefix('@').and_then(|id| id.split_once('/')) {
        Some((scope, name)) if !scope.is_empty() && !name.is_empty() && !name.contains('/') => {
            vec![format!("@{}", component(scope)), component(name)]
        }
        _ => vec![component(id)],
    };
    if id.is_empty() || parts.iter().any(|part| part.len() > 200) {
        let mut result = root.join(".ids");
        if id.is_empty() {
            return result.join("empty");
        }
        for part in id.as_bytes().chunks(48) {
            result.push(
                part.iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>(),
            );
        }
        return result;
    }
    parts
        .iter()
        .fold(root.to_path_buf(), |path, part| path.join(part))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn readable_names_are_isolated_and_portable() {
        let root = Path::new("/apps");
        for (id, expected) in [
            ("@isle/chat-playground", "@isle/chat-playground"),
            ("dsh-rss", "dsh-rss"),
            ("a/b", "a%2fb"),
            ("A", "%41"),
            ("../data", "%2e%2e%2fdata"),
            ("data", "%64ata"),
            ("CON", "%43%4f%4e"),
            ("con", "%63on"),
        ] {
            assert_eq!(application_directory(root, id), root.join(expected));
        }
    }
}
