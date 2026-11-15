import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { extractPDFContent } from "../services/pdfService";
import { extractFromPages } from "../services/pdfExtraction/pipeline/extractAcademicPdf";
import { openPdfDocument, pdfjsLib } from "../services/pdfjsRuntime";
import type { BoundingBox, PaperBlock } from "../types/paper";
import type { CanonicalNode, CanonicalRole } from "../services/pdfExtraction/canonical/types";
import { CANONICAL_ROLES, emptyPageReview, isEvaluationBundle, newReview, type BlockReview, type ErrorType, type EvaluationBundle, type MissingRegionReview, type PageReview } from "./schema";
import { downloadJson, loadBundle, saveBundle } from "./storage";
import { evaluateReview } from "./metrics";
import { overlayBoxFromExtraction } from "./overlayCoordinates";
import { namespaceReextractedPage } from "./reextractSnapshot";
import styles from "./EvaluationStudio.module.css";

type DisplayItem = { id: string; kind: "canonical" | "projection"; role: string; text: string; boxes: BoundingBox[]; overlayBoxes?: BoundingBox[]; canonicalNodeId?: string };

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nodeItem(node: CanonicalNode): DisplayItem {
  return { id: node.id, kind: "canonical", role: node.role, text: node.text ?? "", boxes: node.boundingBoxes, overlayBoxes: node.overlayBoundingBoxes };
}
function projectionItem(block: PaperBlock, canonicalById: Map<string, CanonicalNode>): DisplayItem {
  const canonicalNodeId = typeof block.metadata.canonicalNodeId === "string" ? block.metadata.canonicalNodeId : undefined;
  return { id: block.id, kind: "projection", role: block.type, text: block.original ?? "", boxes: block.boundingBoxes,
    overlayBoxes: canonicalNodeId ? canonicalById.get(canonicalNodeId)?.overlayBoundingBoxes : undefined, canonicalNodeId };
}
function pageReview(bundle: EvaluationBundle, page: number) {
  return bundle.review.pages.find((item) => item.page === page) ?? emptyPageReview(page);
}
function uuid() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function textAnchor(text: string) {
  const compact = text.trim();
  return compact ? { text: compact.slice(0, 180), prefix: compact.slice(0, 40), suffix: compact.slice(-40) } : undefined;
}
function reviewForItem(reviews: BlockReview[] | undefined, item: DisplayItem): BlockReview | undefined {
  if (!reviews) return undefined;
  const canonicalNodeId = item.kind === "canonical" ? item.id : item.canonicalNodeId;
  return reviews.find((review) =>
    (canonicalNodeId !== undefined && review.predictedNodeId === canonicalNodeId) ||
    review.predictedBlockId === item.id
  );
}

type BoxEdit = { item: DisplayItem; mode: "move" | "nw" | "ne" | "se" | "sw"; startX: number; startY: number; original: BoundingBox };
type MissingMove = { id: string; startX: number; startY: number; original: BoundingBox };

