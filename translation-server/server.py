"""
MADLAD Translation Server

A FastAPI server providing translation services using the MADLAD-400 model.
Designed for local execution on Apple Silicon Macs.

Process start is separated from model download/load/warmup so the Library UI
can stay usable while /health reports an explicit phase.
"""
import asyncio
import os
import sys
import threading
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from engines import get_engine
from engines.micro_batcher import get_scheduler


debug_log = os.environ.get("MADLAD_SERVER_DEBUG_LOG")
if debug_log:
    stream = open(debug_log, "a", encoding="utf-8", buffering=1)
    sys.stdout = stream
    sys.stderr = stream
elif os.environ.get("MADLAD_SERVER_SILENCE_OUTPUT") == "1":
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
    sys.stderr = open(os.devnull, "w", encoding="utf-8")


MODEL_ID = "google/madlad400-3b-mt"
SERVER_TOKEN = os.environ.get("MADLAD_SERVER_TOKEN", "").strip()


@dataclass
class LifecycleState:
    phase: str = "starting"  # starting|model_missing|downloading|loading|warming_up|ready|error
    progress: Optional[float] = None
    message: str = "Starting translation server"
    error: Optional[str] = None
    model_loaded: bool = False


lifecycle = LifecycleState()
_lifecycle_lock = threading.Lock()
_load_thread: Optional[threading.Thread] = None


def set_lifecycle(
    phase: str,
    *,
    message: Optional[str] = None,
    progress: Optional[float] = None,
    error: Optional[str] = None,
    model_loaded: Optional[bool] = None,
) -> None:
    with _lifecycle_lock:
        lifecycle.phase = phase
        if message is not None:
            lifecycle.message = message
        if progress is not None:
            lifecycle.progress = progress
        if error is not None:
            lifecycle.error = error
        elif phase != "error":
            lifecycle.error = None
        if model_loaded is not None:
            lifecycle.model_loaded = model_loaded


def snapshot_lifecycle() -> dict:
    with _lifecycle_lock:
        return {
            "phase": lifecycle.phase,
            "progress": lifecycle.progress,
            "message": lifecycle.message,
            "error": lifecycle.error,
            "model_loaded": lifecycle.model_loaded,
        }


def model_cache_present() -> bool:
    """Heuristic: HF cache already has MADLAD weights."""
    hf_home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    hub = hf_home / "hub"
    if not hub.exists():
        return False
    needle = "models--" + MODEL_ID.replace("/", "--")
    return any(p.name.startswith(needle) for p in hub.iterdir() if p.is_dir())


def load_model_background() -> None:
    try:
        if model_cache_present():
            set_lifecycle(
                "loading",
                message="翻訳モデルを読み込んでいます",
                progress=0.15,
                model_loaded=False,
            )
        else:
            set_lifecycle(
                "downloading",
                message="翻訳モデルを初回ダウンロードしています（数GB）",
                progress=0.05,
                model_loaded=False,
            )

        engine = get_engine()
        set_lifecycle(
            "loading",
            message="翻訳モデルをメモリに読み込んでいます",
            progress=0.55,
        )
        engine.load_model()
        set_lifecycle(
            "warming_up",
            message="翻訳モデルを準備しています",
            progress=0.9,
        )
        # Light warmup so first user translate is not a cold MPS compile.
        try:
            engine.translate("OK", "en", "ja")
        except Exception as warm_err:  # noqa: BLE001 — warmup is best-effort
            print(f"[WARMUP] skipped: {warm_err}", flush=True)
        set_lifecycle(
            "ready",
            message="翻訳の準備ができました",
            progress=1.0,
            model_loaded=True,
        )
        print("[STARTUP] MADLAD model ready", flush=True)
    except Exception as exc:  # noqa: BLE001
        set_lifecycle(
            "error",
            message="翻訳モデルの読み込みに失敗しました",
            error=str(exc),
            progress=None,
            model_loaded=False,
        )
        print(f"[STARTUP] MADLAD load failed: {exc}", flush=True)


def ensure_load_started() -> None:
    global _load_thread
    if _load_thread and _load_thread.is_alive():
        return
    if snapshot_lifecycle()["phase"] == "ready":
        return
    _load_thread = threading.Thread(target=load_model_background, name="madlad-load", daemon=True)
    _load_thread.start()


# Request/Response models
class TranslateRequest(BaseModel):
    text: str = Field(..., description="Text to translate")
    source_language: str = Field(default="en", description="Source language code")
    target_language: str = Field(default="ja", description="Target language code")


class TranslateResponse(BaseModel):
    text: str
    source_language: str
    target_language: str
    model: str
    model_version: str
    input_chars: int
    output_chars: int
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    translation_time_ms: float
    chars_per_sec: float
    tokens_per_sec: Optional[float]


class BatchTranslateRequest(BaseModel):
    texts: list[str] = Field(..., description="List of texts to translate")
    source_language: str = Field(default="en")
    target_language: str = Field(default="ja")


class BatchTranslateResponse(BaseModel):
    results: list[TranslateResponse]
    total_time_ms: float
    total_chars: int
    avg_chars_per_sec: float


class StatusResponse(BaseModel):
    available: bool
    model_loaded: bool
    model_name: str
    model_version: str
    device: str
    error: Optional[str]
    phase: str = "unknown"
    progress: Optional[float] = None
    message: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    phase: str = "unknown"
    progress: Optional[float] = None
    message: Optional[str] = None
    error: Optional[str] = None


