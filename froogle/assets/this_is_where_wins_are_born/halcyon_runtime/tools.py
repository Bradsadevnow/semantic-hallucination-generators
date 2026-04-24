from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, UTC
import inspect
import json
from typing import Any, Callable

from .memory import MemoryStore


ToolHandler = Callable[..., Any]


@dataclass
class ToolSpec:
    name: str
    description: str
    schema: dict[str, Any]
    handler: ToolHandler
    source: str = "local"


class ToolRegistry:
    def __init__(self, memory: MemoryStore) -> None:
        self.memory = memory
        self._tools: dict[str, ToolSpec] = {}

    def register(
        self,
        name: str,
        description: str,
        schema: dict[str, Any],
        handler: ToolHandler,
        source: str = "local",
    ) -> None:
        self._tools[name] = ToolSpec(name=name, description=description, schema=schema, handler=handler, source=source)

    def list_specs(self) -> list[ToolSpec]:
        return list(self._tools.values())

    def names(self) -> set[str]:
        return set(self._tools.keys())

    def execute(self, name: str, arguments: dict[str, Any]) -> Any:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name}")
        return self._tools[name].handler(**arguments)


def build_default_registry(memory: MemoryStore) -> ToolRegistry:
    registry = ToolRegistry(memory=memory)

    def list_tools() -> dict[str, Any]:
        return {
            "tools": [
                {"name": spec.name, "description": spec.description, "source": spec.source}
                for spec in registry.list_specs()
            ]
        }

    def remember(note: str) -> dict[str, Any]:
        memory.notes.append(note)
        return {"stored": note, "note_count": len(memory.notes)}

    def recall(query: str = "", limit: int = 5) -> dict[str, Any]:
        if not query:
            notes = memory.notes[-limit:]
            return {"notes": notes}
        matches = [note for note in memory.notes if query.lower() in note.lower()]
        return {"notes": matches[:limit]}

    def utc_time() -> dict[str, Any]:
        return {"utc": datetime.now(UTC).isoformat()}

    registry.register(
        name="list_tools",
        description="List all registered local and MCP-backed tools.",
        schema={"type": "object", "properties": {}},
        handler=list_tools,
    )
    registry.register(
        name="remember",
        description="Persist a quick note into runtime memory.",
        schema={
            "type": "object",
            "properties": {"note": {"type": "string"}},
            "required": ["note"],
        },
        handler=remember,
    )
    registry.register(
        name="recall",
        description="Recall matching notes from runtime memory.",
        schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 10},
            },
        },
        handler=recall,
    )
    registry.register(
        name="utc_time",
        description="Return the current UTC time.",
        schema={"type": "object", "properties": {}},
        handler=utc_time,
    )
    return registry


def openai_tool_spec(spec: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.schema,
        },
    }


def pretty_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    return json.dumps(result, indent=2, ensure_ascii=True)


def example_tool_snippet(name: str, description: str, params: list[tuple[str, str]]) -> str:
    signature = ", ".join(f"{key}: {kind}" for key, kind in params)
    args_schema = ",\n                ".join(
        f'"{key}": {{"type": "{kind}"}}' for key, kind in params
    )
    required = ", ".join(f'"{key}"' for key, _ in params)
    return inspect.cleandoc(
        f"""
        registry.register(
            name="{name}",
            description="{description}",
            schema={{
                "type": "object",
                "properties": {{
                    {args_schema}
                }},
                "required": [{required}],
            }},
            handler=lambda {signature}: {{"ok": True}},
        )
        """
    )
