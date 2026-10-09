import Foundation
import Translation

@main
struct AppleTranslationHelper {
  static func main() async {
    guard CommandLine.arguments.count >= 4 else { exit(2) }
    let source = Locale.Language(identifier: CommandLine.arguments[1])
    let target = Locale.Language(identifier: CommandLine.arguments[2])
    let text = CommandLine.arguments.dropFirst(3).joined(separator: " ")
    do {
      let session = TranslationSession(installedSource: source, target: target)
      let response = try await session.translate(text)
      print(response.targetText)
    } catch {
      fputs("Apple Translation failed: \(error)\n", stderr)
      exit(1)
    }
  }
}
