"""Translation engines package."""
from .base import TranslationEngine, TranslationResult, EngineStatus

__all__ = [
    "TranslationEngine",
    "TranslationResult",
    "EngineStatus",
    "MADLADEngine",
    "get_engine",
]


def __getattr__(name: str):
    if name in {"MADLADEngine", "get_engine"}:
        from .madlad_mps import MADLADEngine, get_engine

        return MADLADEngine if name == "MADLADEngine" else get_engine
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
