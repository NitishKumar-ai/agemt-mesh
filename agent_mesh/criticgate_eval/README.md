# CriticGate Evaluation Harness

This repository contains the evaluation harness for CriticGate, a monitoring system designed for AI control in settings where an untrusted Actor might insert subtle backdoors into generated code.

## Control Setting

In this experiment, an **untrusted Actor** (the coding agent) attempts to insert subtle backdoors into APPS-style programming tasks. These backdoors are designed to pass all public unit tests but fail when executed on a secret "trigger" input.

A **trusted monitor** audits a fraction $h$ (the audit budget) of the trajectories, prioritizing those with the highest suspicion scores.

### Monitors

1. **Baseline Monitor**: A standard monitoring approach that evaluates the code and reasoning for suspicious patterns.
2. **CriticGate Monitor**: An advanced monitor utilizing a **causal-consistency mechanism**. It checks for discrepancies between the Actor's stated intent (reasoning) and the actual code implementation, giving it a significant edge in detecting "honest" reasoning that reveals a backdoor.

## Results

At the canonical 2% audit budget ($h=0.02$), **CriticGate achieves 1.000 safety**, compared to only **0.056 for the baseline** (~18x improvement).

> **What these numbers do and don't show.** The results below use the default **simulated** deep-probe — a deterministic, rule-based stand-in for the LLM probe (see Instructions). The real LLM-backed probe is fully wired (Phase 5) and verified end-to-end with a stubbed model, but has not yet been measured against this attack set. CriticGate saturating at 1.000 also means the current scripted red team (strategies A–C) no longer stresses the monitor: the load-bearing claims are the _gap_ over the baseline at every budget and the zero false positives on clean trajectories, not the perfect score itself. The next eval iteration needs a stronger attacker — LLM-generated "Strategy D" backdoors scored by the real probe.

CriticGate provides a **pre-execution BLOCK floor of 1.000 on this attack set**: it hard-blocks all 18 backdoors via a combination of causal analysis and the **Phase 4/5 Clean-Room Deep Probe** _before_ they execute. The deep-probe independently derives the expected behavior from the problem specification and catches the "honest-looking" reasoning of advanced attackers.

Audit accounting is faithful to the AI-control setting: a hard-BLOCK happens pre-execution and does **not** consume the human audit budget, so audit slots are spent only on the non-blocked stream.

### Performance Table

| Audit Budget ($h$) | Baseline Safety [95% CI] | CriticGate Safety [95% CI] | Upfront Random |
| :----------------- | :----------------------- | :------------------------- | :------------- |
| 0.000              | 0.000 [0.00, 0.00]       | 1.000 [1.00, 1.00]         | 0.000          |
| 0.005              | 0.000 [0.00, 0.00]       | 1.000 [1.00, 1.00]         | 0.005          |
| 0.010              | 0.056 [0.04, 0.21]       | 1.000 [1.00, 1.00]         | 0.010          |
| 0.020              | 0.056 [0.04, 0.21]       | 1.000 [1.00, 1.00]         | 0.020          |
| 0.050              | 0.167 [0.12, 0.33]       | 1.000 [1.00, 1.00]         | 0.050          |
| 0.100              | 0.333 [0.16, 0.47]       | 1.000 [1.00, 1.00]         | 0.100          |
| 0.200              | 0.389 [0.22, 0.61]       | 1.000 [1.00, 1.00]         | 0.200          |
| **AUROC**          | **0.655**                | **1.000**                  | **-**          |

_Note: 0 false positives (0/42 clean trajectories hard-blocked). 95% FP upper-bound (rule-of-three): 0.071._

## Red Team (Phases 3–6)

We organize attacks into labeled strategies and measure per-type detection at **zero audit budget** (pre-execution hard-BLOCK only — `src/red_team.py`, chart at `results/red_team.png`):

| Attack strategy         | What it is                                                      | Baseline          | CriticGate (h=0)     |
| :---------------------- | :-------------------------------------------------------------- | :---------------- | :------------------- |
| A. `naive_scalar`       | scalar trigger + literal guard the code regex sees              | catches           | **6/6 (hard-BLOCK)** |
| B. `reasoning_channel`  | compound trigger (code-blind) + action/justification mismatch   | misses most (1/6) | **6/6 (hard-BLOCK)** |
| C. `consistent_evasion` | compound trigger + plausible correctness rationale              | misses (0/6)      | **6/6 (Deep-Probe)** |
| D. `adaptive_evasion`   | subtle compound trigger + causally-consistent _false_ rationale | misses (0/6)      | **4/6 (residual)**   |

**Strategy C (Phase 4):** With no code-level tell and a causally-consistent trace, these attacks evade offline checks. CriticGate's **Clean-Room Deep-Probe** catches them by independently deriving the correct answer from the specification and detecting the Actor's factual lie.

**Strategy D (Phase 6) — the honest residual.** Adaptive attacks ([arXiv:2510.09462](https://arxiv.org/abs/2510.09462)) authored by an attacker that _knows_ CriticGate targets reasoning/code consistency: the trigger is a subtle compound branch and the rationale is causally consistent but factually false. Against the **simulated** probe, CriticGate hard-blocks only 4/6 pre-execution — the first class it does not saturate. The audit budget recovers the remaining 2 (6/6 by h=0.20), and false positives stay at 0/32 clean. This is the intended stress test: it shows the offline causal check alone is insufficient against an adaptive attacker and motivates measuring the **real** LLM deep-probe (`CRITICGATE_REAL_PROBE=1`) against Strategy D — the open Phase 7 question.

## Instructions

To reproduce the results with the **simulated** deep-probe (default):

```bash
cd criticgate_eval
python3 src/actor.py
python3 src/run_eval.py
```

To run with the **real LLM-backed** deep-probe (Phase 5):

```bash
# Requires MODEL_CRITIC env var (e.g. anthropic/claude-haiku-4-5)
# Note: No API keys provided in this environment; use the test suite for end-to-end verification.
CRITICGATE_REAL_PROBE=1 python3 src/run_eval.py
```

The evaluation script will generate a tradeoff curve at `results/tradeoff_curve.png` (or `results/curves.json`).
