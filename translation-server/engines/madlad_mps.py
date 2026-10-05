"""MADLAD-400 translation engine - MPS Optimized Version

This version prioritizes MPS (Metal Performance Shaders) for Apple Silicon,
with automatic dtype selection and fallback to CPU if needed.
"""
import os
import re
import threading
import time
from typing import Optional
import platform
import torch
import transformers
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from .base import TranslationEngine, TranslationResult, EngineStatus
from .citation_protect import (
    SOURCE_PROTECTION_VERSION,
    bare_reference_values,
    protect_citations,
    restore_missing_bare_references,
    restore_citations,
    terminal_superscript_indices,
)
from .identifier_retry import (
    MEASUREMENT_PATTERN,
    allows_unprotected_identifier_retry,
    unprotected_identifier_retry_values,
)
from .segmenter import (
    SEGMENTER_VERSION,
    rescue_units_for_translation,
    segment_for_translation,
    split_for_translation,
)

INLINE_NUMERIC_CITATION_PATTERN = re.compile(
    r"\[\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?"
    r"(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*\s*\]"
)

# A small script-contamination detector shared conceptually with the client
# quality gate. These characters are strong evidence of a Simplified Chinese
# decode leaking into Japanese; ordinary Japanese kanji are intentionally not
# listed. Rejecting here enables the existing beam/rescue cascade before the
# contaminated output reaches the client.
SIMPLIFIED_CJK_CONTAMINATION = re.compile(
    r"[习这们该过现为发见后还进对个从认说时实开结统处变关记忆态调评]"
    r"|(?:因素|主题|详细|结果|影响|内在因素|外在因素)"
)


def missing_visible_numeric_citations(source: str, translated: str) -> list[str]:
    """Return visible bracket citations lost during an opt-in diagnostic decode."""
    if os.getenv("MADLAD_EXPOSE_INLINE_NUMERIC_CITATIONS", "").lower() not in {"1", "true", "yes"}:
        return []
    return [value for value in INLINE_NUMERIC_CITATION_PATTERN.findall(source) if value not in translated]


def restore_unambiguous_terminal_numeric_citations(source: str, translated: str) -> str:
    """Restore exposed citations only when their source position is sentence-final.

    This is deliberately conservative: a citation in the middle of a
    coordinated clause is not moved, because its attachment cannot be inferred
    from text alone. A citation immediately followed only by terminal
    punctuation has one safe destination in the translated sentence.
    """
    if os.getenv("MADLAD_EXPOSE_INLINE_NUMERIC_CITATIONS", "").lower() not in {"1", "true", "yes"}:
        return translated
    terminal_values: list[str] = []
    for match in INLINE_NUMERIC_CITATION_PATTERN.finditer(source):
        if re.fullmatch(r"\s*[.!?。！？]*\s*", source[match.end():]):
            if match.group(0) not in translated:
                terminal_values.append(match.group(0))
    if not terminal_values:
        return translated
    terminal = re.search(r"([.!?。！？])\s*$", translated)
    insertion = "".join(terminal_values)
    if terminal:
        return translated[:terminal.start()] + insertion + translated[terminal.start():]
    return translated.rstrip() + insertion


def classify_protected_spans(spans: list[str]) -> dict[str, list[str]]:
    """Classify spans reported by a protection-restore failure.

    This is diagnostic-only. It deliberately shares the same narrow shapes as
    the retry policy, but does not decide whether a span may be exposed. The
    resulting categories make long-unit fallback reports actionable without
    logging the source text or changing production acceptance.
    """
    categories: dict[str, list[str]] = {
        "author_year_citation": [],
        "numeric_citation": [],
        "measurement": [],
        "structural_reference": [],
        "identifier": [],
        "other": [],
    }
    for raw in spans:
        value = raw.strip()
        if not value:
            continue
        if re.fullmatch(r"\(?\s*[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+et\s+al\.?)?(?:\s+(?:&|and)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)?\s*,?\s*(?:18|19|20)\d{2}[a-z]?(?:\s*;\s*[^()]*)*\s*\)?", value):
            category = "author_year_citation"
        elif re.fullmatch(r"\[\s*\d+(?:\s*[-–]\s*\d+|\s*,\s*\d+)*\s*\]", value):
            category = "numeric_citation"
        elif re.fullmatch(MEASUREMENT_PATTERN, value, flags=re.IGNORECASE):
            category = "measurement"
        elif re.fullmatch(r"(?:Fig(?:ure)?|Table|Tbl\.?|Section|Appendix|Equation|Eqn?\.?)\s+[^\s]+(?:\s*\([A-Za-z]\))?", value, flags=re.IGNORECASE):
            category = "structural_reference"
        elif re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]{1,31}", value):
            category = "identifier"
        else:
            category = "other"
        categories[category].append(value)
    return categories


def restore_missing_structure_references(source: str, output: str) -> str:
    """Recover omitted structural references without inventing content.

    MADLAD occasionally drops a short cross-reference while translating an
    otherwise complete clause. Copy only references that occur verbatim in the
    source and are absent from the output; append them as an explicit
    parenthetical so the fact remains visible and the client invariant gate
    can verify it. This is deliberately limited to section, appendix, table,
    and figure labels; it does not recover arbitrary names or numbers.
    """
    refs = re.findall(
        r"\b(?:Section|Appendix)\s+(?:\d+(?:\.\d+)*|[A-Z])\b"
        r"|\b(?:Figure|Fig\.?|Table|Tbl\.?)\s+\d+(?:\s*\([A-Za-z]\)|[A-Za-z])?(?![A-Za-z0-9])"
        r"|\b(?:Equation|Eqn?\.?)\s+\d+\b",
        source,
        flags=re.IGNORECASE,
    )
    def present(ref: str) -> bool:
        if ref.lower() in output.lower():
            return True
        equation = re.fullmatch(r"(?:Equation|Eqn?\.?)\s+(\d+)", ref, re.I)
        return bool(equation and re.search(rf"(?:式|equation|eqn?\.?)\s*{equation.group(1)}(?!\d)", output, re.I))

    missing = [ref for ref in dict.fromkeys(refs) if not present(ref)]
    if not missing or len(missing) > 2:
        return output
    return output.rstrip() + " (" + "; ".join(missing) + ")"