function PdfPage({ file, page, pageRotation, zoom, width, height, items, missingRegions, selectedId, selectedItemId, selectedMissingId, reviewRegions, onSelect, onRegion, onMissingSelect, onMissingChange, onBoxChange }: {
  file: File; page: number; pageRotation: number; zoom: number; width: number; height: number; items: DisplayItem[]; selectedId: string | null; selectedItemId: string | null;
  missingRegions: MissingRegionReview[]; selectedMissingId: string | null; reviewRegions: Map<string, BoundingBox>; onSelect: (item: DisplayItem) => void; onRegion: (box: BoundingBox) => void; onMissingSelect: (id: string) => void; onMissingChange: (id: string, region: BoundingBox) => void;
  onBoxChange: (item: DisplayItem, box: BoundingBox) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<BoundingBox | null>(null);
  // React may batch the final mousemove behind mouseup. Keep the drag geometry
  // synchronously as well so a visible draft can never disappear unsaved.
  const draftRef = useRef<BoundingBox | null>(null);
  const [boxEdit, setBoxEdit] = useState<BoxEdit | null>(null);
  const [editingBox, setEditingBox] = useState<BoundingBox | null>(null);
  const [missingMove, setMissingMove] = useState<MissingMove | null>(null);
  const missingMoveRef = useRef<MissingMove | null>(null);
  const movedMissingBoxRef = useRef<BoundingBox | null>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | undefined;
    void (async () => {
      const doc = await openPdfDocument(await file.arrayBuffer()).promise;
      if (cancelled) return;
      const pdfPage = await doc.getPage(page);
      const viewport = pdfPage.getViewport({ scale: zoom });
      // Keep the CSS size in PDF points but render enough backing pixels for
      // Retina/HiDPI displays. At 1x the text looked soft despite a correct
      // overlay coordinate system.
      const outputScale = Math.min(window.devicePixelRatio || 1, 3);
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context || cancelled) return;
      canvas.width = Math.ceil(viewport.width * outputScale); canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvasContext: context, viewport, transform: [outputScale, 0, 0, outputScale, 0, 0], annotationMode: pdfjsLib.AnnotationMode.DISABLE });
      await task.promise.catch(() => undefined);
      await doc.destroy();
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [file, page, zoom]);
  const local = (event: MouseEvent<HTMLElement>) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  };
  const begin = (event: MouseEvent<HTMLDivElement>) => {
    // Do not let a broad detected region hide its surrounding whitespace.
    // A click still selects the region; a real drag always creates a missing
    // region. Existing boxes are resized with their selected corner handles.
    event.preventDefault();
    const point = local(event); if (!point) return;
    const start = { x: point.x, y: point.y };
    dragStartRef.current = start; setDragStart(start); setDraft(null); draftRef.current = null;
  };
  const beginBoxEdit = (event: MouseEvent<HTMLElement>, item: DisplayItem, box: BoundingBox, mode: BoxEdit["mode"]) => {
    event.preventDefault(); event.stopPropagation();
    const point = local(event); if (!point) return;
    onSelect(item);
    setBoxEdit({ item, mode, startX: point.x / point.width * width, startY: point.y / point.height * height, original: box });
    setEditingBox(box);
  };
  const beginMissingMove = (event: MouseEvent<HTMLElement>, region: MissingRegionReview) => {
    event.preventDefault(); event.stopPropagation(); onMissingSelect(region.id);
    const point = local(event); if (!point) return;
    const move = { id: region.id, startX: point.x / point.width * width, startY: point.y / point.height * height, original: region.region };
    missingMoveRef.current = move; movedMissingBoxRef.current = null; setMissingMove(move);
  };
  const edited = (edit: BoxEdit, x: number, y: number): BoundingBox => {
    const dx = x - edit.startX; const dy = y - edit.startY;
    let left = edit.original.x; let top = edit.original.y; let right = left + edit.original.width; let bottom = top + edit.original.height;
    if (edit.mode === "move") { left += dx; right += dx; top += dy; bottom += dy; }
    if (edit.mode.includes("w")) left += dx;
    if (edit.mode.includes("e")) right += dx;
    if (edit.mode.includes("n")) top += dy;
    if (edit.mode.includes("s")) bottom += dy;
    const minimum = 2;
    if (right - left < minimum) { if (edit.mode.includes("w")) left = right - minimum; else right = left + minimum; }
    if (bottom - top < minimum) { if (edit.mode.includes("n")) top = bottom - minimum; else bottom = top + minimum; }
    const boxWidth = right - left; const boxHeight = bottom - top;
    return { page, x: Math.max(0, Math.min(left, width - boxWidth)), y: Math.max(0, Math.min(top, height - boxHeight)), width: Math.min(boxWidth, width), height: Math.min(boxHeight, height) };
  };
  const move = (event: MouseEvent<HTMLDivElement>) => {
    const activeMissingMove = missingMoveRef.current ?? missingMove;
    if (activeMissingMove) {
      const point = local(event); if (!point) return;
      const x = point.x / point.width * width; const y = point.y / point.height * height;
      const moved = { ...activeMissingMove.original, x: Math.max(0, Math.min(activeMissingMove.original.x + x - activeMissingMove.startX, width - activeMissingMove.original.width)), y: Math.max(0, Math.min(activeMissingMove.original.y + y - activeMissingMove.startY, height - activeMissingMove.original.height)) };
      movedMissingBoxRef.current = moved;
      setEditingBox(moved);
      return;
    }
    if (boxEdit) {
      const point = local(event); if (!point) return;
      setEditingBox(edited(boxEdit, point.x / point.width * width, point.y / point.height * height));
      return;
    }
    const start = dragStartRef.current ?? dragStart;
    if (!start) return; const point = local(event); if (!point) return;
    const x = Math.min(start.x, point.x); const y = Math.min(start.y, point.y);
    const nextDraft = { page, x: x / point.width * width, y: y / point.height * height,
      width: Math.abs(point.x - start.x) / point.width * width, height: Math.abs(point.y - start.y) / point.height * height };
    draftRef.current = nextDraft; setDraft(nextDraft);
  };
  const end = () => {
    const activeMissingMove = missingMoveRef.current ?? missingMove;
    if (activeMissingMove) {
      const moved = movedMissingBoxRef.current ?? editingBox;
      if (moved) onMissingChange(activeMissingMove.id, moved);
      missingMoveRef.current = null; movedMissingBoxRef.current = null; setMissingMove(null); setEditingBox(null); return;
    }
    if (boxEdit) {
      if (editingBox && (Math.abs(editingBox.x - boxEdit.original.x) > 0.25 || Math.abs(editingBox.y - boxEdit.original.y) > 0.25 || Math.abs(editingBox.width - boxEdit.original.width) > 0.25 || Math.abs(editingBox.height - boxEdit.original.height) > 0.25)) onBoxChange(boxEdit.item, editingBox);
      setBoxEdit(null); setEditingBox(null); return;
    }
    const completeDraft = draftRef.current ?? draft;
    if (completeDraft && completeDraft.width > 4 && completeDraft.height > 4) onRegion(completeDraft);
    setDragStart(null); dragStartRef.current = null; setDraft(null); draftRef.current = null;
  };
  const relative = (box: BoundingBox) => ({
    left: `${box.x / width * 100}%`,
    top: `${Math.max(0, box.y) / height * 100}%`,
    width: `${box.width / width * 100}%`,
    height: `${box.height / height * 100}%`,
  });
  return <div className={styles.pdfPage}>
    <canvas ref={canvasRef} />
    <div ref={layerRef} className={styles.overlayLayer} onMouseDown={begin} onMouseMove={move} onMouseUp={end} onMouseLeave={end}>
      {items.flatMap((item) => {
        const override = reviewRegions.get(item.id);
        const boxes = override?.page === page ? [override] : item.overlayBoxes?.filter((box) => box.page === page) ?? item.boxes.filter((box) => box.page === page).map((box) =>
          overlayBoxFromExtraction(box, { hasText: Boolean(item.text), pageRotation, role: item.role })
        );
        return boxes.map((box, index) => {
          const isDirectlySelected = selectedItemId === item.id;
          const sourceBox = box;
          const displayBox = boxEdit?.item.id === item.id && editingBox ? editingBox : sourceBox;
          return <div data-overlay="true" data-role={item.role} role="button" tabIndex={0} title={`${item.role}: ${item.text.slice(0, 120)}`} key={`${item.id}-${index}`}
            className={`${styles.region} ${selectedId === item.id || selectedId === item.canonicalNodeId ? styles.regionSelected : ""}`}
            style={relative(displayBox)} onClick={() => onSelect(item)}>
            {isDirectlySelected && <>{(["nw", "ne", "se", "sw"] as const).map((corner) => <button key={corner} data-overlay="true" type="button" aria-label={`判定枠を${corner}からリサイズ`} className={`${styles.resizeHandle} ${styles[`handle${corner.toUpperCase()}`]}`} onMouseDown={(event) => beginBoxEdit(event, item, sourceBox, corner)} />)}</>}
          </div>;
        });
      })}
      {missingRegions.map((region) => <div key={region.id} className={`${styles.missingRegion} ${selectedMissingId === region.id ? styles.regionSelected : ""}`} data-overlay="true" data-role={region.correctRole} title={`認識漏れ: ${region.correctRole}`} style={relative(missingMove?.id === region.id && editingBox ? editingBox : region.region)} onMouseDown={(event) => beginMissingMove(event, region)} onClick={() => onMissingSelect(region.id)} />)}
      {draft && <div className={styles.draftRegion} style={relative(draft)} />}
    </div>
  </div>;
}

