import { introductionBlocks, introductionPaper, introductionSections } from "../data/introductionPaper";
import { getSetting, saveBlocks, savePaper, saveSections, saveSetting } from "./database";
import { listTrashItems } from "./trashService";
import { useLibraryCache } from "../stores/libraryCache";

const SEEDED_KEY = "onboarding.introductionSeeded";

/** First launch only: an empty library gets the bundled Introduction once; trashing it or having papers already means never again. */
export async function seedIntroductionPaper(existingPaperCount: number): Promise<"added" | "skipped"> {
  if (await getSetting<boolean>(SEEDED_KEY)) return "skipped";
  // getAllPapers() hides trashed papers, so an all-trashed library still belongs to an existing user
  if (existingPaperCount > 0 || (await listTrashItems()).length > 0) {
    await saveSetting(SEEDED_KEY, true);
    return "skipped";
  }

  await writeIntroductionPaper();
  await saveSetting(SEEDED_KEY, true);
  return "added";
}

/** Every launch: put the Introduction back if it is not in the library (also restores it from the trash). */
export async function ensureIntroductionPaper(activePaperIds: string[]): Promise<"added" | "skipped"> {
  if (activePaperIds.includes(introductionPaper.id)) return "skipped";
  await writeIntroductionPaper();
  return "added";
}

async function writeIntroductionPaper(): Promise<void> {
  const now = new Date().toISOString();
  const paper = { ...introductionPaper, createdAt: now, updatedAt: now };
  await savePaper(paper);
  await saveSections(introductionSections);
  await saveBlocks(introductionBlocks);

  const { addPaper, setSections, setBlocks } = useLibraryCache.getState();
  addPaper(paper);
  setSections(paper.id, introductionSections);
  setBlocks(paper.id, introductionBlocks);
}
