from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any
from urllib import error, request

from .memory import MemoryFrame
from .tools import ToolRegistry, openai_tool_spec


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    call_id: str | None = None


@dataclass
class ModelResponse:
    text: str
    tool_calls: list[ToolCall]


class BaseModel:
    def generate(
        self,
        system_prompt: str,
        history: list[MemoryFrame],
        registry: ToolRegistry,
    ) -> ModelResponse:
        raise NotImplementedError


class DemoModel(BaseModel):
    def generate(
        self,
        system_prompt: str,
        history: list[MemoryFrame],
        registry: ToolRegistry,
    ) -> ModelResponse:
        user_text = next((frame.content for frame in reversed(history) if frame.role == "user"), "")
        if user_text.startswith("/tool "):
            parts = user_text.split(maxsplit=2)
            tool_name = parts[1] if len(parts) > 1 else ""
            arguments = json.loads(parts[2]) if len(parts) > 2 else {}
            return ModelResponse(
                text=f"Running tool `{tool_name}`.",
                tool_calls=[ToolCall(name=tool_name, arguments=arguments)],
            )
        return ModelResponse(
            text=(
                "Demo mode is active. Set `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL` "
                "for a real model, or run `/tool list_tools {}` style commands to exercise the tool loop."
            ),
            tool_calls=[],
        )


class OpenAICompatibleModel(BaseModel):
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def generate(
        self,
        system_prompt: str,
        history: list[MemoryFrame],
        registry: ToolRegistry,
    ) -> ModelResponse:
        messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        for frame in history:
            messages.append({"role": frame.role, "content": frame.content})

        payload = {
            "model": self.model,
            "messages": messages,
            "tools": [openai_tool_spec(spec) for spec in registry.list_specs()],
            "tool_choice": "auto",
        }
        req = request.Request(
            url=f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=120) as response:
                body = json.loads(response.read().decode("utf-8"))
        except error.URLError as exc:
            raise RuntimeError(f"Model request failed: {exc}") from exc

        message = body["choices"][0]["message"]
        text = message.get("content") or ""
        tool_calls: list[ToolCall] = []
        for call in message.get("tool_calls", []):
            raw_args = call["function"].get("arguments", "{}")
            parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            tool_calls.append(
                ToolCall(
                    name=call["function"]["name"],
                    arguments=parsed_args,
                    call_id=call.get("id"),
                )
            )
        return ModelResponse(text=text, tool_calls=tool_calls)


def load_model_from_env() -> BaseModel:
    base_url = os.environ.get("OPENAI_BASE_URL")
    api_key = os.environ.get("OPENAI_API_KEY")
    model = os.environ.get("OPENAI_MODEL")
    if base_url and api_key and model:
        return OpenAICompatibleModel(base_url=base_url, api_key=api_key, model=model)
    return DemoModel()