export function EvaluationStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<EvaluationBundle | null>(null);
  const [page, setPage] = useState(1); const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<"canonical" | "projection">("canonical");
  const [showRegions, setShowRegions] = useState(true); const [selected, setSelected] = useState<DisplayItem | null>(null);
  const [editingMissingId, setEditingMissingId] = useState<string | null>(null); const [status, setStatus] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const currentReview = bundle ? pageReview(bundle, page) : null;
  const deletedItemIds = useMemo(() => new Set(
    (currentReview?.blockReviews ?? [])
      .filter((review) => review.verdict === "incorrect" && review.errorTypes.includes("extra"))
      .flatMap((review) => [review.predictedNodeId, review.predictedBlockId].filter((id): id is string => Boolean(id)))
  ), [currentReview?.blockReviews]);
  const items = useMemo(() => {
    if (!bundle) return [];
    const canonicalById = new Map(bundle.snapshot.canonical.nodes.map((node) => [node.id, node]));
    return view === "canonical" ? bundle.snapshot.canonical.nodes.map(nodeItem) : bundle.snapshot.projection.blocks.map((block) => projectionItem(block, canonicalById));
  }, [bundle, view]);
  const pageItems = useMemo(() => items.filter((item) => !deletedItemIds.has(item.id) && item.boxes.some((box) => box.page === page)), [items, page, deletedItemIds]);
  const pageSize = bundle?.snapshot.pages.find((item) => item.page === page);
  const reviewRegions = useMemo(() => new Map(
    pageItems.flatMap((item) => {
      const region = reviewForItem(currentReview?.blockReviews, item)?.targetRegion;
      return region ? [[item.id, region] as const] : [];
    })
  ), [currentReview?.blockReviews, pageItems]);

  const persist = (next: EvaluationBundle) => { next.review.updatedAt = new Date().toISOString(); setBundle(next); saveBundle(next); };
  const fitPdfToViewport = () => {
    if (!pageSize) return;
    // Header, toolbar, PDF-pane padding and the hint occupy roughly 280px.
    // The resulting page height fills the remaining window without creating
    // a document-level scrollbar; manual zoom can still use the pane scroll.
    const available = Math.max(240, window.innerHeight - 280);
    setZoom(Math.round(Math.min(3, Math.max(0.6, available / pageSize.height)) * 100) / 100);
  };
  useEffect(() => {
    fitPdfToViewport();
    const onResize = () => fitPdfToViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  // page dimensions intentionally reset the initial view; zoom changes remain manual until resize.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize?.height]);
  const patchPage = (change: (value: PageReview) => PageReview) => {
    if (!bundle) return;
    const current = pageReview(bundle, page); const changed = { ...change(current), updatedAt: new Date().toISOString() };
    persist({ ...bundle, review: { ...bundle.review, pages: bundle.review.pages.map((item) => item.page === page ? changed : item) } });
  };
  const openFile = async (nextFile: File) => {
    setFile(nextFile); setStatus("PDF テキストと構造を抽出中…"); setSelected(null); setEditingMissingId(null);
    try {
      const hash = await sha256(nextFile);
      const prior = loadBundle(hash);
      if (prior) { setBundle(prior); setPage(1); setStatus(""); return; }
      const pdf = await extractPDFContent(nextFile);
      const result = extractFromPages({ pages: pdf.pages, paperId: `evaluation-${hash.slice(0, 12)}`, filePath: nextFile.name, fileHash: hash, metadata: pdf.metadata });
      const snapshot = {
        schemaVersion: 1 as const, kind: "versio-extraction-snapshot" as const, createdAt: new Date().toISOString(),
        parser: { id: "versio-canonical", version: "development" },
        source: { paperId: `evaluation-${hash.slice(0, 12)}`, fileName: nextFile.name, fileHash: hash, pageCount: pdf.pages.length },
        pages: pdf.pages.map((item) => ({ page: item.pageNumber, width: item.width, height: item.height, rotation: item.rotation })),
        canonical: result.canonical, projection: { blocks: result.blocks },
      };
      const next = { schemaVersion: 1 as const, kind: "versio-extraction-evaluation" as const, snapshot, review: newReview(snapshot) };
      persist(next); setPage(1); setStatus("");
    } catch (error) { setStatus(`抽出できませんでした: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const reextractPage = async () => {
    if (!file || !bundle) return;
    setStatus(`${page}ページを再抽出中…`);
    try {
      const pdf = await extractPDFContent(file, undefined, [page]);
      const result = extractFromPages({ pages: pdf.pages, paperId: bundle.snapshot.source.paperId, filePath: file.name, fileHash: bundle.snapshot.source.fileHash, metadata: pdf.metadata });
      const replacement = namespaceReextractedPage(result.canonical, result.blocks, page);
      const belongsToPage = (boxes: BoundingBox[]) => boxes.some((box) => box.page === page);
      const replacedNodeIds = new Set(bundle.snapshot.canonical.nodes.filter((node) => belongsToPage(node.boundingBoxes)).map((node) => node.id));
      const snapshot = {
        ...bundle.snapshot,
        createdAt: new Date().toISOString(),
        canonical: {
          ...bundle.snapshot.canonical,
          nodes: [...bundle.snapshot.canonical.nodes.filter((node) => !belongsToPage(node.boundingBoxes)), ...replacement.canonical.nodes],
          relations: [
            ...bundle.snapshot.canonical.relations.filter((relation) => !replacedNodeIds.has(relation.from) && !replacedNodeIds.has(relation.to)),
            ...replacement.canonical.relations,
          ],
        },
        projection: { blocks: [...bundle.snapshot.projection.blocks.filter((block) => !belongsToPage(block.boundingBoxes)), ...replacement.blocks] },
      };
      // A predicted node ID can change on re-extraction, so its old verdict
      // must not silently attach to a different block. Reviewer-authored
      // missing regions remain valid page-local ground truth and are kept.
      const previous = pageReview(bundle, page);
      const cleared = { ...emptyPageReview(page), missingRegions: previous.missingRegions };
      persist({ ...bundle, snapshot, review: { ...bundle.review, pages: bundle.review.pages.map((review) => review.page === page ? cleared : review) } });
      setSelected(null); setEditingMissingId(null); setStatus("");
    } catch (error) { setStatus(`再抽出できませんでした: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const selectItem = (item: DisplayItem) => { setSelected(item); setEditingMissingId(null); window.setTimeout(() => listRef.current?.querySelector(`[data-item-id="${item.id}"]`)?.scrollIntoView({ block: "nearest" }), 0); };
  const saveReview = (changes: Partial<BlockReview>, target = selected) => {
    if (!target || !bundle) return;
    const nodeId = target.kind === "canonical" ? target.id : target.canonicalNodeId;
    const old = reviewForItem(currentReview?.blockReviews, target);
    const now = new Date().toISOString();
    const review: BlockReview = { id: old?.id ?? uuid(), page, predictedNodeId: nodeId, predictedBlockId: target.kind === "projection" ? target.id : undefined,
      targetRegion: target.boxes.find((box) => box.page === page), textAnchor: textAnchor(target.text), correctRole: (target.kind === "canonical" ? target.role : undefined) as CanonicalRole | undefined,
      verdict: old?.verdict ?? "correct", errorTypes: old?.errorTypes ?? [], severity: old?.severity ?? "critical", createdAt: old?.createdAt ?? now, updatedAt: now, ...old, ...changes };
    patchPage((current) => ({ ...current, status: current.status === "unreviewed" ? "in-progress" : current.status,
      blockReviews: [...current.blockReviews.filter((item) => item.id !== review.id), review] }));
  };
  const addMissing = (region: BoundingBox) => {
    const missing: MissingRegionReview = { id: uuid(), page, region, correctRole: "paragraph", createdAt: new Date().toISOString() };
    patchPage((current) => ({ ...current, status: current.status === "unreviewed" ? "in-progress" : current.status, missingRegions: [...current.missingRegions, missing] }));
    setEditingMissingId(missing.id);
  };
  const updateMissing = (id: string, changes: Partial<MissingRegionReview>) => patchPage((current) => ({ ...current, missingRegions: current.missingRegions.map((region) => region.id === id ? { ...region, ...changes } : region) }));
  const removeMissing = (id: string) => { patchPage((current) => ({ ...current, missingRegions: current.missingRegions.filter((region) => region.id !== id) })); if (editingMissingId === id) setEditingMissingId(null); };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select") || !bundle) return;
      if (editingMissingId) { event.preventDefault(); removeMissing(editingMissingId); return; }
      if (!selected) return;
      event.preventDefault();
      const existing = reviewForItem(currentReview?.blockReviews, selected);
      const errors = [...new Set([...(existing?.errorTypes ?? []), "extra" as ErrorType])];
      saveReview({ verdict: "incorrect", errorTypes: errors, severity: "critical" }, selected);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- dev-only eval tool; handler is rebound via its own deps
  }, [bundle, currentReview?.blockReviews, editingMissingId, selected]);
  const importBundle = async (event: ChangeEvent<HTMLInputElement>) => {
    const uploaded = event.target.files?.[0]; if (!uploaded) return;
    try { const value = JSON.parse(await uploaded.text()); if (!isEvaluationBundle(value)) throw new Error("Evaluation bundle の形式または PDF hash が不正です。");
      setBundle(value); saveBundle(value); setPage(1); setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "読み込みに失敗しました。"); }
  };
  return <main className={styles.app}>
    <header className={styles.header}><div className={styles.product}><span className={styles.productMark}>PR</span><h1>Extraction Review</h1></div>
      <div className={styles.actions}><label className={styles.button}>PDFを開く<input type="file" accept="application/pdf" onChange={(event) => event.target.files?.[0] && void openFile(event.target.files[0])} /></label>
      <label className={styles.button}>読込<input type="file" accept="application/json" onChange={(event) => void importBundle(event)} /></label>
      <button type="button" disabled={!bundle} onClick={() => bundle && downloadJson(`${bundle.snapshot.source.fileName}.evaluation.json`, bundle)}>書出し</button>
      <button type="button" disabled={!bundle} onClick={() => bundle && downloadJson(`${bundle.snapshot.source.fileName}.report.json`, evaluateReview(bundle.snapshot, bundle.review))}>レポート</button></div></header>
    {status && <p className={styles.status}>{status}</p>}
    {!bundle ? <section className={styles.empty} aria-label="PDF未選択" /> : <>
      <section className={styles.toolbar}><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button><strong>{page} / {bundle.snapshot.source.pageCount}</strong><button type="button" onClick={() => setPage((value) => Math.min(bundle.snapshot.source.pageCount, value + 1))}>→</button>
        <label>ズーム <input type="range" min="0.6" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><button type="button" onClick={fitPdfToViewport}>全高</button>
        <button type="button" disabled={!file} onClick={() => void reextractPage()}>再抽出</button>
        <label><input type="checkbox" checked={showRegions} onChange={(event) => setShowRegions(event.target.checked)} /> 領域を表示</label>
        <RoleLegend />
        <label>表示 <select value={view} onChange={(event) => setView(event.target.value as "canonical" | "projection")}><option value="canonical">抽出構造</option><option value="projection">Reader表示</option></select></label>
        <label><input type="checkbox" checked={currentReview?.status === "complete"} onChange={(event) => patchPage((current) => ({ ...current, status: event.target.checked ? "complete" : "in-progress" }))} /> このページを確認済みにする</label></section>
      <section className={styles.workspace}>
        <div className={styles.pdfPane}>{file && pageSize ? <PdfPage file={file} page={page} pageRotation={pageSize.rotation ?? 0} zoom={zoom} width={pageSize.width} height={pageSize.height} items={showRegions ? pageItems : []} missingRegions={currentReview?.missingRegions ?? []} selectedId={(selected?.kind === "canonical" ? selected.id : selected?.canonicalNodeId) ?? null} selectedItemId={selected?.id ?? null} selectedMissingId={editingMissingId} reviewRegions={reviewRegions} onSelect={selectItem} onRegion={addMissing} onMissingSelect={setEditingMissingId} onMissingChange={(id, region) => updateMissing(id, { region })} onBoxChange={(item, targetRegion) => saveReview({ targetRegion }, item)} /> : <div className={styles.pdfPlaceholder}>PDFを開いてください</div>}</div>
        <div className={styles.listPane} ref={listRef}><div className={styles.paneHeading}><h2>抽出結果</h2><span>{pageItems.length}</span></div>
          {pageItems.map((item, index) => { const review = reviewForItem(currentReview?.blockReviews, item); return <button type="button" data-item-id={item.id} key={item.id} className={`${styles.block} ${selected?.id === item.id || (selected?.kind === "canonical" && item.canonicalNodeId === selected.id) || selected?.canonicalNodeId === item.id ? styles.blockSelected : ""}`} onClick={() => selectItem(item)}><span className={styles.blockMeta}><b>{String(index + 1).padStart(2, "0")}</b><i data-role={item.role}>{item.role}</i>{review?.verdict === "incorrect" && <em>要修正</em>}</span><p>{item.text || "（テキストなし）"}</p></button>; })}
          {!pageItems.length && <p>このページに表示対象はありません。</p>}</div>
        <aside className={styles.reviewPane}><div className={styles.paneHeading}><h2>判定</h2></div>
          {selected && <BlockEditor key={selected.id} item={selected} existing={reviewForItem(currentReview?.blockReviews, selected)} onSave={saveReview} />}
          {editingMissingId && currentReview?.missingRegions.find((region) => region.id === editingMissingId) && <MissingEditor value={currentReview.missingRegions.find((region) => region.id === editingMissingId)!} onChange={(changes) => updateMissing(editingMissingId, changes)} />}
          <MissingRegionList value={currentReview?.missingRegions ?? []} editingId={editingMissingId} onEdit={setEditingMissingId} onRemove={removeMissing} />
        </aside>
      </section>
    </>}
  </main>;
}

function RoleLegend() {
  return <details className={styles.legend}><summary>色</summary><div>{CANONICAL_ROLES.map((role) => <span className={styles.legendItem} data-role={role} key={role}>{roleLabel(role)}</span>)}</div></details>;
}
function roleLabel(role: CanonicalRole) {
  const labels: Record<CanonicalRole, string> = { title: "タイトル（紫）", author: "著者（青緑）", affiliation: "所属（青緑）", abstract: "要旨（黄）", heading: "見出し（青）", paragraph: "本文（緑）", figure: "図（緑）", table: "表（橙）", caption: "キャプション（桃）", equation: "数式（赤）", footnote: "脚注（灰）", reference: "参考文献（藍）", header: "ヘッダー（灰）", footer: "フッター（灰）", "page-number": "ページ番号（灰）", copyright: "著作権表示（灰）", citation: "引用（灰）", other: "その他（灰）" };
  return labels[role];
}
function RoleSelect({ value, onChange }: { value: CanonicalRole; onChange: (role: CanonicalRole) => void }) {
  return <label className={styles.roleSelect}><span className={styles.roleSwatch} data-role={value} />色・役割 <select value={value} onChange={(event) => onChange(event.target.value as CanonicalRole)}>{CANONICAL_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>;
}
function BlockEditor({ item, existing, onSave }: { item: DisplayItem; existing?: BlockReview; onSave: (change: Partial<BlockReview>) => void }) {
  const role = existing?.correctRole ?? (CANONICAL_ROLES.includes(item.role as CanonicalRole) ? item.role as CanonicalRole : "other");
  const errors = existing?.errorTypes ?? [];
  const removed = existing?.verdict === "incorrect" && existing.errorTypes.includes("extra");
  const toggleRemoved = () => {
    const nextErrors: ErrorType[] = removed ? errors.filter((type) => type !== "extra") : [...new Set<ErrorType>([...errors, "extra"])];
    const nextVerdict = removed && nextErrors.length === 0 ? "correct" : "incorrect";
    onSave({ errorTypes: nextErrors, verdict: nextVerdict });
  };
  return <section className={styles.editor}><h3>{item.role}</h3><p>{item.text.slice(0, 300) || "（テキストなし）"}</p>
    <button type="button" onClick={toggleRemoved}>{removed ? "削除を戻す" : "削除"}</button>
    <RoleSelect value={role} onChange={(next) => onSave({ correctRole: next, verdict: next === item.role ? (errors.length ? "incorrect" : "correct") : "incorrect", errorTypes: next === item.role ? errors.filter((type) => type !== "role") : [...new Set<ErrorType>([...errors, "role"])] })} />
    <label>誤り <select value={errors.find((type) => type !== "extra" && type !== "role") ?? (errors.includes("role") ? "role" : "none")} onChange={(event) => { const type = event.target.value as ErrorType | "none"; const retained = errors.filter((value) => value === "extra" || value === "role"); const next: ErrorType[] = type === "none" ? retained : [...new Set<ErrorType>([...retained, type])]; onSave({ errorTypes: next, verdict: next.length ? "incorrect" : "correct" }); }}><option value="none">問題なし</option><option value="reading-order">読み順</option><option value="merge">結合</option><option value="split">分割</option><option value="role">役割</option><option value="text-corruption">文字化け・テキスト</option><option value="relation">図表とキャプションの対応</option></select></label></section>;
}
function MissingEditor({ value, onChange }: { value: MissingRegionReview; onChange: (changes: Partial<MissingRegionReview>) => void }) { return <section className={styles.editor}><h3>認識漏れ</h3><RoleSelect value={value.correctRole} onChange={(correctRole) => onChange({ correctRole })} /></section>; }
function MissingRegionList({ value, editingId, onEdit, onRemove }: { value: MissingRegionReview[]; editingId: string | null; onEdit: (id: string) => void; onRemove: (id: string) => void }) { if (!value.length) return null; return <section className={styles.editor}><h3>認識漏れ</h3>{value.map((region) => <div className={styles.relation} key={region.id}><button type="button" className={editingId === region.id ? styles.active : ""} onClick={() => onEdit(region.id)}><code>{region.correctRole} · {region.textAnchor?.text?.slice(0, 32) || "（テキストなし）"}</code></button><button type="button" onClick={() => onRemove(region.id)}>削除</button></div>)}</section>; }
