from __future__ import annotations

from pathlib import Path

from .events import ConsoleSink, Event, JSONLLogSink, Router
from .governor import ProposalTransition, evaluate
from .mcp import MCPBridge
from .model import BaseModel, ToolCall, load_model_from_env
from .state import RuntimeState
from .tools import ToolRegistry, build_default_registry, pretty_result


SYSTEM_PROMPT = """You are a governed local-first runtime.
Keep responses concise and useful.
Use tools when they materially help.
If you are uncertain about a tool or its side effects, ask instead of guessing.
"""


class HalcyonRuntime:
    def __init__(
        self,
        state_path: Path,
        log_path: Path,
        mcp_config_path: Path,
        model: BaseModel | None = None,
    ) -> None:
        self.state_path = state_path
        self.state = RuntimeState.load(state_path)
        self.router = Router([JSONLLogSink(log_path), ConsoleSink(enabled=True)])
        self.registry = build_default_registry(self.state.memory)
        self.mcp = MCPBridge(mcp_config_path)
        self.mcp.load()
        self.mcp_tools = self.mcp.register_tools(self.registry)
        self.model = model or load_model_from_env()
        self.router.emit(
            Event(
                kind="runtime.start",
                module="runtime",
                msg="Runtime initialized.",
                payload={"mcp_tools": self.mcp_tools},
            )
        )

    def chat_once(self, user_input: str) -> str:
        self.state.tick_count += 1
        self.state.memory.append("user", user_input)
        self.router.emit(
            Event(
                kind="loop.pulse",
                module="runtime",
                msg="Tick started.",
                payload={"tick_count": self.state.tick_count, "mode": self.state.current_mode},
            )
        )

        response = self.model.generate(SYSTEM_PROMPT, self.state.memory.recent(12), self.registry)

        assistant_parts: list[str] = []
        if response.text:
            assistant_parts.append(response.text)

        for tool_call in response.tool_calls:
            assistant_parts.append(self._execute_tool_call(tool_call))

        if not assistant_parts:
            assistant_parts.append("No content returned.")

        final_text = "\n\n".join(part for part in assistant_parts if part.strip())
        self.state.memory.append("assistant", final_text)
        self.state.affect.decay()
        self.state.save(self.state_path)
        self.router.emit(
            Event(
                kind="loop.end",
                module="runtime",
                msg="Tick committed.",
                payload=self.state.affect.heartbeat(),
            )
        )
        return final_text

    def _execute_tool_call(self, tool_call: ToolCall) -> str:
        proposal = ProposalTransition(
            kind="tool",
            target_state={"tool_name": tool_call.name, "arguments": tool_call.arguments},
        )
        decision, reason = evaluate(self.state.bound_intent, proposal, self.registry.names())
        self.router.emit(
            Event(
                kind="governor.decision",
                module="governor",
                msg=reason,
                payload={"decision": decision, "tool_name": tool_call.name},
            )
        )
        if decision != "ALLOW":
            return f"Governor decision: {decision}. {reason}"

        result = self.registry.execute(tool_call.name, tool_call.arguments)
        rendered = pretty_result(result)
        self.router.emit(
            Event(
                kind="tool.execute",
                module="tools",
                msg=f"Executed {tool_call.name}.",
                payload={"tool_name": tool_call.name, "result": rendered},
            )
        )
        return f"Tool `{tool_call.name}` result:\n{rendered}"
