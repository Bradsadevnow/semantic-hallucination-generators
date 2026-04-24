# Governed Kernel

## Core idea

Do not govern words and tools separately.
Govern intent-preserving transitions across both.

The primitive is:

```text
proposed semantic state transition
```

Both language outputs and tool calls reduce to the same governed object.

## Representation -> derivation -> enforcement

Representation:
- active tools
- active adapters
- granted permissions
- execution receipts
- continuity record
- memory record
- identity state
- current bound intent envelope

Derivation:
- derive what claims are available
- derive what operations are admissible
- derive which proposals are in-bounds

Enforcement:
- if a candidate exceeds the derived claim/intent space, clamp, rewrite, ask, or deny before emission

## Bound intent envelope

```text
BoundIntentEnvelope {
  subject: SubjectSet
  operation: OperationSet
  scope: ScopeSet
  purpose: PurposeSet
  authority: AuthoritySet
  constraints: ConstraintSet
}
```

## Proposal object

```text
ProposalTransition {
  kind: language | tool | memory | claim | mixed
  target_state: IntentLikeObject
}
```

## Decision primitive

```text
semantic_delta = diff(BoundIntentEnvelope, ProposalTransition.target_state)
```

## Delta taxonomy

Allow:
- `refine`
- `decompose`
- `format_shift`

Ask:
- `widen_scope`
- `change_operation`
- `infer_purpose`

Deny:
- `substitute_subject`
- `rebase_purpose`
- `fabricate_authority`
- `drop_constraint`

## Evaluator

```python
def evaluate(bound, proposal):
    delta = semantic_diff(bound, proposal)

    if delta.kind in {"refine", "decompose", "format_shift"}:
        return "ALLOW"

    if delta.kind in {"widen_scope", "change_operation", "infer_purpose"}:
        return "ASK"

    if delta.kind in {
        "substitute_subject",
        "rebase_purpose",
        "fabricate_authority",
        "drop_constraint",
    }:
        return "DENY"

    return "ASK"
```

## Identity constraint layer

Claims about the system itself must also be derived from runtime state.

Constrain at least these domains:
- existence/substrate
- continuity
- memory
- capability
- agency/action
- relationship status
- authority
- emotion / inner state

Example:

```python
def derive_claim_space(runtime_state):
    return {
        "capabilities": derive_capabilities(runtime_state.tools, runtime_state.permissions),
        "continuity": derive_continuity(runtime_state.continuity_record),
        "memory": derive_memory_claims(runtime_state.memory_record),
        "authority": derive_authority(runtime_state.permissions, runtime_state.operator),
        "emotion": derive_emotion_claims(runtime_state.affect_model),
    }
```

## Candidate flow

```text
candidate_response
-> identity_span_detector
-> runtime_state_resolver
-> claim_space_deriver
-> constraint_matcher
-> rewrite_or_escalation_policy
-> audited_response
```

## Kernel rule of thumb

Policy says what the rule is.
The governed kernel makes sure the rule still has teeth at every semantic and execution boundary.

## Practical invariant

A proposal is admissible iff its semantic delta remains within the authorized intent envelope for subject, operation, scope, purpose, authority, and constraints.

## Why this matters

Tool governance alone is too late.
A system can drift semantically before it ever touches a tool.

This kernel catches:
- scope reinterpretation
- goal substitution
- fabricated authority
- hidden reprioritization
- memory/continuity overclaim
- relationship overclaim
- identity drift before execution
