import { reconstructDocument, detectPageColumns } from "../src/services/pdfLayout.ts";

const columnPairs = Array.from({ length: 6 }, (_, index) => {
  const y = 430 + index * 14;
  return [
    {
      text: `Left body sentence number ${index} about airway training outcomes and planning.`,
      x: 147, y, width: 190, height: 9, fontSize: 9, fontName: "Body", page: 1,
    },
    {
      text: `Right strengths bullet number ${index} about metrics and observation.`,
      x: 377, y, width: 170, height: 9, fontSize: 9, fontName: "Body", page: 1,
    },
  ];
}).flat();

const pages = [{
  pageNumber: 1,
  width: 595,
  height: 794,
  textItems: [
    { text: "Open access", x: 44, y: 33, width: 55, height: 10, fontSize: 10, fontName: "Hdr", page: 1 },
    { text: "Protocol", x: 506, y: 33, width: 40, height: 10, fontSize: 10, fontName: "Hdr", page: 1 },
    { text: "Effect of simulation-based human factors training", x: 147, y: 80, width: 280, height: 18, fontSize: 18, fontName: "Title", page: 1 },
    { text: "Abid Ali Jamali", x: 147, y: 200, width: 90, height: 11, fontSize: 11, fontName: "Author", page: 1 },
    { text: "To cite: Jamali AA,", x: 41, y: 320, width: 78, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
    { text: "ABSTRACT", x: 147, y: 318, width: 55, height: 10, fontSize: 10, fontName: "Head", page: 1 },
    { text: "STRENGTHS AND LIMITATIONS OF THIS STUDY", x: 365, y: 318, width: 180, height: 10, fontSize: 10, fontName: "Head", page: 1 },
    { text: "Introduction", x: 147, y: 340, width: 48, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    { text: "Up to 40% of major complications during", x: 198, y: 340, width: 150, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    { text: "This study uses a structured design.", x: 377, y: 340, width: 160, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    { text: "simulation-based human", x: 41, y: 352, width: 74, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
    { text: "airway management result from human factors.", x: 147, y: 352, width: 188, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    { text: "study protocol for a quasi-", x: 41, y: 387, width: 78, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
    { text: "of complications reduced. Simulation-based teaching", x: 147, y: 387, width: 177, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    { text: "experimental pre-post study at", x: 41, y: 398, width: 95, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
    { text: "provides real-time situations and allows healthcare", x: 147, y: 398, width: 190, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    { text: "Protected by copyright, including for uses related to text and data mining.", x: 569, y: 159, width: 200, height: 9, fontSize: 9, fontName: "Edge", page: 1 },
    ...columnPairs,
  ],
}];

console.log(detectPageColumns(pages[0] as never));
const { blocks } = reconstructDocument(pages as never);
for (const b of blocks.filter((x) => /quasi|complications|Protected|Up to 40/i.test(x.text))) {
  console.log(b.role, b.column, Math.round(b.bbox.x), JSON.stringify(b.text.slice(0, 100)));
}
