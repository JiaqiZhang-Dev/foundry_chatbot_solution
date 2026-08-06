"""Generic Teams message preprocessing."""

from __future__ import annotations

import html
import re

_LINK_RE = re.compile(
    r'<a\s+(?:[^>]*?\s+)?href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
    re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]*>")


def preprocess_message(text: str) -> str:
    decoded = html.unescape(text)
    linked = _LINK_RE.sub(
        lambda match: f"[{_TAG_RE.sub('', match.group(2)).strip()}]({match.group(1)})",
        decoded,
    )
    return _TAG_RE.sub("", linked).strip()
