pub(super) fn parse_skill_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    if !content.starts_with("---\n") {
        return (None, None);
    }

    let Some(end_index) = content[4..].find("\n---") else {
        return (None, None);
    };
    let frontmatter = &content[4..4 + end_index];
    let mut name = None;
    let mut description = None;

    let lines = frontmatter.lines().collect::<Vec<_>>();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if let Some(value) = line.strip_prefix("name:") {
            name = Some(trim_frontmatter_value(value));
        } else if let Some(value) = line.strip_prefix("description:") {
            let value = value.trim();
            if value == "|"
                || value == "|-"
                || value == "|+"
                || value == ">"
                || value == ">-"
                || value == ">+"
            {
                let (block, next_index) = read_frontmatter_block(&lines, index + 1);
                description = Some(block);
                index = next_index;
                continue;
            }
            description = Some(trim_frontmatter_value(value));
        }
        index += 1;
    }

    (name, description)
}

fn read_frontmatter_block(lines: &[&str], start_index: usize) -> (String, usize) {
    let mut block_lines = Vec::new();
    let mut index = start_index;

    while index < lines.len() {
        let line = lines[index];
        if !line.starts_with(' ') && !line.starts_with('\t') && line.contains(':') {
            break;
        }
        block_lines.push(line.trim());
        index += 1;
    }

    (block_lines.join("\n").trim().to_string(), index)
}

fn trim_frontmatter_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}
