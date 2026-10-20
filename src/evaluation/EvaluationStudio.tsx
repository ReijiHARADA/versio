import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { extractPDFContent } from "../services/pdfService";
import { extractFromPages } from "../services/pdfExtraction/pipeline/extractAcademicPdf";
import { openPdfDocument, pdfjsLib } from "../services/pdfjsRuntime";
import type { BoundingBox, PaperBlock } from "../types/paper";
import type { CanonicalNode, CanonicalRole } from "../services/pdfExtraction/canonical/types";
import { CANONICAL_ROLES, ERROR_TYPES, emptyPageReview, isEvaluationBundle, newReview, type BlockReview, type ErrorType, type EvaluationBundle, type MissingRegionReview, type PageReview, type Severity } from "./schema";
import { downloadJson, loadBundle, saveBundle } from "./storage";
import { evaluateReview } from "./metrics";
import styles from "./EvaluationStudio.module.css";

type DisplayItem = { id: string; kind: "canonical" | "projection"; role: string; text: string; boxes: BoundingBox[]; canonicalNodeId?: string };

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nodeItem(node: CanonicalNode): DisplayItem {
  return { id: node.id, kind: "canonical", role: node.role, text: node.text ?? "", boxes: node.boundingBoxes };
}
function projectionItem(block: PaperBlock): DisplayItem {
  return { id: block.id, kind: "projection", role: block.type, text: block.original ?? "", boxes: block.boundingBoxes,
    canonicalNodeId: typeof block.metadata.canonicalNodeId === "string" ? block.metadata.canonicalNodeId : undefined };
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

function PdfPage({ file, page, zoom, width, height, items, selectedId, selectedItemId, reviewRegions, onSelect, onRegion, onBoxChange }: {
  file: File; page: number; zoom: number; width: number; height: number; items: DisplayItem[]; selectedId: string | null; selectedItemId: string | null;
  reviewRegions: Map<string, BoundingBox>; onSelect: (item: DisplayItem) => void; onRegion: (box: BoundingBox) => void;
  onBoxChange: (item: DisplayItem, box: BoundingBox) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<BoundingBox | null>(null);
  const [boxEdit, setBoxEdit] = useState<BoxEdit | null>(null);
  const [editingBox, setEditingBox] = useState<BoundingBox | null>(null);
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
    if ((event.target as HTMLElement).dataset.overlay) return;
    const point = local(event); if (!point) return;
    setDragStart({ x: point.x, y: point.y }); setDraft(null);
  };
  const beginBoxEdit = (event: MouseEvent<HTMLElement>, item: DisplayItem, box: BoundingBox, mode: BoxEdit["mode"]) => {
    event.preventDefault(); event.stopPropagation();
    const point = local(event); if (!point) return;
    onSelect(item);
    setBoxEdit({ item, mode, startX: point.x / point.width * width, startY: point.y / point.height * height, original: box });
    setEditingBox(box);
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
    if (boxEdit) {
      const point = local(event); if (!point) return;
      setEditingBox(edited(boxEdit, point.x / point.width * width, point.y / point.height * height));
      return;
    }
    if (!dragStart) return; const point = local(event); if (!point) return;
    const x = Math.min(dragStart.x, point.x); const y = Math.min(dragStart.y, point.y);
    setDraft({ page, x: x / point.width * width, y: y / point.height * height,
      width: Math.abs(point.x - dragStart.x) / point.width * width, height: Math.abs(point.y - dragStart.y) / point.height * height });
  };
  const end = () => {
    if (boxEdit) {
      if (editingBox && (Math.abs(editingBox.x - boxEdit.original.x) > 0.25 || Math.abs(editingBox.y - boxEdit.original.y) > 0.25 || Math.abs(editingBox.width - boxEdit.original.width) > 0.25 || Math.abs(editingBox.height - boxEdit.original.height) > 0.25)) onBoxChange(boxEdit.item, editingBox);
      setBoxEdit(null); setEditingBox(null); return;
    }
    if (draft && draft.width > 4 && draft.height > 4) onRegion(draft); setDragStart(null); setDraft(null);
  };
  // Native PDF text geometry is stored from its baseline (PDF.js text matrix),
  // while regions such as a detected figure/table are already top-left boxes.
  // Convert only text-bearing blocks for display; do not change saved source
  // coordinates or manually selected regions.
  const relative = (box: BoundingBox, textBox: boolean) => ({
    left: `${box.x / width * 100}%`,
    top: `${Math.max(0, box.y - (textBox ? box.height : 0)) / height * 100}%`,
    width: `${box.width / width * 100}%`,
    height: `${box.height / height * 100}%`,
  });
  return <div className={styles.pdfPage}>
    <canvas ref={canvasRef} />
    <div ref={layerRef} className={styles.overlayLayer} onMouseDown={begin} onMouseMove={move} onMouseUp={end} onMouseLeave={end}>
      {items.flatMap((item) => {
        const override = reviewRegions.get(item.id);
        const boxes = override?.page === page ? [override] : item.boxes.filter((box) => box.page === page).map((box) =>
          item.text ? { ...box, y: Math.max(0, box.y - box.height) } : box
        );
        return boxes.map((box, index) => {
          const isDirectlySelected = selectedItemId === item.id;
          const displayBox = boxEdit?.item.id === item.id && editingBox ? editingBox : box;
          return <div data-overlay="true" data-role={item.role} role="button" tabIndex={0} title={`${item.role}: ${item.text.slice(0, 120)}`} key={`${item.id}-${index}`}
            className={`${styles.region} ${selectedId === item.id || selectedId === item.canonicalNodeId ? styles.regionSelected : ""}`}
            style={relative(displayBox, false)} onMouseDown={(event) => beginBoxEdit(event, item, box, "move")} onClick={() => onSelect(item)}>
            {isDirectlySelected && <>{(["nw", "ne", "se", "sw"] as const).map((corner) => <button key={corner} data-overlay="true" type="button" aria-label={`判定枠を${corner}からリサイズ`} className={`${styles.resizeHandle} ${styles[`handle${corner.toUpperCase()}`]}`} onMouseDown={(event) => beginBoxEdit(event, item, box, corner)} />)}</>}
          </div>;
        });
      })}
      {draft && <div className={styles.draftRegion} style={relative(draft, false)} />}
    </div>
  </div>;
}

export function EvaluationStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<EvaluationBundle | null>(null);
  const [page, setPage] = useState(1); const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<"canonical" | "projection">("canonical");
  const [showRegions, setShowRegions] = useState(true); const [selected, setSelected] = useState<DisplayItem | null>(null);
  const [missingBox, setMissingBox] = useState<BoundingBox | null>(null); const [status, setStatus] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const currentReview = bundle ? pageReview(bundle, page) : null;
  const items = useMemo(() => {
    if (!bundle) return [];
    return view === "canonical" ? bundle.snapshot.canonical.nodes.map(nodeItem) : bundle.snapshot.projection.blocks.map(projectionItem);
  }, [bundle, view]);
  const pageItems = useMemo(() => items.filter((item) => item.boxes.some((box) => box.page === page)), [items, page]);
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
    setFile(nextFile); setStatus("PDF テキストと構造を抽出中…"); setSelected(null); setMissingBox(null);
    try {
      const hash = await sha256(nextFile);
      const prior = loadBundle(hash);
      if (prior) { setBundle(prior); setPage(1); setStatus(""); return; }
      const pdf = await extractPDFContent(nextFile);
      const result = extractFromPages({ pages: pdf.pages, paperId: `evaluation-${hash.slice(0, 12)}`, filePath: nextFile.name, fileHash: hash, metadata: pdf.metadata });
      const snapshot = {
        schemaVersion: 1 as const, kind: "paper-reader-extraction-snapshot" as const, createdAt: new Date().toISOString(),
        parser: { id: "paper-reader-canonical", version: "development" },
        source: { paperId: `evaluation-${hash.slice(0, 12)}`, fileName: nextFile.name, fileHash: hash, pageCount: pdf.pages.length },
        pages: pdf.pages.map((item) => ({ page: item.pageNumber, width: item.width, height: item.height, rotation: item.rotation })),
        canonical: result.canonical, projection: { blocks: result.blocks },
      };
      const next = { schemaVersion: 1 as const, kind: "paper-reader-extraction-evaluation" as const, snapshot, review: newReview(snapshot) };
      persist(next); setPage(1); setStatus("");
    } catch (error) { setStatus(`抽出できませんでした: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const selectItem = (item: DisplayItem) => { setSelected(item); setMissingBox(null); window.setTimeout(() => listRef.current?.querySelector(`[data-item-id="${item.id}"]`)?.scrollIntoView({ block: "nearest" }), 0); };
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
  const addMissing = (role: CanonicalRole, comment: string) => {
    if (!missingBox) return;
    const missing: MissingRegionReview = { id: uuid(), page, region: missingBox, correctRole: role, textAnchor: textAnchor(comment), comment: comment || undefined, createdAt: new Date().toISOString() };
    patchPage((current) => ({ ...current, status: current.status === "unreviewed" ? "in-progress" : current.status, missingRegions: [...current.missingRegions, missing] }));
    setMissingBox(null);
  };
  const importBundle = async (event: ChangeEvent<HTMLInputElement>) => {
    const uploaded = event.target.files?.[0]; if (!uploaded) return;
    try { const value = JSON.parse(await uploaded.text()); if (!isEvaluationBundle(value)) throw new Error("Evaluation bundle の形式または PDF hash が不正です。");
      setBundle(value); saveBundle(value); setPage(1); setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "読み込みに失敗しました。"); }
  };
  const relationSet = (fromNodeId: string, toNodeId: string, relationKind: string, verdict: "correct" | "incorrect") => {
    patchPage((current) => ({ ...current, relationReviews: [...current.relationReviews.filter((item) => !(item.fromNodeId === fromNodeId && item.toNodeId === toNodeId && item.relationKind === relationKind)), { id: uuid(), page, fromNodeId, toNodeId, relationKind, verdict }] }));
  };
  const boundarySet = (leftNodeId: string, rightNodeId: string, verdict: "correct" | "incorrect") => {
    patchPage((current) => ({ ...current, paragraphBoundaryReviews: [...current.paragraphBoundaryReviews.filter((item) => !(item.leftNodeId === leftNodeId && item.rightNodeId === rightNodeId)), { id: uuid(), page, leftNodeId, rightNodeId, verdict }] }));
  };
  return <main className={styles.app}>
    <header className={styles.header}><h1>PDF Extraction Evaluation Studio</h1>
      <div className={styles.actions}><label className={styles.button}>PDFを開く<input type="file" accept="application/pdf" onChange={(event) => event.target.files?.[0] && void openFile(event.target.files[0])} /></label>
      <label className={styles.button}>bundle読込<input type="file" accept="application/json" onChange={(event) => void importBundle(event)} /></label>
      <button type="button" disabled={!bundle} onClick={() => bundle && downloadJson(`${bundle.snapshot.source.fileName}.evaluation.json`, bundle)}>保存/書出し</button>
      <button type="button" disabled={!bundle} onClick={() => bundle && downloadJson(`${bundle.snapshot.source.fileName}.report.json`, evaluateReview(bundle.snapshot, bundle.review))}>定量レポート</button></div></header>
    {status && <p className={styles.status}>{status}</p>}
    {!bundle ? <section className={styles.empty} aria-label="PDF未選択" /> : <>
      <section className={styles.toolbar}><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button><strong>{page} / {bundle.snapshot.source.pageCount}</strong><button type="button" onClick={() => setPage((value) => Math.min(bundle.snapshot.source.pageCount, value + 1))}>→</button>
        <label>ズーム <input type="range" min="0.6" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><button type="button" onClick={fitPdfToViewport}>全高</button>
        <label><input type="checkbox" checked={showRegions} onChange={(event) => setShowRegions(event.target.checked)} /> 領域を表示</label>
        <RoleLegend />
        <label>右ペイン <select value={view} onChange={(event) => setView(event.target.value as "canonical" | "projection")}><option value="canonical">CanonicalDocument</option><option value="projection">Reader projection</option></select></label>
        <label>ページ状態 <select value={currentReview?.status ?? "unreviewed"} onChange={(event) => patchPage((current) => ({ ...current, status: event.target.value as PageReview["status"] }))}><option value="unreviewed">未確認</option><option value="in-progress">作業中</option><option value="complete">レビュー完了</option></select></label></section>
      <section className={styles.workspace}>
        <div className={styles.pdfPane}>{file && pageSize ? <PdfPage file={file} page={page} zoom={zoom} width={pageSize.width} height={pageSize.height} items={showRegions ? pageItems : []} selectedId={(selected?.kind === "canonical" ? selected.id : selected?.canonicalNodeId) ?? null} selectedItemId={selected?.id ?? null} reviewRegions={reviewRegions} onSelect={selectItem} onRegion={setMissingBox} onBoxChange={(item, targetRegion) => saveReview({ targetRegion }, item)} /> : <div className={styles.pdfPlaceholder}>bundle は読み込み済みです。原本 PDF を選択すると原本を表示します。</div>}
          <p className={styles.hint}>空白をドラッグして認識漏れの領域を指定します。座標は回転後の PDF viewport を基準に保存されます。</p></div>
        <div className={styles.listPane} ref={listRef}><h2>{view === "canonical" ? "CanonicalDocument" : "Reader projection"} <small>読書順</small></h2>
          {pageItems.map((item, index) => { const review = reviewForItem(currentReview?.blockReviews, item); return <button type="button" data-item-id={item.id} key={item.id} className={`${styles.block} ${selected?.id === item.id || (selected?.kind === "canonical" && item.canonicalNodeId === selected.id) || selected?.canonicalNodeId === item.id ? styles.blockSelected : ""}`} onClick={() => selectItem(item)}><span>{index + 1} · {item.role}{review ? ` · ${review.verdict === "incorrect" ? "要修正" : "確認済み"}` : ""}</span><p>{item.text || "（テキストなし）"}</p></button>; })}
          {!pageItems.length && <p>このページに表示対象はありません。</p>}</div>
        <aside className={styles.reviewPane}><h2>レビュー</h2><CoverageEditor value={currentReview!} onChange={(coverage) => patchPage((current) => ({ ...current, coverage }))} />
          {selected && <BlockEditor key={selected.id} item={selected} existing={reviewForItem(currentReview?.blockReviews, selected)} onSave={saveReview} />}
          {missingBox && <MissingEditor onAdd={addMissing} onCancel={() => setMissingBox(null)} />}
          <h3>段落境界</h3><BoundaryList bundle={bundle} page={page} reviews={currentReview?.paragraphBoundaryReviews ?? []} onSet={boundarySet} />
          <h3>読み順・図表関係</h3><RelationList bundle={bundle} page={page} reviews={currentReview?.relationReviews ?? []} onSet={relationSet} />
        </aside>
      </section>
    </>}
  </main>;
}

function CoverageEditor({ value, onChange }: { value: PageReview; onChange: (coverage: PageReview["coverage"]) => void }) {
  return <fieldset className={styles.coverage}><legend>完全性（未選択は N/A）</legend>{(["predictedComplete", "goldComplete", "paragraphBoundariesComplete", "readingOrderComplete", "relationsComplete"] as const).map((key) => <label key={key}><input type="checkbox" checked={value.coverage[key]} onChange={(event) => onChange({ ...value.coverage, [key]: event.target.checked })} /> {key}</label>)}</fieldset>;
}
function RoleLegend() {
  const roles: Array<[string, string]> = [["title", "title"], ["author", "author / affiliation"], ["abstract", "abstract"], ["heading", "heading"], ["paragraph", "paragraph"], ["figure", "figure"], ["table", "table"], ["caption", "caption"], ["equation", "equation"], ["reference", "reference"], ["other", "other"]];
  return <details className={styles.legend}><summary>色</summary><div>{roles.map(([role, label]) => <span className={styles.legendItem} data-role={role} key={role}>{label}</span>)}</div></details>;
}
function BlockEditor({ item, existing, onSave }: { item: DisplayItem; existing?: BlockReview; onSave: (change: Partial<BlockReview>) => void }) {
  const [comment, setComment] = useState(existing?.comment ?? ""); const [role, setRole] = useState<CanonicalRole>(existing?.correctRole ?? (CANONICAL_ROLES.includes(item.role as CanonicalRole) ? item.role as CanonicalRole : "other"));
  const [verdict, setVerdict] = useState<BlockReview["verdict"]>(existing?.verdict ?? "correct"); const [severity, setSeverity] = useState<Severity>(existing?.severity ?? "critical"); const [errors, setErrors] = useState<ErrorType[]>(existing?.errorTypes ?? []);
  useEffect(() => { setComment(existing?.comment ?? ""); setRole(existing?.correctRole ?? (CANONICAL_ROLES.includes(item.role as CanonicalRole) ? item.role as CanonicalRole : "other")); setVerdict(existing?.verdict ?? "correct"); setSeverity(existing?.severity ?? "critical"); setErrors(existing?.errorTypes ?? []); }, [item.id, existing?.id]);
  const commit = (changes: Partial<BlockReview> = {}) => onSave({ verdict, correctRole: role, severity, errorTypes: errors, comment: comment || undefined, ...changes });
  const setError = (type: ErrorType, checked: boolean) => {
    const next = checked ? [...errors, type] : errors.filter((value) => value !== type);
    setErrors(next);
    // An error type is itself an incorrect verdict; users must not need to
    // make the same decision in two separate controls.
    if (checked) setVerdict("incorrect");
    commit({ errorTypes: next, verdict: checked ? "incorrect" : verdict });
  };
  return <section className={styles.editor}><h3>{item.role}</h3><p>{item.text.slice(0, 300) || "（テキストなし）"}</p>
    <label>抽出結果は <select value={verdict} onChange={(event) => { const next = event.target.value as BlockReview["verdict"]; const nextErrors = next === "correct" ? [] : errors; setVerdict(next); setErrors(nextErrors); commit({ verdict: next, errorTypes: nextErrors }); }}><option value="correct">正しい</option><option value="incorrect">誤り</option></select></label>
    <label>正しい role <select value={role} onChange={(event) => { const next = event.target.value as CanonicalRole; setRole(next); commit({ correctRole: next }); }}>{CANONICAL_ROLES.map((value) => <option key={value}>{value}</option>)}</select></label><label>深刻度 <select value={severity} onChange={(event) => { const next = event.target.value as Severity; setSeverity(next); commit({ severity: next }); }}><option value="minor">minor</option><option value="major">major</option><option value="critical">critical</option></select></label>
    <div className={styles.errorTypes}>{ERROR_TYPES.map((type) => <label key={type}><input type="checkbox" checked={errors.includes(type)} onChange={(event) => setError(type, event.target.checked)} /> {type}</label>)}</div><textarea placeholder="コメント" value={comment} onChange={(event) => setComment(event.target.value)} onBlur={() => commit()} /></section>;
}
function MissingEditor({ onAdd, onCancel }: { onAdd: (role: CanonicalRole, comment: string) => void; onCancel: () => void }) { const [role, setRole] = useState<CanonicalRole>("paragraph"); const [comment, setComment] = useState(""); return <section className={styles.editor}><h3>認識漏れ</h3><label>正しい role <select value={role} onChange={(event) => setRole(event.target.value as CanonicalRole)}>{CANONICAL_ROLES.map((value) => <option key={value}>{value}</option>)}</select></label><textarea placeholder="テキストアンカー / コメント" value={comment} onChange={(event) => setComment(event.target.value)} /><button type="button" onClick={() => onAdd(role, comment)}>欠落として追加</button><button type="button" onClick={onCancel}>取消</button></section>; }
function BoundaryList({ bundle, page, reviews, onSet }: { bundle: EvaluationBundle; page: number; reviews: PageReview["paragraphBoundaryReviews"]; onSet: (left: string, right: string, verdict: "correct" | "incorrect") => void }) { const nodes = bundle.snapshot.canonical.nodes.filter((node) => node.pageStart === page && node.role === "paragraph"); const pairs = nodes.slice(1).map((node, index) => [nodes[index], node] as const); if (!pairs.length) return <p className={styles.muted}>このページには確認対象の連続 paragraph 境界はありません。</p>; return <div><p className={styles.explanation}>左と右が別段落として分かれているかを確認します。</p>{pairs.map(([left, right]) => { const review = reviews.find((item) => item.leftNodeId === left.id && item.rightNodeId === right.id); return <div className={styles.relation} key={`${left.id}-${right.id}`}><code>{left.text?.slice(0, 20) ?? ""} → {right.text?.slice(0, 20) ?? ""}</code><button type="button" className={review?.verdict === "correct" ? styles.active : ""} onClick={() => onSet(left.id, right.id, "correct")}>正しい</button><button type="button" className={review?.verdict === "incorrect" ? styles.active : ""} onClick={() => onSet(left.id, right.id, "incorrect")}>誤り</button></div>; })}</div>; }
function RelationList({ bundle, page, reviews, onSet }: { bundle: EvaluationBundle; page: number; reviews: PageReview["relationReviews"]; onSet: (from: string, to: string, kind: string, verdict: "correct" | "incorrect") => void }) {
  const byId = new Map(bundle.snapshot.canonical.nodes.map((node) => [node.id, node]));
  const relations = bundle.snapshot.canonical.relations.filter((relation) => byId.get(relation.from)?.pageStart === page && (relation.kind === "CAPTION_OF" || relation.kind === "READS_BEFORE"));
  if (!relations.length) return <p className={styles.muted}>このページに確認対象の読み順・図表関係はありません。</p>;
  return <div><p className={styles.explanation}>読み順: 左の要素を右の要素より先に読むか。図表関係: キャプションが図表を正しく指すか。</p>{relations.map((relation) => {
    const review = reviews.find((item) => item.fromNodeId === relation.from && item.toNodeId === relation.to && item.relationKind === relation.kind);
    const from = byId.get(relation.from)?.text?.slice(0, 28) || relation.from;
    const to = byId.get(relation.to)?.text?.slice(0, 28) || relation.to;
    const label = relation.kind === "READS_BEFORE" ? `読み順: ${from} → ${to}` : `図表: ${from} → ${to}`;
    return <div className={styles.relation} key={`${relation.from}-${relation.to}`}><code>{label}</code><button type="button" className={review?.verdict === "correct" ? styles.active : ""} onClick={() => onSet(relation.from, relation.to, relation.kind, "correct")}>正しい</button><button type="button" className={review?.verdict === "incorrect" ? styles.active : ""} onClick={() => onSet(relation.from, relation.to, relation.kind, "incorrect")}>誤り</button></div>;
  })}</div>;
}
