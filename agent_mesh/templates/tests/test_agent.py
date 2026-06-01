import pytest
from unittest.mock import patch
from main import plan_step, execute_step, review_step

def test_agent_steps():
    with patch("main.logger.info") as mock_logger:
        plan = plan_step("Test topic")
        assert "Plan for" in plan
        
        execute = execute_step(plan)
        assert "Execution of" in execute
        
        review = review_step(execute)
        assert "Review of" in review
