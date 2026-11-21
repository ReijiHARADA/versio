import type { NormalizedSectionKind, Paper, PaperBlock, Section } from "../types/paper";

// Bundled onboarding paper: written as a paper so the reader learns Versio by using the Reader on it.
const PAPER_ID = "versio-introduction";
const STAMP = "2026-11-21T00:00:00Z";

export const introductionPaper: Paper = {
  id: PAPER_ID,
  sourceFilePath: "",
  sourceFileHash: "bundled:versio-introduction",
  titleOriginal: "Versio: Reading Papers Across Languages",
  titleTranslated: "Versio: 言語を越えて論文を読む",
  authors: ["The Versio Team"],
  publication: "Bundled with Versio",
  year: 2026,
  pageCount: 1,
  processingStatus: "ready",
  lastReadBlockId: null,
  lastReadOffset: null,
  createdAt: STAMP,
  updatedAt: STAMP,
};

type Part =
  | { kind: "heading" | "paragraph"; en: string; ja: string }
  | { kind: "reference"; en: string; n: number };

type Chapter = { id: string; kind: NormalizedSectionKind; en: string; ja: string; parts: Part[] };

const h = (en: string, ja: string): Part => ({ kind: "heading", en, ja });
const p = (en: string, ja: string): Part => ({ kind: "paragraph", en, ja });
const ref = (n: number, en: string): Part => ({ kind: "reference", n, en });

