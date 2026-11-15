import { describe, expect, it } from "vitest";
import { latexToText, parseLatexFields } from "../../evaluation/fieldGold/latex";

const ACM = String.raw`
\documentclass{acmart}
% \title{Commented out}
\iffalse \title{Hidden} \fi
\title[short]{Long \emph{Title} of\\ the Paper}
\author{Jane Smith}
\affiliation{\institution{Univ A}}
\email{jane@example.org}
\author{Bo Chen\thanks{Equal contribution.}}
\affiliation{\institution{Lab B}}
\begin{document}
\begin{figure*}
  \includegraphics{x}
  \caption[Short]{Overview of the \textbf{system}.}\label{fig:x}
\end{figure*}
\begin{table}
  \caption{Results 50\% better.}
  \begin{tabular}{c} a \end{tabular}
\end{table}
\begin{figure}
  \begin{subfigure}{0.5\linewidth}\caption{Sub a}\end{subfigure}
  \caption{Main caption.}
\end{figure}
\end{document}`;

const GENERIC = String.raw`\title{Plain}
\author{Ann Lee$^{1}$ \and Tom Ito\inst{2}\\ Some University \\ \texttt{tom@x.jp}}`;

const BBL = String.raw`\begin{thebibliography}{2}
\bibitem[Lee(2019)]{lee19}
A.~Lee.
\newblock Prior work on {T}hings.
\newblock {\em J. Things}, 3, 2019.

\bibitem{chen20}
B.~Chen and J.~Smith.
\newblock Second paper.
\newblock In {\em Proc. CHI}, 2020.
\end{thebibliography}`;

describe("parseLatexFields", () => {
  const r = parseLatexFields({ mainTex: ACM, bbl: BBL });
  it("reads the long title without markup", () => expect(r.title).toBe("Long Title of the Paper"));
  it("reads ACM-style repeated authors and drops \\thanks", () => {
    expect(r.authors.map((a) => a.name)).toEqual(["Jane Smith", "Bo Chen"]);
  });
  it("leaves affiliations and emails empty", () => {
    expect(r.affiliations).toEqual([]);
    expect(r.emails).toEqual([]);
  });
  it("reads main figure/table captions, not subfigure captions", () => {
    expect(r.captions).toEqual([
      { kind: "figure", label: null, text: "Overview of the system." },
      { kind: "table", label: null, text: "Results 50% better." },
      { kind: "figure", label: null, text: "Main caption." },
    ]);
  });
  it("splits bbl items", () => {
    expect(r.references).toHaveLength(2);
    expect(r.references[0].raw).toBe("A. Lee. Prior work on Things. J. Things, 3, 2019.");
    expect(r.references[1].raw).toContain("Second paper.");
  });
  it("splits \\and authors and keeps only the name line", () => {
    expect(parseLatexFields({ mainTex: GENERIC, bbl: null }).authors.map((a) => a.name)).toEqual(["Ann Lee", "Tom Ito"]);
  });
  it("ignores commented titles", () => {
    expect(parseLatexFields({ mainTex: String.raw`% \title{No}` + "\n" + String.raw`\title{Yes}`, bbl: null }).title).toBe("Yes");
  });
  it("converts accents", () => expect(latexToText(String.raw`M\"{u}ller and Jos\'e`)).toBe("Müller and José"));
});
