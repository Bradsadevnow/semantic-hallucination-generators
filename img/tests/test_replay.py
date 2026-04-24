"""Tests for the replay evidence reducer."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from halcyon_core.api.server import create_app
from halcyon_core.config import RuntimeConfig
from halcyon_core.events import RuntimeEvent, SQLiteEventLedger
from halcyon_core.governance.receipts import verify_receipt
from halcyon_core.governance.replay import ToolChain, reduce_replay_evidence
from halcyon_core.model.client import LocalModelClient
from halcyon_core.tools.registry import ToolRegistry
from halcyon_core.tools.types import MutationClass, ToolSpec


def fake_client(content: str):
    return LocalModelClient(
        "http://local.test/v1",
        "fake",
        transport=lambda url, payload: {"choices": [{"message": {"content": content}}]},
    )


def tool_proposal_reply(tool_name: str = "echo", message: str = "hello"):
    return json.dumps({
        "reply": "I will echo that.",
        "memory_proposals": [],
        "tool_proposals": [{
            "action_type": tool_name,
            "target": tool_name,
            "payload": {"message": message},
            "mutation_class": "external",
            "reason": "user requested",
        }],
    })


def no_tool_reply(reply: str = "just a reply"):
    return json.dumps({
        "reply": reply,
        "memory_proposals": [],
        "tool_proposals": [],
    })


def missing_callable_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        ToolSpec("write_file", "Write a file", MutationClass.FILESYSTEM, commit_threshold="reversible")
    )
    return registry


# ---------------------------------------------------------------------------
# Approved execution — complete chain
# ---------------------------------------------------------------------------

def test_reducer_produces_strong_claim_for_complete_tool_chain(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(config, model_client=fake_client(tool_proposal_reply(message="ping")))
    client = TestClient(app)

    turn = client.post("/chat", json={"message": "echo ping"}).json()
    call_digest = turn["tool_results"][0]["call_digest"]

    client.post(
        f"/tools/proposals/{call_digest}/approve",
        json={"approved_by": "brad", "approval_basis": "user_direct_consent"},
    )

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    assert len(evidence.tool_chains) == 1
    chain = evidence.tool_chains[0]
    assert chain.call_digest == call_digest
    assert chain.governance_claim == "strong_governed_execution"
    assert chain.execution_outcome == "executed"
    assert chain.is_complete
    assert chain.missing_events == []
    assert chain.all_violations() == []
    assert chain.receipt_event is not None
    verification = verify_receipt(
        chain.receipt_event.payload["receipt"],
        expected_digest=chain.receipt_event.payload["receipt_digest"],
    )
    assert verification.valid is True
    assert len(chain.receipt_event.payload["receipt"]["boundary_attestations"]) == 4


# ---------------------------------------------------------------------------
# Refused tool — no approval path
# ---------------------------------------------------------------------------

def test_reducer_marks_refused_tool_as_incomplete(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(config, model_client=fake_client(tool_proposal_reply()))
    client = TestClient(app)

    client.post("/chat", json={"message": "echo hello"})

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    assert len(evidence.tool_chains) == 1
    chain = evidence.tool_chains[0]
    assert chain.has_proposal
    assert not chain.has_approval
    assert not chain.has_execution
    assert chain.governance_claim == "incomplete"
    assert not chain.is_complete


def test_reducer_marks_approved_refusal_as_approved_not_executed(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(
        config,
        model_client=fake_client(tool_proposal_reply(tool_name="write_file")),
        tool_registry=missing_callable_registry(),
    )
    client = TestClient(app)

    turn = client.post("/chat", json={"message": "write_file now"}).json()
    call_digest = turn["tool_results"][0]["call_digest"]
    response = client.post(
        f"/tools/proposals/{call_digest}/approve",
        json={"approved_by": "brad", "approval_basis": "user_direct_consent"},
    )

    assert response.status_code == 403

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    chain = next(chain for chain in evidence.tool_chains if chain.call_digest == call_digest)
    assert chain.execution_outcome == "refused"
    assert chain.governance_claim == "approved_not_executed"
    assert chain.is_complete
    assert chain.receipt_event is not None
    assert chain.receipt_event.payload["receipt"]["boundary_attestations"][-1]["decision"] == "denied"


def test_reducer_detects_tampered_receipt_as_governance_breach(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(config, model_client=fake_client(tool_proposal_reply(message="tamper")))
    client = TestClient(app)

    turn = client.post("/chat", json={"message": "echo tamper"}).json()
    call_digest = turn["tool_results"][0]["call_digest"]
    client.post(
        f"/tools/proposals/{call_digest}/approve",
        json={"approved_by": "brad", "approval_basis": "user_direct_consent"},
    )

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        receipt_event = next(
            event
            for event in ledger.iter_events_by_name("governance.receipt.emitted")
            if event.payload["call_digest"] == call_digest
        )
        tampered_receipt = dict(receipt_event.payload["receipt"])
        tampered_decision = dict(tampered_receipt["decision"])
        tampered_decision["reason_code"] = "tampered_reason"
        tampered_receipt["decision"] = tampered_decision
        tampered_event = RuntimeEvent(
            index=receipt_event.index,
            name=receipt_event.name,
            parent_index=receipt_event.parent_index,
            created_at=receipt_event.created_at,
            payload={
                **receipt_event.payload,
                "receipt": tampered_receipt,
            },
        )
        evidence = reduce_replay_evidence(_LedgerOverride(ledger, tampered_event))
    finally:
        ledger.close()

    chain = next(chain for chain in evidence.tool_chains if chain.call_digest == call_digest)
    assert chain.governance_claim == "governance_breach"
    assert "executed_output_digest_mismatch" not in chain.receipt_violations
    assert "receipt_digest_mismatch" in chain.receipt_violations


# ---------------------------------------------------------------------------
# No tool proposals — no tool chains
# ---------------------------------------------------------------------------

def test_reducer_produces_no_tool_chains_when_no_proposals(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(config, model_client=fake_client(no_tool_reply()))
    client = TestClient(app)

    client.post("/chat", json={"message": "just say hello"})

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    assert evidence.tool_chains == []


# ---------------------------------------------------------------------------
# Multiple turns — chains are isolated per call_digest
# ---------------------------------------------------------------------------

def test_reducer_isolates_chains_across_multiple_turns(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)

    app1 = create_app(config, model_client=fake_client(tool_proposal_reply(message="first")))
    client1 = TestClient(app1)
    turn1 = client1.post("/chat", json={"message": "echo first"}).json()
    digest1 = turn1["tool_results"][0]["call_digest"]
    client1.post(
        f"/tools/proposals/{digest1}/approve",
        json={"approved_by": "brad", "approval_basis": "user_direct_consent"},
    )

    app2 = create_app(config, model_client=fake_client(tool_proposal_reply(message="second")))
    client2 = TestClient(app2)
    turn2 = client2.post("/chat", json={"message": "echo second"}).json()
    digest2 = turn2["tool_results"][0]["call_digest"]

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    assert len(evidence.tool_chains) == 2
    by_digest = {c.call_digest: c for c in evidence.tool_chains}
    assert by_digest[digest1].governance_claim == "strong_governed_execution"
    assert by_digest[digest2].governance_claim == "incomplete"


# ---------------------------------------------------------------------------
# Summary output
# ---------------------------------------------------------------------------

def test_reducer_summary_counts_are_accurate(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(config, model_client=fake_client(tool_proposal_reply(message="ping")))
    client = TestClient(app)

    turn = client.post("/chat", json={"message": "echo ping"}).json()
    call_digest = turn["tool_results"][0]["call_digest"]
    client.post(
        f"/tools/proposals/{call_digest}/approve",
        json={"approved_by": "brad", "approval_basis": "user_direct_consent"},
    )

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    summary = evidence.to_summary()
    assert summary["tool_chains"]["total"] == 1
    assert summary["tool_chains"]["complete"] == 1
    assert summary["tool_chains"]["incomplete"] == 0
    assert summary["tool_chains"]["by_claim"]["strong_governed_execution"] == 1
    assert summary["tool_chains"]["by_outcome"]["executed"] == 1
    assert summary["total_events_scanned"] > 0


# ---------------------------------------------------------------------------
# Digest integrity: ordering violation detection
# ---------------------------------------------------------------------------

def test_reducer_detects_no_violations_on_clean_chain(tmp_path):
    config = RuntimeConfig(database_path=str(tmp_path / "halcyon.sqlite"), actions_allowed=True)
    app = create_app(config, model_client=fake_client(tool_proposal_reply(message="check")))
    client = TestClient(app)

    turn = client.post("/chat", json={"message": "echo check"}).json()
    call_digest = turn["tool_results"][0]["call_digest"]
    client.post(
        f"/tools/proposals/{call_digest}/approve",
        json={"approved_by": "brad", "approval_basis": "user_direct_consent"},
    )

    ledger = SQLiteEventLedger(config.events_database_path())
    try:
        evidence = reduce_replay_evidence(ledger)
    finally:
        ledger.close()

    chain = evidence.tool_chains[0]
    assert chain.ordering_violations == []
    assert chain.digest_violations == []
    assert chain.parent_violations == []
    assert chain.receipt_violations == []
    assert evidence.breached_chains() == []


class _LedgerOverride:
    def __init__(self, ledger: SQLiteEventLedger, replacement: RuntimeEvent) -> None:
        self.path = ledger.path
        self._events = [
            replacement if event.index == replacement.index else event
            for event in ledger.iter_events()
        ]

    def iter_events(self):
        return iter(self._events)
