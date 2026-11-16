import type { Paper, PaperBlock, Section } from "../types/paper";
import type { WorkspaceNode, WorkspacePaper } from "../types/project";
import type { ImportJob } from "../stores/importJobStore";

export const PRESENTATION_DEMO_FILE_NAME = "Versio-Demo.pdf";

/** This build-time gate prevents fixture data entering ordinary imports. */
export function isPresentationDemoPdf(file: File): boolean {
  // The dedicated build is the boundary. Do not rely on browser-specific file
  // names, which may be rewritten by a picker or drag-and-drop bridge.
  return import.meta.env.VITE_VERSIO_DEMO === "1" && file.type.includes("pdf");
}

/** Figures are cropped/extracted locally by `npm run prepare:demo-video`. */
const ASSET = "/presentation-demo-assets";

type BlockInput = Omit<
  PaperBlock,
  "paperId" | "order" | "boundingBoxes" | "extractionConfidence" | "translationStatus" | "parentBlockId"
>;

/**
 * Filming-only Reader fixture for Gemperle et al., "Design for Wearability"
 * (ISWC 1998). Body paragraphs, figure captions, and references are quoted
 * from the original paper (selected passages; line-break hyphenation and
 * obvious typos such as "Aatlas"/"trapezes" repaired). Section
 * headings below level 1 follow the paper's own guideline list. The Japanese
 * is a hand-written presentation translation. This is never an extraction
 * result, a PLaMo output, or a benchmark input.
 */
