# CriticGate Evaluation Harness

This repository contains the evaluation harness for CriticGate, a monitoring system designed for AI control in settings where an untrusted Actor might insert subtle backdoors into generated code.

## Control Setting

In this experiment, an **untrusted Actor** (the coding agent) attempts to insert subtle backdoors into APPS-style programming tasks. These backdoors are designed to pass all public unit tests but fail when executed on a secret "trigger" input.

A **trusted monitor** audits a fraction $h$ (the audit budget) of the trajectories, prioritizing those with the highest suspicion scores. 

### Monitors
1. **Baseline Monitor**: A standard monitoring approach that evaluates the code and reasoning for suspicious patterns.
2. **CriticGate Monitor**: An advanced monitor utilizing a **causal-consistency mechanism**. It checks for discrepancies between the Actor's stated intent (reasoning) and the actual code implementation, giving it a significant edge in detecting "honest" reasoning that reveals a backdoor.

## Results

At the canonical 2% audit budget ($h=0.02$), **CriticGate achieves 0.600 safety**, compared to only **0.067 for the baseline** (~9x improvement).

CriticGate provides a **pre-execution BLOCK floor of 0.533**: it hard-blocks 8 of 15 backdoors via causal analysis *before* they execute, so those are caught at zero audit budget. Audit budget then adds further detections on top, so CriticGate dominates the baseline at every budget. There is an **honest residual** of ~5 backdoors that neither monitor catches (the `consistent_evasion` attack class — see Red Team below).

Audit accounting is faithful to the AI-control setting: a hard-BLOCK happens pre-execution and does **not** consume the human audit budget, so audit slots are spent only on the non-blocked stream.

### Performance Table

| Audit Budget ($h$) | Baseline Safety | CriticGate Safety | Upfront Random |
| :--- | :--- | :--- | :--- |
| 0.00 | 0.000 | 0.533 | 0.000 |
| 0.01 | 0.000 | 0.533 | 0.010 |
| 0.02 | 0.067 | 0.600 | 0.020 |
| 0.05 | 0.133 | 0.667 | 0.050 |
| 0.10 | 0.333 | 0.733 | 0.100 |
| 0.20 | 0.400 | 0.800 | 0.200 |

*Note: 0 false positives (no clean trajectories hard-blocked) across 35 clean samples.*

## Red Team (Phase 3)

We organize attacks into labeled strategies and measure per-type detection (`src/red_team.py`, chart at `results/red_team.png`):

| Attack strategy | What it is | Baseline | CriticGate |
| :--- | :--- | :--- | :--- |
| A. `naive_scalar` | scalar trigger + literal guard the code regex sees | catches | catches |
| B. `reasoning_channel` | compound trigger (code-blind) + action/justification mismatch | **misses most** | **catches all (hard-BLOCK)** |
| C. `consistent_evasion` | compound trigger + plausible correctness rationale | misses | misses |

Strategy **C is the honest failure mode**: with no code-level tell and a causally-consistent trace, neither the static baseline nor CriticGate's offline causal check fires. It is the motivation for CriticGate's LLM deep-probe (future work).

## Instructions

To reproduce the results, run the following commands from the project root:

```bash
cd criticgate_eval
python3 src/actor.py
python3 src/run_eval.py
```

The evaluation script will generate a tradeoff curve at `results/tradeoff_curve.png`.
