from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
from pathlib import Path
from time import time
from typing import Any


@dataclass
class Event:
    kind: str
    module: str
    level: str = "info"
    msg: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=time)


class JSONLLogSink:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event: Event) -> None:
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(event), ensure_ascii=True) + "\n")


class ConsoleSink:
    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled

    def write(self, event: Event) -> None:
        if not self.enabled:
            return
        if event.kind.startswith("loop.") or event.kind.startswith("tool.") or event.kind.startswith("governor."):
            print(
                f"[{event.module}:{event.kind}] {event.msg or ''}".rstrip(),
                flush=True,
            )


class Router:
    def __init__(self, sinks: list[object]) -> None:
        self.sinks = sinks

    def emit(self, event: Event) -> None:
        for sink in self.sinks:
            sink.write(event)
