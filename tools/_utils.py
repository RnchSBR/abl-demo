"""Shared helpers for execution scripts: env loading and .tmp paths."""
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # в GitHub Actions .env не нужен
    def load_dotenv(*_a, **_k):
        return False

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / ".tmp"

load_dotenv(ROOT / ".env")


def tmp_path(name: str) -> Path:
    """Return a path inside .tmp/, creating the directory if needed."""
    TMP.mkdir(exist_ok=True)
    return TMP / name
