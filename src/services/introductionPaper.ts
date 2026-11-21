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

  const now = new Date().toISOString();
  const paper = { ...introductionPaper, createdAt: now, updatedAt: now };
  await savePaper(paper);
  await saveSections(introductionSections);
  await saveBlocks(introductionBlocks);
  await saveSetting(SEEDED_KEY, true);

  const { addPaper, setSections, setBlocks } = useLibraryCache.getState();
  addPaper(paper);
  setSections(paper.id, introductionSections);
  setBlocks(paper.id, introductionBlocks);
  return "added";
}
