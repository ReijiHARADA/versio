"""Base translation engine interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import time


@dataclass
class TranslationResult:
    """Result of a translation operation."""
    text: str
    source_language: str
    target_language: str
    model: str
    model_version: str
    input_chars: int
    output_chars: int
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    translation_time_ms: float = 0.0
    # Present only when the engine deliberately returns or embeds source text
    # after a decode/quality failure. This helps callers distinguish a model
    # fallback from a transport error without inspecting logs.
    fallback_reason: Optional[str] = None
    fallback_stage: Optional[str] = None
    # Indexes of semantic translation units that failed while the paragraph
    # was being assembled. This is diagnostic metadata only; callers must not
    # infer that the remaining units are safe to display without re-running
    # the document-level quality gate.
    unit_fallback_indices: Optional[list[int]] = None
    # Candidate assembled from successful units plus exact source slices for
    # failed units. It is diagnostic-only until a caller independently
    # validates it; `text` remains the authoritative source fallback.
    partial_text: Optional[str] = None
    partial_source_units: Optional[list[str]] = None
    partial_unit_texts: Optional[list[str]] = None

    @property
    def chars_per_sec(self) -> float:
        if self.translation_time_ms <= 0:
            return 0.0
        return self.input_chars / (self.translation_time_ms / 1000)

    @property
    def tokens_per_sec(self) -> Optional[float]:
        if self.output_tokens is None or self.translation_time_ms <= 0:
            return None
        return self.output_tokens / (self.translation_time_ms / 1000)

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "source_language": self.source_language,
            "target_language": self.target_language,
            "model": self.model,
            "model_version": self.model_version,
            "input_chars": self.input_chars,
            "output_chars": self.output_chars,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "translation_time_ms": self.translation_time_ms,
            "fallback_reason": self.fallback_reason,
            "fallback_stage": self.fallback_stage,
            "unit_fallback_indices": self.unit_fallback_indices,
            "partial_text": self.partial_text,
            "partial_source_units": self.partial_source_units,
            "partial_unit_texts": self.partial_unit_texts,
            "chars_per_sec": self.chars_per_sec,
            "tokens_per_sec": self.tokens_per_sec,
        }


@dataclass
class EngineStatus:
    """Status of the translation engine."""
    available: bool
    model_loaded: bool
    model_name: str
    model_version: str
    device: str
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "available": self.available,
            "model_loaded": self.model_loaded,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "device": self.device,
            "error": self.error,
        }


class TranslationEngine(ABC):
    """Abstract base class for translation engines."""

    @abstractmethod
    def load_model(self) -> None:
        """Load the translation model into memory."""
        pass

    @abstractmethod
    def unload_model(self) -> None:
        """Unload the model from memory."""
        pass

    @abstractmethod
    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        """
        Translate text from source language to target language.
        
        Args:
            text: Text to translate
            source_language: Source language code (e.g., "en")
            target_language: Target language code (e.g., "ja")
            
        Returns:
            TranslationResult with translated text and metrics
        """
        pass

    @abstractmethod
    def get_status(self) -> EngineStatus:
        """Get the current status of the engine."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name."""
        pass

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Return the model version."""
        pass
