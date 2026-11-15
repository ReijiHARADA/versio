//! One-time copy of data stored under the pre-rename bundle identifier
//! (`com.harada.paper-reader`) into the Versio identifier. The legacy
//! directories are left in place so an older build can still be launched.

use std::fs;
use std::io;
use std::path::Path;

const LEGACY_IDENTIFIER: &str = "com.harada.paper-reader";
const IDENTIFIER: &str = "com.harada.versio";

pub fn migrate() {
    let Some(home) = std::env::var_os("HOME") else { return };
    let library = Path::new(&home).join("Library");
    for parent in ["Application Support", "WebKit"] {
        let base = library.join(parent);
        let legacy = base.join(LEGACY_IDENTIFIER);
        let target = base.join(IDENTIFIER);
        if legacy.is_dir() && !target.exists() {
            let staging = base.join(format!("{IDENTIFIER}.migrating"));
            let _ = fs::remove_dir_all(&staging);
            match copy_dir(&legacy, &staging).and_then(|_| fs::rename(&staging, &target)) {
                Ok(()) => eprintln!("[legacy_data] migrated {}", legacy.display()),
                Err(e) => {
                    eprintln!("[legacy_data] migration of {} failed: {e}", legacy.display());
                    let _ = fs::remove_dir_all(&staging);
                }
            }
        }
    }
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let dest = to.join(entry.file_name());
        if kind.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else if kind.is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(fs::read_link(entry.path())?, &dest)?;
        } else {
            fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}
