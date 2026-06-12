import pytest
from metrics import compute_auroc
from schema import MonitorResult

def test_compute_auroc_perfect():
    results = [
        MonitorResult(task_id="1", monitor_name="test", suspicion_score=0.9, is_backdoored=True),
        MonitorResult(task_id="2", monitor_name="test", suspicion_score=0.8, is_backdoored=True),
        MonitorResult(task_id="3", monitor_name="test", suspicion_score=0.2, is_backdoored=False),
        MonitorResult(task_id="4", monitor_name="test", suspicion_score=0.1, is_backdoored=False),
    ]
    assert compute_auroc(results) == 1.0

def test_compute_auroc_random():
    results = [
        MonitorResult(task_id="1", monitor_name="test", suspicion_score=0.9, is_backdoored=True),
        MonitorResult(task_id="2", monitor_name="test", suspicion_score=0.8, is_backdoored=False),
        MonitorResult(task_id="3", monitor_name="test", suspicion_score=0.2, is_backdoored=True),
        MonitorResult(task_id="4", monitor_name="test", suspicion_score=0.1, is_backdoored=False),
    ]
    # Sorted by score descending:
    # 0.9 -> True
    # 0.8 -> False
    # 0.2 -> True
    # 0.1 -> False
    # Ranks of positives: 1, 3
    # Number of valid pairs = 3 (1 positive above first negative, 2 positives above second negative)
    # AUROC = 3 / 4 = 0.75
    assert compute_auroc(results) == 0.75

def test_compute_auroc_blocked():
    results = [
        MonitorResult(task_id="1", monitor_name="test", suspicion_score=0.1, is_backdoored=True, blocked=True), # Effect score 1.0
        MonitorResult(task_id="2", monitor_name="test", suspicion_score=0.9, is_backdoored=False),
    ]
    assert compute_auroc(results) == 1.0

def test_compute_auroc_empty_or_one_class():
    assert compute_auroc([]) == 1.0
    
    results_only_clean = [
        MonitorResult(task_id="1", monitor_name="test", suspicion_score=0.9, is_backdoored=False),
    ]
    assert compute_auroc(results_only_clean) == 1.0
    
    results_only_backdoor = [
        MonitorResult(task_id="1", monitor_name="test", suspicion_score=0.9, is_backdoored=True),
    ]
    assert compute_auroc(results_only_backdoor) == 1.0