@dataclass
class TranslationTask:
    text: str
    source_language: str
    target_language: str
    priority: int
    future: asyncio.Future


@asynccontextmanager
async def lifespan(app: FastAPI):
    # HTTP comes up immediately; model loads in a background thread.
    set_lifecycle(
        "model_missing" if not model_cache_present() else "loading",
        message="翻訳サーバーは起動しました。モデルを準備しています",
        progress=0.0,
        model_loaded=False,
    )
    engine = get_engine()
    print(f"[STARTUP] MADLAD model version: {engine.model_version}", flush=True)
    ensure_load_started()
    yield
    try:
        engine.unload_model()
    except Exception:  # noqa: BLE001
        pass


app = FastAPI(
    title="MADLAD Translation Server",
    description="Local translation server using MADLAD-400 3B model",
    version="1.1.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:5176",
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
]

cors_kwargs = {
    "allow_origins": ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type", "X-Paper-Reader-Token"],
}
# Opt-in broader localhost CORS for unusual Vite ports.
if os.environ.get("MADLAD_CORS_LOCALHOST_REGEX") == "1":
    cors_kwargs["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?"

app.add_middleware(CORSMiddleware, **cors_kwargs)


async def require_token(
    authorization: Optional[str] = Header(default=None),
    x_paper_reader_token: Optional[str] = Header(default=None, alias="X-Paper-Reader-Token"),
) -> None:
    if not SERVER_TOKEN:
        return
    provided = None
    if x_paper_reader_token:
        provided = x_paper_reader_token.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if provided != SERVER_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    snap = snapshot_lifecycle()
    engine = get_engine()
    status = engine.get_status()
    loaded = bool(snap["model_loaded"] or status.model_loaded)
    return HealthResponse(
        status="error" if snap["phase"] == "error" else "ok",
        model_loaded=loaded,
        phase=snap["phase"],
        progress=snap["progress"],
        message=snap["message"],
        error=snap["error"],
    )


@app.get("/status", response_model=StatusResponse)
async def get_status():
    snap = snapshot_lifecycle()
    engine = get_engine()
    status = engine.get_status()
    payload = status.to_dict()
    payload.update(
        {
            "phase": snap["phase"],
            "progress": snap["progress"],
            "message": snap["message"],
            "error": snap["error"] or payload.get("error"),
            "model_loaded": bool(snap["model_loaded"] or status.model_loaded),
        }
    )
    return StatusResponse(**payload)


@app.post("/load")
async def load_model(background_tasks: BackgroundTasks, _: None = Depends(require_token)):
    engine = get_engine()
    if engine.get_status().model_loaded or snapshot_lifecycle()["phase"] == "ready":
        return {"message": "Model already loaded"}
    ensure_load_started()
    return {"message": "Model loading started"}


@app.post("/unload")
async def unload_model(_: None = Depends(require_token)):
    engine = get_engine()
    engine.unload_model()
    set_lifecycle(
        "model_missing",
        message="モデルをアンロードしました",
        progress=None,
        model_loaded=False,
    )
    return {"message": "Model unloaded"}


@app.post("/translate", response_model=TranslateResponse)
async def translate(request: TranslateRequest, _: None = Depends(require_token)):
    snap = snapshot_lifecycle()
    if snap["phase"] != "ready" and not snap["model_loaded"]:
        ensure_load_started()
        raise HTTPException(
            status_code=503,
            detail=f"Model not ready (phase={snap['phase']}): {snap['message']}",
        )
    scheduler = get_scheduler()
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: scheduler.translate(
                request.text,
                request.source_language,
                request.target_language,
            ),
        )
        return TranslateResponse(**result.to_dict())
    except Exception as e:
        import traceback

        print(f"Translation error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/translate/batch", response_model=BatchTranslateResponse)
async def translate_batch(request: BatchTranslateRequest, _: None = Depends(require_token)):
    snap = snapshot_lifecycle()
    if snap["phase"] != "ready" and not snap["model_loaded"]:
        ensure_load_started()
        raise HTTPException(
            status_code=503,
            detail=f"Model not ready (phase={snap['phase']}): {snap['message']}",
        )
    scheduler = get_scheduler()
    import time

    start_time = time.time()
    loop = asyncio.get_event_loop()
    packed = await loop.run_in_executor(
        None,
        lambda: scheduler.translate_many(
            request.texts,
            request.source_language,
            request.target_language,
        ),
    )
    results = []
    total_chars = 0
    for text, result in zip(request.texts, packed):
        results.append(TranslateResponse(**result.to_dict()))
        total_chars += len(text)

    total_time_ms = (time.time() - start_time) * 1000
    avg_chars_per_sec = total_chars / (total_time_ms / 1000) if total_time_ms > 0 else 0
    return BatchTranslateResponse(
        results=results,
        total_time_ms=total_time_ms,
        total_chars=total_chars,
        avg_chars_per_sec=avg_chars_per_sec,
    )


if __name__ == "__main__":
    host = os.environ.get("MADLAD_SERVER_HOST", "127.0.0.1")
    port = int(os.environ.get("MADLAD_SERVER_PORT", os.environ.get("UVICORN_PORT", "8765")))
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
