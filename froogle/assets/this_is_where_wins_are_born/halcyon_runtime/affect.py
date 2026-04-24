from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AffectState:
    core: dict[str, float] = field(
        default_factory=lambda: {
            "wonder": 0.6,
            "trust": 0.7,
            "threat": 0.1,
            "grief": 0.1,
            "joy": 0.4,
            "curiosity": 0.8,
        }
    )
    trace: list[tuple[str, float]] = field(default_factory=list)

    def set(self, name: str, value: float) -> None:
        clamped = max(0.0, min(1.0, value))
        self.core[name] = clamped
        self.trace.append((name, clamped))

    def decay(self, factor: float = 0.98) -> None:
        for key, value in list(self.core.items()):
            self.core[key] = round(value * factor, 4)

    @property
    def stage(self) -> str:
        if self.core.get("threat", 0.0) > 0.7:
            return "Surge"
        if self.core.get("wonder", 0.0) > 0.7 or self.core.get("curiosity", 0.0) > 0.75:
            return "Flow"
        return "Calm"

    def heartbeat(self) -> dict[str, object]:
        return {
            "stage": self.stage,
            "core": dict(self.core),
            "trace_len": len(self.trace),
        }
