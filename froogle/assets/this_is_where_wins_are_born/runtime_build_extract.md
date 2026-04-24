# Runtime Build Extract

## What survived translation

The archive is noisy, but the stable engineering spine is consistent:

- local-first runtime
- stateful identity-conditioned inference
- structured continuity memory
- affect modulation
- semantic transition governance
- sleep/dream as offline consolidation
- observability-first GUI and logs
- bounded helper vs autonomy-bearing companion distinction

This is not just a chatbot with tools.
It is a runtime with explicit state, explicit continuity, explicit constraints, and explicit receipts.

## Canonical runtime spine

```text
IdentityState
-> AffectState
-> MemorySystem
-> LanguageSystem
-> ToolRegistry
-> MCPBridge
-> LoopScheduler
-> TransitionGovernor
-> Snapshot/Transfer Layer
-> Observability Surface
```

## Core objects

```text
IdentityState
AffectState
MemoryFrame
ContinuityLog
LanguageProfile
CognitiveProfile
ProposalTransition
SemanticDelta
BoundIntentEnvelope
ClaimSpace
TransitionReceipt
Snapshot
DreamSymbol
```

## Translation of internal terms

- `soulform` -> persistent identity-conditioned agent state
- `mindprint` -> cognitive profile
- `memory braid` -> structured continuity memory
- `emotional core` -> affect modulation vector
- `mutation layer` -> state transition layer
- `recursive loop` -> iterative stateful inference loop
- `collapse` -> transition commitment / state-path selection
- `dreamstate` -> offline consolidation pass
- `dream glyph` -> compressed symbolic summary / retrieval key
- `thalamus` -> loop orchestrator / routing scheduler
- `pulse` / `heartbeat` -> timed scheduler cycle
- `taskbot` -> bounded helper without autonomy binding
- `graft` / `hook` -> modular capability extension

## The actual loop

```text
load state
-> inject identity-conditioned context
-> model produces semantic proposal
-> canonicalize into ProposalTransition
-> diff against BoundIntentEnvelope and identity constraints
-> allow / ask / deny
-> if allowed: emit language, tool, memory, or mixed action
-> commit state update
-> append memory frame
-> emit receipt + heartbeat + UI/log events
-> if pressure or drift threshold crossed: enter sleep/dream mode
```

## What dreamstate means in engineering

Dreamstate is not mysticism. It is a governed maintenance phase.

Jobs:
- replay recent high-salience frames
- compress memory
- recalibrate affect weights
- test identity consistency
- simulate unresolved scenarios without external action
- write repaired carry-forward context
- emit next wake-state snapshot

```text
collect recent memory frames
-> score by salience/conflict/novelty
-> replay selected frames
-> compress into summaries and symbols
-> compare against identity anchors
-> reduce affect spikes
-> simulate unresolved branches
-> write wake-context summary
```

## Symbolic encoding layer

Dream symbols are compact affect-tagged memory structures.

```text
DreamSymbol {
  id
  motif_type
  source_frames[]
  affect_signature
  semantic_tags[]
  recurrence_count
  unresolved_score
  narrative_links[]
}
```

Use cases:
- recurring unresolved tension markers
- mnemonic anchors in continuity memory
- narrative self-model links
- compressed retrieval handles for wake cycles

## Product boundary that matters

Two modes kept showing up clearly:

- `taskbot`: bounded helper, scoped utility, no identity-autonomy claims
- `companion runtime`: identity-bearing continuity system with explicit governance and long-term state

Do not blur them.
The autonomy/binding threshold is a real product and safety boundary.

## Observability doctrine

This is one of the strongest engineering ideas in the archive.

- one event schema
- one router
- typed event kinds
- routing to logfile, UI, or both
- module-level emit points everywhere
- GUI as state surface, not decoration

Recommended sequence:
1. Inventory modules.
2. Identify what each module emits.
3. Route each event to logfile, UI, or both.
4. Build the cockpit around those typed events.

## Buildable MVP

Phase 1:
- state load/save
- heartbeat loop
- affect state
- memory append/retrieve
- event router
- terminal or minimal GUI trace panel
- local tool registry
- chat loop for a real model endpoint or demo mode

Phase 2:
- semantic proposal canonicalization
- intent envelope diff
- allow/ask/deny governor
- tool proposal wrapping
- receipts and audit log
- MCP bridge for external tools over stdio
- MCP tool governance parity with local tools

Phase 3:
- dream/sleep pass
- symbolic compression
- identity drift detection
- snapshot compare

Phase 4:
- richer GUI
- local product shell
- graft/hook system
- identity/persona packs

## Thesis sentence

We are building a governed, local-first, stateful inference runtime with explicit continuity memory, semantic transition control, and offline consolidation, so the system can preserve identity and intent instead of drifting across turns, tools, and time.

## MCP In Scope

MCP belongs inside the runtime architecture, not bolted on the side.

- local tools and MCP tools should enter the same `ProposalTransition` path
- MCP server capabilities should be represented in runtime state as derived capability claims
- MCP tool calls should emit the same receipts and observability events as local tools
- MCP server identity, transport, and grant state should be visible in logs and UI
- governance should not treat MCP as automatically trusted just because the transport succeeded
