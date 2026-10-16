# Quarantined PDFs

Local-only. Not scored by `diagnose-extraction-wide-corpus.ts`.

Typical reasons:

- title/id body mismatch
- multi-article journal dump
- rights not verified as OA / CC (e.g. commercial textbook)

Do not commit PDF binaries. Re-fetch verified OA with:

```bash
node scripts/fetch-oa-europepmc.mjs --limit=40
```
