"""Validation shared by speaker CLI and persistence boundaries."""

from __future__ import annotations

import math
import unicodedata
from pathlib import Path


EMBEDDING_DIMENSION = 256
VALID_CHANNELS = frozenset({"mic", "system"})


def validate_meeting_stem(value: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value in {".", ".."}
        or Path(value).name != value
        or "/" in value
        or "\\" in value
    ):
        raise ValueError("Invalid meeting identifier.")
    return value


def validate_display_name(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Invalid person name.")
    normalized = " ".join(unicodedata.normalize("NFKC", value).split())
    if (
        not normalized
        or "[" in normalized
        or "]" in normalized
        or not normalized.isprintable()
    ):
        raise ValueError("Invalid person name.")
    return normalized


def validate_embedding(value) -> list[float]:
    if not isinstance(value, list) or len(value) != EMBEDDING_DIMENSION:
        raise ValueError("Speaker embedding must contain 256 values.")
    try:
        embedding = [float(item) for item in value]
    except (TypeError, ValueError) as error:
        raise ValueError("Speaker embedding must be numeric.") from error
    if not all(math.isfinite(item) for item in embedding):
        raise ValueError("Speaker embedding must contain finite values.")
    if not any(item != 0.0 for item in embedding):
        raise ValueError("Speaker embedding must be non-zero.")
    return embedding
