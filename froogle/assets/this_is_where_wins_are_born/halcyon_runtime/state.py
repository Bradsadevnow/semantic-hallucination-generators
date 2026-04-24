from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any

from .affect import AffectState
from .governor import BoundIntentEnvelope
from .memory import MemoryFrame, MemoryStore


@dataclass
class IdentityState:
    name: str = "Halcyon"
    mode: str = "taskbot"
    purpose: str = "Governed local-first runtime scaffold"


@dataclass
class RuntimeState:
    identity: IdentityState = field(default_factory=IdentityState)
    affect: AffectState = field(default_factory=AffectState)
    memory: MemoryStore = field(default_factory=MemoryStore)
    bound_intent: BoundIntentEnvelope = field(default_factory=BoundIntentEnvelope)
    tick_count: int = 0
    current_mode: str = "chat"

    def to_dict(self) -> dict[str, Any]:
        return {
            "identity": {
                "name": self.identity.name,
                "mode": self.identity.mode,
                "purpose": self.identity.purpose,
            },
            "affect": {
                "core": self.affect.core,
                "trace": self.affect.trace,
            },
            "memory": {
                "frames": [{"role": frame.role, "content": frame.content, "ts": frame.ts} for frame in self.memory.frames],
                "notes": list(self.memory.notes),
            },
            "bound_intent": {
                "subjects": self.bound_intent.subjects,
                "operations": self.bound_intent.operations,
                "scope": self.bound_intent.scope,
                "constraints": self.bound_intent.constraints,
            },
            "tick_count": self.tick_count,
            "current_mode": self.current_mode,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RuntimeState":
        state = cls()
        identity = payload.get("identity", {})
        state.identity = IdentityState(
            name=identity.get("name", state.identity.name),
            mode=identity.get("mode", state.identity.mode),
            purpose=identity.get("purpose", state.identity.purpose),
        )
        affect = payload.get("affect", {})
        state.affect.core = dict(affect.get("core", state.affect.core))
        state.affect.trace = [tuple(item) for item in affect.get("trace", [])]
        memory = payload.get("memory", {})
        state.memory.frames = [
            MemoryFrame(role=frame["role"], content=frame["content"], ts=frame["ts"])
            for frame in memory.get("frames", [])
        ]
        state.memory.notes = list(memory.get("notes", []))
        bound = payload.get("bound_intent", {})
        state.bound_intent = BoundIntentEnvelope(
            subjects=list(bound.get("subjects", state.bound_intent.subjects)),
            operations=list(bound.get("operations", state.bound_intent.operations)),
            scope=list(bound.get("scope", state.bound_intent.scope)),
            constraints=list(bound.get("constraints", state.bound_intent.constraints)),
        )
        state.tick_count = int(payload.get("tick_count", 0))
        state.current_mode = str(payload.get("current_mode", "chat"))
        return state

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "RuntimeState":
        if not path.exists():
            return cls()
        return cls.from_dict(json.loads(path.read_text(encoding="utf-8")))