class MADLADEngine(TranslationEngine):
    """
    Translation engine using Google's MADLAD-400 model.

    Optimized for Apple Silicon (M4) with MPS support.
    Falls back to CPU only if MPS is unavailable or fails.
    """

    MODEL_ID = "google/madlad400-3b-mt"
    TRANSFORMERS_RUNTIME_VERSION = "4.57.6"
    QUALITY_GATE_VERSION = "quality-v36-relation-condition-beam-v8-section-marker-contextual-number-citation-group-foreign-script-hangul-supplementary-ref-inventory-long-claim-quoted-boundary-repeat-token-dense-citation-claim-compression-beam-v2-identifier-glue-simplified-cjk-rescue-quoted-label-policy"
    MODEL_VERSION = (
        f"3b-mt-v6-transformers-{TRANSFORMERS_RUNTIME_VERSION}-{SEGMENTER_VERSION}-"
        f"{SOURCE_PROTECTION_VERSION}-strict-restore-v28-{QUALITY_GATE_VERSION}"
    )
    # Long academic units were previously capped at 256 decoder tokens,
    # causing otherwise valid output to end mid-sentence. Keep the cap finite
    # while allowing a complete Japanese rendering for long source units.
    MAX_NEW_TOKENS = 384
    # Greedy MADLAD can loop on a Japanese phrase for English parallel lists
    # (for example, repeated "how to …" clauses). Four tokens still permits
    # ordinary lexical reuse while stopping the observed decoder loop.
    NO_REPEAT_NGRAM_SIZE = 4

    def __init__(self, device: Optional[str] = None, dtype: Optional[torch.dtype] = None):
        """
        Initialize the MADLAD engine.

        Args:
            device: Device to use ("mps", "cuda", "cpu", or None for auto-detect)
            dtype: Data type to use (torch.bfloat16, torch.float16, torch.float32, or None for auto)
        """
        self._model = None
        self._tokenizer = None
        self._device_str = device
        self._device = None
        self._dtype = dtype
        self._model_loaded = False
        self._load_time = 0.0
        # MPS is not safe for concurrent generate() — the original SIGSEGV
        # happened with two /translate requests on Metal at once.
        self._lock = threading.Lock()
        # Independent sentence chunks in one generate() call. 1 disables batching.
        # Sweep 2026-09-04: 24 is slightly faster than 8 on long paragraphs and
        # matches 12/32 quality. 1 restores one generate() per chunk.
        self._batch_size = max(1, int(os.environ.get("MADLAD_BATCH_SIZE", "24")))

        # Enable MPS fallback for unsupported operations
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

        # ログ出力
        self._log_environment()

    def _log_environment(self) -> None:
        """Log detailed environment information."""
        print("\n" + "=" * 80)
        print("MADLAD ENGINE ENVIRONMENT")
        print("=" * 80)
        print(f"Python version: {platform.python_version()}")
        print(f"Platform: {platform.platform()}")
        print(f"Machine: {platform.machine()}")

        if platform.system() == "Darwin":
            print(f"macOS version: {platform.mac_ver()[0]}")

        print(f"PyTorch version: {torch.__version__}")
        print(f"MPS built: {torch.backends.mps.is_built()}")
        print(f"MPS available: {torch.backends.mps.is_available()}")
        print(f"CUDA available: {torch.cuda.is_available()}")
        print(f"MPS fallback enabled: {os.getenv('PYTORCH_ENABLE_MPS_FALLBACK', '0')}")
        print("=" * 80 + "\n")

    def _detect_device(self) -> torch.device:
        """
        Detect the best available device.

        Priority:
        1. MPS (Apple Silicon GPU) - best for M4 Mac
        2. CUDA (NVIDIA GPU)
        3. CPU (fallback only)
        """
        if torch.backends.mps.is_available():
            print("[DEVICE] Using MPS (Apple Silicon GPU)")
            return torch.device("mps")
        elif torch.cuda.is_available():
            print("[DEVICE] Using CUDA (NVIDIA GPU)")
            return torch.device("cuda")
        else:
            print("[DEVICE] Using CPU (no GPU available)")
            return torch.device("cpu")

    def _select_dtype(self, device: torch.device) -> torch.dtype:
        """
        Select optimal dtype for the device.

        For MPS:
        1. Try bfloat16 (best speed/quality tradeoff)
        2. Fallback to float16 if bfloat16 fails
        3. Fallback to float32 if both fail

        For CUDA:
        - Use float16 (standard for inference)

        For CPU:
        - Use float32 (CPU doesn't benefit from lower precision)
        """
        if device.type == "mps":
            # Try bfloat16 first (recommended for Apple Silicon)
            print("[DTYPE] Selecting bfloat16 for MPS")
            return torch.bfloat16
        elif device.type == "cuda":
            print("[DTYPE] Selecting float16 for CUDA")
            return torch.float16
        else:
            print("[DTYPE] Selecting float32 for CPU")
            return torch.float32

    def load_model(self) -> None:
        """Load the MADLAD model and tokenizer."""
        with self._lock:
            self._load_model_unlocked()

    def _load_model_unlocked(self) -> None:
        """Load the model. Caller must hold self._lock."""
        if self._model_loaded:
            print("[DEBUG] Model already loaded, skipping...")
            return

        if transformers.__version__ != self.TRANSFORMERS_RUNTIME_VERSION:
            raise RuntimeError(
                f"MADLAD requires transformers=={self.TRANSFORMERS_RUNTIME_VERSION}; "
                f"found {transformers.__version__}"
            )

        print(f"\n[LOADING] MADLAD-400 model from {self.MODEL_ID}")
        load_start = time.time()

        try:
            # Detect device
            if self._device_str:
                self._device = torch.device(self._device_str)
                print(f"[DEVICE] Using specified device: {self._device}")
            else:
                self._device = self._detect_device()

            # Select dtype
            if self._dtype is None:
                self._dtype = self._select_dtype(self._device)
            else:
                print(f"[DTYPE] Using specified dtype: {self._dtype}")

            print(f"[CONFIG] Device: {self._device}, Dtype: {self._dtype}")

            # Load tokenizer. Language tags like <2ja> must remain whole tokens.
            print("[LOADING] Loading tokenizer...")
            self._tokenizer = AutoTokenizer.from_pretrained(
                self.MODEL_ID,
                use_fast=False,
            )
            self._tokenizer.padding_side = "right"
            print("[LOADING] ✓ Tokenizer loaded")

            # Load model with selected dtype
            print(f"[LOADING] Loading model with dtype={self._dtype}...")

            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                self.MODEL_ID,
                dtype=self._dtype,
                low_cpu_mem_usage=True,
            )
            self._verify_madlad_embeddings()

            # Move to device
            print(f"[LOADING] Moving model to {self._device}...")
            self._model = self._model.to(self._device)
            self._model.eval()

            # Verify
            actual_device = next(self._model.parameters()).device
            actual_dtype = next(self._model.parameters()).dtype
            print(f"[LOADING] ✓ Model on device: {actual_device}")
            print(f"[LOADING] ✓ Model dtype: {actual_dtype}")

            self._model_loaded = True
            self._load_time = time.time() - load_start

            print(f"[LOADING] ✓ Model loaded successfully in {self._load_time:.2f}s\n")

        except Exception as e:
            print(f"[ERROR] Failed to load model: {e}")
            import traceback
            traceback.print_exc()

            # Fallback to CPU if MPS fails
            if self._device and self._device.type == "mps":
                print("\n[FALLBACK] MPS failed, trying CPU...")
                self._device = torch.device("cpu")
                self._dtype = torch.float32
                self._model = None
                self._tokenizer = None
                self._load_model_unlocked()
            else:
                raise

    def unload_model(self) -> None:
        """Unload the model from memory."""
        if self._model is not None:
            del self._model
            self._model = None
        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None
        self._model_loaded = False

        # Clear cache
        if self._device and self._device.type == "mps":
            torch.mps.empty_cache()
        elif torch.cuda.is_available():
            torch.cuda.empty_cache()

    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        """
        Translate text using MADLAD-400.

        MADLAD uses language tags: <2xx> where xx is the language code.
        Example: <2ja> for Japanese, <2en> for English.
        """
        translate_start = time.time()
        model_was_cached = self._model_loaded

        with self._lock:
            if not self._model_loaded:
                self._load_model_unlocked()

            try:
                named = MADLADEngine._format_named_work_heading(text)
                if named and target_language == "ja":
                    translate_time = (time.time() - translate_start) * 1000
                    return TranslationResult(
                        text=named,
                        source_language=source_language,
                        target_language=target_language,
                        model=self.MODEL_ID,
                        model_version=self.MODEL_VERSION,
                        input_chars=len(text),
                        output_chars=len(named),
                        input_tokens=0,
                        output_tokens=0,
                        translation_time_ms=translate_time,
                    )

                heading = re.match(
                    r"^(?P<num>\d+(?:\.\d+)*)[.)]\s+(?P<rest>.+)$",
                    " ".join(text.split()).strip(),
                )
                translate_body = text
                heading_num = None
                if (
                    target_language == "ja"
                    and heading
                    and len(heading.group("rest")) <= 80
                    and heading.group("rest").count(".") == 0
                ):
                    heading_num = heading.group("num")
                    translate_body = heading.group("rest")

                units = segment_for_translation(translate_body)
                chunks = [unit.text for unit in units]
                model_inputs = [unit.model_input for unit in units]
                if os.getenv("TRANSLATION_UNIT_DEBUG") == "1":
                    print("[TRANSLATION_UNIT]", flush=True)
                    print(f"SOURCE: {translate_body}", flush=True)
                    for index, (chunk, model_input) in enumerate(zip(chunks, model_inputs)):
                        protected, _, _ = protect_citations(model_input)
                        print(
                            f"CHUNK[{index}] chars={len(chunk)} source={chunk!r} model_input={model_input!r} protected={protected!r}",
                            flush=True,
                        )
                print(
                    f"\n[TRANSLATE] Input: {len(text)} chars, {len(chunks)} chunk(s), "
                    f"{source_language} -> {target_language}",
                    flush=True,
                )

                try:
                    pieces, in_toks, out_toks = self._translate_chunks(
                        chunks, target_language, model_inputs
                    )
                except Exception as initial_error:
                    # A single independently valid-looking unit can still be
                    # too difficult for the decoder (for example a long
                    # coordinate clause).  Previously this exception escaped
                    # before the existing retry-only rescue path ran, turning
                    # a recoverable unit failure into a whole-block fallback.
                    # Retry only when the delimiter-aware rescue actually
                    # produces more units; otherwise preserve the original
                    # error and fail closed.
                    rescue_units = rescue_units_for_translation(translate_body)
                    if len(rescue_units) <= len(chunks):
                        raise initial_error
                    print(
                        f"[TRANSLATE] unit failure; retrying with {len(rescue_units)} rescue unit(s)",
                        flush=True,
                    )
                    chunks = [unit.text for unit in rescue_units]
                    model_inputs = [unit.model_input for unit in rescue_units]
                    pieces, in_toks, out_toks = self._translate_chunks(
                        chunks, target_language, model_inputs
                    )
                input_tokens = sum(in_toks)
                output_tokens = sum(out_toks)

                translated_text = self._join_translated_chunks(
                    chunks, pieces, target_language, model_inputs
                )
                if target_language == "ja":
                    translated_text = restore_missing_structure_references(text, translated_text)
                    translated_text = self._restore_numeric_quote_labels(text, translated_text)
                if heading_num:
                    translated_text = f"{heading_num}. {translated_text.lstrip()}"

                if self._is_degenerate(translated_text, text, target_language):
                    # Retry the same units with deterministic beam decoding;
                    # the existing whole-text gate remains unchanged.
                    try:
                        beam_pieces: list[str] = []
                        beam_in: list[int] = []
                        beam_out: list[int] = []
                        for chunk, model_input in zip(chunks, model_inputs):
                            piece, in_tok, out_tok = self._translate_chunk(
                                chunk, target_language, model_input, num_beams=4, retry_label="whole-beam"
                            )
                            beam_pieces.append(piece)
                            beam_in.append(in_tok)
                            beam_out.append(out_tok)
                        beam_text = self._join_translated_chunks(chunks, beam_pieces, target_language, model_inputs)
                        if target_language == "ja":
                            beam_text = self._restore_numeric_quote_labels(text, beam_text)
                        if not self._is_degenerate(beam_text, text, target_language):
                            translated_text = beam_text
                            input_tokens = sum(beam_in)
                            output_tokens = sum(beam_out)
                    except Exception:
                        pass
                    if self._is_degenerate(translated_text, text, target_language):
                        rescue_units = rescue_units_for_translation(translate_body)
                        if len(rescue_units) > len(chunks):
                            print(f"[TRANSLATE] whole-unit quality failure; retrying with {len(rescue_units)} rescue unit(s)", flush=True)
                            rescue_chunks = [unit.text for unit in rescue_units]
                            rescue_inputs = [unit.model_input for unit in rescue_units]
                            rescue_pieces, rescue_in, rescue_out = self._translate_chunks(rescue_chunks, target_language, rescue_inputs)
                            rescued = self._join_translated_chunks(rescue_chunks, rescue_pieces, target_language, rescue_inputs)
                            rescue_units_valid = all(
                                not self._is_degenerate(piece, chunk, target_language)
                                for chunk, piece in zip(rescue_chunks, rescue_pieces)
                            )
                            rescue_aggregate_only = (
                                self._degenerate_reason(rescued, text, target_language)
                                == "implausibly_short"
                            )
                            if not self._is_degenerate(rescued, text, target_language) or (
                                rescue_units_valid and rescue_aggregate_only
                            ):
                                translated_text = rescued
                                input_tokens = sum(rescue_in)
                                output_tokens = sum(rescue_out)
                                # Keep the accepted rescue structure for the
                                # final aggregate check below. Otherwise the
                                # original one-unit shape would make a valid
                                # chunked rescue look like a short paragraph.
                                chunks = rescue_chunks
                                model_inputs = rescue_inputs
                    if self._is_degenerate(translated_text, text, target_language):
                        # A long logical paragraph can be safely assembled
                        # from independently validated sentence units. In
                        # that case the whole-text compression heuristic
                        # compares Japanese output with the unsegmented source
                        # and can reject a valid chunked result. Keep all
                        # source-span, repetition, marker, and instruction
                        # checks; relax only this aggregate-length case when
                        # every unit passed its own quality gate.
                        chunked_length_only = (
                            len(chunks) > 1
                            and self._degenerate_reason(translated_text, text, target_language) == "implausibly_short"
                        )
                        if not chunked_length_only:
                            print(f"[TRANSLATE] Rejected degenerate output: {translated_text[:120]!r}")
                            raise ValueError("degenerate translation output")
                        print("[TRANSLATE] accepted chunked output despite aggregate compression", flush=True)

                # Validate the assembled logical block after all ordinary and
                # rescue retries. A split can make every individual unit look
                # valid while the joined result still omits one of several
                # quoted experimental conditions.
                if (
                    target_language == "ja"
                    and (
                        self._quoted_content_span_count(text) >= 2
                        or (
                            self._quoted_content_span_count(text) >= 1
                            and re.search(r"\be\.g\.,?\s*[\u201c\"]", text, re.I)
                        )
                    )
                    and self._quoted_content_span_count(translated_text)
                    < self._quoted_content_span_count(text)
                ):
                    raise ValueError("quoted content span dropped from assembled translation")

                print(f"[TRANSLATE] Output: {translated_text[:200]!r}", flush=True)

                translate_time = (time.time() - translate_start) * 1000
                tokens_per_sec = (output_tokens / translate_time) * 1000 if translate_time > 0 else 0
                load_time_label = "cached" if model_was_cached else f"{self._load_time:.2f}s"

                print("[MADLAD BENCHMARK]")
                print(f"  device: {self._device}")
                print(f"  dtype: {self._dtype}")
                print(f"  chunks: {len(chunks)}")
                print(f"  batch_size: {self._batch_size}")
                print(f"  input_chars: {len(text)}")
                print(f"  input_tokens: {input_tokens}")
                print(f"  output_tokens: {output_tokens}")
                print(f"  model_load_time: {load_time_label}")
                print(f"  translation_time: {translate_time / 1000:.2f}s")
                print(f"  tokens_per_second: {tokens_per_sec:.2f}")

                return TranslationResult(
                    text=translated_text,
                    source_language=source_language,
                    target_language=target_language,
                    model=self.MODEL_ID,
                    model_version=self.MODEL_VERSION,
                    input_chars=len(text),
                    output_chars=len(translated_text),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    translation_time_ms=translate_time,
                )

            except Exception as e:
                print(f"[ERROR] Translation failed: {e}")
                import traceback
                traceback.print_exc()
                raise

    @staticmethod
    def _format_named_work_heading(text: str) -> str | None:
        compact = " ".join(text.split()).strip()
        match = re.match(
            r"^(?:(?P<num>\d+(?:\.\d+)*)[.)]\s+)?(?P<title>.+?)\s+by\s+(?P<author>[A-Z].+)$",
            compact,
            re.I,
        )
        if not match:
            return None
        author = match.group("author").strip().rstrip(".:;")
        if not author or len(author) > 60 or author.count(" ") > 5:
            return None
        if not re.match(r"^[A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){0,5}$", author):
            return None
        title = match.group("title").strip()
        num = match.group("num")
        body = f"{title} ({author})"
        return f"{num}. {body}" if num else body

    @staticmethod
    def _split_for_translation(text: str) -> list[str]:
        return split_for_translation(text)

    @staticmethod
    def _split_clauses(part: str) -> list[str]:
        """Compatibility entry point for older callers."""
        return split_for_translation(part)

    @staticmethod
    def _to_halfwidth_ascii(text: str) -> str:
        """Convert fullwidth digits/latin/symbols (１，：（）) to ASCII.

        Ideographic 。、 remain. This is post-decode and does not add
        MADLAD tokens; ASCII digits are usually fewer tokens, not more.
        """
        out: list[str] = []
        for ch in text:
            code = ord(ch)
            if 0xFF01 <= code <= 0xFF5E:
                out.append(chr(code - 0xFEE0))
            elif code == 0x3000:
                out.append(" ")
            else:
                out.append(ch)
        converted = "".join(out)
        return re.sub(
            r"([,;:])(?=[\u3040-\u30FF\u4E00-\u9FFF])",
            r"\1 ",
            converted,
        )

    @staticmethod
    def _join_translated_chunks(
        chunks: list[str],
        pieces: list[str],
        target_language: str,
        model_inputs: list[str] | None = None,
    ) -> str:
        if target_language != "ja":
            return " ".join(pieces).strip()

        out: list[str] = []
        for i, (chunk, piece) in enumerate(zip(chunks, pieces)):
            piece = piece.strip()
            # A source slice may end in a comma while its independently
            # translatable model input deliberately ends in a full stop (for
            # example before a long `in which participants …` clause). Use
            # that completed boundary when rejoining Japanese pieces.
            boundary_source = (
                model_inputs[i]
                if model_inputs is not None and i < len(model_inputs)
                else chunk
            )
            source_end = boundary_source.rstrip()[-1:] if boundary_source.rstrip() else ""
            ja_end = piece[-1:] if piece else ""
            if (
                source_end in ".!?"
                and ja_end not in "。！？.!?"
                and not re.fullmatch(r"\d+[.)]", chunk.strip())
            ):
                piece += "。"
            elif (
                source_end not in ".!?"
                and len(chunk) < 80
                and piece.endswith("を")
            ):
                piece = piece[:-1]
            is_list_item = bool(re.match(r"^[•‣▪∙]\s+", chunk))
            if is_list_item:
                # The model may omit the bullet token. It is source structure,
                # so restore it deterministically instead of relying on decode.
                # Conversely, when MADLAD preserves or substitutes a marker,
                # drop it before restoring the one canonical marker.
                piece = re.sub(r"^(?:[•‣▪∙・-]\s*)+", "", piece)
                if out:
                    out.append("\n")
                out.append("• ")
            elif i > 0:
                prev = chunks[i - 1].rstrip()
                prev_piece = out[-1] if out else ""
                if (
                    prev.endswith(":")
                    and prev_piece
                    and prev_piece[-1] not in "。！？：、:"
                ):
                    out.append(":")
            out.append(piece)
        joined = "".join(out).strip()
        joined = re.sub(r"[:：]+", ":", joined)
        return MADLADEngine._to_halfwidth_ascii(joined)

    def _translate_chunks(
        self, chunks: list[str], target_language: str, model_inputs: list[str] | None = None
    ) -> tuple[list[str], list[int], list[int]]:
        model_inputs = model_inputs or chunks
        if len(model_inputs) != len(chunks):
            raise ValueError("model inputs must align with source chunks")
        if self._batch_size <= 1 or len(chunks) <= 1:
            pieces: list[str] = []
            in_toks: list[int] = []
            out_toks: list[int] = []
            for index, (chunk, model_input) in enumerate(zip(chunks, model_inputs)):
                try:
                    piece, in_tok, out_tok = self._translate_chunk_with_rescue(
                        chunk, target_language, model_input
                    )
                except Exception as unit_error:
                    if os.getenv("TRANSLATION_UNIT_DEBUG") == "1":
                        print(
                            f"[TRANSLATION_UNIT_FAILURE] index={index} chars={len(chunk)} "
                            f"words={len(chunk.split())} reason={unit_error!r} source={chunk!r}",
                            flush=True,
                        )
                    raise
                pieces.append(piece)
                in_toks.append(in_tok)
                out_toks.append(out_tok)
            return pieces, in_toks, out_toks

        pieces = []
        in_toks = []
        out_toks = []
        for start in range(0, len(chunks), self._batch_size):
            group = chunks[start : start + self._batch_size]
            group_inputs = model_inputs[start : start + self._batch_size]
            try:
                group_pieces, group_in, group_out = self._translate_chunk_batch(
                    group, target_language, group_inputs
                )
            except Exception as exc:
                print(
                    f"[TRANSLATE] Batch of {len(group)} failed ({exc!r}); "
                    "retrying sequentially",
                    flush=True,
                )
                group_pieces = []
                group_in = []
                group_out = []
                for offset, (chunk, model_input) in enumerate(zip(group, group_inputs)):
                    try:
                        piece, one_in, one_out = self._translate_chunk_with_rescue(
                            chunk, target_language, model_input
                        )
                    except Exception as unit_error:
                        if os.getenv("TRANSLATION_UNIT_DEBUG") == "1":
                            print(
                                f"[TRANSLATION_UNIT_FAILURE] index={start + offset} "
                                f"chars={len(chunk)} words={len(chunk.split())} "
                                f"reason={unit_error!r} source={chunk!r}",
                                flush=True,
                            )
                        raise
                    group_pieces.append(piece)
                    group_in.append(one_in)
                    group_out.append(one_out)
            pieces.extend(group_pieces)
            in_toks.extend(group_in)
            out_toks.extend(group_out)
        return pieces, in_toks, out_toks

    def _translate_chunk_with_rescue(
        self, text: str, target_language: str, model_input: str | None = None
    ) -> tuple[str, int, int]:
        debug_candidates = os.getenv("TRANSLATION_UNIT_DEBUG") == "1"

        def log_candidate(label: str, candidate: str) -> None:
            if not debug_candidates:
                return
            print(
                f"[TRANSLATION_CANDIDATE] label={label} chars={len(candidate)} "
                f"score={self._candidate_score(candidate, text):.3f} "
                f"source_chars={len(text)} output={candidate!r}",
                flush=True,
            )

        try:
            greedy = self._translate_chunk(text, target_language, model_input)
            log_candidate("greedy", greedy[0])
            if target_language == "ja":
                missing_supplement = self._missing_supplementary_references(text, greedy[0])
                if missing_supplement:
                    try:
                        literal = self._translate_chunk(
                            text, target_language, model_input,
                            retry_label="supplementary-reference-literal",
                            unprotected_values=set(missing_supplement),
                        )
                        log_candidate("supplementary-reference-literal", literal[0])
                        if not self._missing_supplementary_references(text, literal[0]):
                            return literal
                    except Exception:
                        pass
            # Quoted coined names (for example a prototype name) are source
            # facts. A fluent decode that drops one is unsafe even when its
            # length and Japanese-script checks pass. Try one deterministic
            # beam candidate and keep it only when every quoted name survives.
            if target_language == "ja":
                missing_names = self._missing_quoted_technical_names(text, greedy[0])
                if missing_names:
                    try:
                        literal = self._translate_chunk(
                            text,
                            target_language,
                            model_input,
                            retry_label="quoted-name-literal",
                            unprotected_values=set(missing_names),
                        )
                        log_candidate("quoted-name-literal", literal[0])
                        if not self._missing_quoted_technical_names(text, literal[0]):
                            return literal
                    except Exception:
                        pass
                    try:
                        beam = self._translate_chunk(
                            text, target_language, model_input, num_beams=4,
                            retry_label="quoted-name-beam",
                        )
                        log_candidate("quoted-name-beam", beam[0])
                        if not self._missing_quoted_technical_names(text, beam[0]):
                            return beam
                    except Exception:
                        pass
                    raise ValueError(
                        "quoted technical name dropped by model: " + " || ".join(missing_names)
                    )
                # Preserve multiple quoted content spans as structural
                # evidence.  A fluent partial translation can otherwise drop
                # one experimental cue or condition while passing length and
                # numeric checks.  Only enforce this when there are at least
                # two substantive source spans; a single ordinary quotation
                # can legitimately be rendered without quote punctuation.
                source_quote_count = self._quoted_content_span_count(text)
                requires_quoted_content = source_quote_count >= 2 or (
                    source_quote_count >= 1 and re.search(r"\be\.g\.,?\s*[\u201c\"]", text, re.I)
                )
                if requires_quoted_content and self._quoted_content_span_count(greedy[0]) < source_quote_count:
                    try:
                        beam = self._translate_chunk(
                            text, target_language, model_input, num_beams=4,
                            retry_label="quoted-content-beam",
                        )
                        log_candidate("quoted-content-beam", beam[0])
                        if self._quoted_content_span_count(beam[0]) >= self._quoted_content_span_count(text):
                            return beam
                    except Exception:
                        pass
                    raise ValueError("quoted content span dropped by model")
            # A fluent greedy decode can turn epistemic claims such as
            # "might not have been detected" into a categorical statement.
            # Run the existing deterministic beam rescue only when the source
            # carries an explicit epistemic-negative construction and the
            # greedy Japanese output lacks an uncertainty marker.  This never
            # rewrites output or weakens the client quality gate; if beam also
            # loses the modality, the original result remains subject to the
            # normal fallback path.
            if target_language == "ja" and self._epistemic_marker_missing(text, greedy[0]):
                try:
                    beam = self._translate_chunk(
                        text, target_language, model_input, num_beams=4, retry_label="epistemic-beam"
                    )
                    log_candidate("epistemic-beam", beam[0])
                    if not self._epistemic_marker_missing(text, beam[0]):
                        return beam
                except Exception:
                    pass
            # Preserve explicit negation in ordinary scholarly prose. This is
            # a bounded rescue for decode drift (for example, `not the first`
            # becoming a positive claim); the client quality gate still
            # rejects a candidate when the beam cannot retain the polarity.
            if target_language == "ja" and self._negation_marker_missing(text, greedy[0]):
                try:
                    beam = self._translate_chunk(
                        text, target_language, model_input, num_beams=4, retry_label="negation-beam"
                    )
                    log_candidate("negation-beam", beam[0])
                    if not self._negation_marker_missing(text, beam[0]):
                        return beam
                except Exception:
                    pass
            # A small set of explicit comparison/choice constructions often
            # loses its second clause under greedy decoding. Try one beam
            # candidate and keep it only when the existing conservative
            # candidate score improves; this is not a blanket beam fallback.
            if target_language == "ja" and self._relation_risk_source(text):
                try:
                    beam = self._translate_chunk(
                        text, target_language, model_input, num_beams=4, retry_label="relation-candidate-beam"
                    )
                    log_candidate("relation-candidate-beam", beam[0])
                    if (
                        self._candidate_score(beam[0], text) > self._candidate_score(greedy[0], text)
                        or len(beam[0]) >= len(greedy[0]) * 1.1
                        or (
                            self._exclusivity_marker_missing(text, greedy[0])
                            and not self._exclusivity_marker_missing(text, beam[0])
                        )
                        or (
                            self._alternative_marker_missing(text, greedy[0])
                            and not self._alternative_marker_missing(text, beam[0])
                        )
                        or (
                            self._comparative_likelihood_marker_missing(text, greedy[0])
                            and not self._comparative_likelihood_marker_missing(text, beam[0])
                        )
                        or (
                            self._condition_marker_missing(text, greedy[0])
                            and not self._condition_marker_missing(text, beam[0])
                        )
                    ):
                        return beam
                except Exception:
                    pass
            # Short academic sentences can silently drop the second predicate
            # of a coordination even when they are too small for the long-unit
            # retry below.  Probe one deterministic beam candidate only when
            # the greedy result is unusually compressed and the source has an
            # explicit coordination. Candidate scoring remains the authority,
            # so a shorter/less factual beam output is not selected.
            if target_language == "ja" and self._claim_compression_risk(text, greedy[0]):
                try:
                    beam = self._translate_chunk(
                        text, target_language, model_input, num_beams=4,
                        retry_label="claim-compression-beam",
                    )
                    log_candidate("claim-compression-beam", beam[0])
                    if self._candidate_score(beam[0], text) > self._candidate_score(greedy[0], text):
                        return beam
                except Exception:
                    pass
            # Long academic units are the main source of silent claim loss.
            # Generate a second deterministic candidate only for those units;
            # short prose keeps the fast single-decode path.
            if len(text) >= 300:
                try:
                    beam = self._translate_chunk(
                        text, target_language, model_input, num_beams=4, retry_label="candidate-beam"
                    )
                    log_candidate("candidate-beam", beam[0])
                    if self._candidate_score(beam[0], text) > self._candidate_score(greedy[0], text):
                        return beam
                except Exception:
                    pass
            return greedy
        except Exception as original_error:
            # A repeated comparative-results sentence can fail because the
            # decoder sees many opaque statistic placeholders as unrelated
            # symbols. Retry one time with only the compact inline statistics
            # visible. The normal invariant gate still rejects any candidate
            # that changes or drops a number, so this improves context without
            # weakening scientific-fact safety.
            if target_language == "ja" and self._comparative_stat_retry_values(text):
                try:
                    retry = self._translate_chunk(
                        text,
                        target_language,
                        model_input,
                        retry_label="comparative-inline-statistics",
                        unprotected_values=set(self._comparative_stat_retry_values(text)),
                    )
                    if not self._comparative_stat_values_preserved(text, retry[0]):
                        raise ValueError("comparative statistic value changed or dropped")
                    return retry
                except Exception:
                    pass
            # If only identifier-like placeholders were dropped, retry once
            # without protection. The client invariant gate remains the final
            # authority, so a retry that loses RF/TQP3M9009 is still rejected.
            message = str(original_error)
            protection_failure = (
                "protected citation placeholder dropped by model:" in message
                or "protected citation placeholder malformed" in message
            )
            quoted_name_failure = "quoted technical name dropped by model:" in message
            # The quoted-name beam was already attempted in the greedy path.
            # Do not let the generic beam rescue re-accept the same fluent
            # omission; it must remain a safe fallback unless a structural
            # rescue unit can preserve the name.
            if quoted_name_failure:
                raise original_error
            if protection_failure:
                missing = [value.strip() for value in message.partition(":")[2].split(" || ") if value.strip()]
                if os.getenv("TRANSLATION_UNIT_DEBUG") == "1":
                    # Diagnostic-only evidence for restore failures.  Keep this
                    # before any rescue attempt so the original model input,
                    # protected spans and failure reason remain observable.
                    try:
                        debug_protected, debug_values, debug_nonce = protect_citations(
                            self._detach_enumeration_prefix(model_input or text)[1],
                            unprotected_values=set(),
                        )
                        print(
                            "[TRANSLATION_PROTECTION_FAILURE] "
                            f"reason={message!r} source={text!r} model_input={(model_input or text)!r} "
                            f"protected={debug_protected!r} values={debug_values!r} "
                            f"nonce={debug_nonce} missing={missing!r} "
                            f"categories={classify_protected_spans(missing)!r}",
                            flush=True,
                        )
                    except Exception as debug_error:
                        print(
                            f"[TRANSLATION_PROTECTION_FAILURE] reason={message!r} "
                            f"diagnostic_error={debug_error!r}",
                            flush=True,
                        )
                # Malformed placeholders do not carry a trustworthy index.
                # Recompute the exact protected spans from the source and
                # expose those spans only for this rescue attempt; the normal
                # invariant/quality gate still decides whether the result is
                # usable. This avoids turning a restore failure into a whole
                # paragraph fallback without disabling protection globally.
                if not missing and "malformed" in message:
                    _, protected_values, _ = protect_citations(text)
                    missing = list(protected_values)
                # Measurements are semantic facts that often occur inside a
                # coordinated hardware description.  If their placeholders
                # were dropped, retry the *complete* sentence with only those
                 # spans exposed before splitting at commas. Splitting first
                 # can turn `prototype ... 11.3 mm ... 335 mg` into unrelated
                # fragments and permanently lose the dimensions.
                measurement_values_in_source = re.findall(
                    MEASUREMENT_PATTERN, text, flags=re.IGNORECASE
                )
                measurement_missing = bool(measurement_values_in_source) and (
                    not missing
                    or any(
                    re.fullmatch(MEASUREMENT_PATTERN, value, flags=re.IGNORECASE)
                        for value in missing
                    )
                )
                if measurement_missing:
                    try:
                        retry_values = unprotected_identifier_retry_values(
                            missing, allow_inline_numeric=True
                        )
                        if not retry_values and measurement_values_in_source:
                            retry_values = measurement_values_in_source
                        if retry_values:
                            print(
                                f"[TRANSLATE] retrying complete unit with {len(retry_values)} measurement span(s) unprotected",
                                flush=True,
                            )
                            return self._translate_chunk(
                                text,
                                target_language,
                                model_input,
                                retry_label="measurement-complete-unit",
                                unprotected_values=set(retry_values),
                            )
                    except Exception:
                        pass
                # A repeated opaque identifier can destabilize an otherwise
                # valid coordinated sentence. Retry its independent clauses
                # separately before exposing the identifier to the decoder.
                # This is punctuation/structure driven and only runs after a
                # placeholder-drop failure; ordinary prose keeps one unit.
                clause_parts = self._coordinated_clause_parts(text)
                coordinated_attempted = bool(clause_parts and missing)
                if clause_parts and missing:
                    try:
                        pieces = [
                            self._translate_chunk(
                                part,
                                target_language,
                                part,
                                retry_label="coordinated-clause-rescue",
                                unprotected_values=set(missing),
                            )
                            for part in clause_parts
                        ]
                        uppercase_ids = [value for value in missing if re.fullmatch(r"[A-Z][A-Z0-9_-]{1,}", value)]
                        if any(
                            uppercase_ids
                            and not any(identifier in piece[0] for identifier in uppercase_ids)
                            for piece in pieces
                        ):
                            raise ValueError("coordinated clause lost uppercase identifier")
                        joined = ", ".join(piece[0] for piece in pieces)
                        return joined, sum(piece[1] for piece in pieces), sum(piece[2] for piece in pieces)
                    except Exception:
                        pass
                retry_values = unprotected_identifier_retry_values(
                    missing, allow_inline_numeric=True
                )
                if retry_values or allows_unprotected_identifier_retry(missing):
                    values_to_unprotect = retry_values or missing
                    try:
                        print(
                            f"[TRANSLATE] retrying with {len(retry_values)} dropped identifier span(s) unprotected",
                            flush=True,
                        )
                        return self._translate_chunk(
                            text,
                            target_language,
                            model_input,
                            retry_label="identifier-only-unprotected",
                            unprotected_values=set(values_to_unprotect),
                        )
                    except Exception:
                        pass
                if coordinated_attempted:
                    raise original_error
            try:
                print(
                    "[TRANSLATE] retrying rejected chunk with beam search",
                    flush=True,
                )
                return self._translate_chunk(
                    text,
                    target_language,
                    model_input,
                    num_beams=4,
                    retry_label="beam",
                )
            except Exception:
                pass
            rescue_units = rescue_units_for_translation(model_input or text)
            if len(rescue_units) <= 1:
                raise original_error
            print(
                f"[TRANSLATE] retrying rejected chunk with {len(rescue_units)} rescue unit(s)",
                flush=True,
            )
            rescue_chunks = [unit.text for unit in rescue_units]
            rescue_inputs = [unit.model_input for unit in rescue_units]
            # Carry only the identifier spans proven safe by the failed
            # restore attempt into each smaller retry unit.  Without this,
            # rescue segmentation re-protects the same acronym (for example
            # EMG), reproducing the placeholder drop that triggered rescue.
            rescue_unprotected = set(
                unprotected_identifier_retry_values(missing, allow_inline_numeric=True)
            ) if protection_failure else set()
            pieces: list[str] = []
            in_toks: list[int] = []
            out_toks: list[int] = []
            for rescue_chunk, rescue_input in zip(rescue_chunks, rescue_inputs):
                piece, in_tok, out_tok = self._translate_chunk(
                    rescue_chunk,
                    target_language,
                    rescue_input,
                    unprotected_values=rescue_unprotected,
                )
                pieces.append(piece)
                in_toks.append(in_tok)
                out_toks.append(out_tok)
            translated = self._join_translated_chunks(
                rescue_chunks, pieces, target_language, rescue_inputs
            )
            # A valid rescue can be shorter than the original long unit when
            # the source contains repeated academic scaffolding.  Validate
            # each rescue unit against its own source before applying the
            # aggregate-length check; otherwise a successful semantic rescue
            # is discarded as an implausibly short whole paragraph.
            rescue_units_valid = all(
                not self._is_degenerate(piece, rescue_chunk, target_language)
                for rescue_chunk, piece in zip(rescue_chunks, pieces)
            )
            if self._is_degenerate(translated, text, target_language) and not rescue_units_valid:
                raise original_error
            return translated, sum(in_toks), sum(out_toks)

    @staticmethod
    def _comparative_stat_retry_values(source: str) -> list[str]:
        if len(re.findall(r"\b(?:less|more|higher|lower|greater|smaller)\b", source, re.I)) < 3:
            return []
        values = re.findall(r"\(\s*[-+]?\d+(?:\.\d+)?\s*\)|\bp\s*[<=>≤≥]\s*[-+]?\d+(?:\.\d+)?", source, re.I)
        return list(dict.fromkeys(values))

    @staticmethod
    def _comparative_stat_values_preserved(source: str, output: str) -> bool:
        source_values = re.findall(r"[-+]?\d+(?:\.\d+)?", " ".join(MADLADEngine._comparative_stat_retry_values(source)))
        output_values = re.findall(r"[-+]?\d+(?:\.\d+)?", output)
        remaining = list(output_values)
        for value in source_values:
            if value not in remaining:
                return False
            remaining.remove(value)
        return True

    @staticmethod
    def _missing_quoted_technical_names(source: str, output: str) -> list[str]:
        names = []
        for match in re.finditer(r"[\u201c\"]([A-Z][A-Za-z0-9][A-Za-z0-9_-]{3,})[\u201d\"]", source):
            name = match.group(1)
            # Ordinary title-cased labels such as “Normal” and “Awkward” are
            # meant to be translated. Keep the invariant for coined names,
            # identifiers, and names introduced by a generic naming frame.
            identifier_like = bool(re.search(r"[a-z][A-Z]|\d|[-_]", name))
            context = source[max(0, match.start() - 48):match.start()]
            naming_frame = bool(re.search(
                r"(?:dubbed|called|named|prototype|interface|system)\s+(?:the\s+)?$",
                context,
                re.I,
            ))
            if identifier_like or naming_frame:
                names.append(name)
        normalized = output.casefold()
        return sorted({name for name in names if name.casefold() not in normalized})

    @staticmethod
    def _quoted_content_span_count(text: str) -> int:
        """Count substantive quoted spans across English and Japanese quotes."""
        return sum(
            1
            for match in re.finditer(r'[\u201c"]([^\u201d"]{3,})[\u201d"]|「([^」]{3,})」', text)
            if any((group or "").strip() for group in match.groups())
        )

    @staticmethod
    def _missing_supplementary_references(source: str, output: str) -> list[str]:
        refs = sorted(set(re.findall(r"\bSI\s+Appendix\b", source, flags=re.IGNORECASE)))
        normalized = output.casefold()
        return [ref for ref in refs if ref.casefold() not in normalized]

    @staticmethod
    def _epistemic_marker_missing(source: str, output: str) -> bool:
        """Detect loss of explicit English epistemic-negative modality.

        This is deliberately structural rather than vocabulary-specific: it
        only asks whether a source modal-negative construction has a Japanese
        uncertainty marker in the candidate output.
        """
        if not re.search(r"\b(?:may|might|could)\s+not\b", source, re.I):
            return False
        return not re.search(r"可能性|かもしれ|とは限ら|おそれ|恐れ|かねない|あり得|考えられ", output)

    @staticmethod
    def _negation_marker_missing(source: str, output: str) -> bool:
        """Detect loss of a clear source negation in a Japanese candidate."""
        if not re.search(
            r"\b(?:not|never|no|neither|without|cannot|can't|didn't|doesn't|isn't|aren't|wasn't|weren't)\b",
            source,
            re.I,
        ):
            return False
        return not re.search(r"ない|なく|ず|ぬ|無|未|否定|ではありません|ではない|ません", output)

    @staticmethod
    def _relation_risk_source(source: str) -> bool:
        """Return true for relations whose omission changes an academic claim.

        This is a retry trigger only.  The candidate score still decides
        whether a beam result is retained, so ordinary prose is not rejected
        or rewritten merely because it contains a conjunction.
        """
        return bool(re.search(
            r"\b(?:either\b[^.!?]{0,180}\bor\b|whether\b[^.!?]{0,180}\bor\b|"
            r"more\s+(?:likely|slowly|quickly)\b|less\s+(?:likely|slowly|quickly)\b|"
            r"\bonly\b|\bsolely\b|"
            r"rather\s+than|greater\s+than|smaller\s+than|\bunless\b|\bif\b|\bwhen\b|"
            r"\bhowever\b|\balthough\b|\bthough\b|\bdespite\b|\bwhereas\b|"
            r"\btherefore\b|\bthus\b|\bconsequently\b|\bbecause\b|\bsince\b|"
            r"\bincluding\b|\bsuch\s+as\b|\bboth\b[^.!?]{0,120}\band\b|"
            r"\bnot\s+only\b[^.!?]{0,120}\bbut\b)",
            source,
            re.I,
        ))

    @staticmethod
    def _claim_compression_risk(source: str, output: str) -> bool:
        """Identify compact coordinated prose worth one beam probe.

        This is a retry trigger only.  It deliberately does not reject an
        output or require a particular translated word.  The source must be a
        substantive sentence with an explicit conjunction and the greedy
        output must be substantially shorter than the source.  Compact valid
        translations may still trigger a probe, but candidate scoring decides
        whether the beam result is retained.
        """
        source_compact = "".join(source.split())
        output_compact = "".join(output.split())
        if len(source_compact) < 90 or len(output_compact) == 0:
            return False
        if len(output_compact) / len(source_compact) >= 0.30:
            return False
        return bool(re.search(r"\b(?:and|or)\b", source, re.IGNORECASE))

    @staticmethod
    def _condition_marker_missing(source: str, output: str) -> bool:
        """Detect loss of an explicit conditional or exception qualifier."""
        if re.search(r"\bunless\b", source, re.I):
            return not re.search(r"ない限り|場合を除|記載がない限り|ただし", output)
        if re.search(r"\b(?:if|when)\b", source, re.I):
            return not re.search(r"場合|なら|れば|とき|時|条件", output)
        return False

    @staticmethod
    def _coordinated_clause_parts(source: str) -> list[str] | None:
        """Split one top-level comma-coordinated sentence into safe clauses."""
        for match in re.finditer(r",\s+(?:and|but|or)\s+(?=[A-Za-z])", source, re.I):
            left = source[: match.start()].strip().rstrip(".") + "."
            right = source[match.end():].strip().rstrip(".")
            # Only split a genuine top-level coordination. This avoids
            # breaking author citations/lists inside delimiters while allowing
            # the right clause to contain its own commas.
            if left.count("(") != left.count(")") or left.count("[") != left.count("]"):
                continue
            if len(left.split()) < 6 or len(right.split()) < 8:
                continue
            return [left, right]
        return None

    @staticmethod
    def _exclusivity_marker_missing(source: str, output: str) -> bool:
        """Detect loss of an explicit only/solely relation in Japanese."""
        if not re.search(r"\b(?:only|solely)\b", source, re.I):
            return False
        return not re.search(r"しか|だけ|のみ|に限(?:る|られ)|唯一", output)

    @staticmethod
    def _alternative_marker_missing(source: str, output: str) -> bool:
        """Detect loss of an explicit either/whether...or choice relation."""
        if not re.search(r"\b(?:either|whether)\b[^.!?]{0,180}\bor\b", source, re.I):
            return False
        return not re.search(r"(?:いずれか|どちらか|どちら|または|あるいは|か(?:どうか|、|。|$))", output)

    @staticmethod
    def _comparative_likelihood_marker_missing(source: str, output: str) -> bool:
        """Detect loss of an explicit more/less-likely comparison."""
        if not re.search(r"\b(?:more|less)\s+likely\b", source, re.I):
            return False
        return not re.search(r"可能性が(?:高|低)|より(?:も)?可能性|尤度", output)

    @staticmethod
    def _candidate_score(output: str, source: str) -> float:
        """Rank already-validated candidates without inventing semantic facts.

        This is a conservative tie-breaker: it rewards preservation of source
        numeric/scientific tokens and penalizes severe length collapse. It is
        never an acceptance gate and cannot make an otherwise rejected output
        acceptable.
        """
        source_tokens = re.findall(
            r"\b\d+(?:\.\d+)?\b"
            r"|\bp\s*[<=>≤≥]\s*\.?\d+(?:\.\d+)?"
            r"|\b[FT]\s*\([^)]{1,12}\)"
            r"|\b(?:BERT|GPT[-‐‑–—]?\d+)\b",
            source,
            re.I,
        )
        output_lower = output.lower()
        preserved = sum(token.lower() in output_lower for token in source_tokens)
        ratio = len(output) / max(len(source), 1)
        length_score = min(ratio / 0.35, 1.0) if ratio < 0.35 else 1.0
        # A decoder that stops before the source sentence boundary is a common
        # silent omission. Prefer a candidate that preserves a terminal mark
        # when both candidates already pass the hard quality gates. This is a
        # ranking signal only; it never makes an otherwise rejected output
        # acceptable.
        source_terminal = bool(re.search(r"[.!?]\s*[\"')\]]*$", source))
        output_terminal = bool(re.search(r"[。！？.!?]\s*$", output))
        terminal_score = 1.0 if source_terminal and output_terminal else 0.0
        source_has_negation = bool(re.search(
            r"\b(?:not|never|without|neither|nor|no|cannot|can't|doesn't|don't|didn't)\b",
            source,
            re.I,
        ))
        output_has_negation = bool(re.search(r"(?:ない|なく|ません|ず|ぬ|無い|無し)", output))
        # Relation preservation is only a ranking signal between candidates
        # that already pass hard quality gates. It must never turn a rejected
        # candidate into an accepted translation.
        negation_score = 1.5 if source_has_negation == output_has_negation else -1.5
        return preserved * 4.0 + length_score + terminal_score + negation_score

    def _translate_chunk_batch(
        self, chunks: list[str], target_language: str, model_inputs: list[str] | None = None
    ) -> tuple[list[str], list[int], list[int]]:
        model_inputs = model_inputs or chunks
        protected_chunks: list[str] = []
        cite_maps: list[tuple[list[str], int, set[int]]] = []
        enumeration_prefixes: list[str] = []
        for model_input in model_inputs:
            prefix, translate_body = self._detach_enumeration_prefix(model_input)
            # Native PDF bullets are layout markers, not translation content.
            # Keep them in the source chunk for deterministic reassembly, but
            # remove them from the model input so decoding starts with prose.
            translate_body = re.sub(r"^[•‣▪∙・]\s+", "", translate_body)
            protected, cites, nonce = protect_citations(
                translate_body,
                # Literal bare superscript markers are more stable than a
                # large set of ZZCIT placeholders in citation-heavy prose;
                # the client invariant gate still requires exact retention.
                unprotected_values=bare_reference_values(translate_body),
            )
            protected_chunks.append(protected)
            cite_maps.append((cites, nonce, terminal_superscript_indices(translate_body)))
            enumeration_prefixes.append(prefix)

        lang_token = f"<2{target_language}>"
        if self._tokenizer.convert_tokens_to_ids(lang_token) == self._tokenizer.unk_token_id:
            raise ValueError(f"Unknown MADLAD language tag: {lang_token}")

        encoded = self._tokenizer(
            [f"{lang_token} {chunk}" for chunk in protected_chunks],
            return_tensors="pt",
            truncation=True,
            max_length=512,
            add_special_tokens=True,
            padding=True,
        )
        encoded = {key: value.to(self._device) for key, value in encoded.items()}
        in_toks = [int(n) for n in encoded["attention_mask"].sum(dim=1).tolist()]
        max_new_tokens = max(
            min(max(token_count * 3 + 24, 48), self.MAX_NEW_TOKENS) for token_count in in_toks
        )
        decoder_start = self._model.config.decoder_start_token_id
        pad_id = self._tokenizer.pad_token_id

        with torch.inference_mode():
            outputs = self._model.generate(
                input_ids=encoded["input_ids"],
                attention_mask=encoded["attention_mask"],
                max_new_tokens=max_new_tokens,
                num_beams=1,
                do_sample=False,
                decoder_start_token_id=decoder_start,
                pad_token_id=pad_id,
                eos_token_id=self._tokenizer.eos_token_id,
                no_repeat_ngram_size=self.NO_REPEAT_NGRAM_SIZE,
            )

        pieces: list[str] = []
        out_toks: list[int] = []
        for i, chunk in enumerate(chunks):
            seq = outputs[i]
            piece = self._tokenizer.decode(seq, skip_special_tokens=True).strip()
            piece = self._restore_byte_escapes(piece)
            cites, nonce, recoverable_terminal_indices = cite_maps[i]
            piece = restore_citations(
                piece,
                cites,
                nonce,
                reject_missing=True,
                recoverable_terminal_indices=recoverable_terminal_indices,
            )
            piece = restore_missing_bare_references(chunk, piece)
            piece = self._restore_numeric_quote_labels(chunk, piece)
            piece = restore_unambiguous_terminal_numeric_citations(chunk, piece)
            missing_visible = missing_visible_numeric_citations(chunk, piece)
            if missing_visible:
                raise ValueError(
                    "visible numeric citation dropped: " + ", ".join(missing_visible)
                )
            if enumeration_prefixes[i]:
                piece = f"{enumeration_prefixes[i]} {piece}".strip()
            if self._is_degenerate(piece, chunk, target_language):
                print(f"[TRANSLATE] Rejected batch chunk ({self._degenerate_reason(piece, chunk, target_language)}): {piece[:120]!r}", flush=True)
                raise ValueError("degenerate translation output")
            print(
                f"[TRANSLATE] batch {in_toks[i]}->{int(seq.shape[0])}: {piece[:120]!r}",
                flush=True,
            )
            pieces.append(piece)
            if pad_id is None:
                out_toks.append(int(seq.shape[0]))
            else:
                out_toks.append(int((seq != pad_id).sum().item()))
        return pieces, in_toks, out_toks

    def _translate_chunk(
        self,
        text: str,
        target_language: str,
        model_input: str | None = None,
        num_beams: int = 1,
        retry_label: str = "",
        unprotected_values: set[str] | None = None,
    ) -> tuple[str, int, int]:
        enumeration_prefix, translate_body = self._detach_enumeration_prefix(model_input or text)
        translate_body = re.sub(r"^[•‣▪∙・]\s+", "", translate_body)
        recoverable_terminal_indices = terminal_superscript_indices(
            translate_body,
            unprotected_values=unprotected_values,
        )
        if os.environ.get("MADLAD_DISABLE_PROTECTION") == "1":
            # Diagnostic-only A/B switch. Never enable in production: the
            # normal path protects citations/scientific tokens before decode.
            protected, cites, nonce = translate_body, [], 0
        else:
            protected, cites, nonce = protect_citations(
                translate_body,
                unprotected_values=(unprotected_values or set())
                | bare_reference_values(translate_body),
            )
        inputs = self._encode_translation_inputs(protected, target_language)
        input_tokens = inputs["input_ids"].shape[1]
        max_new_tokens = min(max(input_tokens * 3 + 24, 48), self.MAX_NEW_TOKENS)
        decoder_start = self._model.config.decoder_start_token_id

        with torch.inference_mode():
            outputs = self._model.generate(
                input_ids=inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                max_new_tokens=max_new_tokens,
                num_beams=num_beams,
                do_sample=False,
                decoder_start_token_id=decoder_start,
                pad_token_id=self._tokenizer.pad_token_id,
                eos_token_id=self._tokenizer.eos_token_id,
                no_repeat_ngram_size=self.NO_REPEAT_NGRAM_SIZE,
                early_stopping=True if num_beams > 1 else False,
            )

        translated_text = self._tokenizer.decode(
            outputs[0],
            skip_special_tokens=True,
        ).strip()
        if os.getenv("TRANSLATION_UNIT_DEBUG") == "1":
            # Keep decode-time evidence separate from the restored result. This
            # is intentionally opt-in: normal runs must not emit full paper
            # text, while investigations need to distinguish model corruption
            # from placeholder restoration or quality-gate rejection.
            print(
                f"[TRANSLATION_DECODE] input={protected!r} raw={translated_text!r} "
                f"citations={cites!r} nonce={nonce}",
                flush=True,
            )
        translated_text = self._restore_byte_escapes(translated_text)
        translated_text = restore_citations(
            translated_text,
            cites,
            nonce,
            reject_missing=True,
            recoverable_terminal_indices=recoverable_terminal_indices,
        )
        translated_text = restore_missing_bare_references(text, translated_text)
        translated_text = self._restore_numeric_quote_labels(text, translated_text)
        translated_text = restore_unambiguous_terminal_numeric_citations(translate_body, translated_text)
        missing_visible = missing_visible_numeric_citations(translate_body, translated_text)
        if missing_visible:
            raise ValueError(
                "visible numeric citation dropped: " + ", ".join(missing_visible)
            )
        if os.getenv("TRANSLATION_UNIT_DEBUG") == "1":
            print(f"[TRANSLATION_RESTORED] text={translated_text!r}", flush=True)
        if enumeration_prefix:
            translated_text = f"{enumeration_prefix} {translated_text}".strip()
        if self._is_degenerate(translated_text, text, target_language):
            label = f" {retry_label}" if retry_label else ""
            print(f"[TRANSLATE] Rejected{label} chunk ({self._degenerate_reason(translated_text, text, target_language)}): {translated_text[:120]!r}", flush=True)
            raise ValueError("degenerate translation output")
        label = f" {retry_label}" if retry_label else ""
        print(f"[TRANSLATE]{label} chunk {input_tokens}->{outputs.shape[1]}: {translated_text[:120]!r}", flush=True)
        return translated_text, input_tokens, int(outputs.shape[1])

    @staticmethod
    def _restore_byte_escapes(text: str) -> str:
        """Decode contiguous UTF-8 byte tokens emitted by the tokenizer."""
        pattern = re.compile(r"(?:<0x[0-9A-Fa-f]{2}>)+")

        def replace(match: re.Match[str]) -> str:
            values = re.findall(r"<0x([0-9A-Fa-f]{2})>", match.group(0))
            try:
                return bytes(int(value, 16) for value in values).decode("utf-8")
            except UnicodeDecodeError:
                return match.group(0)

        return pattern.sub(replace, text)

    @staticmethod
    def _detach_enumeration_prefix(text: str) -> tuple[str, str]:
        """Keep a leading inline-list ordinal out of greedy decoding.

        The segmenter splits a flattened `(1) …; (2) …` list into units.  If
        MADLAD sees the ordinal, it can autoregressively invent `(4)` through
        `(13)`.  The ordinal is source structure, so send only its prose body
        and restore the exact prefix after decoding.
        """
        match = re.match(r"^(\(\d{1,2}\))\s+(.+)$", text.strip())
        if not match:
            return "", text
        return match.group(1), match.group(2)

    def _verify_madlad_embeddings(self) -> None:
        """Fail closed unless the pinned runtime loaded MADLAD input embeddings intact."""
        encoder = self._model.encoder.embed_tokens.weight.detach()
        decoder = self._model.decoder.embed_tokens.weight.detach()
        shared = self._model.shared.weight.detach()
        head = self._model.lm_head.weight.detach()
        if self._model.config.tie_word_embeddings:
            raise RuntimeError("MADLAD checkpoint requires tie_word_embeddings=False")
        if not torch.equal(encoder, decoder) or not torch.equal(shared, decoder):
            raise RuntimeError("MADLAD encoder/shared embeddings do not match decoder input embeddings")
        if encoder.data_ptr() == head.data_ptr():
            raise RuntimeError("MADLAD encoder embeddings are incorrectly tied to lm_head")
        input_max = encoder.float().abs().max().item()
        head_max = head.float().abs().max().item()
        if input_max < 10 or head_max >= input_max:
            raise RuntimeError(
                f"MADLAD embedding integrity check failed (input={input_max:.2f}, lm_head={head_max:.2f})"
            )
        print(
            f"[LOADING] embedding integrity verified: encoder==decoder=True, "
            f"input absmax={input_max:.2f}, lm_head absmax={head_max:.2f}, separate=True",
            flush=True,
        )

    def _encode_translation_inputs(
        self, text: str, target_language: str
    ) -> dict[str, torch.Tensor]:
        lang_token = f"<2{target_language}>"
        if self._tokenizer.convert_tokens_to_ids(lang_token) == self._tokenizer.unk_token_id:
            raise ValueError(f"Unknown MADLAD language tag: {lang_token}")

        encoded = self._tokenizer(
            f"{lang_token} {text}",
            return_tensors="pt",
            truncation=True,
            max_length=512,
            add_special_tokens=True,
            padding=False,
        )
        return {k: v.to(self._device) for k, v in encoded.items()}

    @staticmethod
    def _has_abnormal_phrase_repetition(output: str) -> bool:
        """Detect repeated fluent Japanese phrases without a word blacklist."""
        compact = "".join(re.findall(r"[\u3040-\u30ff\u4e00-\u9fff\d]", output))
        if len(compact) < 36:
            return False
        # Repeated kanji alone are common in Japanese academic prose (e.g.
        # 評価/的/性). Treating one frequent character as repetition produced
        # false rejects on otherwise readable translations. Require a repeated
        # multi-character phrase below; the existing repeated-character guard
        # still catches degenerate character loops.
        for phrase_size in (4, 5):
            counts: dict[str, int] = {}
            for index in range(len(compact) - phrase_size + 1):
                phrase = compact[index : index + phrase_size]
                counts[phrase] = counts.get(phrase, 0) + 1
            # A technical noun or collocation can legitimately occur twice in
            # a short academic paragraph. Require three occurrences before
            # treating the phrase as decoder looping; this matches the
            # frontend quality gate and avoids rejecting valid repetition such
            # as 「広告パケット」 in adjacent Bluetooth sentences.
            if any(
                count >= 3
                and (phrase_size * count) / len(compact) >= 0.16
                # Repeated katakana modifiers in a comma-separated inventory
                # are list structure, not decoder looping.
                and not (re.fullmatch(r"[\u30a0-\u30ff]+", phrase) and len(re.findall(r"[,、]", output)) >= 2)
                for phrase, count in counts.items()
            ):
                return True
        return False

    @staticmethod
    def _repetition_shape_allowed(source: str, output: str) -> bool:
        """Allow repetition that mirrors an explicit comparative result list.

        Statistical prose commonly repeats ``less``/``more`` for each item in
        a list. A Japanese rendering repeats the predicate as well, which can
        look like a decoder loop to a source-agnostic n-gram detector. This
        relaxation is gated by source structure and sentence-level Japanese;
        it does not weaken repetition, placeholder, or fact checks elsewhere.
        """
        comparative_count = len(re.findall(r"\b(?:less|more|higher|lower|greater|smaller)\b", source, re.I))
        return comparative_count >= 3 and bool(re.search(r"[。！？]", output))

    @staticmethod
    def _has_translation_instruction_contamination(output: str) -> bool:
        """Detect a generated prompt/example appended after translated prose.

        This is deliberately a format marker check, rather than a blacklist of
        content words.  Requiring the marker to occur after some output avoids
        rejecting a source sentence that happens to discuss translation.
        """
        marker = re.compile(
            r"(?:次の(?:英語|英文)(?:の学術テキスト)?を日本語に翻訳してください|"
            r"英語(?:の)?学術テキストを日本語に翻訳|"
            r"translate the following (?:english )?(?:academic )?text|"
            r"output only the japanese translation)",
            re.IGNORECASE,
        )
        match = marker.search(output)
        return match is not None and match.start() > 0

    @staticmethod
    def _has_adjacent_repeated_latin_token(output: str) -> bool:
        """Detect placeholder restoration or decode glue duplicating a token."""
        return bool(re.search(r"(?<![A-Za-z])([A-Za-z]{3,})\1(?![A-Za-z])", output, re.IGNORECASE))

    @staticmethod
    def _has_corrupted_identifier_glue(source: str, output: str) -> bool:
        """Catch mutated protected acronym compounds such as ``RTz+CTz``.

        The check is structural: it only runs when the source contains an
        uppercase experimental compound and looks for an impossible lowercase
        glue suffix on the same uppercase pieces. It does not name a domain or
        reject ordinary ``z`` variables.
        """
        compounds = re.findall(r"(?<![A-Za-z0-9])[A-Z]{2,}\s*[+/&]\s*[A-Z]{2,}(?![A-Za-z0-9])", source)
        if not compounds:
            return False
        return bool(re.search(r"(?<![A-Za-z0-9])[A-Z]{2,}z\s*[+/&]\s*[A-Z]{2,}z(?![A-Za-z0-9])", output))

    @staticmethod
    def _has_unsupported_numbered_enumeration(output: str, source: str) -> bool:
        """Detect a decoder inventing a numbered list absent from the source.

        This is a retry trigger, not a content blacklist.  Academic prose can
        contain ordinary numbers, so require three or more explicit list
        markers in the output and fewer than two such markers in the source.
        The subsequent rescue pass translates smaller semantic units before
        the client-side invariant gate makes the final decision.
        """
        # Academic prose commonly writes enumerations as ``(1) ... (2) ...``;
        # count those as source markers too so a translation that preserves
        # the numbered claims is not mistaken for an invented list.
        source_markers = len(re.findall(r"(?:^|[\n\s,(（])\d{1,2}[.)](?=\s|[^\d])", source))
        output_markers = len(re.findall(r"(?:^|[\n\s,、(（])\d{1,2}[.)](?=\s|[^\d])", output))
        return source_markers < 2 and output_markers >= 3

    @staticmethod
    def _has_unsupported_inventory(output: str, source: str) -> bool:
        """Detect a decode that invents a long comma-separated inventory.

        A short prose claim can occasionally drift into a fluent list even
        though the source contains no list (for example, two reasons becoming
        a catalogue of unrelated factors).  Compare structural separators,
        rather than matching any domain term.  Requiring a large gap keeps
        ordinary translated lists and Japanese comma usage unaffected.
        """
        source_separators = len(re.findall(r"[,;、；]", source))
        output_separators = len(re.findall(r"[,、;；]", output))
        return source_separators <= 2 and output_separators >= 8

    @staticmethod
    def _has_missing_section_marker(output: str, source: str) -> bool:
        """Reject a translated block that drops its leading section marker.

        Numbered headings/subheadings are structural facts. If a block starts
        with a marker such as ``4.3.1`` and the decode omits that marker, the
        translated text can no longer be placed reliably in the document
        hierarchy. This is deliberately limited to a marker at the source
        start; ordinary numeric prose remains untouched.
        """
        marker = re.match(r"^\s*(\d+(?:\.\d+)+)\b", source)
        if not marker:
            return False
        return not re.search(rf"(?<!\d){re.escape(marker.group(1))}(?!\d)", output)

    @staticmethod
    def _missing_contextual_count(source: str, output: str) -> str | None:
        """Return a missing multi-digit study/participant count.

        A fluent decode that drops a screening total or participant count is
        unsafe even when the remaining numbers survive. Keep this deliberately
        narrow: require a 3+ digit count adjacent to an academic count noun,
        and compare exact digits after normalizing comma grouping.
        """
        source_counts = re.findall(
            r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{3,})(?=\s*(?:stud(?:y|ies)|participant|subject|sample|record|article|paper)s?\b)",
            source,
            re.I,
        )
        if not source_counts:
            return None
        output_digits = {value.replace(",", "") for value in re.findall(r"\d[\d,]*", output)}
        for value in source_counts:
            if value.replace(",", "") not in output_digits:
                return value
        return None

    @staticmethod
    def _has_unexpected_contextual_number(source: str, output: str) -> str | None:
        """Detect a new 3+ digit number in count-heavy research prose."""
        source_numbers = {
            value.replace(",", "")
            for value in re.findall(r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{3,})", source)
        }
        contextual = re.findall(
            r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{3,})(?=\s*(?:stud(?:y|ies)|participant|subject|sample|record|article|paper)s?\b)",
            source,
            re.I,
        )
        if len(contextual) < 2:
            return None
        for value in re.findall(r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{3,})(?![\d.,])", output):
            if value.replace(",", "") not in source_numbers:
                return value
        return None

    @staticmethod
    def _has_collapsed_measurement_labels(source: str, output: str) -> bool:
        """Detect distinct source labels collapsing onto one translated label.

        Academic prose often contrasts measurements such as ``75% lean`` and
        ``25% fat``.  Numeric invariant checks alone cannot catch a polarity
        inversion when both numbers survive.  Compare only paired numeric
        labels in the source and the short output windows immediately after
        the same numbers; this is structural and does not blacklist words.
        """
        source_items = list(re.finditer(r"(?P<num>\d+(?:\.\d+)?%)\s+(?P<label>[A-Za-z][A-Za-z-]*)", source))
        if len(source_items) < 2:
            return False
        for left_index, left in enumerate(source_items):
            for right in source_items[left_index + 1:]:
                if right.start() - left.end() > 240 or left.group("label").lower() == right.group("label").lower():
                    continue
                output_labels: list[str] = []
                for item in (left, right):
                    number = item.group("num")
                    match = re.search(
                        re.escape(number) +
                        r"\s*([^。！？.!?;,、；:]{1,24}?)(?=と|で|に|を|は|が|[,、。！？.!?]|$)",
                        output,
                    )
                    if not match:
                        output_labels = []
                        break
                    label = re.sub(r"[\s\d%]+", "", match.group(1)).strip("()[]")
                    output_labels.append(label)
                if len(output_labels) == 2 and output_labels[0] and output_labels[0] == output_labels[1]:
                    return True
        return False

    @staticmethod
    def _has_inconsistent_repeated_measurement_labels(source: str, output: str) -> bool:
        """Reject drift when one numeric condition receives two labels.

        A repeated source condition such as `75% lean ... 75% lean` should
        retain one stable translated label. Different output labels indicate
        polarity/scope drift even when every number survives.
        """
        source_items = re.findall(r"(\d+(?:\.\d+)?%)\s+[A-Za-z][A-Za-z-]*", source)
        counts = {value: source_items.count(value) for value in set(source_items)}
        repeated = {value for value, count in counts.items() if count >= 2}
        if not repeated:
            return False
        for number in repeated:
            labels = re.findall(
                re.escape(number) + r"\s*(?:[\"'“”「」])?"
                r"([A-Za-z][A-Za-z-]*|[\u3040-\u30ff\u4e00-\u9fff]{1,8})",
                output,
            )
            if len(labels) >= 2 and len({label.lower() for label in labels[:2]}) > 1:
                return True
        return False

    @staticmethod
    def _restore_numeric_quote_labels(source: str, output: str) -> str:
        """Keep paired numeric experimental labels exact when decoding drifts.

        Quoted stimuli such as ``"75% lean"`` / ``"25% fat"`` are data
        conditions, not ordinary prose. When a decoder preserves the numbers
        but mistranslates the labels, retaining the source labels is safer and
        still readable in an academic translation. This is structural (quoted
        numeric spans), not a vocabulary blacklist.
        """
        spans = re.findall(r"[\u201c\"'](\d+(?:\.\d+)?%\s+[A-Za-z][A-Za-z-]*)(?:[.!?])?[\u201d\"']", source)
        source_items = re.findall(r"(\d+(?:\.\d+)?%)\s+([A-Za-z][A-Za-z-]*)", source)
        if len(spans) < 1 and len(source_items) < 2:
            return output
        repaired = output
        for span in spans:
            number = re.match(r"\d+(?:\.\d+)?%", span)
            if not number:
                continue
            quoted = re.compile(
                r"([\u201c\"'「]\s*" + re.escape(number.group(0))
                + r"\s*)([^\u201d\"'」]{1,32})([\u201d\"'」])"
            )
            label = span[len(number.group(0)):].lstrip()
            repaired = quoted.sub(lambda match, value=label: match.group(1).rstrip() + " " + value + match.group(3), repaired, count=1)
        # The same condition is often mentioned again outside quotes. Keep
        # that repeated label consistent as well; otherwise one occurrence
        # can drift to a different polarity while all numeric invariants pass.
        for number, label in source_items:
            if sum(item[0] == number for item in source_items) < 2:
                continue
            repeated = re.compile(
                re.escape(number) + r"(\s*)([A-Za-z][A-Za-z-]*|[\u3040-\u30ff\u4e00-\u9fff]{1,8}?)(?=[とにをはがで、。,.!?]|$)"
            )
            def replace_label(match: re.Match[str], desired: str = label) -> str:
                current = match.group(2)
                if current in {"の", "に", "を", "は", "が", "で", "と"}:
                    return match.group(0)
                return f"{number} {desired}"
            repaired = repeated.sub(replace_label, repaired)
        return repaired

    @staticmethod
    def _is_degenerate(output: str, source: str, target_language: str) -> bool:
        compact = "".join(output.split())
        if not compact:
            return True
        if re.search(r"(.)\1{7,}", compact):
            return True
        if re.search(r"[\u0e00-\u0e7f]", output):
            return True
        if target_language == "ja" and SIMPLIFIED_CJK_CONTAMINATION.search(output):
            return True
        # MADLAD occasionally inserts a single Korean syllable into an
        # otherwise fluent Japanese sentence. Japanese output may contain
        # Latin identifiers, but Hangul is never a valid Japanese translation
        # span; reject it before it becomes reader-visible.
        if target_language == "ja" and re.search(r"[\uac00-\ud7af]", output):
            return True
        counts: dict[str, int] = {}
        for ch in compact:
            counts[ch] = counts.get(ch, 0) + 1
        if len(compact) >= 16 and max(counts.values()) / len(compact) > 0.4:
            return True
        if target_language == "ja":
            has_kana = bool(re.search(r"[\u3040-\u30ff]", output))
            has_kanji = bool(re.search(r"[\u4e00-\u9fff]", output))
            if not has_kana and not has_kanji:
                return True
            if len(source) >= 40 and has_kanji and not has_kana:
                return True
            if MADLADEngine._latin_ratio_beyond_source(output, source) > 0.45:
                return True
            if re.search(r"\d{4}-\d{2}-\d{2}", output) and not re.search(
                r"\d{4}-\d{2}-\d{2}", source
            ):
                return True
            # Diagnostic-only bypass used by protection/gate attribution
            # benchmarks. Production keeps the conservative rejection.
            if os.getenv("MADLAD_DIAGNOSTIC_ALLOW_SHORT") != "1" and MADLADEngine._is_implausibly_short_unit(output, source):
                return True
            if MADLADEngine._contains_untranslated_source_span(output, source):
                return True
            if MADLADEngine._has_translation_instruction_contamination(output):
                return True
            if MADLADEngine._has_adjacent_repeated_latin_token(output):
                return True
            if MADLADEngine._has_corrupted_identifier_glue(source, output):
                return True
            if MADLADEngine._has_abnormal_phrase_repetition(output) and not MADLADEngine._repetition_shape_allowed(source, output):
                return True
            if MADLADEngine._has_unsupported_numbered_enumeration(output, source):
                return True
            if MADLADEngine._has_unsupported_inventory(output, source):
                return True
            if MADLADEngine._has_missing_section_marker(output, source):
                return True
            if MADLADEngine._missing_contextual_count(source, output):
                return True
            if MADLADEngine._has_unexpected_contextual_number(source, output):
                return True
            if MADLADEngine._has_collapsed_measurement_labels(source, output):
                return True
            if MADLADEngine._has_inconsistent_repeated_measurement_labels(source, output):
                return True
        return False

    @staticmethod
    def _degenerate_reason(output: str, source: str, target_language: str) -> str:
        """Return a compact diagnostic label without changing acceptance."""
        compact = "".join(output.split())
        if not compact:
            return "empty"
        if re.search(r"<0x[0-9a-f]{2}>", output, re.I):
            return "byte_escape"
        if target_language == "ja" and re.search(r"[\uac00-\ud7af]", output):
            return "foreign_script:hangul"
        if target_language == "ja" and SIMPLIFIED_CJK_CONTAMINATION.search(output):
            return "foreign_script:simplified_cjk"
        if re.search(r"(.)\1{7,}", compact):
            return "character_repetition"
        if MADLADEngine._has_unsupported_numbered_enumeration(output, source):
            return "unsupported_numbered_enumeration"
        if MADLADEngine._has_unsupported_inventory(output, source):
            return "unsupported_inventory"
        if MADLADEngine._has_corrupted_identifier_glue(source, output):
            return "corrupted_identifier_glue"
        if MADLADEngine._has_missing_section_marker(output, source):
            return "missing_section_marker"
        missing_count = MADLADEngine._missing_contextual_count(source, output)
        if missing_count:
            return f"missing_contextual_count:{missing_count}"
        unexpected_count = MADLADEngine._has_unexpected_contextual_number(source, output)
        if unexpected_count:
            return f"unexpected_contextual_number:{unexpected_count}"
        if MADLADEngine._has_collapsed_measurement_labels(source, output):
            return "collapsed_measurement_labels"
        if MADLADEngine._has_inconsistent_repeated_measurement_labels(source, output):
            return "inconsistent_repeated_measurement_labels"
        if os.getenv("MADLAD_DIAGNOSTIC_ALLOW_SHORT") != "1" and MADLADEngine._is_implausibly_short_unit(output, source):
            return "implausibly_short"
        if MADLADEngine._contains_untranslated_source_span(output, source):
            return "source_span"
        if MADLADEngine._has_translation_instruction_contamination(output):
            return "instruction_contamination"
        if MADLADEngine._has_adjacent_repeated_latin_token(output):
            return "adjacent_repeated_latin_token"
        if MADLADEngine._has_abnormal_phrase_repetition(output) and not MADLADEngine._repetition_shape_allowed(source, output):
            return "phrase_repetition"
        if target_language == "ja" and not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", output):
            return "no_japanese_script"
        return "quality_guard"

    @staticmethod
    def _normalize_for_source_overlap(text: str) -> str:
        return (
            text.lower()
            .replace("\u2018", "'")
            .replace("\u2019", "'")
            .replace("\u201c", '"')
            .replace("\u201d", '"')
            .replace("\u2013", "-")
            .replace("\u2014", "-")
            .replace("\u2212", "-")
        )

    @staticmethod
    def _source_spans_for_overlap(source: str) -> list[str]:
        normalized = re.sub(r"\s+", " ", source).strip()
        spans = re.findall(r"[^.!?]+[.!?]+(?:[\"')\]]+)?|[^.!?]+$", normalized) or [normalized]
        candidates: list[str] = []
        for span in spans:
            text = span.strip()
            if not text:
                continue
            candidates.append(text)
            for part in re.split(r"[,;:]\s+", text):
                clause = part.strip()
                if clause and clause != text:
                    candidates.append(clause)
        return candidates

    @staticmethod
    def _contains_untranslated_source_span(output: str, source: str) -> bool:
        normalized_output = re.sub(
            r"\s+",
            " ",
            MADLADEngine._normalize_for_source_overlap(output),
        ).strip()
        if not normalized_output:
            return False
        # Citations and scientific identifiers are restored verbatim after
        # decoding. Remove those exact protected spans before searching for
        # untranslated prose so an author-year citation does not look like a
        # model echo of the source sentence.
        _, protected_spans, _ = protect_citations(source)
        for span in protected_spans:
            normalized_span = re.sub(
                r"\s+",
                " ",
                MADLADEngine._normalize_for_source_overlap(span),
            ).strip()
            if normalized_span:
                normalized_output = normalized_output.replace(normalized_span, " ")
        # Detect a decoder appending only the prefix of a source identifier
        # (for example ``GPT`` from ``GPT-3``) after a complete Japanese
        # sentence. This catches orphaned source fragments without a
        # paper-specific blacklist.
        trailing = re.search(r"([A-Za-z][A-Za-z0-9]*)\s*(?:[。！？.!?]|$)", output)
        if trailing:
            tail = trailing.group(1).lower()
            source_tokens = re.findall(r"[A-Za-z][A-Za-z0-9]*(?:[-'][A-Za-z0-9]+)+", source)
            if any(token.lower().startswith(tail) and token.lower() != tail for token in source_tokens):
                return True
        for candidate in MADLADEngine._source_spans_for_overlap(source):
            normalized_candidate = re.sub(
                r"\s+",
                " ",
                MADLADEngine._normalize_for_source_overlap(candidate),
            ).strip()
            word_count = len(re.findall(r"[a-z][a-z'-]*", normalized_candidate))
            letter_count = len(re.findall(r"[a-z]", normalized_candidate))
            if len(normalized_candidate) < 48 or word_count < 7 or letter_count < 35:
                continue
            if re.match(r"^(?:fig(?:ure)?|table)\s+\d+", candidate, re.I):
                continue
            if normalized_candidate in normalized_output:
                return True
        return False

    @staticmethod
    def _is_implausibly_short_unit(output: str, source: str) -> bool:
        """Reject a sentence-sized decode that cannot represent its source.

        Paragraph-level length checks hide an omitted unit when surrounding
        sentences translate normally.  This only applies to a substantial
        natural-language unit: equations, captions, identifiers, and short
        labels remain outside the rule.  It intentionally chooses original
        source over a fluent Japanese summary when a decoder drops most of a
        complete research claim.
        """
        source_compact = "".join(source.split())
        output_compact = "".join(output.split())
        words = re.findall(r"[A-Za-z]{2,}", source)
        has_multiple_sentences = len(re.findall(r"[.!?][\"”’')\]]*\s+[A-Z(]", source)) >= 1
        citation_count = len(re.findall(
            r"\([A-Z][A-Za-z'’-]+(?:\s+et\s+al\.?)?,?\s+\d{4}[a-z]?[^)]*\)",
            source,
        ))
        has_negative_explanatory_as = bool(
            re.search(
                r"\bas\s+(?:they|it|this|these|the\s+\w+)\s+"
                r"(?:are|is|was|were|do|does|did|has|have)\s+not\b",
                source,
                re.I,
            )
        )
        # A complete research sentence with at least 18 English words should
        # not collapse to a one-clause Japanese summary. The audited rLPFC
        # result sentence was 114 compact characters and lost its entire
        # ``even ...`` qualification at a 0.263 ratio; a later real-paper
        # result sentence omitted its final contrast at 0.275. Checking at
        # unit scope with this narrow 0.28 boundary preserves both cases
        # lets the scheduler preserve the original instead of accepting that
        # fluent omission. The threshold is intentionally limited to prose
        # with both a meaningful word count and a non-trivial source length.
        if (len(source_compact) < 110 and not has_negative_explanatory_as) or (
            len(words) < 18 and not (has_multiple_sentences and len(source_compact) >= 180)
        ):
            return False
        ratio_source = source_compact
        # Academic prose often wraps a complete claim in a reporting frame such
        # as “Among other things they found that …”.  A rescue retry may produce
        # a faithful translation of the claim while naturally omitting that
        # discourse frame, which should not force an English source fallback.
        # Do not discount the frame when the source still contains a coordinated
        # `and that` claim: in that shape the same low ratio can mean one of two
        # findings was omitted, which is unsafe to accept.
        if not re.search(r"\band\s+that\b", source, re.I):
            adjusted = re.sub(
                r"^(?:among\s+other\s+things\s+)?(?:they|we|the\s+authors|researchers)\s+found\s+that\s+",
                "",
                source,
                flags=re.I,
            )
            ratio_source = "".join(adjusted.split())
        # Japanese can express a compact, complete academic sentence in far
        # fewer characters than English.  Keep the stricter 0.28 floor for
        # long units (where omitted qualifications are common), but avoid
        # rejecting a substantive 110–179 character sentence solely because
        # its faithful Japanese rendering is compact.
        has_qualification = bool(
            re.search(
                r"\b(?:because|although|though|while|whereas|even|unless|if)\b"
                r"|\bas\s+(?:they|it|this|these|the\s+\w+)\s+"
                r"(?:are|is|was|were|do|does|did|has|have)\s+not\b",
                source,
                re.I,
            )
        )
        # Multi-sentence units carry independent claims. A compact decode of
        # only the final clause can look fluent while omitting the first claim
        # (common when a PDF list marker is present). Keep the stricter floor
        # for substantial multi-sentence units without changing short-label
        # behavior.
        floor = (
            0.42
            if has_negative_explanatory_as and len(ratio_source) < 180
            else 0.40
            if citation_count >= 3 and len(ratio_source) >= 250
            else 0.35 if has_multiple_sentences and len(ratio_source) >= 180
            else 0.21 if len(ratio_source) < 180 and not has_qualification else 0.28
        )
        return len(output_compact) / max(1, len(ratio_source)) < floor

    @staticmethod
    def _latin_ratio_beyond_source(output: str, source: str) -> float:
        """Ignore source proper nouns when checking a Japanese translation."""
        stripped = output
        source_tokens = sorted(
            set(re.findall(r"[A-Za-z]{2,}", source)), key=len, reverse=True
        )
        for token in source_tokens:
            stripped = re.sub(re.escape(token), "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\d+(?:\.\d+)*", "", stripped)
        compact = "".join(stripped.split())
        if len(compact) < 8:
            return 0.0
        return len(re.findall(r"[A-Za-z]", compact)) / len(compact)

    def get_status(self) -> EngineStatus:
        """Get the current status of the engine."""
        device_str = str(self._device) if self._device else "not initialized"

        return EngineStatus(
            available=True,
            model_loaded=self._model_loaded,
            model_name=self.MODEL_ID,
            model_version=self.MODEL_VERSION,
            device=device_str,
        )

    @property
    def model_name(self) -> str:
        return self.MODEL_ID

    @property
    def model_version(self) -> str:
        return self.MODEL_VERSION


# Singleton instance for reuse
_engine_instance: Optional[MADLADEngine] = None


def get_engine() -> MADLADEngine:
    """Get the singleton MADLAD engine instance."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = MADLADEngine()
    return _engine_instance
