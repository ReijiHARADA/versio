import type { Ref } from "react";

/** Hidden PDF picker opened through `inputRef.current.click()`. Resets its value so the same file can be picked again. */
export function PdfFileInput({
  inputRef,
  onFile,
  testId,
}: {
  inputRef: Ref<HTMLInputElement>;
  onFile: (file: File) => void;
  testId?: string;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      data-testid={testId}
      aria-label="PDFファイルを選択"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
        event.target.value = "";
      }}
    />
  );
}