export function createPresentationDemoProjection(paperId: string, fileHash: string, fileName: string): {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
} {
  const now = new Date().toISOString();
  const paper: Paper = {
    id: paperId,
    sourceFilePath: fileName,
    sourceFileName: fileName,
    sourceStoredPath: `papers/${paperId}/source.pdf`,
    sourceFileHash: fileHash,
    titleOriginal: "Design for Wearability",
    titleTranslated: "ウェアラビリティのためのデザイン",
    authors: ["Francine Gemperle", "Chris Kasabach", "John Stivoric", "Malcolm Bauer", "Richard Martin"],
    authorsStructured: [
      { id: "gemperle", name: "Francine Gemperle", affiliationIds: ["cmu"] },
      { id: "kasabach", name: "Chris Kasabach", affiliationIds: ["cmu"] },
      { id: "stivoric", name: "John Stivoric", affiliationIds: ["cmu"] },
      { id: "bauer", name: "Malcolm Bauer", affiliationIds: ["cmu"] },
      { id: "martin", name: "Richard Martin", affiliationIds: ["cmu"] },
    ],
    affiliations: [{ id: "cmu", name: "Institute for Complex Engineered Systems, Carnegie Mellon University" }],
    doi: null,
    publication: "ISWC '98",
    year: 1998,
    pageCount: 7,
    favorite: true,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };

  const sectionRows: Array<Omit<Section, "paperId" | "order">> = [
    { id: "abstract", originalTitle: "Abstract", translatedTitle: "概要", normalizedKind: "abstract", parentSectionId: null, level: 1 },
    { id: "why", originalTitle: "Why Is Wearability Important?", translatedTitle: "なぜウェアラビリティが重要なのか", normalizedKind: "introduction", parentSectionId: null, level: 1 },
    { id: "approach", originalTitle: "Approach", translatedTitle: "アプローチ", normalizedKind: "method", parentSectionId: null, level: 1 },
    { id: "guidelines", originalTitle: "Design Guidelines for Wearability", translatedTitle: "ウェアラビリティのためのデザインガイドライン", normalizedKind: "method", parentSectionId: null, level: 1 },
    { id: "g1", originalTitle: "1. Placement", translatedTitle: "1. 配置", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "g2", originalTitle: "2. Form Language", translatedTitle: "2. フォーム言語", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "g3", originalTitle: "3. Human Movement", translatedTitle: "3. 人の動き", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "g4", originalTitle: "4. Proxemics", translatedTitle: "4. プロクセミクス", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "g5", originalTitle: "5. Sizing", translatedTitle: "5. サイズ", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "g6", originalTitle: "6. Attachment", translatedTitle: "6. 装着", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "g7", originalTitle: "7–13. Containment to Long-term Use", translatedTitle: "7–13. 収納から長期使用まで", normalizedKind: "method", parentSectionId: "guidelines", level: 2 },
    { id: "forms", originalTitle: "Dynamic Wearable Forms", translatedTitle: "ダイナミック・ウェアラブル・フォーム", normalizedKind: "results", parentSectionId: null, level: 1 },
    { id: "neck", originalTitle: "Dynamic Wearable Forms Around the Neck", translatedTitle: "首まわりのダイナミック・ウェアラブル・フォーム", normalizedKind: "results", parentSectionId: "forms", level: 2 },
    { id: "next", originalTitle: "Next Steps", translatedTitle: "今後の展開", normalizedKind: "discussion", parentSectionId: null, level: 1 },
    { id: "conclusion", originalTitle: "Conclusion", translatedTitle: "結論", normalizedKind: "conclusion", parentSectionId: null, level: 1 },
    { id: "references", originalTitle: "References", translatedTitle: "参考文献", normalizedKind: "references", parentSectionId: null, level: 1 },
  ];
  const sections: Section[] = sectionRows.map((section, order) => ({ ...section, paperId, order }));

  const p = (id: string, sectionId: string, page: number, original: string, translated: string): BlockInput => ({
    id, sectionId, type: "paragraph", pageStart: page, pageEnd: page, original, translated, metadata: { role: "paragraph" },
  });
  const fig = (id: string, sectionId: string, page: number, file: string, number: number, captionOriginal: string, captionTranslated: string): BlockInput => ({
    id, sectionId, type: "figure", pageStart: page, pageEnd: page, original: captionOriginal, translated: captionTranslated,
    metadata: { role: "figure", imageUrl: `${ASSET}/${file}`, figureNumber: `図${number}`, captionOriginal, captionTranslated },
  });
  const ref = (n: number, original: string): BlockInput => ({
    id: `ref-${n}`, sectionId: "references", type: "reference", pageStart: 7, pageEnd: 7, original: `${n}. ${original}`, translated: null,
    metadata: { role: "reference", referenceId: `ref-${n}` },
  });

  const guidelineRows: Array<[string, string]> = [
    ["Placement (where on the body it should go)", "配置（身体のどこに置くか）"],
    ["Form Language (defining the shape)", "フォーム言語（形状を定める）"],
    ["Human Movement (consider the dynamic structure)", "人の動き（動的な構造を考慮する）"],
    ["Proxemics (human perception of space)", "プロクセミクス（人による空間の知覚）"],
    ["Sizing (for body size diversity)", "サイズ（体格の多様性に対応する）"],
    ["Attachment (fixing forms to the body)", "装着（フォームを身体に固定する）"],
    ["Containment (considering what's inside the form)", "収納（フォームの中身を考慮する）"],
    ["Weight (as its spread across the human body)", "重量（身体への荷重の分散）"],
    ["Accessibility (physical access to the forms)", "アクセシビリティ（フォームへの物理的なアクセス）"],
    ["Sensory Interaction (for passive or active input)", "感覚的インタラクション（受動的・能動的な入力）"],
    ["Thermal (issues of heat next to the body)", "熱（身体に接する熱の問題）"],
    ["Aesthetics (perceptual appropriateness)", "美しさ（知覚的なふさわしさ）"],
    ["Long-term Use (effects on the body and mind)", "長期使用（身体と心への影響）"],
  ];
  const guidelineTable: BlockInput = {
    id: "table-guidelines", sectionId: "guidelines", type: "table", pageStart: 2, pageEnd: 2,
    original: guidelineRows.map(([en], index) => `${index + 1}. ${en}`).join("\n"),
    translated: guidelineRows.map(([, ja], index) => `${index + 1}. ${ja}`).join("\n"),
    // The paper prints this list as a boxed panel; show the original panel
    // (cropped from page 2) and carry the Japanese list in the caption.
    metadata: {
      role: "table",
      imageUrl: `${ASSET}/dfw-guidelines-box.png`,
      tableNumber: "一覧",
      captionOriginal: `Guidelines for Wearability: ${guidelineRows.map(([en], index) => `${index + 1}. ${en.replace(/\s*\(.*\)$/, "")}`).join(", ")}`,
      captionTranslated: `ウェアラビリティのための13のガイドライン：${guidelineRows.map(([, ja], index) => `${index + 1}. ${ja.replace(/（.*）$/, "")}`).join("、")}`,
    },
  };

  const inputs: BlockInput[] = [
    p("abs-1", "abstract", 1,
      "Digital Technology is constantly improving as information becomes wireless. These advances demand more wearable and mobile form factors for products that access information. A product that is wearable should have wearability. This paper explores the concept of dynamic wearability through design research. Wearability is defined as the interaction between the human body and the wearable object. Dynamic wearability extends that definition to include the human body in motion. Our research has been to locate, understand, and define the spaces on the human body where solid and flexible forms can rest – without interfering with fluid human movement. The result is a set of design guidelines embodied in a set of wearable forms. These wearable forms describe the three dimensional spaces on the body best suited for comfortable and unobtrusive wearability by design.",
      "デジタル技術は、情報のワイヤレス化とともに絶えず進歩している。こうした進歩は、情報にアクセスする製品に、より身に着けやすくモバイルな形態を求める。身に着ける製品には、ウェアラビリティ（着用性）が備わっているべきである。本稿では、デザインリサーチを通じて「ダイナミック・ウェアラビリティ」という概念を探究する。ウェアラビリティとは、人体と着用物との相互作用と定義される。ダイナミック・ウェアラビリティは、この定義を動いている人体にまで広げたものである。私たちの研究は、人の滑らかな動きを妨げずに硬い形状や柔らかい形状を置ける身体上の空間を特定し、理解し、定義することにあった。その成果が、一連のウェアラブル・フォームとして具体化したデザインガイドラインである。これらのフォームは、快適で邪魔にならないウェアラビリティに最も適した、身体上の三次元空間を示している。"),

    p("why-1", "why", 1,
      "Current trends in computing tools are consistent with society's historical need to evolve its tools and products into more portable, mobile, and even wearable form factors. Time pieces, radios, and telephones are common examples of this trend. With advances in technology, miniaturization, and wireless communication, access to information is no longer limited to the static environment of the office desktop and personal computer. Well-designed mobile and wearable products can offer more portable and effective ways for people to relate to this information. However, simply shrinking down computing tools from the desktop paradigm to a more portable scale only makes them into mini PC's. It does not take advantage of the opportunities presented by a whole new context of use. It does not regard the human body as a context.",
      "コンピューティング・ツールの現在の潮流は、道具や製品をより持ち運びやすく、モバイルで、さらには身に着けられる形へと進化させてきた社会の歴史的な要請と一致している。時計、ラジオ、電話はこの潮流のよく知られた例である。技術の進歩、小型化、無線通信によって、情報へのアクセスはもはやオフィスのデスクトップやパーソナルコンピュータという固定された環境に限られない。よくデザインされたモバイル製品やウェアラブル製品は、人々がこうした情報と関わるための、より携帯しやすく効果的な方法を提供できる。しかし、デスクトップのパラダイムに基づくコンピューティング・ツールを単に持ち運べる大きさへ縮めるだけでは、小さなPCができるにすぎない。それは、まったく新しい利用文脈がもたらす機会を活かしておらず、人体を一つの文脈として捉えていない。"),
    p("why-2", "why", 1,
      "The word wearable implies the use of the human body as a support environment for the product. The human body is active, its form is diverse and changing. Wearable design that respects these dynamics results in product wearability. Existing static human anthropometric data provides a limited description of the body [1,2]. Beyond these simple dimensions, no resources describing how to design wearable forms for the human body have been found. These issues considered, there is an obvious need for a more in depth understanding of the role of human form in wearable product design.",
      "「ウェアラブル」という言葉は、人体を製品の支持環境として用いることを意味する。人体は活動的で、その形は多様であり、変化し続ける。こうした動的な性質を尊重したウェアラブルデザインが、製品のウェアラビリティにつながる。既存の静的な人体計測データは、身体について限られた記述しか与えない [1,2]。こうした単純な寸法を超えて、人体のためのウェアラブル・フォームをどうデザインすべきかを記述した資料は見つかっていない。これらを踏まえると、ウェアラブル製品のデザインにおいて人体の形が果たす役割を、より深く理解する必要があるのは明らかである。"),
    p("why-3", "why", 2,
      "Our study, Design for Wearability, evolves from over seven years of hands-on, interdisciplinary, in-the-field experience developing mobile and wearable computer systems for a variety of industrial, commercial, and military applications [3,4]. From this experience we have mapped the design space for developing wearable systems. Wearable computer design involves a great deal of compromise, inevitably encountered when integrating issues of human form and human-computer interaction with the constraints of technology and the context-of-use.",
      "私たちの研究「Design for Wearability」は、産業・商業・軍事のさまざまな用途に向けたモバイル／ウェアラブル・コンピュータシステムを開発してきた、7年以上にわたる実践的かつ学際的な現場経験から生まれたものである [3,4]。この経験から、私たちはウェアラブルシステム開発のデザイン空間を整理した。ウェアラブル・コンピュータのデザインには多くの妥協が伴う。人体の形や人とコンピュータの相互作用に関わる課題を、技術の制約や利用文脈と統合しようとすれば、妥協は避けられない。"),

    p("approach-1", "approach", 2,
      "Design for wearability focuses on a specific and important issue within the design space for developing wearable computing systems; wear-ability, the physical shape of wearables and their active relationship with the human form. In the sections that follow we have outlined several design guidelines for the creation of wearable forms. These design guidelines are based on codifying our past experiences building and testing systems in the field and extensive research in understanding the issues enveloped in addressing wearability. We study wearable objects, the human body, and individual experiences with wearables.",
      "Design for Wearabilityは、ウェアラブル・コンピューティングシステム開発のデザイン空間のなかでも、特に重要な一つの課題に焦点を当てる。それが「wear-ability（着用可能性）」、すなわちウェアラブルの物理的な形状と、人体の形との能動的な関係である。以下の節では、ウェアラブル・フォームをつくるためのいくつかのデザインガイドラインを概説する。これらのガイドラインは、現場でシステムを構築・試験してきた過去の経験の体系化と、ウェアラビリティに伴う課題を理解するための広範な調査に基づいている。私たちは、着用物、人体、そしてウェアラブルにまつわる個人の経験を研究対象とする。"),
    p("approach-2", "approach", 2,
      "In our study of wearable objects, we explore history and cultures regarding many topics including clothing, costume, protective wearables, and a variety of carried devices [5,6]. Study of the human body focuses on form and dynamics. For this, we look to physiology and biomechanics, as well as the movements of modern dancers and athletes [7,8,9]. Interviews of people explaining their own wearables provide a valuable glimpse into the way humans prepare, compromise, and construct themselves with what they wear and carry. Much of this background research can be found on the Design for Wearability web site. The design guidelines below reflect this study and experience with wearability.",
      "着用物の研究では、衣服、衣装、防護用の装着物、さまざまな携行機器など、多くのテーマについて歴史と文化を調べた [5,6]。人体の研究では、形と動きに焦点を当てる。そのために、生理学やバイオメカニクスに加え、モダンダンサーやアスリートの動きにも目を向けた [7,8,9]。自分のウェアラブルについて語ってもらうインタビューからは、人が身に着け持ち歩くものによって、どのように準備し、妥協し、自らを形づくっているかを垣間見ることができた。こうした背景調査の多くは、Design for Wearabilityのウェブサイトで公開している。以下のデザインガイドラインは、こうした研究とウェアラビリティに関する経験を反映している。"),

    p("guidelines-1", "guidelines", 2,
      "The design guidelines below are intended to communicate the considerations and principles necessary for the design of wearable products. They are listed here in a predictable order from the simple to the more complex, understanding that in development, tradeoffs will exist between them.",
      "以下のデザインガイドラインは、ウェアラブル製品のデザインに必要な考慮事項と原則を伝えることを目的としている。開発の過程ではガイドライン同士にトレードオフが生じることを前提に、単純なものから複雑なものへと順に並べている。"),
    guidelineTable,
    p("guidelines-2", "guidelines", 2,
      "Our wearability study attempts to integrate these guidelines. While all are important, we will only focus on the first six guidelines in the physical manifestation of our study. We have found the latter seven are not easily generalizable since they are much more dependent on the context and constraints of a specific design problem.",
      "私たちのウェアラビリティ研究は、これらのガイドラインを統合することを目指している。いずれも重要だが、研究を物理的な形として具体化するにあたっては、最初の6項目にのみ焦点を当てる。残りの7項目は、個々のデザイン課題の文脈や制約に大きく左右されるため、容易には一般化できないことがわかった。"),

    p("g1-1", "g1", 2,
      "Design for dynamic wearability requires unobtrusive placement. Placement is determined by editing the extensive human surface area with the use of criteria. Criteria for placement can vary with the needs of functionality and accessibility; however, it is important to work within the appropriate areas for the dynamic human body. The criteria we used for determining placement for dynamic wearability are: areas that are relatively the same size across adults, areas that have low movement/flexibility even when the body is in motion, and areas that are larger in surface area. Applying these criteria results in the most unobtrusive locations for placement of wearable objects.",
      "ダイナミック・ウェアラビリティのためのデザインには、邪魔にならない配置が必要である。配置は、広い人体の表面を基準に沿って絞り込むことで決まる。配置の基準は機能性やアクセシビリティの要求によって変わり得るが、動く人体にとって適切な領域の中で設計することが重要である。私たちがダイナミック・ウェアラビリティのための配置を決める際に用いた基準は、成人の間で大きさが比較的変わらない領域、身体が動いているときでも動きや屈曲が小さい領域、そして表面積が比較的大きい領域である。これらの基準を適用すると、着用物を置くのに最も邪魔にならない位置が得られる。"),
    fig("fig-1", "g1", 2, "dfw-fig1-placement.png", 1,
      "Figure 1. The general areas we have found to be the most unobtrusive for wearable objects are: (a) collar area, (b) rear of the upper arm, (c) forearm, (d) rear, side, and front ribcage, (e) waist and hips, (f) thigh, (g) shin, and (h) top of the foot.",
      "図1. 着用物にとって最も邪魔にならないとわかった主な領域：(a) 襟まわり、(b) 上腕の後ろ側、(c) 前腕、(d) 胸郭の後ろ・横・前、(e) 腰と臀部、(f) 太もも、(g) すね、(h) 足の甲。"),

    p("g2-1", "g2", 2,
      "Design for the human body also requires a humanistic form language. This works with the dynamic human form to ensure a comfortable, stable fit. Humanistic form language includes forming a concavity on the inside surface touching the body, to accept human convexities. On the outside surface, convexity will deflect objects in the environment thereby avoiding bumps and snags. Tapering of the form's sides will stabilize the form on the body. Radiusing all edges and corners creates a safe, soft and wearable form. These steps are illustrated below, taking a simple block to a wearable form. The humanistic form language not only makes forms wearable, it adds structural ruggedness which is crucial in an active environment.",
      "人体のためのデザインには、人間的なフォーム言語も必要である。これは動的な人体の形に寄り添い、快適で安定したフィットを実現する。人間的なフォーム言語では、身体に触れる内側の面を凹ませて、人体の凸面を受け止める。外側の面を凸にすれば、周囲の物をそらし、ぶつかったり引っかかったりするのを避けられる。フォームの側面を先細りにすると、身体の上で安定する。すべての辺と角に丸みを付けると、安全で柔らかく、身に着けやすい形になる。単純なブロックを着用可能な形へと変えていくこれらの手順を下図に示す。人間的なフォーム言語は、形を身に着けやすくするだけでなく、活動的な環境で欠かせない構造的な頑丈さも与える。"),
    fig("fig-2", "g2", 2, "dfw-fig2-form-language.png", 2,
      "Figure 2. Combining elements of concavity (a) against the body, convexity (b) on the outside surfaces of the form, tapering (c) as the form extends off the body, and radii (d) softening up the edges combine to create a humanistic form language.",
      "図2. 身体に接する面の凹み (a)、フォーム外面の凸 (b)、身体から離れるにつれて細くなる先細り (c)、辺を和らげる丸み (d) を組み合わせることで、人間的なフォーム言語が生まれる。"),

    p("g3-1", "g3", 3,
      "Human movement provides both a constraint and a resource in the design of dynamic wearable forms. Human movement is useful in determining a profile or footprint for wearable forms, as well as to shape the surface of forms. Consider the many elements that make up any single movement. Elements include the mechanics of joints, the shifting of flesh, and the flexing and extending of muscle and tendons beneath the skin. Allowing freedom for these movements can be accomplished in one of two ways: by designing around the more active areas of the joints or by creating spaces on the wearable form into which the body can move. For example, the torso is a good place to put a wearable, but the arms need to have full freedom to swing around the side and front of the torso. In addition, the torso needs the full ability to twist and bend. These movements can help sculpt the surface of the form.",
      "人の動きは、ダイナミック・ウェアラブル・フォームのデザインにおいて、制約であると同時に資源でもある。人の動きは、フォームの輪郭や接地面を決めるのにも、表面の形を整えるのにも役立つ。一つの動作を構成する多くの要素を考えてみよう。関節の機構、肉の移動、皮膚の下での筋肉や腱の屈曲と伸展などである。こうした動きの自由を確保する方法は二つある。よく動く関節まわりを避けてデザインするか、身体が入り込める空間をフォームに設けるかである。たとえば胴体はウェアラブルを置くのに適した場所だが、腕が胴体の横や前を自由に振れる必要がある。さらに胴体自体も、十分にひねったり曲げたりできなければならない。こうした動きは、フォームの表面を形づくる手がかりにもなる。"),

    p("g4-1", "g4", 3,
      "Design for human perception of size. The brain perceives an aura around the body that should be considered to determine the distance a wearable form projects from the body. The understanding of these layers of perception around the body is referred to as proxemics [10]. Forms should stay within the wearer's intimate space, so that perceptually they become a part of the body. The intimate space is illustrated below and can be between 0 and 5 inches off the body. Compromises are often necessary but a general rule of thumb is to minimize thickness as much as possible. This increases safety and comfort, both physical and perceptual. A good example to observe is when a young American football player first dons shoulder pads, and immediately starts bumping into people and door ways because of the extra bulk.",
      "人による大きさの知覚を考慮してデザインする。脳は身体のまわりにオーラのような領域を知覚しており、フォームが身体からどれだけ張り出すかを決める際にはこれを考慮すべきである。身体のまわりにあるこうした知覚の層の理解は、プロクセミクスと呼ばれる [10]。フォームは着用者の密接距離の内側にとどめ、知覚上は身体の一部となるようにすべきである。密接距離は下図のとおりで、身体から0〜5インチ（約0〜13 cm）の範囲である。妥協が必要になることも多いが、一般的な目安は厚みをできる限り抑えることである。そうすることで、物理的にも知覚的にも安全性と快適性が高まる。わかりやすい例は、アメリカンフットボールを始めたばかりの若い選手が初めてショルダーパッドを着けたとき、増えたかさのせいで人や戸口にすぐぶつかり始める様子である。"),
    fig("fig-4", "g4", 3, "dfw-fig4-proxemics.png", 4,
      "Figure 4. Aura around the human body that the brain will perceive as part of the body.",
      "図4. 脳が身体の一部として知覚する、人体のまわりのオーラ。"),

    p("g5-1", "g5", 3,
      "Size variation provides an interesting challenge when designing wearable forms. Both the build of a body and the ways in which it will gain and lose weight and muscle are important. Wearables must be designed to fit as many types of users as possible. Allowing for these size variations is achieved in two ways. The first is the use of static anthropometric data, which details point to point distances on different sized bodies [1,2]. The second is consideration of human muscle and fat growth in three dimensions. Fitting these changing circumferences can be achieved through the use of solid rigid areas coupled with flexible areas. The flexible areas should either be located between solid forms as joints or extending from the solid forms as wings.",
      "体格の違いは、ウェアラブル・フォームをデザインするうえで興味深い課題となる。身体のつくりと、体重や筋肉の増減のしかたの両方が重要である。ウェアラブルは、できるだけ多くのタイプのユーザーに合うようにデザインしなければならない。こうした体格差への対応は二つの方法で実現できる。一つ目は、さまざまな体格における点と点の距離を詳しく示した静的な人体計測データの利用である [1,2]。二つ目は、筋肉や脂肪が三次元的にどう増えるかを考慮することである。変化する周囲長への適合は、硬い領域と柔軟な領域を組み合わせることで実現できる。柔軟な領域は、硬いフォーム同士をつなぐ関節として配置するか、硬いフォームから伸びる翼として配置するとよい。"),

    p("g6-1", "g6", 3,
      "Comfortable attachment of forms can be created by wrapping the form around the body, rather than using single point fastening systems such as clips or shoulder straps. As in guideline 5, it is also important to have attachment systems that can accommodate various physical sizes. Design for stable, solid, and comfortable attachment draws on the clothing and outdoor equipment industries. Design for size variations in attachment systems can be obtained in two simple ways. The first is through adjustability; e.g. straps that can be extended as seen on backpacking equipment. The second is through the use of standardized sizing systems from the clothing industry.",
      "快適な装着は、クリップやショルダーストラップのような一点で留める方式ではなく、フォームを身体に巻き付けることで実現できる。ガイドライン5と同様に、さまざまな体格に対応できる装着方式であることも重要である。安定してしっかりとした、快適な装着のデザインには、衣料品やアウトドア用品の業界の知見が活かせる。装着方式で体格差に対応するには、二つの簡単な方法がある。一つ目は調整機能で、たとえばバックパッキング用品に見られる伸ばせるストラップである。二つ目は、衣料品業界の標準化されたサイズ体系を用いることである。"),

    p("g7-1", "g7", 4,
      "7. Designing wearable objects generally requires the object to contain materials such as digital technology, water, food, etc. While some of these things are malleable in form, there are many constraints that these 'insides' bring to the outer form.",
      "7. 着用物をデザインする際には、一般にデジタル技術、水、食料などの中身を収める必要がある。これらの中には形を変えられるものもあるが、こうした「中身」が外側の形に課す制約は多い。"),
    p("g7-2", "g7", 4,
      "8. The weight of a wearable should not hinder the body's movement or balance. The human body bears its own extra weight on the stomach, waist and hip area. Placing the bulk of the load there, close to the center of gravity, and minimizing as it spreads to the extremities is the rule of thumb.",
      "8. ウェアラブルの重さが、身体の動きやバランスを妨げてはならない。人体は、自らの余分な重さを腹部・腰・臀部で支えている。荷重の大部分を重心に近いこの部位に置き、手足の先へ向かうほど小さくするのが目安である。"),
    p("g7-3", "g7", 4,
      "9. For any wearable it is important to consider the sort of accessibility necessary to render the product most usable. Extensive research exists in the areas of visual, tactile, auditory, or kinesthetic access on the human body. Simple testing should be conducted to verify the accessibility of specific wearables.",
      "9. どのようなウェアラブルでも、製品を最も使いやすくするために必要なアクセシビリティを考慮することが重要である。人体における視覚・触覚・聴覚・運動感覚によるアクセスについては、広範な研究がある。個々のウェアラブルのアクセシビリティは、簡単なテストで確かめるべきである。"),
    p("g7-4", "g7", 4,
      "10. Sensory interaction, both passive and active, is a valuable aspect of any product. It is important to be sensitive to how one interacts with a wearable - something that exists on one's body. This interaction should be kept simple and intuitive.",
      "10. 受動的・能動的な感覚的インタラクションは、どの製品にとっても価値ある要素である。自分の身体の上にあるウェアラブルと人がどう関わるかには、細やかな配慮が必要である。このインタラクションは、シンプルかつ直感的に保つべきである。"),
    p("g7-5", "g7", 4,
      "11. There are three thermal aspects of designing objects for the body - functional, biological, and perceptual. The body needs to breathe and is very sensitive to products that create, focus, or trap heat.",
      "11. 身体のための物をデザインする際の熱の側面には、機能的・生物学的・知覚的の三つがある。身体は呼吸する必要があり、熱を発したり、集中させたり、こもらせたりする製品にとても敏感である。"),
    p("g7-6", "g7", 4,
      "12. An important aspect of the form and function of any wearable object is aesthetics. Culture and context will dictate shapes, materials, textures, and colors that perceptually fit the user and their environment [11]. For example, we created a wearable computer for an airplane repair situation, depicted below. Using the heavy leather of the traditional tool belt, it is possible to increase the comfort and acceptance by the repair technicians.",
      "12. どの着用物にとっても、形と機能の重要な側面の一つが美しさである。ユーザーとその環境に知覚的になじむ形・素材・質感・色は、文化と文脈によって決まる [11]。たとえば私たちは、航空機の整備現場向けのウェアラブル・コンピュータを製作した（下図）。伝統的な工具ベルトの厚い革を用いることで、整備士にとっての快適さと受け入れやすさを高めることができる。"),
    fig("fig-7", "g7", 4, "dfw-fig7-navigator.png", 7,
      "Figure 7. Navigator 2 wearable computer for aircraft maintenance engineers integrates a humanistic form language with attachment guidelines, placement guidelines (small off the back) and aesthetic, perceptual, and sensory informed use of materials.",
      "図7. 航空機整備士向けのウェアラブル・コンピュータ「Navigator 2」。人間的なフォーム言語に、装着と配置（腰の後ろ側）のガイドライン、そして美しさ・知覚・感覚を踏まえた素材の使い方を統合している。"),
    p("g7-7", "g7", 4,
      "13. The long term use of wearable computers has an unknown physiological effect on the human body. As wearable systems become more and more useful and are used for longer periods of time, it will be important to test their effect on the wearer's body.",
      "13. ウェアラブル・コンピュータの長期使用が人体に与える生理的な影響はわかっていない。ウェアラブルシステムがますます有用になり、より長時間使われるようになるにつれ、着用者の身体への影響を検証することが重要になる。"),
    p("g7-8", "g7", 4,
      "The Design Guidelines alone can not convey all significant aspects of designing for wearability. They communicate a means to consider all the issues involved when creating wearable forms. The design guidelines for dynamic wearability were written in conjunction with the development of a family of wearable forms. These forms are a part of our study of design for dynamic wearability. The intent of this study is to thoroughly reflect design guidelines and define the ideal three-dimensional envelope where forms can exist on the human body in motion.",
      "デザインガイドラインだけで、ウェアラビリティのためのデザインの重要な側面をすべて伝えることはできない。ガイドラインは、ウェアラブル・フォームをつくる際に関わるあらゆる課題を検討するための手段を示すものである。ダイナミック・ウェアラビリティのためのデザインガイドラインは、一連のウェアラブル・フォームの開発と並行して書かれた。これらのフォームは、ダイナミック・ウェアラビリティのためのデザインに関する私たちの研究の一部である。この研究の目的は、デザインガイドラインを十分に反映し、動く人体の上でフォームが存在できる理想的な三次元の包絡領域を定義することにある。"),

    p("forms-1", "forms", 4,
      "We have created a set of three dimensional forms for the human body that employ the Design Guidelines listed above. These forms outline the ideal envelope for dynamic wearability. The creation of these forms was an iterative process. We made both two dimensional drawings and three dimensional foam models and applied them to many bodies in the process. We also conducted two user studies, the first to better understand the complex curves of the body and the second to verify these forms are indeed wearable on the dynamic human form.",
      "私たちは、上記のデザインガイドラインを適用した、人体のための一連の三次元フォームを製作した。これらのフォームは、ダイナミック・ウェアラビリティのための理想的な包絡領域を示している。フォームの製作は反復的なプロセスであった。二次元の図面と三次元の発泡材モデルの両方をつくり、その過程で多くの身体に当てて確かめた。また、二つのユーザースタディを行った。一つ目は身体の複雑な曲面をより深く理解するため、二つ目はこれらのフォームが動く人体の上で実際に着用可能であることを確かめるためである。"),
    p("forms-2", "forms", 5,
      "The object of the first study was to generate data defining the complex convex curves of the determined placement areas (see Figure 1). Our goal was to not only define but also to further understand those curves and how they changed with bodies of different size and shape. We developed a tool for this study, depicted in Figure 8. With this flexible tool, we were able to map the arcs of several parts of the body: the collar area, triceps, forearm, ribcage, thigh, and shin. We were then able to both compare and measure the arcs from various bodies. This allowed us to determine an appropriate radius/spherical section for the concave inside of the forms, as well as the starting point and length of the flexible areas for each form.",
      "一つ目のスタディの目的は、先に定めた配置領域（図1）の複雑な凸曲面を定義するデータを得ることであった。目標は、それらの曲面を定義するだけでなく、体格や体形の異なる身体でどう変わるかをより深く理解することにあった。このスタディのために、私たちは図8に示す道具を開発した。この柔軟な道具を使って、襟まわり、上腕三頭筋、前腕、胸郭、太もも、すねといった身体の複数の部位の弧を写し取ることができた。さらに、さまざまな身体から得た弧を比較し、測定することができた。これにより、フォーム内側の凹面に適した半径や球面の断面、そして各フォームの柔軟な領域の始点と長さを決めることができた。"),
    fig("fig-8", "forms", 5, "dfw-fig8-arc-tool.png", 8,
      "Figure 8. A shape-able tool used to map the arc of the triceps. Different peoples arcs are then mapped together to create an average concavity and width dimension to apply to wearable designs.",
      "図8. 上腕三頭筋の弧を写し取るために用いた、形を変えられる道具。複数の人の弧を重ね合わせ、ウェアラブルのデザインに適用する平均的な凹みと幅の寸法を求める。"),
    p("forms-3", "forms", 5,
      "The second study is part of our on-going research. It is being performed to test the comfort level and freedom of movement allowed by the forms we design. So far we have had ten people test the wearability of these forms. Test subjects were chosen to represent extreme diversity in body shape and size. They performed a series of simple activities, once in their regular clothing and once with the full set of wearable forms on their bodies, over their clothing. The activities are walking, carrying a box, bending, squatting to lift a box, reaching, climbing, and sitting. Subjects are asked to rate their freedom of movement and comfort levels during each activity and for each area of their bodies. This study has thus far been successful and informative. Preliminary analysis of the data indicates that levels of comfort and freedom of movement appear nearly identical with or without the pods.",
      "二つ目のスタディは、現在進行中の研究の一部である。私たちがデザインしたフォームが、どの程度の快適さと動きの自由を許すかを検証するために行っている。これまでに10人がこれらのフォームの着用性を試した。被験者は、体形と体格が極めて多様になるよう選んだ。被験者は、普段の服装のままで一度、服の上からウェアラブル・フォーム一式を着けてもう一度、一連の簡単な動作を行った。動作は、歩く、箱を運ぶ、かがむ、しゃがんで箱を持ち上げる、手を伸ばす、登る、座るである。被験者には、各動作中の動きの自由度と快適さを、身体の部位ごとに評価してもらった。このスタディはここまで順調で、多くの知見が得られている。データの予備分析では、ポッドの有無にかかわらず、快適さと動きの自由度はほぼ同じであった。"),
    p("forms-4", "forms", 5,
      "More interesting than the data has been the subjects' comments; both from the standpoint of testing the wearability of these forms and from the standpoint of studying peoples' personal relationships with their wearables. Below are some initial and final reaction quotes from test subjects wearing all 36 of the dynamic wearable forms: “I feel pretty comfortable and secure, not hi-tech but sporty”, “Physically pretty comfortable, not very restrictive. I knew they were on”, “I can even cross my legs with these on”.",
      "データ以上に興味深かったのは被験者のコメントである。フォームの着用性を検証するという観点からも、人とそのウェアラブルとの個人的な関係を研究するという観点からも示唆に富んでいた。以下は、36個すべてのダイナミック・ウェアラブル・フォームを着けた被験者の、最初と最後の反応の一部である。「かなり快適で安心感がある。ハイテクというよりスポーティな感じ」「身体的にはかなり快適で、あまり窮屈ではない。着けていることはわかった」「これを着けたままでも脚を組める」。"),

    p("neck-1", "neck", 6,
      "We refer to the three dimensional forms we developed as “pods”, a group of pods strung together are “pod sets”. Around the neck there is a pod set consisting of four pods. Two pods rest on the front of the body and two on the back. Each individual pod is made up of three parts: two thin solid forms with a flexible material sandwiched between them. The flexible material extends beyond the solid pod structure, serving as a flex zone. On the neck the flex zone creates a collar that encircles the neck and connects all four pods. The two pods on the front of the body sit just below the collar bone, on the pectoral muscle and above the breast. The two pods on the back of the body sit on the large triangular muscle that connects the shoulders to the neck, the trapezius.",
      "私たちは、開発した三次元フォームを「ポッド」、複数のポッドをつなげたものを「ポッドセット」と呼ぶ。首まわりには、4つのポッドからなるポッドセットがある。2つは身体の前側に、2つは背中側に載る。個々のポッドは3つの部分からなり、2枚の薄い硬質フォームの間に柔軟な素材が挟まれている。柔軟な素材は硬いポッド本体の外まで伸び、フレックスゾーンとして機能する。首では、このフレックスゾーンが首を囲む襟となり、4つのポッドすべてをつなぐ。前側の2つのポッドは、鎖骨のすぐ下、胸の上の大胸筋の上に位置する。背中側の2つのポッドは、肩と首をつなぐ大きな三角形の筋肉である僧帽筋の上に位置する。"),
    p("neck-2", "neck", 6,
      "Placement of four neck pods allows for all movement of the shoulders, arms and head. The flex zone connecting these four pods flexes to accommodate the various different torso depths and chest and trapezius arcs. Pods on the chest follow the curves defined by the first and second ribs below the collar bone. The trapezius pods have a top profile determined by the curve where the neck meets the shoulders and a bottom profile determined by the movement space for the shoulder blades and the spine.",
      "首まわりの4つのポッドの配置は、肩・腕・頭のあらゆる動きを妨げない。4つのポッドをつなぐフレックスゾーンはしなって、さまざまな胴の厚みや、胸と僧帽筋の弧に対応する。胸のポッドは、鎖骨の下にある第1・第2肋骨がつくる曲線に沿う。僧帽筋のポッドは、上側の輪郭が首と肩の接する曲線によって、下側の輪郭が肩甲骨と背骨の動く空間によって決まる。"),
    p("neck-3", "neck", 6,
      "These pods on the shoulder area are designed to move and float over the movement of the trapezius (shrugged shoulders). The pods on the chest extend 1/2 inch off the body and are four by two inches. The pods on the shoulder extend 3/4 inch off the body and are 2.3 by 3.4 inches.",
      "肩まわりのポッドは、僧帽筋の動き（肩をすくめる動作）に合わせて動き、その上に浮かぶようにデザインされている。胸のポッドは身体から1/2インチ（約1.3 cm）張り出し、大きさは4×2インチである。肩のポッドは身体から3/4インチ（約1.9 cm）張り出し、大きさは2.3×3.4インチである。"),

    p("next-1", "next", 6,
      "We intend to continue refining these dynamic wearable forms through testing and create a dynamic human factors guide for designing comfortable, manageable, and unobtrusive wearable products that integrate with the body in motion. The initial results of our Design for Wearability Project, Design Guidelines and Wearable Forms begin to instruct and define wearability. We intend to use these as a tool and reference document and hope that others concerned with the creation of wearables will do the same. By making dynamic wearability constraints explicit, we hope designers will treat wearability requirements as concretely as technological constraints, and match them to users' functional requirements in the early stages of the design process.",
      "今後もテストを通じてこれらのダイナミック・ウェアラブル・フォームを改良し、動く身体になじむ、快適で扱いやすく邪魔にならないウェアラブル製品をデザインするための、動的なヒューマンファクターズ・ガイドをつくる予定である。Design for Wearabilityプロジェクトの初期成果であるデザインガイドラインとウェアラブル・フォームは、ウェアラビリティを示し、定義し始めている。私たちはこれらをツールおよび参照資料として用いるつもりであり、ウェアラブルの制作に携わる人々にも同様に活用してほしいと考えている。ダイナミック・ウェアラビリティの制約を明示することで、デザイナーがウェアラビリティの要件を技術的な制約と同じくらい具体的に扱い、デザインプロセスの初期段階でユーザーの機能要件と照らし合わせるようになることを期待している。"),
    p("next-2", "next", 6,
      "We plan to extend our research to include accessibility for different activities, weight distribution, thermal concerns, interaction issues, material preferences, and long term effects to the body while using these wearables.",
      "今後は研究の範囲を広げ、さまざまな活動におけるアクセシビリティ、重量配分、熱の問題、インタラクションの課題、素材の好み、そしてこれらのウェアラブルを使い続けたときの身体への長期的な影響も扱う予定である。"),

    p("conclusion-1", "conclusion", 6,
      "Static, anthropometric data exists, however, dynamic understanding and measurements of the human body do not. We have collected information that has aided us in our development of wearable systems. This Design for Wearability Study represents a start at putting this information together, organized, in one place, to be useful as a set of guidelines and a resource for designers that need to integrate issues of wearability into a design.",
      "静的な人体計測データは存在するが、人体の動的な理解や測定は存在しない。私たちは、ウェアラブルシステムの開発に役立つ情報を集めてきた。このDesign for Wearability研究は、そうした情報を一か所に整理してまとめる第一歩であり、ウェアラビリティの課題をデザインに組み込む必要のあるデザイナーにとって、ガイドラインおよび参照資料として役立つものである。"),
    p("conclusion-2", "conclusion", 6,
      "Our design guidelines illustrate steps to take into consideration when designing something to exist on the human body. This set of guidelines presents a method of thinking about and understanding a wearable and its wear-ability.",
      "私たちのデザインガイドラインは、人体の上に存在するものをデザインする際に考慮すべき手順を示している。このガイドライン群は、ウェアラブルとその着用可能性について考え、理解するための方法を提示する。"),
    p("conclusion-3", "conclusion", 6,
      "Wearable technology should not compromise but enhance people. It is possible to create a wearable piece of digital technology that feels good. Design for wearability and the wearable forms provide both proof and process for this.",
      "ウェアラブル技術は、人を妥協させるのではなく、人を高めるものであるべきだ。着け心地のよいデジタル技術のウェアラブルをつくることは可能である。Design for Wearabilityとウェアラブル・フォームは、その証拠であり、そのための方法でもある。"),

    ref(1, "Tilley, Alvin R. The Measure of Man and Woman. Henry Dreyfuss and Associates, NY. 1993."),
    ref(2, "McCormick, E.J. et al. Human Factors In Engineering and Design. McGraw-Hill, Inc. 1982."),
    ref(3, "Bass, L. et al. The Design of a Wearable Computer. CHI97."),
    ref(4, "Siegel, J, Bauer, M. A Field Usability Evaluation of a Wearable System. ISWC97."),
    ref(5, "Rudolphsky, B. Are Clothes Modern. Paul Theobald. 1947."),
    ref(6, "Racinet, A. The Historical Encyclopedia of Costume. Facts On File. 1988."),
    ref(7, "Muybridge, E. The Human Figure In Motion. Dover Publications, Inc. 1955."),
    ref(8, "Peck, R.P. Atlas of Human Anatomy for the Artist. Oxford University Press, Inc. 1951."),
    ref(9, "Nordin, M., Frankel, V. Basic Biomechanics of the Musculoskeletal System. Lea & Febiger. 1989."),
    ref(10, "Hall, E. T. The Hidden Dimension. Anchor Books. 1982."),
    ref(11, "Craik, J. The Face of Fashion. Routledge. 1994."),
  ];

  const blocks: PaperBlock[] = inputs.map((input, order) => ({
    ...input,
    paperId,
    order,
    boundingBoxes: [{ page: input.pageStart, x: 72, y: 160, width: 450, height: 48 }],
    extractionConfidence: 1,
    translationStatus: input.type === "reference" ? "skipped" : "completed",
    parentBlockId: null,
  }));
  return { paper, sections, blocks };
}

