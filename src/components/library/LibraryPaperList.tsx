import type { ComponentProps, ReactNode } from "react";
import type { LibraryView } from "../../stores/appStore";
import type { ImportJob } from "../../stores/importJobStore";
import type { Paper } from "../../types/paper";
import { ImportJobCard } from "./ImportJobCard";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import styles from "./LibraryScreen.module.css";

type LibraryPaperListProps = {
  view: LibraryView;
  papers: Paper[];
  busyId: string | null;
  onOpen: (paper: Paper) => void;
  onDeleteRequest: ComponentProps<typeof PaperMenu>["onDeleteRequest"];
  jobs?: ImportJob[];
  recovery?: Omit<ComponentProps<typeof ImportJobCard>, "job" | "layout">;
};

/** Grid/list of import jobs and paper cards shared by the library collection screens. */
export function LibraryPaperList({
  view,
  papers,
  busyId,
  onOpen,
  onDeleteRequest,
  jobs = [],
  recovery,
}: LibraryPaperListProps) {
  return (
    <div className={view === "grid" ? styles.tileGrid : styles.paperList}>
      {jobs.map((job) => (
        <ImportJobCard key={job.id} job={job} layout={view} {...recovery} />
      ))}
      {papers.map((paper) => (
        <PaperCard
          key={paper.id}
          paper={paper}
          layout={view}
          enabled={busyId !== paper.id}
          onOpen={() => {
            if (busyId !== paper.id) onOpen(paper);
          }}
          actions={
            <PaperMenu paper={paper} variant="library" onDeleteRequest={onDeleteRequest} />
          }
        />
      ))}
    </div>
  );
}

export function LibraryEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyDescription}>{description}</p>
    </div>
  );
}
