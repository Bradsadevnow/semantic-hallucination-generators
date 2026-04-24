from __future__ import annotations

from dataclasses import dataclass, field
from time import time


@dataclass
class MemoryFrame:
    role: str
    content: str
    ts: float = field(default_factory=time)


@dataclass
class MemoryStore:
    frames: list[MemoryFrame] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def append(self, role: str, content: str) -> MemoryFrame:
        frame = MemoryFrame(role=role, content=content)
        self.frames.append(frame)
        return frame

    def recent(self, limit: int = 8) -> list[MemoryFrame]:
        return self.frames[-limit:]

    def retrieve_related(self, query: str, limit: int = 3) -> list[MemoryFrame]:
        query_terms = {term.lower() for term in query.split() if term.strip()}
        if not query_terms:
            return self.recent(limit)

        scored: list[tuple[int, MemoryFrame]] = []
        for frame in self.frames:
            haystack = set(frame.content.lower().split())
            overlap = len(query_terms & haystack)
            if overlap:
                scored.append((overlap, frame))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [frame for _, frame in scored[:limit]]
