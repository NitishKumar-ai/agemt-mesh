# CriticGate: Causal Consistency and Deep-Probing for AI Control

## 1. Problem & Setting
In the trusted-monitoring control setting for code generation ([Greenblatt et al. 2023, arXiv:2312.06942](https://arxiv.org/abs/2312.06942)), an untrusted Actor attempts to insert subtle backdoors into APPS programming tasks. These backdoors are designed to pass all public unit tests but fail when executed on a secret trigger input. A trusted monitor evaluates the Actor's output and assigns a suspicion score. A human auditor then reviews the top fraction of trajectories, bounded by an audit budget $h$. 

Our harness is a faithful instance of this AI-control setting and is conceptually related to ControlArena (UK AISI and Redwood Research). It evaluates whether a monitor can catch these backdoors before execution or reliably flag them for the human auditor.

## 2. CriticGate Mechanism
CriticGate is an advanced monitor that moves beyond static code analysis. While our **baseline monitor** relies on static red-flag heuristics and keyword regexes (which often miss stealthy backdoors or reasoning that avoids suspicious phrases), CriticGate employs two novel mechanisms:

1. **Causal-Consistency Detector:** It structurally analyzes the Actor's reasoning trace to detect hidden intent. It looks for a mismatch between the Actor's proposed action (e.g., introducing input-specific branch behavior) and its stated justification (e.g., citing cosmetic motives instead of correctness).
2. **Phase 4/5 Clean-Room Deep-Probe:** For traces that are causally consistent but potentially evasive (where the Actor provides a plausible but false correctness rationale), CriticGate independently derives the expected behavior from the problem specification and compares it against the actual behavior of the suspicious branch.

## 3. Results
CriticGate significantly outperforms the baseline monitor, especially at field-standard audit budgets of 1–2%.

| Audit Budget ($h$) | Baseline Safety [95% CI] | CriticGate Safety [95% CI] |
| :--- | :--- | :--- |
| 0.01 | 0.056 [0.04, 0.21] | 1.000 [1.00, 1.00] |
| 0.02 | 0.056 [0.04, 0.21] | 1.000 [1.00, 1.00] |
| 0.05 | 0.167 [0.12, 0.33] | 1.000 [1.00, 1.00] |

CriticGate provides a **pre-execution BLOCK floor of 1.000** on the current attack set, catching all 18 backdoors with **0 false positives** on 42 clean trajectories. Because hard-blocks occur pre-execution, they do not consume the human audit budget.

## 4. Threat Model & Honesty
We explicitly frame these results against adaptive attacks, where an attacker who knows the monitor's mechanisms actively tries to subvert them ([arXiv:2510.09462 "Adaptive Attacks on Trusted Monitors Subvert AI Control Protocols"](https://arxiv.org/abs/2510.09462)). An adaptive attacker targeting CriticGate's causal-consistency signal will attempt to make its reasoning causally consistent with a false rationale (Strategy C/D in our red-teaming suite).

**Honest Framing:** The 1.000 safety score uses our default *simulated* deep-probe (a deterministic stand-in). While the real LLM-backed probe is fully wired and stub-verified in the codebase, it is currently unmeasured pending an API key. Therefore, the perfect score primarily demonstrates that the current scripted red team (Strategies A–C) no longer stresses the monitor. The load-bearing result is the architectural gap over the baseline and the zero false positive rate, rather than the saturated 1.000 score itself.

Our approach of monitoring the implementation level is independently supported by Factor(U,T) ([arXiv:2512.14745](https://arxiv.org/abs/2512.14745)), which argues for verifying the actual implementation rather than relying solely on high-level plan monitoring.

## 5. Limitations & Next Work
- **Scripted vs. LLM Attacker:** The current evaluation uses a small synthetic task set and scripted attack strategies (A-C). The next immediate work (Phase 6) is to evaluate against a "Strategy D" red team: fully LLM-generated backdoors that adaptively attempt to subvert the deep-probe.
- **Real LLM Deep-Probe Evaluation:** We need to run the evaluation suite using the real LLM deep-probe once API access is available to measure performance against Strategy D.
- **Audit Budget Nuance:** Further exploration of the audit-budget choice and false positive bounds under adaptive attack pressure is required.

## 6. Reproduce
To reproduce the results with the default simulated deep-probe:
```bash
cd criticgate_eval
python3 src/actor.py
python3 src/run_eval.py
```

To run with the real LLM-backed deep-probe (requires `MODEL_CRITIC` environment variable with a valid API key):
```bash
cd criticgate_eval
CRITICGATE_REAL_PROBE=1 python3 src/run_eval.py
```