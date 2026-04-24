# Module Hook Checklist

Use this to turn the archive into a real runtime.

## Minimum module inventory

- `identity_state`
- `affect`
- `memory`
- `language`
- `cognition`
- `symbols`
- `mutation_layer`
- `governed_kernel`
- `tool_adapter`
- `dreamstate`
- `snapshot`
- `router`
- `ui_bridge`

## Required emit points

Every module should emit at least:
- start
- end
- warning or violation
- metric or state sample

## Suggested routing targets

`log only`:
- low-level metrics
- verbose retrieval traces
- replay internals

`ui only`:
- simplified heartbeat
- avatar/body state
- top-line status badges

`both`:
- allow/ask/deny decisions
- tool proposals
- tool execution receipts
- identity violations
- memory commits
- dream enter/exit

## First practical pass

1. `router`
   - implement typed event object
   - implement JSONL log sink
   - implement UI sink stub

2. `heartbeat`
   - pulse every tick
   - include stage, pressure, current mode, active trace id

3. `memory`
   - append frame
   - retrieve related
   - braid continuity summary

4. `governed_kernel`
   - evaluate proposal transitions
   - evaluate identity claims
   - emit allow/ask/deny

5. `ui_bridge`
   - terminal panel or tiny GUI first
   - show pulse, recent events, current mode, last decision

## MVP success condition

The runtime is real enough for the next stage when you can watch a full tick and answer:
- what state was loaded?
- what proposal was generated?
- what governor decision was made?
- what effect was committed?
- what got remembered?
- why did it enter or skip dreamstate?

If you cannot answer those from logs or UI, keep building observability before adding more magic.
