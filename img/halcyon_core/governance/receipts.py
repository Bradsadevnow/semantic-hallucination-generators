"""Canonical governance receipts for governed tool attempts."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from halcyon_core.events import canonical_json, digest_payload

ReceiptOutcome = Literal["executed", "refused", "failed_precondition", "verification_failed"]
AttestationDecision = Literal["approved", "denied", "conditional", "not_applicable", "verification_failed"]


@dataclass(frozen=True)
class ReceiptIdentity:
    receipt_id: str
    schema_version: str
    emitted_at: str
    request_id: str
    call_digest: str
    action_digest: str
    lineage: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class GovernanceInputs:
    policy_snapshot: dict[str, Any]
    policy_snapshot_digest: str
    authority_snapshot: dict[str, Any]
    authority_snapshot_digest: str
    runtime_posture_snapshot: dict[str, Any]
    runtime_posture_snapshot_digest: str
    boundary_evidence: dict[str, Any]
    boundary_evidence_digest: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DecisionRecord:
    outcome: ReceiptOutcome
    reason_code: str
    governing_predicate_class: str
    output_digest: str | None = None
    refusal_artifact_digest: str | None = None
    output: dict[str, Any] = field(default_factory=dict)
    refusal_artifact: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class BoundaryAttestation:
    boundary_name: str
    decision: AttestationDecision
    reason_codes: tuple[str, ...]
    evidence: tuple[str, ...]
    snapshot_digests: dict[str, Any]
    event_index: int | None = None
    parent_attestation_digest: str | None = None
    attestation_digest: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class GovernanceReceipt:
    identity: ReceiptIdentity
    governance_inputs: GovernanceInputs
    decision: DecisionRecord
    boundary_attestations: tuple[BoundaryAttestation, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "identity": self.identity.to_dict(),
            "governance_inputs": self.governance_inputs.to_dict(),
            "decision": self.decision.to_dict(),
            "boundary_attestations": [attestation.to_dict() for attestation in self.boundary_attestations],
        }


@dataclass(frozen=True)
class ReceiptVerification:
    valid: bool
    receipt_digest: str
    failures: tuple[str, ...] = ()


def canonical_receipt_json(receipt: GovernanceReceipt | dict[str, Any]) -> str:
    payload = receipt.to_dict() if isinstance(receipt, GovernanceReceipt) else receipt
    return canonical_json(payload)


def digest_receipt(receipt: GovernanceReceipt | dict[str, Any]) -> str:
    payload = receipt.to_dict() if isinstance(receipt, GovernanceReceipt) else receipt
    return digest_payload(payload)


def verify_receipt(
    receipt: GovernanceReceipt | dict[str, Any],
    *,
    expected_digest: str | None = None,
) -> ReceiptVerification:
    payload = receipt.to_dict() if isinstance(receipt, GovernanceReceipt) else receipt
    failures: list[str] = []
    receipt_digest = digest_receipt(payload)

    if expected_digest is not None and receipt_digest != expected_digest:
        failures.append("receipt_digest_mismatch")

    identity = payload.get("identity", {})
    governance_inputs = payload.get("governance_inputs", {})
    decision = payload.get("decision", {})

    required_top_level = ("identity", "governance_inputs", "decision", "boundary_attestations")
    for field_name in required_top_level:
        if field_name not in payload:
            failures.append(f"missing_{field_name}")

    if not identity.get("receipt_id"):
        failures.append("missing_receipt_id")
    if identity.get("schema_version") != "governance-receipt-v1":
        failures.append("unsupported_schema_version")
    if not identity.get("call_digest"):
        failures.append("missing_call_digest")
    if not identity.get("action_digest"):
        failures.append("missing_action_digest")

    for field_name in (
        "policy_snapshot",
        "authority_snapshot",
        "runtime_posture_snapshot",
        "boundary_evidence",
    ):
        snapshot = governance_inputs.get(field_name)
        digest_name = f"{field_name}_digest"
        if snapshot is None:
            failures.append(f"missing_{field_name}")
            continue
        if governance_inputs.get(digest_name) != digest_payload(snapshot):
            failures.append(f"{field_name}_digest_mismatch")

    outcome = decision.get("outcome")
    if outcome not in {"executed", "refused", "failed_precondition", "verification_failed"}:
        failures.append("invalid_outcome")
    if not decision.get("reason_code"):
        failures.append("missing_reason_code")
    if not decision.get("governing_predicate_class"):
        failures.append("missing_governing_predicate_class")

    attestations = payload.get("boundary_attestations")
    if not isinstance(attestations, list) or not attestations:
        failures.append("missing_boundary_attestations")
    else:
        failures.extend(_verify_boundary_attestations(attestations))

    if outcome == "executed":
        output = decision.get("output")
        if not isinstance(output, dict):
            failures.append("executed_output_missing")
        elif decision.get("output_digest") != digest_payload(output):
            failures.append("executed_output_digest_mismatch")
    if outcome == "refused":
        artifact = decision.get("refusal_artifact")
        if not isinstance(artifact, dict):
            failures.append("refusal_artifact_missing")
        elif decision.get("refusal_artifact_digest") != digest_payload(artifact):
            failures.append("refusal_artifact_digest_mismatch")

    return ReceiptVerification(
        valid=not failures,
        receipt_digest=receipt_digest,
        failures=tuple(failures),
    )


def build_executed_receipt(
    *,
    emitted_at: str,
    request_id: str,
    call_digest: str,
    action_digest: str,
    lineage: dict[str, Any],
    policy_snapshot: dict[str, Any],
    authority_snapshot: dict[str, Any],
    runtime_posture_snapshot: dict[str, Any],
    boundary_evidence: dict[str, Any],
    boundary_attestations: list[dict[str, Any]],
    output: dict[str, Any],
    reason_code: str,
    governing_predicate_class: str,
) -> GovernanceReceipt:
    return _build_receipt(
        emitted_at=emitted_at,
        request_id=request_id,
        call_digest=call_digest,
        action_digest=action_digest,
        lineage=lineage,
        policy_snapshot=policy_snapshot,
        authority_snapshot=authority_snapshot,
        runtime_posture_snapshot=runtime_posture_snapshot,
        boundary_evidence=boundary_evidence,
        boundary_attestations=boundary_attestations,
        outcome="executed",
        reason_code=reason_code,
        governing_predicate_class=governing_predicate_class,
        output=output,
        refusal_artifact={},
    )


def build_refused_receipt(
    *,
    emitted_at: str,
    request_id: str,
    call_digest: str,
    action_digest: str,
    lineage: dict[str, Any],
    policy_snapshot: dict[str, Any],
    authority_snapshot: dict[str, Any],
    runtime_posture_snapshot: dict[str, Any],
    boundary_evidence: dict[str, Any],
    boundary_attestations: list[dict[str, Any]],
    refusal_artifact: dict[str, Any],
    reason_code: str,
    governing_predicate_class: str,
) -> GovernanceReceipt:
    return _build_receipt(
        emitted_at=emitted_at,
        request_id=request_id,
        call_digest=call_digest,
        action_digest=action_digest,
        lineage=lineage,
        policy_snapshot=policy_snapshot,
        authority_snapshot=authority_snapshot,
        runtime_posture_snapshot=runtime_posture_snapshot,
        boundary_evidence=boundary_evidence,
        boundary_attestations=boundary_attestations,
        outcome="refused",
        reason_code=reason_code,
        governing_predicate_class=governing_predicate_class,
        output={},
        refusal_artifact=refusal_artifact,
    )


def _build_receipt(
    *,
    emitted_at: str,
    request_id: str,
    call_digest: str,
    action_digest: str,
    lineage: dict[str, Any],
    policy_snapshot: dict[str, Any],
    authority_snapshot: dict[str, Any],
    runtime_posture_snapshot: dict[str, Any],
    boundary_evidence: dict[str, Any],
    boundary_attestations: list[dict[str, Any]],
    outcome: ReceiptOutcome,
    reason_code: str,
    governing_predicate_class: str,
    output: dict[str, Any],
    refusal_artifact: dict[str, Any],
) -> GovernanceReceipt:
    identity_seed = {
        "call_digest": call_digest,
        "action_digest": action_digest,
        "request_id": request_id,
        "outcome": outcome,
        "lineage": lineage,
    }
    identity = ReceiptIdentity(
        receipt_id="receipt:" + digest_payload(identity_seed).split(":", 1)[1],
        schema_version="governance-receipt-v1",
        emitted_at=emitted_at,
        request_id=request_id,
        call_digest=call_digest,
        action_digest=action_digest,
        lineage=lineage,
    )
    governance_inputs = GovernanceInputs(
        policy_snapshot=policy_snapshot,
        policy_snapshot_digest=digest_payload(policy_snapshot),
        authority_snapshot=authority_snapshot,
        authority_snapshot_digest=digest_payload(authority_snapshot),
        runtime_posture_snapshot=runtime_posture_snapshot,
        runtime_posture_snapshot_digest=digest_payload(runtime_posture_snapshot),
        boundary_evidence=boundary_evidence,
        boundary_evidence_digest=digest_payload(boundary_evidence),
    )
    decision = DecisionRecord(
        outcome=outcome,
        reason_code=reason_code,
        governing_predicate_class=governing_predicate_class,
        output_digest=digest_payload(output) if outcome == "executed" else None,
        refusal_artifact_digest=digest_payload(refusal_artifact) if outcome == "refused" else None,
        output=output,
        refusal_artifact=refusal_artifact,
    )
    attestations = tuple(_stamp_boundary_attestations(boundary_attestations))
    return GovernanceReceipt(
        identity=identity,
        governance_inputs=governance_inputs,
        decision=decision,
        boundary_attestations=attestations,
    )


def _stamp_boundary_attestations(boundary_attestations: list[dict[str, Any]]) -> list[BoundaryAttestation]:
    stamped: list[BoundaryAttestation] = []
    parent_digest: str | None = None
    for attestation in boundary_attestations:
        record = {
            "boundary_name": attestation["boundary_name"],
            "decision": attestation["decision"],
            "reason_codes": list(attestation.get("reason_codes", ())),
            "evidence": list(attestation.get("evidence", ())),
            "snapshot_digests": attestation.get("snapshot_digests", {}),
            "event_index": attestation.get("event_index"),
            "parent_attestation_digest": parent_digest,
        }
        attestation_digest = digest_payload(record)
        stamped_attestation = BoundaryAttestation(
            boundary_name=record["boundary_name"],
            decision=record["decision"],
            reason_codes=tuple(record["reason_codes"]),
            evidence=tuple(record["evidence"]),
            snapshot_digests=record["snapshot_digests"],
            event_index=record["event_index"],
            parent_attestation_digest=parent_digest,
            attestation_digest=attestation_digest,
        )
        stamped.append(stamped_attestation)
        parent_digest = attestation_digest
    return stamped


def _verify_boundary_attestations(attestations: list[dict[str, Any]]) -> list[str]:
    failures: list[str] = []
    parent_digest: str | None = None
    for index, attestation in enumerate(attestations):
        if attestation.get("parent_attestation_digest") != parent_digest:
            failures.append(f"boundary_attestation_parent_mismatch:{index}")
        attestation_seed = {
            "boundary_name": attestation.get("boundary_name"),
            "decision": attestation.get("decision"),
            "reason_codes": list(attestation.get("reason_codes", ())),
            "evidence": list(attestation.get("evidence", ())),
            "snapshot_digests": attestation.get("snapshot_digests", {}),
            "event_index": attestation.get("event_index"),
            "parent_attestation_digest": attestation.get("parent_attestation_digest"),
        }
        expected_digest = digest_payload(attestation_seed)
        if attestation.get("attestation_digest") != expected_digest:
            failures.append(f"boundary_attestation_digest_mismatch:{index}")
        if attestation.get("decision") not in {
            "approved",
            "denied",
            "conditional",
            "not_applicable",
            "verification_failed",
        }:
            failures.append(f"boundary_attestation_invalid_decision:{index}")
        parent_digest = attestation.get("attestation_digest")
    return failures
