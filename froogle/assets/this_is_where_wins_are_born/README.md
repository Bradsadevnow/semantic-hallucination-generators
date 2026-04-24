# Wins Are Born

This folder started as the build extraction pack from the archive, runtime docs, and concept translation work.
It now also includes a runnable Python scaffold for a governed local-first chat runtime.

Files:
- `runtime_build_extract.md`: distilled architecture, modules, and engineering concepts worth carrying forward
- `governed_kernel.md`: the semantic-governance core, including intent envelope + identity constraints
- `code_fragments.md`: extracted code and pseudocode patterns from the archive that are useful for implementation
- `module_hook_checklist.md`: practical module/output checklist for wiring the first real runtime
- `halcyon_runtime/`: runnable scaffold with chat loop, state, memory, governor, tools, and MCP bridge
- `mcp_servers.example.json`: example MCP server config for bridging external tools into the runtime
- `pyproject.toml`: package metadata so the runtime can be launched with `python -m halcyon_runtime.cli`

Recommended build order:
1. Implement the event spine and module emit points.
2. Stand up the governed kernel as an allow/ask/deny layer around semantic proposals and tool proposals.
3. Build the loop runtime with explicit state, affect, memory, and sleep/dream passes.
4. Add GUI as an observability surface, not as decoration.
5. Only then layer richer identity, symbolic encoding, and product polish.

Current scaffold:
- local chat loop with persisted state and JSONL events
- local tool registry with a few built-in tools
- OpenAI-compatible model adapter via environment variables
- MCP bridge that can load `tools/list` and `tools/call` from configured stdio servers

Core thesis:

We are building a governed, local-first, stateful inference runtime that preserves continuity, interprets outputs as proposed semantic state transitions, and constrains those transitions against explicit intent, authority, and identity boundaries.
