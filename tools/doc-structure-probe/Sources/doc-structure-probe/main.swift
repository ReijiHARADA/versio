// doc-structure-probe <pdf> [--no-llm] [--max-pages N]
// Prints JSON: Vision document structure per page and, when the on-device
// model is available, header fields (title/authors/affiliations/emails) from
// pages 1–2. Evaluation only; everything runs locally.
import CoreGraphics
import Foundation
#if PROBE_FM
import FoundationModels
#endif
import PDFKit
import Vision

struct Box: Codable { let x: Double; let y: Double; let w: Double; let h: Double }
struct Paragraph: Codable { let text: String; let bbox: Box }
struct ListOut: Codable { let items: [String]; let bbox: Box }
struct PageOut: Codable {
    let page: Int
    let title: String?
    let paragraphs: [Paragraph]
    let lists: [ListOut]
    let tables: Int
}
struct AuthorOut: Codable { let name: String; let affiliationKeys: [String] }
struct AffOut: Codable { let key: String; let text: String }
struct HeaderOut: Codable { let title: String?; let authors: [AuthorOut]; let affiliations: [AffOut]; let emails: [String] }
struct Output: Codable {
    let fmAvailable: Bool
    let fmError: String?
    let pages: [PageOut]
    let header: HeaderOut?
}

/// Shape the model is asked to emit as JSON (decoded leniently).
struct GenAuthor: Decodable { var name: String; var affiliationIndexes: [Int]? }
struct GenHeader: Decodable { var title: String?; var authors: [GenAuthor]?; var affiliations: [String]?; var emails: [String]? }

/// First balanced {...} block in the model output.
func firstJSONObject(_ s: String) -> Data? {
    guard let start = s.firstIndex(of: "{") else { return nil }
    var depth = 0, inString = false, escaped = false
    for i in s[start...].indices {
        let c = s[i]
        if inString { if escaped { escaped = false } else if c == "\\" { escaped = true } else if c == "\"" { inString = false }; continue }
        if c == "\"" { inString = true } else if c == "{" { depth += 1 } else if c == "}" { depth -= 1; if depth == 0 { return String(s[start...i]).data(using: .utf8) } }
    }
    return nil
}

func box(_ region: NormalizedRegion) -> Box {
    let r = region.boundingBox
    return Box(x: Double(r.origin.x), y: Double(r.origin.y), w: Double(r.width), h: Double(r.height))
}

func render(_ page: PDFPage, scale: CGFloat) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale), height = Int(bounds.height * scale)
    guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    return ctx.makeImage()
}

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("usage: doc-structure-probe <pdf> [--no-llm] [--max-pages N]\n".data(using: .utf8)!)
    exit(2)
}
let useLLM = !args.contains("--no-llm")
let maxPages = args.firstIndex(of: "--max-pages").flatMap { Int(args[$0 + 1]) } ?? doc.pageCount

var request = RecognizeDocumentsRequest()
request.textRecognitionOptions.recognitionLanguages = [Locale.Language(identifier: "en-US"), Locale.Language(identifier: "ja-JP")]

var pages: [PageOut] = []
for index in 0..<min(doc.pageCount, maxPages) {
    guard let page = doc.page(at: index), let image = render(page, scale: 2) else { continue }
    let observations = (try? await request.perform(on: image)) ?? []
    guard let d = observations.first?.document else {
        pages.append(PageOut(page: index + 1, title: nil, paragraphs: [], lists: [], tables: 0))
        continue
    }
    pages.append(PageOut(
        page: index + 1,
        title: d.title?.transcript,
        paragraphs: d.paragraphs.map { Paragraph(text: $0.transcript, bbox: box($0.boundingRegion)) },
        lists: d.lists.map { ListOut(items: $0.items.map(\.itemString), bbox: box($0.boundingRegion)) },
        tables: d.tables.count
    ))
}

var header: HeaderOut? = nil
#if PROBE_FM
let model = SystemLanguageModel.default
let fmAvailable = model.availability == .available
var fmError: String? = fmAvailable ? nil : String(describing: model.availability)
if useLLM && fmAvailable {
    // Top-to-bottom reading of pages 1–2, capped to stay inside the small context window.
    var lead = pages.prefix(2).flatMap { $0.paragraphs }.map(\.text).joined(separator: "\n")
    if lead.count > 6000 { lead = String(lead.prefix(6000)) }
    do {
        let session = LanguageModelSession(instructions: "You extract bibliographic header fields from the first pages of an academic paper. Copy text exactly; do not translate or invent. Reply with JSON only.")
        let prompt = """
        Return one JSON object: {"title": string, "authors": [{"name": string, "affiliationIndexes": [int]}], "affiliations": [string], "emails": [string]}.
        title: the paper title as printed (main language only, no version notes). authors: every author in order, one per person, no footnote marks.
        affiliations: each distinct affiliation as printed; affiliationIndexes are 1-based indexes into it. emails: every email printed.

        Paper text:
        \(lead)
        """
        let reply = try await session.respond(to: prompt).content
        guard let data = firstJSONObject(reply) else { throw NSError(domain: "probe", code: 1, userInfo: [NSLocalizedDescriptionKey: "no JSON in reply"]) }
        let g = try JSONDecoder().decode(GenHeader.self, from: data)
        let affs = (g.affiliations ?? []).enumerated().map { AffOut(key: "a\($0.offset + 1)", text: $0.element) }
        header = HeaderOut(
            title: (g.title ?? "").isEmpty ? nil : g.title,
            authors: (g.authors ?? []).map { a in AuthorOut(name: a.name, affiliationKeys: (a.affiliationIndexes ?? []).filter { $0 >= 1 && $0 <= affs.count }.map { "a\($0)" }) },
            affiliations: affs,
            emails: g.emails ?? []
        )
    } catch {
        fmError = String(describing: error)
    }
}

#else
// Built without FoundationModels: on macOS 26.0 the system framework lacks symbols
// the current SDK emits (respond(to:), GeneratedContent), so the binary would not load.
let fmAvailable = false
let fmError: String? = "built without FoundationModels (runtime ABI mismatch on this macOS build)"
_ = useLLM
#endif

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]
FileHandle.standardOutput.write(try encoder.encode(Output(fmAvailable: fmAvailable, fmError: fmError, pages: pages, header: header)))