export const PRESENTATION_PRIMARY_PAPER_ID = "demo-design-for-wearability";

/**
 * Capture-only Library state. It is kept in memory and is only selected by
 * the dedicated demo build, so it cannot enter a user's SQLite library or an
 * extraction benchmark. Library-only papers carry real bibliographic metadata
 * for local papers in test-data/real-papers; they have no Reader body.
 */
export function createPresentationCaptureSeed(): {
  papers: Paper[];
  documents: Array<{ paperId: string; sections: Section[]; blocks: PaperBlock[] }>;
  workspaceNodes: WorkspaceNode[];
  memberships: WorkspacePaper[];
  importJob: ImportJob;
} {
  const now = "2026-11-05T00:00:00.000Z";
  const opened = (hoursAgo: number) => new Date(Date.parse(now) - hoursAgo * 3_600_000).toISOString();
  const primaryDocument = createPresentationDemoProjection(
    PRESENTATION_PRIMARY_PAPER_ID,
    "presentation-demo-design-for-wearability",
    "design-for-wearability.pdf"
  );

  const libraryPaper = (input: {
    id: string;
    fileName: string;
    titleOriginal: string;
    titleTranslated: string;
    authors: string[];
    affiliations: string[];
    publication: string;
    year: number;
    pageCount: number;
    favorite?: boolean;
    openedHoursAgo: number;
  }): Paper => ({
    id: input.id,
    sourceFilePath: input.fileName,
    sourceFileName: input.fileName,
    sourceStoredPath: `papers/${input.id}/source.pdf`,
    sourceFileHash: `presentation-${input.id}`,
    titleOriginal: input.titleOriginal,
    titleTranslated: input.titleTranslated,
    authors: input.authors,
    // Library-only rows do not claim a per-author affiliation mapping.
    authorsStructured: input.authors.map((name, index) => ({
      id: `${input.id}-author-${index + 1}`,
      name,
      affiliationIds: [],
    })),
    affiliations: input.affiliations.map((name, index) => ({ id: `${input.id}-aff-${index + 1}`, name })),
    doi: null,
    publication: input.publication,
    year: input.year,
    pageCount: input.pageCount,
    favorite: input.favorite,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    lastOpenedAt: opened(input.openedHoursAgo),
    createdAt: now,
    updatedAt: now,
  });

  const papers: Paper[] = [
    { ...primaryDocument.paper, lastOpenedAt: opened(1), createdAt: now, updatedAt: now },
    libraryPaper({
      id: "demo-interactive-jewellery",
      fileName: "interactive-jewellery.pdf",
      titleOriginal: "Interactive Jewellery: a design exploration",
      titleTranslated: "インタラクティブ・ジュエリー：デザイン探究",
      authors: ["Maarten Versteeg", "Elise van den Hoven", "Caroline Hummels"],
      affiliations: ["Eindhoven University of Technology"],
      publication: "TEI '16",
      year: 2016,
      pageCount: 9,
      openedHoursAgo: 5,
    }),
    libraryPaper({
      id: "demo-power-over-skin",
      fileName: "power-over-skin.pdf",
      titleOriginal: "Power-over-Skin: Full-Body Wearables Powered By Intra-Body RF Energy",
      titleTranslated: "Power-over-Skin：体内を伝わるRFエネルギーで給電する全身ウェアラブル",
      authors: ["Andy Kong", "Daehwa Kim", "Chris Harrison"],
      affiliations: ["Carnegie Mellon University"],
      publication: "UIST '24",
      year: 2024,
      pageCount: 13,
      favorite: true,
      openedHoursAgo: 26,
    }),
    libraryPaper({
      id: "demo-speechin",
      fileName: "speechin.pdf",
      titleOriginal: "SpeeChin: A Smart Necklace for Silent Speech Recognition",
      titleTranslated: "SpeeChin：無声発話を認識するスマートネックレス",
      authors: ["Ruidong Zhang", "Mingyang Chen", "Benjamin Steeper", "Yaxuan Li", "Zihan Yan", "Yizhuo Chen", "Songyun Tao", "Tuochao Chen", "Hyunchul Lim", "Cheng Zhang"],
      affiliations: ["Cornell University"],
      publication: "Proc. ACM IMWUT",
      year: 2021,
      pageCount: 23,
      openedHoursAgo: 50,
    }),
    libraryPaper({
      id: "demo-finger-specific-touch",
      fileName: "ozchi-finger-specific-touch.pdf",
      titleOriginal: "Exploring Finger Specific Touch Screen Interaction for Mobile Phone User Interfaces",
      titleTranslated: "携帯電話のユーザーインターフェースにおける指ごとに異なるタッチスクリーン操作の探究",
      authors: ["Ashley Colley", "Jonna Häkkilä"],
      affiliations: ["University of Oulu", "University of Lapland"],
      publication: "OzCHI '14",
      year: 2014,
      pageCount: 10,
      openedHoursAgo: 75,
    }),
    libraryPaper({
      id: "demo-osworld",
      fileName: "osworld-multimodal-agents.pdf",
      titleOriginal: "OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments",
      titleTranslated: "OSWorld：実コンピュータ環境でのオープンエンドなタスクに向けたマルチモーダルエージェントのベンチマーク",
      authors: ["Tianbao Xie", "Danyang Zhang", "Jixuan Chen", "Xiaochuan Li", "Siheng Zhao", "Ruisheng Cao", "Toh Jing Hua", "Zhoujun Cheng", "Dongchan Shin", "Fangyu Lei", "Yitao Liu", "Yiheng Xu", "Shuyan Zhou", "Silvio Savarese", "Caiming Xiong", "Victor Zhong", "Tao Yu"],
      affiliations: ["The University of Hong Kong"],
      publication: "NeurIPS '24",
      year: 2024,
      pageCount: 51,
      openedHoursAgo: 120,
    }),
  ];

  const node = (id: string, name: string, parentId: string | null, order: number): WorkspaceNode => ({
    id, name, parentId, order, createdAt: now, updatedAt: now,
  });
  const workspaceNodes = [
    node("demo-hci", "HCIリサーチ", null, 0),
    node("demo-wearables", "ウェアラブル", "demo-hci", 0),
    node("demo-mobile", "モバイルUX", "demo-hci", 1),
    node("demo-principles", "デザイン原則", null, 1),
    node("demo-guidelines", "ガイドライン", "demo-principles", 0),
    node("demo-agents", "AIエージェント", null, 2),
  ];
  const link = (nodeId: string, paperId: string, order: number): WorkspacePaper => ({
    nodeId, paperId, order, status: "unread", createdAt: now, updatedAt: now,
  });
  return {
    papers,
    documents: [
      {
        paperId: primaryDocument.paper.id,
        sections: primaryDocument.sections,
        blocks: primaryDocument.blocks,
      },
    ],
    workspaceNodes,
    memberships: [
      link("demo-wearables", PRESENTATION_PRIMARY_PAPER_ID, 0),
      link("demo-wearables", "demo-interactive-jewellery", 1),
      link("demo-wearables", "demo-power-over-skin", 2),
      link("demo-wearables", "demo-speechin", 3),
      link("demo-mobile", "demo-finger-specific-touch", 0),
      link("demo-guidelines", PRESENTATION_PRIMARY_PAPER_ID, 0),
      link("demo-agents", "demo-osworld", 0),
    ],
    importJob: {
      id: "demo-importing-paper",
      fileName: "Human–AI Interaction Guidelines.pdf",
      fileKey: "presentation-capture-import",
      workspaceNodeId: "demo-guidelines",
      stage: "extracting",
      stageProgress: 38,
      stageTotal: 100,
      message: "本文と図表を抽出しています…",
    },
  };
}
