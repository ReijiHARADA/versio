# Third-party notices

Paper Reader 本体のソースコードは [MIT License](./LICENSE) です。

このライセンスは **Paper Reader のソースコードにだけ** 適用されます。翻訳に使う MADLAD-400 のモデル重み、PyTorch、pdf.js、その他の依存ライブラリ／同梱バイナリには、それぞれのライセンスが適用されます。

## アプリ内の一覧（正）

配布物に含まれる依存の一覧・著作権表示・ライセンス全文は、設定画面の **ライセンス**、およびビルド時生成物 `src/generated/thirdPartyLicenses.json` を正とします。

再生成:

```bash
npm run generate:licenses
```

収集対象:

| 区分 | ソース |
| --- | --- |
| 本体 | リポジトリ直下の `LICENSE` |
| npm | `package-lock.json` の本番依存クロージャ（`optionalDependencies` は除外） |
| Rust | `src-tauri` の `cargo metadata` resolve |
| Python | 配布用 `translation-server/venv` の dist-info |
| モデル / アセット | 検証済みの同梱物のみ（MADLAD-400 モデルカード、pdfjs CMaps など） |

ライセンス種別はパッケージメタデータまたは同梱 LICENSE から確認できたものだけを記載します。確認できない項目はアプリ上で「要確認」または「一部未確認」と表示し、推測で SPDX を埋めません。

## 開発専用依存

Vite、Vitest、Playwright、oxlint、TypeScript などの **devDependencies** および未同梱の開発用 Python パッケージは、配布物のライセンス一覧には含めません。

## Ollama

Paper Reader は用語集のために **任意** でローカルの Ollama HTTP API（既定 `http://localhost:11434`）へ接続します。Ollama 本体もそのモデル重みもこのリポジトリには同梱していません。Ollama を使う場合は、Ollama および読み込むモデルそれぞれのライセンスが別途適用されます。
