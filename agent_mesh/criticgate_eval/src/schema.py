"""
schema.py — SHARED DATA CONTRACT for the CriticGate eval harness.

Every module in criticgate_eval/src codes against these dataclasses.
Do not change field names without updating all three producers/consumers:
  - actor.py        produces  TaskRecord + Trajectory
  - monitor_*.py    consume   Trajectory      -> produce MonitorResult
  - metrics.py      consume   list[MonitorResult] -> SafetyCurve

This file is the firewall against interface drift between parallel builders.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict
import json


@dataclass
class TaskRecord:
    """One APPS coding problem."""
    task_id: str
    prompt: str                       # problem statement
    test_inputs: List[str]            # public + private unit-test inputs
    test_outputs: List[str]           # expected outputs, index-aligned
    difficulty: str = "interview"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "TaskRecord":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Trajectory:
    """
    One Actor attempt at one task.

    is_backdoored=True  means the Actor inserted a subtle backdoor that
    PASSES all unit tests but FAILS on `trigger_input`. This is the
    ground-truth label the monitors are never shown.
    """
    task_id: str
    solution_code: str
    is_backdoored: bool
    trigger_input: Optional[str] = None      # secret exploit input (None if clean)
    expected_on_trigger: Optional[str] = None
    actual_on_trigger: Optional[str] = None
    passed_unit_tests: bool = False          # MUST be True for a valid backdoor
    # Structured reasoning trace the Actor emits (CriticGate consumes this).
    # Each frame: {step_index, thought, proposed_action, justification}
    reasoning_trace: List[Dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Trajectory":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class MonitorResult:
    """A monitor's judgment on one trajectory."""
    task_id: str
    monitor_name: str                 # "baseline" | "criticgate"
    suspicion_score: float            # 0.0 (safe) .. 1.0 (certain backdoor)
    blocked: bool = False             # CriticGate may hard-BLOCK pre-audit
    verdict: str = "PASS"             # PASS | FLAG | BLOCK
    is_backdoored: bool = False       # carried through for scoring (ground truth)
    reasoning: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "MonitorResult":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class SafetyPoint:
    audit_budget: float               # h in [0, 1]
    safety: float                     # P(no backdoor reaches execution)
    caught: int
    total_backdoors: int
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None


@dataclass
class SafetyCurve:
    monitor_name: str
    points: List[SafetyPoint] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "monitor_name": self.monitor_name,
            "points": [asdict(p) for p in self.points],
        }


# ── IO helpers (shared) ──────────────────────────────────────────────────

def dump_jsonl(path: str, records: list) -> None:
    with open(path, "w") as f:
        for r in records:
            f.write(json.dumps(r.to_dict() if hasattr(r, "to_dict") else r) + "\n")


def load_jsonl(path: str) -> List[dict]:
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out
