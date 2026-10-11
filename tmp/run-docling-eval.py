from __future__ import annotations

import json
import sys
from pathlib import Path

from docling.document_converter import DocumentConverter


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: run-docling-eval.py INPUT.pdf OUTPUT_DIR")

    source = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    result = DocumentConverter().convert(source)
    document = result.document
    (out_dir / "docling.md").write_text(document.export_to_markdown(), encoding="utf-8")
    (out_dir / "docling.json").write_text(
        json.dumps(document.export_to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"pages": len(document.pages), "output": str(out_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
