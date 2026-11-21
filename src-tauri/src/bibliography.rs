//! Fetches bibliographic records from fixed public endpoints (Crossref, arXiv).
//! Only identifiers are accepted, never URLs, so the frontend cannot use this
//! command to reach arbitrary hosts.

use std::process::Command;

const USER_AGENT: &str = concat!(
    "Versio/",
    env!("CARGO_PKG_VERSION"),
    " (desktop paper reader)"
);

fn is_valid_doi(doi: &str) -> bool {
    let Some(rest) = doi.strip_prefix("10.") else {
        return false;
    };
    let Some((registrant, suffix)) = rest.split_once('/') else {
        return false;
    };
    registrant.len() >= 4
        && registrant.chars().all(|c| c.is_ascii_digit() || c == '.')
        && !suffix.is_empty()
        && doi.len() <= 256
        && doi.chars().all(|c| c.is_ascii_graphic())
}

fn is_valid_arxiv_id(id: &str) -> bool {
    // New style 2101.01234(v2) or old style hep-th/9901001(v1).
    let core = match id.rfind('v') {
        Some(i) if i > 0 && id[i + 1..].chars().all(|c| c.is_ascii_digit()) && i + 1 < id.len() => {
            &id[..i]
        }
        _ => id,
    };
    if let Some((yymm, num)) = core.split_once('.') {
        if yymm.len() == 4
            && yymm.chars().all(|c| c.is_ascii_digit())
            && (4..=5).contains(&num.len())
            && num.chars().all(|c| c.is_ascii_digit())
        {
            return true;
        }
    }
    if let Some((archive, num)) = core.split_once('/') {
        return !archive.is_empty()
            && archive
                .chars()
                .all(|c| c.is_ascii_lowercase() || c == '-' || c == '.' || c.is_ascii_uppercase())
            && num.len() == 7
            && num.chars().all(|c| c.is_ascii_digit());
    }
    false
}

fn percent_encode_path(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn endpoint(kind: &str, id: &str) -> Result<String, String> {
    match kind {
        "doi" if is_valid_doi(id) => Ok(format!(
            "https://api.crossref.org/works/{}",
            percent_encode_path(id)
        )),
        "arxiv" if is_valid_arxiv_id(id) => Ok(format!(
            "https://export.arxiv.org/api/query?id_list={id}&max_results=1"
        )),
        "doi" => Err("DOI の形式が正しくありません".into()),
        "arxiv" => Err("arXiv ID の形式が正しくありません".into()),
        _ => Err("未対応の識別子です".into()),
    }
}

#[tauri::command]
pub async fn fetch_bibliographic_record(kind: String, id: String) -> Result<String, String> {
    let url = endpoint(&kind, id.trim())?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("/usr/bin/curl")
            .args([
                "-sS",
                "-L",
                "--max-time",
                "20",
                "--proto",
                "=https",
                "-A",
                USER_AGENT,
            ])
            .args(["-w", "\n%{http_code}", &url])
            .output()
            .map_err(|e| format!("通信を開始できませんでした: {e}"))?;
        if !output.status.success() {
            return Err("書誌情報サーバーに接続できませんでした".into());
        }
        let text = String::from_utf8_lossy(&output.stdout).into_owned();
        let (body, status) = text.rsplit_once('\n').unwrap_or((&text, ""));
        match status.trim() {
            "200" => Ok(body.to_string()),
            "404" => Err("該当する論文が見つかりませんでした".into()),
            code => Err(format!("書誌情報サーバーがエラーを返しました ({code})")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_identifiers() {
        assert!(is_valid_doi("10.1145/3290605.3300233"));
        assert!(is_valid_doi("10.48550/arXiv.2101.01234"));
        assert!(!is_valid_doi("10.1/x"));
        assert!(!is_valid_doi("https://evil.example/10.1145/x"));
        assert!(!is_valid_doi("10.1145/a b"));
        assert!(is_valid_arxiv_id("2101.01234"));
        assert!(is_valid_arxiv_id("2101.01234v3"));
        assert!(is_valid_arxiv_id("hep-th/9901001"));
        assert!(!is_valid_arxiv_id("2101.01234&x=1"));
        assert!(!is_valid_arxiv_id("../etc"));
    }

    #[test]
    fn encodes_doi_path() {
        assert_eq!(
            endpoint("doi", "10.1002/(SICI)1097").unwrap(),
            "https://api.crossref.org/works/10.1002/%28SICI%291097"
        );
    }
}
