// swift-tools-version:6.2
import PackageDescription

// Evaluation-only probe: Vision RecognizeDocumentsRequest + on-device Foundation Models.
let package = Package(
    name: "doc-structure-probe",
    platforms: [.macOS("26.0")],
    targets: [.executableTarget(name: "doc-structure-probe")]
)
