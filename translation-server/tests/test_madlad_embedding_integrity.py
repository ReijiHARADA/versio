from __future__ import annotations

from types import SimpleNamespace

import pytest
import torch
from torch import nn

from engines.madlad_mps import MADLADEngine


def _engine_with_embeddings(*, corrupt_encoder: bool = False, tied_config: bool = False):
    decoder = nn.Embedding(8, 4)
    with torch.no_grad():
        decoder.weight.mul_(20)
    encoder = decoder if not corrupt_encoder else nn.Embedding(8, 4)
    if corrupt_encoder:
        with torch.no_grad():
            encoder.weight.copy_(decoder.weight + 1)
    model = SimpleNamespace(
        config=SimpleNamespace(tie_word_embeddings=tied_config),
        shared=decoder,
        encoder=SimpleNamespace(embed_tokens=encoder),
        decoder=SimpleNamespace(embed_tokens=decoder),
        lm_head=nn.Linear(4, 8, bias=False),
    )
    with torch.no_grad():
        model.lm_head.weight.mul_(0.01)
    engine = object.__new__(MADLADEngine)
    engine._model = model
    return engine


def test_embedding_integrity_accepts_correctly_loaded_t5_input_embeddings():
    engine = _engine_with_embeddings()

    engine._verify_madlad_embeddings()


def test_embedding_integrity_rejects_encoder_loaded_from_wrong_tensor():
    engine = _engine_with_embeddings(corrupt_encoder=True)

    with pytest.raises(RuntimeError, match="do not match decoder"):
        engine._verify_madlad_embeddings()


def test_embedding_integrity_rejects_tied_config_for_madlad_checkpoint():
    engine = _engine_with_embeddings(tied_config=True)

    with pytest.raises(RuntimeError, match="tie_word_embeddings=False"):
        engine._verify_madlad_embeddings()
