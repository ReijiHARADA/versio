import { Link } from "react-router-dom";
import type { WorkspaceNode } from "../../types/project";
import styles from "./WorkspacePathTrail.module.css";

type WorkspacePathTrailProps = {
  /** Root → … → nearest folder. */
  folders: WorkspaceNode[];
  /**
   * Optional trailing leaf (e.g. paper title). When set, every folder is a link.
   * When omitted, the last folder is the current location (not a link).
   */
  leaf?: { label: string };
  /**
   * Small "A / B /" line shown above a title. Every folder is a link and the
   * trail ends with a separator, since the title itself follows below.
   */
  prefix?: boolean;
};

export function WorkspacePathTrail({
  folders,
  leaf,
  prefix = false,
}: WorkspacePathTrailProps) {
  if (folders.length === 0 && !leaf) return null;

  const folderIsCurrent = !leaf && !prefix;
  const segments: Array<{
    key: string;
    label: string;
    to?: string;
    current: boolean;
  }> = folders.map((folder, index) => {
    const isLast = index === folders.length - 1;
    const current = folderIsCurrent && isLast;
    return {
      key: folder.id,
      label: folder.name,
      to: current ? undefined : `/project/${folder.id}`,
      current,
    };
  });

  if (leaf && !prefix) {
    segments.push({
      key: "leaf",
      label: leaf.label,
      current: true,
    });
  }

  return (
    <nav
      className={`${styles.trail} ${prefix ? styles.prefix : styles.md}`}
      aria-label="場所"
    >
      {segments.map((segment, index) => (
        <span key={segment.key} className={styles.segmentWrap}>
          {index > 0 && (
            <span className={styles.sep} aria-hidden="true">
              /
            </span>
          )}
          {segment.current ? (
            <span className={styles.current} title={segment.label}>
              {segment.label}
            </span>
          ) : (
            <Link to={segment.to!} className={styles.ancestor} title={segment.label}>
              {segment.label}
            </Link>
          )}
        </span>
      ))}
      {prefix && (
        <span className={styles.sep} aria-hidden="true">
          /
        </span>
      )}
    </nav>
  );
}
