//! Fetches bibliographic records from fixed public endpoints (Crossref, arXiv, OpenAlex).
//! Only identifiers or search text are accepted, never URLs, so the frontend cannot use this
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

/// GET over https only (redirects included). Body on stdout, HTTP status via stderr,
/// so binary bodies (PDF) stay intact.
fn curl_get(url: &str, max_time: &str, max_bytes: u64) -> Result<(Vec<u8>, String), String> {
    let output = Command::new("/usr/bin/curl")
        .args(["-sS", "-L", "--proto", "=https", "--proto-redir", "=https"])
        .args([
            "--max-time",
            max_time,
            "--max-filesize",
            &max_bytes.to_string(),
        ])
        .args(["-A", USER_AGENT, "-w", "%{stderr}%{http_code}", url])
        .output()
        .map_err(|e| format!("通信を開始できませんでした: {e}"))?;
    if !output.status.success() {
        return Err(if output.status.code() == Some(63) {
            "PDFが大きすぎます（100MBまで）".into()
        } else {
            "サーバーに接続できませんでした".into()
        });
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let status = stderr
        .trim()
        .chars()
        .rev()
        .take(3)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    Ok((output.stdout, status))
}

fn expect_ok(status: &str) -> Result<(), String> {
    match status {
        "200" => Ok(()),
        "404" => Err("該当する論文が見つかりませんでした".into()),
        code => Err(format!("サーバーがエラーを返しました ({code})")),
    }
}

#[tauri::command]
pub async fn fetch_bibliographic_record(kind: String, id: String) -> Result<String, String> {
    let url = endpoint(&kind, id.trim())?;
    tauri::async_runtime::spawn_blocking(move || {
        let (body, status) = curl_get(&url, "20", 20_000_000)?;
        expect_ok(&status)?;
        Ok(String::from_utf8_lossy(&body).into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Percent-encode free text for a query-string value (everything but unreserved).
fn percent_encode_query(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn search_endpoint(source: &str, query: &str) -> Result<String, String> {
    let query: String = query.split_whitespace().collect::<Vec<_>>().join(" ");
    let query: String = query.chars().take(400).collect();
    if query.chars().count() < 8 {
        return Err("参考文献の文字列が短すぎます".into());
    }
    let q = percent_encode_query(&query);
    match source {
        "crossref" => Ok(format!(
            "https://api.crossref.org/works?query.bibliographic={q}&rows=5&select=DOI,title,issued,published,author,container-title"
        )),
        // Title search: `,` / `:` / `|` are filter syntax, so they become spaces.
        "openalex" => Ok(format!(
            "https://api.openalex.org/works?filter=title.search:{}&per-page=5",
            percent_encode_query(&query.replace([',', ':', '|'], " "))
        )),
        _ => Err("未対応の検索先です".into()),
    }
}

/// Searches Crossref (whole reference string) / OpenAlex (title) for works and
/// returns the raw JSON. The host is fixed per source; the frontend decides
/// which hit (if any) is the cited work.
#[tauri::command]
pub async fn search_bibliographic_records(source: String, query: String) -> Result<String, String> {
    let url = search_endpoint(&source, &query)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (body, status) = curl_get(&url, "20", 20_000_000)?;
        expect_ok(&status)?;
        Ok(String::from_utf8_lossy(&body).into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

const MAX_PDF_BYTES: u64 = 100 * 1024 * 1024;

/// Open-access PDF location for a DOI, from OpenAlex (no account or email needed).
fn openalex_pdf_url(doi: &str) -> Result<String, String> {
    let url = format!(
        "https://api.openalex.org/works/doi:{}",
        percent_encode_path(doi)
    );
    let (body, status) = curl_get(&url, "20", 20_000_000)?;
    expect_ok(&status)?;
    let work: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|_| "OpenAlex の応答を読み取れませんでした".to_string())?;
    let best = work
        .pointer("/best_oa_location/pdf_url")
        .and_then(|v| v.as_str());
    let any = work
        .get("locations")
        .and_then(|v| v.as_array())
        .and_then(|locations| {
            locations
                .iter()
                .find_map(|l| l.get("pdf_url").and_then(|v| v.as_str()))
        });
    best.or(any)
        .filter(|u| u.starts_with("https://"))
        .map(str::to_string)
        .ok_or_else(|| "オープンアクセスの PDF が見つかりませんでした".into())
}

/// Downloads an open-access PDF for an arXiv id or DOI. The host is fixed for
/// arXiv; for a DOI the PDF URL comes from OpenAlex, never from the frontend.
#[tauri::command]
pub async fn download_open_access_pdf(kind: String, id: String) -> Result<Vec<u8>, String> {
    let id = id.trim().to_string();
    let url = match kind.as_str() {
        "arxiv" if is_valid_arxiv_id(&id) => format!("https://arxiv.org/pdf/{id}"),
        "doi" if is_valid_doi(&id) => String::new(),
        _ => return Err("arXiv ID か DOI の形式が正しくありません".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let url = if url.is_empty() {
            openalex_pdf_url(&id)?
        } else {
            url
        };
        let (body, status) = curl_get(&url, "120", MAX_PDF_BYTES)?;
        expect_ok(&status)?;
        if !body.starts_with(b"%PDF") {
            return Err("PDF を直接取得できませんでした（出版社のページが返されました）".into());
        }
        Ok(body)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn search_endpoint_encodes_query_and_fixes_host() {
        let url = super::search_endpoint("crossref", "Vaswani A. Attention is all you need & more").unwrap();
        assert!(url.starts_with("https://api.crossref.org/works?query.bibliographic=Vaswani%20A.%20Attention"));
        assert!(url.contains("%26%20more&rows=5"));
        let url = super::search_endpoint("openalex", "Visual prompting: pixel space, again").unwrap();
        assert!(url.starts_with("https://api.openalex.org/works?filter=title.search:Visual%20prompting%20%20pixel%20space%20%20again&"));
        assert!(super::search_endpoint("evil.example", "long enough query").is_err());
        assert!(super::search_endpoint("crossref", "short").is_err());
    }

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
