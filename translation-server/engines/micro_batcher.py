"""Coalesce independent MADLAD chunks from concurrent /translate calls.

One worker thread runs model.generate(). Requests are never generate()-parallel.
"""

from __future__ import annotations

import os
import re
import hashlib
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Optional

from .base import TranslationResult
from .citation_protect import protect_citations
from .segmenter import is_probable_panel_fragment, segment_for_translation
from .madlad_mps import MADLADEngine, get_engine, restore_missing_structure_references


@dataclass
class _Pending:
    text: str
    source_language: str
    target_language: str
    translate_body: str
    heading_num: str | None
    future: Future
    queued_at: float
    request_index: int = -1


class MicroBatchScheduler:
    def __init__(self, engine: MADLADEngine):
        self._engine = engine
        self._window_ms = max(0, int(os.environ.get("MADLAD_MICROBATCH_MS", "25")))
        self._enabled = os.environ.get("MADLAD_MICROBATCH", "1") != "0"
        self._debug = os.environ.get("MADLAD_BATCH_DEBUG", "0") == "1"
        self._unit_debug = os.environ.get("TRANSLATION_UNIT_DEBUG", "0") == "1"
        self._cond = threading.Condition()
        self._flush_lock = threading.Lock()
        self._queue: list[_Pending] = []
        self._thread: threading.Thread | None = None
        self._stop = False

    @staticmethod
    def _fallback_reason(error: Exception) -> str:
        message = str(error).lower()
        if "protected citation placeholder dropped" in message:
            reason = "protected_token_restore_failed"
        elif "degenerate" in message or "no_japanese_script" in message:
            reason = "translation_quality_rejected"
        else:
            reason = "engine_exception"
        return f"{reason}:{type(error).__name__}"

    def start(self) -> None:
        if not self._enabled:
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, name="madlad-microbatch", daemon=True)
        self._thread.start()

    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        if not self._enabled:
            return self._engine.translate(text, source_language, target_language)

        named = MADLADEngine._format_named_work_heading(text)
        if named and target_language == "ja":
            return self._named_result(named, text, source_language, target_language)

        translate_body, heading_num = self._strip_heading(text, target_language)

        future: Future = Future()
        pending = _Pending(
            text=text,
            source_language=source_language,
            target_language=target_language,
            translate_body=translate_body,
            heading_num=heading_num,
            future=future,
            queued_at=time.time(),
        )
        self.start()
        with self._cond:
            self._queue.append(pending)
            self._cond.notify()
        return future.result()

    def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
    ) -> list[TranslationResult]:
        """Pack a known list of paragraphs in one flush (import / batch API)."""
        if not texts:
            return []
        if not self._enabled or len(texts) == 1:
            return [
                self.translate(text, source_language, target_language) for text in texts
            ]
        pending: list[_Pending] = []
        done: dict[int, TranslationResult] = {}
        for i, text in enumerate(texts):
            named = MADLADEngine._format_named_work_heading(text)
            if named and target_language == "ja":
                done[i] = self._named_result(
                    named, text, source_language, target_language
                )
                continue
            body, heading_num = self._strip_heading(text, target_language)
            pending.append(
                _Pending(
                    text=text,
                    source_language=source_language,
                    target_language=target_language,
                    translate_body=body,
                    heading_num=heading_num,
                    future=Future(),
                    queued_at=time.time(),
                    request_index=i,
                )
            )
        flushed = self._flush_items(pending) if pending else []
        by_index: dict[int, TranslationResult] = dict(done)
        for item, result in zip(pending, flushed):
            if result is None:
                item.future.result()
            by_index[item.request_index] = result
        return [by_index[i] for i in range(len(texts))]

    @staticmethod
    def _named_result(
        named: str, text: str, source_language: str, target_language: str
    ) -> TranslationResult:
        return TranslationResult(
            text=named,
            source_language=source_language,
            target_language=target_language,
            model=MADLADEngine.MODEL_ID,
            model_version=MADLADEngine.MODEL_VERSION,
            input_chars=len(text),
            output_chars=len(named),
            input_tokens=0,
            output_tokens=0,
            translation_time_ms=0.0,
        )

    @staticmethod
    def _strip_heading(text: str, target_language: str) -> tuple[str, str | None]:
        heading = re.match(
            r"^(?P<num>\d+(?:\.\d+)*)[.)]\s+(?P<rest>.+)$",
            " ".join(text.split()).strip(),
        )
        if (
            target_language == "ja"
            and heading
            and len(heading.group("rest")) <= 80
            and heading.group("rest").count(".") == 0
        ):
            return heading.group("rest"), heading.group("num")
        return text, None

    def _loop(self) -> None:
        while not self._stop:
            with self._cond:
                while not self._queue and not self._stop:
                    self._cond.wait()
                if self._stop:
                    return
                if self._window_ms > 0:
                    deadline = time.monotonic() + self._window_ms / 1000.0
                    while time.monotonic() < deadline:
                        self._cond.wait(timeout=max(0.0, deadline - time.monotonic()))
                items = self._queue
                self._queue = []
            try:
                self._flush_items(items)
            except Exception as exc:
                for item in items:
                    if not item.future.done():
                        item.future.set_exception(exc)

    def _flush_items(self, items: list[_Pending]) -> list[TranslationResult | None]:
        if not items:
            return []
        with self._flush_lock:
            return self._flush_items_locked(items)

    @staticmethod
    def _language_groups(items: list[_Pending]) -> list[list[_Pending]]:
        groups: dict[tuple[str, str], list[_Pending]] = {}
        order: list[tuple[str, str]] = []
        for item in items:
            key = (item.source_language, item.target_language)
            if key not in groups:
                order.append(key)
                groups[key] = []
            groups[key].append(item)
        return [groups[key] for key in order]

    def _flush_items_locked(self, items: list[_Pending]) -> list[TranslationResult | None]:
        if not items:
            return []
        engine = self._engine
        if not engine._model_loaded:
            engine.load_model()

        by_id: dict[int, TranslationResult | None] = {}
        for group in self._language_groups(items):
            try:
                group_results = self._translate_language_group(group)
            except Exception as batch_error:
                # A malformed or unusually long paragraph can make one packed
                # generate() fail. Do not fail every concurrent request with
                # it: keep normal batches fast, then isolate the offending
                # item with single-request retries.
                print(
                    f"[MICROBATCH] packed batch failed; retrying {len(group)} item(s) individually: {batch_error}",
                    flush=True,
                )
                group_results = []
                for item in group:
                    try:
                        group_results.append(self._translate_language_group([item])[0])
                    except Exception as item_error:
                        # A single degenerate decode must not turn an entire
                        # import batch into HTTP 500. Returning the source lets
                        # the existing client quality gate preserve original
                        # text for this item while other items still finish.
                        group_results.append(self._original_result(
                            item,
                            f"item_retry_failed:{self._fallback_reason(item_error)}",
                            "whole_item_fallback",
                        ))
                        if not item.future.done():
                            item.future.set_result(group_results[-1])
            for item, result in zip(group, group_results):
                by_id[id(item)] = result
        return [by_id[id(item)] for item in items]

    def _translate_language_group(
        self, items: list[_Pending]
    ) -> list[TranslationResult | None]:
        if not items:
            return []
        t0 = time.time()
        engine = self._engine
        target_language = items[0].target_language

        spans: list[tuple[_Pending, list[str], list[str]]] = []
        for item in items:
            units = segment_for_translation(item.translate_body)
            semantic_chunks = [unit.text for unit in units]
            # Retain the established engine splitter seam. Production receives
            # the semantic source slices; a caller that deliberately replaces
            # the splitter (benchmarks/tests) gets exactly its replacement and
            # cannot accidentally inherit model-input rewrites.
            chunks = MADLADEngine._split_for_translation(item.translate_body)
            item_model_inputs = (
                [unit.model_input for unit in units]
                if chunks == semantic_chunks
                else chunks
            )
            if self._unit_debug:
                print("[TRANSLATION_UNIT]", flush=True)
                print(f"SOURCE: {item.translate_body}", flush=True)
                for index, (chunk, model_input) in enumerate(zip(chunks, item_model_inputs)):
                    protected, _, _ = protect_citations(model_input)
                    print(
                        f"CHUNK[{index}] chars={len(chunk)} source={chunk!r} model_input={model_input!r} protected={protected!r}",
                        flush=True,
            )
            spans.append((item, chunks, item_model_inputs))

        with engine._lock:
            translated_spans: list[tuple[_Pending, list[str], list[str], list[str], list[int], list[int], list[str]]] = []
            for item, chunks, item_model_inputs in spans:
                # Greedy MADLAD output is padding-sensitive. This also occurs
                # between unequal sentence units in one paragraph, so preserve
                # fidelity by generating every semantic unit independently.
                # The scheduler still serializes MPS access; only decoder
                # co-batching is disabled.
                pieces: list[str] = []
                in_toks: list[int] = []
                out_toks: list[int] = []
                unit_fallback_reasons: list[str] = []
                for unit_index, (chunk, model_input) in enumerate(zip(chunks, item_model_inputs)):
                    if is_probable_panel_fragment(chunk):
                        # Panel labels are source facts, not prose. Preserve the
                        # exact unit and keep it out of MADLAD; the UI can still
                        # show the original label/caption context.
                        pieces.append(chunk)
                        in_toks.append(0)
                        out_toks.append(0)
                        continue
                    try:
                        if model_input == chunk:
                            unit_pieces, unit_in, unit_out = engine._translate_chunks([chunk], target_language)
                        else:
                            unit_pieces, unit_in, unit_out = engine._translate_chunks([chunk], target_language, [model_input])
                        pieces.extend(unit_pieces)
                        in_toks.extend(unit_in)
                        out_toks.extend(unit_out)
                    except Exception as unit_error:
                        # A rejected semantic unit should not force a whole
                        # multi-sentence paragraph back to English. Preserve
                        # the exact source slice for that unit and keep the
                        # successful translated neighbors. The client still
                        # runs its whole-paragraph quality gate, so unsafe
                        # mixed output can be rejected, but a single hard
                        # sentence no longer erases every safe sentence.
                        if self._unit_debug:
                            source_hash = hashlib.sha256(item.text.encode("utf-8")).hexdigest()[:12]
                            print(
                                f"[MICROBATCH] unit fallback source={source_hash} "
                                f"unit={unit_index}/{len(chunks)} chars={len(chunk)} "
                                f"error={type(unit_error).__name__}: {unit_error}",
                                flush=True,
                            )
                        else:
                            print("[MICROBATCH] unit fallback", flush=True)
                        pieces.append(chunk)
                        in_toks.append(0)
                        out_toks.append(0)
                        unit_fallback_reasons.append(
                            f"unit_{unit_index}:{self._fallback_reason(unit_error)}"
                        )
                translated_spans.append(
                    (item, chunks, item_model_inputs, pieces, in_toks, out_toks, unit_fallback_reasons)
                )

        occupied = sum(len(chunks) for _, chunks, _ in spans)
        if self._debug:
            print(
                f"[MICROBATCH] pair={items[0].source_language}->{target_language} "
                f"requests={len(items)} chunks={occupied} "
                f"batch_size={engine._batch_size} window_ms={self._window_ms} "
                f"request_isolated_generate_groups={sum((len(chunks) + engine._batch_size - 1) // max(engine._batch_size, 1) for _, chunks, _ in spans)}",
                flush=True,
            )

        results: list[TranslationResult | None] = []
        for item, chunks, item_model_inputs, part, in_toks, out_toks, unit_fallback_reasons in translated_spans:
            item_in = sum(in_toks)
            item_out = sum(out_toks)
            assembled_partial: str | None = None
            try:
                if item_model_inputs == chunks:
                    translated = MADLADEngine._join_translated_chunks(
                        chunks, part, item.target_language
                    )
                else:
                    translated = MADLADEngine._join_translated_chunks(
                        chunks, part, item.target_language, item_model_inputs
                    )
                if item.target_language == "ja":
                    translated = restore_missing_structure_references(item.text, translated)
                if item.heading_num:
                    translated = f"{item.heading_num}. {translated.lstrip()}"
                if unit_fallback_reasons:
                    assembled_partial = translated
                degenerate = engine._is_degenerate(translated, item.text, item.target_language)
                if self._unit_debug:
                    print(
                        f"[TRANSLATION_UNIT_RESULT] source_chars={len(item.text)} "
                        f"candidate_chars={len(translated)} degenerate={degenerate} "
                        f"reason={engine._degenerate_reason(translated, item.text, item.target_language)}",
                        flush=True,
                    )
                    print(f"SOURCE: {item.text}", flush=True)
                    print(f"CANDIDATE: {translated}", flush=True)
                if degenerate:
                    raise ValueError("degenerate translation output")
                failed_indices = sorted({
                    int(match.group(1))
                    for reason in unit_fallback_reasons
                    if (match := re.match(r"unit_(\d+):", reason))
                })
                failed_sources = [chunks[index] for index in failed_indices]
                elapsed_ms = (time.time() - t0) * 1000
                result = TranslationResult(
                    text=translated,
                    source_language=item.source_language,
                    target_language=item.target_language,
                    model=engine.MODEL_ID,
                    model_version=engine.MODEL_VERSION,
                    input_chars=len(item.text),
                    output_chars=len(translated),
                    input_tokens=item_in,
                    output_tokens=item_out,
                    translation_time_ms=elapsed_ms,
                    fallback_reason="; ".join(unit_fallback_reasons) if unit_fallback_reasons else None,
                    fallback_stage="partial_unit_fallback" if unit_fallback_reasons else None,
                    unit_fallback_indices=failed_indices or None,
                    partial_text=assembled_partial,
                    partial_source_units=failed_sources or None,
                    partial_unit_texts=part,
                )
                results.append(result)
                if not item.future.done():
                    item.future.set_result(result)
            except Exception as exc:
                # Quality failure is an expected safe fallback condition, not
                # a transport/server failure. The caller will reject the
                # source echo as a translation and retain the original.
                failure_reasons = [*unit_fallback_reasons, f"whole_item:{self._fallback_reason(exc)}"]
                fallback = self._original_result(
                    item,
                    "; ".join(failure_reasons),
                    "whole_item_fallback",
                )
                if unit_fallback_reasons:
                    failed_indices: list[int] = []
                    for reason in unit_fallback_reasons:
                        match = re.match(r"unit_(\d+):", reason)
                        if match:
                            failed_indices.append(int(match.group(1)))
                    failed_indices = sorted(set(failed_indices))
                    fallback.unit_fallback_indices = failed_indices or None
                    fallback.partial_text = assembled_partial
                    fallback.partial_source_units = [chunks[index] for index in failed_indices]
                    fallback.partial_unit_texts = part
                results.append(fallback)
                if not item.future.done():
                    item.future.set_result(fallback)
        return results

    def _original_result(
        self,
        item: _Pending,
        fallback_reason: str,
        fallback_stage: str,
    ) -> TranslationResult:
        return TranslationResult(
            text=item.text,
            source_language=item.source_language,
            target_language=item.target_language,
            model=self._engine.MODEL_ID,
            model_version=self._engine.MODEL_VERSION,
            input_chars=len(item.text),
            output_chars=len(item.text),
            input_tokens=0,
            output_tokens=0,
            translation_time_ms=0.0,
            fallback_reason=fallback_reason,
            fallback_stage=fallback_stage,
        )


_scheduler: Optional[MicroBatchScheduler] = None


def get_scheduler() -> MicroBatchScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = MicroBatchScheduler(get_engine())
        _scheduler.start()
    return _scheduler
