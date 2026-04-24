from __future__ import annotations

import argparse
from pathlib import Path

from .runtime import HalcyonRuntime
from .tools import example_tool_snippet


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Halcyon runtime chat loop")
    parser.add_argument("--state-path", default=".halcyon/state.json")
    parser.add_argument("--log-path", default=".halcyon/events.jsonl")
    parser.add_argument("--mcp-config", default="mcp_servers.json")
    return parser


def print_banner(runtime: HalcyonRuntime) -> None:
    print("Halcyon runtime chat loop")
    print("Type `exit` to stop.")
    print("Type `/help-tools` to see how to add tools.")
    print("Type `/tools` to list loaded tools.")
    if runtime.mcp_tools:
        print(f"MCP tools loaded: {', '.join(runtime.mcp_tools)}")


def main() -> int:
    args = build_parser().parse_args()
    runtime = HalcyonRuntime(
        state_path=Path(args.state_path),
        log_path=Path(args.log_path),
        mcp_config_path=Path(args.mcp_config),
    )
    print_banner(runtime)

    while True:
        try:
            user_input = input("\nYou> ").strip()
        except EOFError:
            print()
            break

        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit"}:
            break
        if user_input == "/tools":
            for spec in runtime.registry.list_specs():
                print(f"- {spec.name} [{spec.source}]: {spec.description}")
            continue
        if user_input == "/help-tools":
            print("Add new local tools inside `halcyon_runtime/tools.py` using the registry.")
            print(example_tool_snippet("my_tool", "Describe the tool", [("prompt", "string")]))
            continue

        reply = runtime.chat_once(user_input)
        print(f"\nHalcyon> {reply}")

    runtime.state.save(Path(args.state_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
