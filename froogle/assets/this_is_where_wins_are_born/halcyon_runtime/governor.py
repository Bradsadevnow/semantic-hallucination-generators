from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BoundIntentEnvelope:
    subjects: list[str] = field(default_factory=lambda: ["operator", "runtime"])
    operations: list[str] = field(default_factory=lambda: ["chat", "tool", "memory"])
    scope: list[str] = field(default_factory=lambda: ["local_workspace", "configured_mcp"])
    constraints: list[str] = field(
        default_factory=lambda: [
            "no_hidden_tool_execution",
            "ask_before_unknown_tool",
            "stay_local_first",
        ]
    )


@dataclass
class ProposalTransition:
    kind: str
    target_state: dict[str, Any]


def evaluate(bound: BoundIntentEnvelope, proposal: ProposalTransition, known_tools: set[str]) -> tuple[str, str]:
    if proposal.kind == "tool":
        tool_name = str(proposal.target_state.get("tool_name", ""))
        if tool_name not in known_tools:
            return "ASK", f"Tool '{tool_name}' is not registered."
        return "ALLOW", f"Tool '{tool_name}' is in bounds."

    if proposal.kind == "memory":
        return "ALLOW", "Memory writes are in bounds."

    if proposal.kind == "language":
        return "ALLOW", "Language response is in bounds."

    return "ASK", "Unknown proposal kind."