const chapters: Chapter[] = [
  {
    id: "abstract",
    kind: "abstract",
    en: "Abstract",
    ja: "概要",
    parts: [
      p(
        "Versio is a desktop reader that turns English research papers into Japanese you can read at a natural pace, while keeping the original one click away. This paper is itself a Versio document: every chapter explains one feature and asks you to try it on the text in front of you. Reading it from start to finish takes about five minutes and covers importing, translation, notes, the glossary, search, workspaces, and export.",
        "Versio は、英語の研究論文を自然な速さで読める日本語にし、原文もワンクリックで確かめられるデスクトップ用リーダーです。この論文そのものが Versio の文書になっていて、各章でひとつの機能を説明し、目の前の文章で試してもらいます。最後まで読むのにかかるのは約 5 分で、取り込み、翻訳、メモ、用語集、検索、ワークスペース、書き出しを一通り扱います。"
      ),
    ],
  },
  {
    id: "introduction",
    kind: "introduction",
    en: "1 Introduction",
    ja: "1 はじめに",
    parts: [
      h("1 Introduction", "1 はじめに"),
      p(
        "Reading papers in a second language is slow not because the ideas are hard, but because every sentence costs a little extra effort. Versio removes that cost: it extracts the structure of a PDF, translates it paragraph by paragraph on your own Mac, and lets you check the English whenever a sentence matters.",
        "第二言語で論文を読むのが遅いのは、内容が難しいからではなく、一文ごとに少しずつ余計な労力がかかるからです。Versio はその負担を取り除きます。PDF の構造を抽出し、段落ごとにあなたの Mac の中で翻訳し、大事な一文では英語をいつでも確かめられるようにします。"
      ),
      p(
        "Nothing leaves your computer. Papers, notes, and translations are stored locally, and the translation model runs offline once it has been downloaded (Section 8).",
        "データは一切コンピュータの外に出ません。論文、メモ、翻訳はローカルに保存され、翻訳モデルも一度ダウンロードすればオフラインで動きます（第 8 章）。"
      ),
    ],
  },
  {
    id: "importing",
    kind: "method",
    en: "2 Importing Papers",
    ja: "2 論文を取り込む",
    parts: [
      h("2 Importing Papers", "2 論文を取り込む"),
      p(
        "To add a paper, drop a PDF anywhere on the Versio window, or use the “Add paper” button next to the library title. You can also open a PDF from Finder with “Open With → Versio”. You stay on the library while the paper is prepared in the background.",
        "論文を追加するには、PDF を Versio のウィンドウのどこかにドロップするか、ライブラリのタイトル横にある「論文を追加」ボタンを使います。Finder から「このアプリケーションで開く → Versio」で開くこともできます。論文の準備は裏で進むので、ライブラリの画面のまま待てます。"
      ),
      p(
        "Each card shows where the paper is: preparing, readable, translating, or needs attention. A paper becomes readable as soon as its text is extracted, and translation fills in while you read. Scanned PDFs are recognized with on-device OCR.",
        "各カードには、論文が今どの段階にあるか（準備中・読める・翻訳中・要確認）が表示されます。本文が抽出された時点で読めるようになり、翻訳は読んでいる間に埋まっていきます。スキャンした PDF は端末内の OCR で文字を認識します。"
      ),
      p(
        "Try it: after finishing this paper, drop one of your own PDFs onto the window and watch its card change state.",
        "試してみよう：この論文を読み終えたら、手元の PDF をウィンドウにドロップして、カードの状態が変わっていく様子を見てください。"
      ),
    ],
  },
  {
    id: "reading",
    kind: "method",
    en: "3 Reading and Translation",
    ja: "3 読むことと翻訳",
    parts: [
      h("3 Reading and Translation", "3 読むことと翻訳"),
      p(
        "Versio shows the Japanese translation by default. Every paragraph has an eye button, “Show original”, that unfolds the English text right below it, so you can compare wording without losing your place.",
        "Versio は既定で日本語訳を表示します。各段落には目のアイコンの「原文を表示」ボタンがあり、押すとすぐ下に英語の原文が開くので、読んでいる位置を見失わずに言い回しを見比べられます。"
      ),
      p(
        "Try it: press “Show original” on this paragraph, then press it again to hide the English.",
        "試してみよう：この段落の「原文を表示」を押し、もう一度押して英語を隠してください。"
      ),
      p(
        "The table of contents on the left jumps between chapters, and the display settings in the toolbar change the font size, line height, and text width. Versio remembers where you stopped reading and returns you there next time.",
        "左の目次で章のあいだを移動でき、ツールバーの表示設定で文字サイズ・行間・本文幅を変えられます。Versio は読み終えた位置を覚えていて、次に開いたときはそこから再開します。"
      ),
      p(
        "Numbered citations such as [1] can be clicked to preview the matching reference without scrolling to the end of the paper.",
        "[1] のような番号付きの引用はクリックすると、論文の末尾までスクロールしなくても対応する参考文献を確認できます。"
      ),
    ],
  },
  {
    id: "notes",
    kind: "method",
    en: "4 Notes and Glossary",
    ja: "4 メモと用語集",
    parts: [
      h("4 Notes and Glossary", "4 メモと用語集"),
      p(
        "Select any phrase in the text to highlight it or attach a note with “Add note”. Notes stay anchored to the paragraph even if the paper is extracted again, and the notes list in the toolbar collects every note in this paper.",
        "本文の語句を選択すると、ハイライトしたり「メモを追加」でメモを付けたりできます。メモは論文を抽出し直しても段落に結びついたまま残り、ツールバーのメモ一覧にこの論文のメモがすべて集まります。"
      ),
      p(
        "Try it: select the words “stay anchored” in the paragraph above and add a short note.",
        "試してみよう：上の段落の「結びついたまま」を選択して、短いメモを付けてみてください。"
      ),
      p(
        "The glossary keeps your preferred translation for technical terms. Open the glossary from the toolbar and add an English term with its Japanese rendering; Versio then marks the term wherever it appears.",
        "用語集には、専門用語をどう訳したいかを登録しておけます。ツールバーから用語集を開き、英語の用語と日本語の訳語を追加すると、Versio は本文中でその用語が現れる箇所に印を付けます。"
      ),
    ],
  },
  {
    id: "search",
    kind: "method",
    en: "5 Search",
    ja: "5 検索",
    parts: [
      h("5 Search", "5 検索"),
      p(
        "Press ⌘K to search the whole library by title, author, or body text. Press ⌘F inside a paper to search only that paper and step through the hits.",
        "⌘K を押すと、タイトル・著者・本文でライブラリ全体を検索できます。論文の中で ⌘F を押すと、その論文だけを検索してヒットを順にたどれます。"
      ),
      p(
        "Try it: press ⌘F now and search for “glossary”.",
        "試してみよう：いま ⌘F を押して「glossary」を検索してください。"
      ),
    ],
  },
  {
    id: "workspace",
    kind: "method",
    en: "6 Organizing with Workspaces",
    ja: "6 ワークスペースで整理する",
    parts: [
      h("6 Organizing with Workspaces", "6 ワークスペースで整理する"),
      p(
        "Workspaces are folders for research projects, and they can be nested as deeply as you like. Create one with “New folder” in the sidebar, then drag a paper row from the library onto it. A paper can belong to several workspaces at once without being copied.",
        "ワークスペースは研究プロジェクトごとのフォルダで、いくらでも入れ子にできます。サイドバーの「新規フォルダ」で作り、ライブラリの論文の行をそこへドラッグします。ひとつの論文を、複製することなく複数の ワークスペースに同時に入れられます。"
      ),
      p(
        "Papers that belong to no workspace appear in Inbox. Dragging a paper onto Inbox removes it from all workspaces; the paper itself is never deleted this way.",
        "どの ワークスペースにも入っていない論文は Inbox に表示されます。論文を Inbox にドラッグするとすべての ワークスペースから外れますが、この操作で論文そのものが消えることはありません。"
      ),
    ],
  },
  {
    id: "export",
    kind: "method",
    en: "7 Exporting",
    ja: "7 書き出し",
    parts: [
      h("7 Exporting", "7 書き出し"),
      p(
        "Use “Export” in the Reader toolbar to save a paper as Markdown or EPUB. An EPUB opens in e-book readers such as Apple Books or Kindle, and the Markdown export can be imported into Notion.",
        "Reader のツールバーの「書き出す」を使うと、論文を Markdown や EPUB として保存できます。EPUB は Apple Books や Kindle などの電子書籍リーダーで開け、Markdown の書き出しは Notion に読み込めます。"
      ),
    ],
  },
  {
    id: "plamo",
    kind: "method",
    en: "8 Translation Model (PLaMo)",
    ja: "8 翻訳モデル（PLaMo）",
    parts: [
      h("8 Translation Model (PLaMo)", "8 翻訳モデル（PLaMo）"),
      p(
        "Versio translates with PLaMo 3 Translate [1], a model specialized for English–Japanese translation that runs entirely on your Mac. The model (about 1.8 GB) is downloaded once, the first time you need it; the translation of this paper was bundled in advance, so you could read it before the download.",
        "Versio は、英日翻訳に特化し、すべてあなたの Mac の中で動くモデル PLaMo 3 Translate [1] で翻訳します。モデル（約 1.8 GB）は、初めて必要になったときに一度だけダウンロードされます。この論文の訳文はあらかじめ同梱してあるので、ダウンロード前でも読めました。"
      ),
      p(
        "If you skipped the download at startup, open Settings → Translation and press “Download model”. When it shows “Ready”, papers you import are translated automatically.",
        "起動時にダウンロードを後回しにした場合は、設定 → 翻訳 を開いて「モデルをダウンロード」を押してください。「準備完了」と表示されれば、取り込んだ論文は自動で翻訳されます。"
      ),
      p(
        "That is everything you need. You can move this paper to the trash at any time; it will not come back.",
        "必要なことは以上です。この論文はいつでもゴミ箱に入れて構いません。再び現れることはありません。"
      ),
    ],
  },
  {
    id: "references",
    kind: "references",
    en: "References",
    ja: "参考文献",
    parts: [
      h("References", "参考文献"),
      ref(1, "[1] Preferred Networks. PLaMo 3 Translate. https://huggingface.co/pfnet, 2026."),
      ref(2, "[2] Mozilla. PDF.js: a PDF reader in JavaScript. https://mozilla.github.io/pdf.js/."),
      ref(3, "[3] Georgi Gerganov et al. llama.cpp. https://github.com/ggml-org/llama.cpp."),
    ],
  },
];

export const introductionSections: Section[] = chapters.map((c, order) => ({
  id: `intro-sec-${c.id}`,
  paperId: PAPER_ID,
  parentSectionId: null,
  order,
  level: 1,
  originalTitle: c.en,
  translatedTitle: c.ja,
  normalizedKind: c.kind,
}));

export const introductionBlocks: PaperBlock[] = chapters
  .flatMap((c) => c.parts.map((part) => ({ c, part })))
  .map(({ c, part }, i) => ({
    id: `intro-block-${String(i + 1).padStart(3, "0")}`,
    paperId: PAPER_ID,
    sectionId: `intro-sec-${c.id}`,
    type: part.kind,
    order: i + 1,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: part.en,
    translated: part.kind === "reference" ? null : part.ja,
    extractionConfidence: 1,
    translationStatus: part.kind === "reference" ? "skipped" : "completed",
    parentBlockId: null,
    metadata: part.kind === "reference" ? { referenceNumber: part.n } : {},
  }));
