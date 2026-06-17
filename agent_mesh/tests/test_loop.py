"""
Tests for loop.py (inner agentic loop) and its harness.py integration.
All LLM calls are scripted/mocked — no API keys required.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from loop import (
    Action,
    AgentLoop,
    FINISH_TOOL,
    LoopConfig,
    Tool,
    ToolRegistry,
    parse_action,
)


def make_tool(name="echo", risk="low", fn=None):
    return Tool(
        name=name,
        description=f"{name} tool",
        parameters={"text": "text to process"},
        run=fn or (lambda args: f"echoed: {args.get('text', '')}"),
        risk_level=risk,
    )


def scripted_llm(replies):
    """Returns an llm callable that yields each reply in order."""
    it = iter(replies)
    return lambda prompt: next(it)


def tool_call(tool, **args):
    return json.dumps({"thought": "t", "tool": tool, "args": args})


# ── ToolRegistry ──────────────────────────────────────────────────────────────

class TestToolRegistry:
    def test_finish_always_present(self):
        reg = ToolRegistry([make_tool()])
        assert reg.get(FINISH_TOOL) is not None
        assert "echo" in reg.names()

    def test_empty_registry_still_has_finish(self):
        reg = ToolRegistry()
        assert reg.names() == [FINISH_TOOL]

    def test_render_for_prompt_lists_all_tools(self):
        reg = ToolRegistry([make_tool()])
        rendered = reg.render_for_prompt()
        assert "echo(text: text to process)" in rendered
        assert FINISH_TOOL in rendered


# ── parse_action ──────────────────────────────────────────────────────────────

class TestParseAction:
    def test_plain_json(self):
        a = parse_action('{"thought": "x", "tool": "echo", "args": {"text": "hi"}}')
        assert a.tool == "echo"
        assert a.args == {"text": "hi"}
        assert a.thought == "x"

    def test_fenced_json(self):
        a = parse_action('```json\n{"tool": "echo", "args": {}}\n```')
        assert a.tool == "echo"

    def test_json_embedded_in_prose(self):
        a = parse_action('Sure! Here is my step:\n{"tool": "echo", "args": {"text": "a"}}\nDone.')
        assert a.tool == "echo"

    def test_action_key_alias(self):
        a = parse_action('{"action": "echo", "arguments": {"text": "a"}}')
        assert a.tool == "echo"
        assert a.args == {"text": "a"}

    def test_non_dict_args_wrapped(self):
        a = parse_action('{"tool": "echo", "args": "raw string"}')
        assert a.args == {"input": "raw string"}

    def test_no_json_returns_none(self):
        assert parse_action("I will now think about the problem.") is None

    def test_missing_tool_returns_none(self):
        assert parse_action('{"thought": "no tool here"}') is None


# ── AgentLoop ─────────────────────────────────────────────────────────────────

class TestAgentLoop:
    def test_runs_tool_then_finishes(self):
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=scripted_llm([
                tool_call("echo", text="hello"),
                tool_call(FINISH_TOOL, result="all done"),
            ]),
        )
        state = loop.run("goal")
        assert state.finished is True
        assert state.stop_reason == "finish"
        assert state.final_result == "all done"
        assert len(state.steps) == 2
        assert state.steps[0].observation.content == "echoed: hello"

    def test_outcomes_shape_matches_review_contract(self):
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=scripted_llm([
                tool_call("echo", text="hi"),
                tool_call(FINISH_TOOL, result="done"),
            ]),
        )
        outcomes = loop.run("goal").outcomes()
        assert all({"step", "result", "status"} <= set(o) for o in outcomes)
        assert outcomes[0]["status"] == "success"

    def test_unknown_tool_yields_failed_observation_and_continues(self):
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=scripted_llm([
                tool_call("nonexistent"),
                tool_call(FINISH_TOOL, result="ok"),
            ]),
        )
        state = loop.run("goal")
        assert state.finished is True
        assert state.steps[0].observation.success is False
        assert "Unknown tool" in state.steps[0].observation.content

    def test_tool_exception_becomes_failed_observation(self):
        def boom(args):
            raise RuntimeError("kaput")
        loop = AgentLoop(
            tools=ToolRegistry([make_tool(fn=boom)]),
            llm=scripted_llm([
                tool_call("echo", text="x"),
                tool_call(FINISH_TOOL, result="recovered"),
            ]),
        )
        state = loop.run("goal")
        assert state.steps[0].observation.success is False
        assert "kaput" in state.steps[0].observation.content
        assert state.finished is True

    def test_max_steps_termination(self):
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=lambda prompt: tool_call("echo", text="again"),
            config=LoopConfig(max_steps=3),
        )
        state = loop.run("goal")
        assert state.finished is False
        assert state.stop_reason == "max_steps"
        assert len(state.steps) == 3

    def test_parse_failures_get_corrective_observation_then_stop(self):
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=lambda prompt: "no json here at all",
            config=LoopConfig(max_parse_failures=3),
        )
        state = loop.run("goal")
        assert state.stop_reason == "unparseable_llm_output"
        # two corrective steps recorded before the third failure stops the loop
        assert len(state.steps) == 2
        assert all(not s.observation.success for s in state.steps)

    def test_parse_failure_counter_resets_on_success(self):
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=scripted_llm([
                "garbage",
                tool_call("echo", text="ok"),
                "garbage",
                "garbage",
                tool_call(FINISH_TOOL, result="done"),
            ]),
            config=LoopConfig(max_parse_failures=3),
        )
        state = loop.run("goal")
        assert state.finished is True

    def test_critic_block_prevents_execution(self):
        executed = []
        def record(args):
            executed.append(args)
            return "ran"
        loop = AgentLoop(
            tools=ToolRegistry([make_tool(fn=record)]),
            llm=scripted_llm([
                tool_call("echo", text="dangerous"),
                tool_call(FINISH_TOOL, result="gave up"),
            ]),
            critic=lambda action: (False, "too risky"),
        )
        state = loop.run("goal")
        assert executed == []
        assert state.steps[0].observation.success is False
        assert "too risky" in state.steps[0].observation.content

    def test_critic_exception_fails_closed(self):
        def bad_critic(action):
            raise RuntimeError("critic down")
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=scripted_llm([
                tool_call("echo", text="x"),
                tool_call(FINISH_TOOL, result="r"),
            ]),
            critic=bad_critic,
        )
        state = loop.run("goal")
        assert state.steps[0].observation.success is False
        assert "critic error" in state.steps[0].observation.content

    def test_pre_step_check_halts_loop(self):
        class Halt(Exception):
            pass
        calls = {"n": 0}
        def check():
            calls["n"] += 1
            if calls["n"] > 1:
                raise Halt()
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=lambda prompt: tool_call("echo", text="x"),
            pre_step_check=check,
        )
        with pytest.raises(Halt):
            loop.run("goal")

    def test_observation_truncated_in_history(self):
        big = "x" * 10_000
        prompts = []
        def llm(prompt):
            prompts.append(prompt)
            if len(prompts) == 1:
                return tool_call("echo", text="big")
            return tool_call(FINISH_TOOL, result="done")
        loop = AgentLoop(
            tools=ToolRegistry([make_tool(fn=lambda a: big)]),
            llm=llm,
            config=LoopConfig(obs_char_limit=100),
        )
        loop.run("goal")
        # second prompt contains the first observation, truncated
        assert "x" * 100 in prompts[1]
        assert "x" * 101 not in prompts[1]

    def test_history_drops_oldest_steps_beyond_budget(self):
        replies = [tool_call("echo", text=f"step{i}") for i in range(6)]
        replies.append(tool_call(FINISH_TOOL, result="done"))
        prompts = []
        inner = scripted_llm(replies)
        def llm(prompt):
            prompts.append(prompt)
            return inner(prompt)
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=llm,
            config=LoopConfig(max_steps=10, history_char_budget=150),
        )
        loop.run("goal")
        assert "[earlier steps truncated]" in prompts[-1]

    def test_events_emitted(self):
        events = []
        loop = AgentLoop(
            tools=ToolRegistry([make_tool()]),
            llm=scripted_llm([
                tool_call("echo", text="x"),
                tool_call(FINISH_TOOL, result="r"),
            ]),
            on_event=lambda t, p: events.append(t),
        )
        loop.run("goal")
        assert "loop_action" in events
        assert "loop_observation" in events
        assert "loop_finished" in events


# ── harness.py integration ───────────────────────────────────────────────────

class TestHarnessIntegration:
    def _make_agent(self, harness, tools):
        class ToolAgent(harness.BaseAgent):
            def get_tools(self):
                return [t.name for t in tools]
            def get_tool_objects(self, run_id: str):
                return tools
        agent = ToolAgent(goal="test goal")
        agent.write_event = MagicMock()
        agent.check_killswitch = lambda: None
        agent.check_budget = lambda run_id: None
        return agent

    def test_execute_drives_tool_loop(self):
        import harness
        agent = self._make_agent(harness, [make_tool()])
        replies = scripted_llm([
            tool_call("echo", text="hi"),
            tool_call(FINISH_TOOL, result="loop done"),
        ])
        with patch("harness.generate_tracked", side_effect=lambda m, p, *a, **k: replies(p)):
            result = agent.execute({"steps": ["use echo"]}, "run-1")
        assert result["finished"] is True
        assert result["final"] == "loop done"
        assert result["outcomes"][0]["status"] == "success"

    def test_execute_legacy_fallback_without_tool_objects(self):
        import harness

        class LegacyAgent(harness.BaseAgent):
            def get_tools(self):
                return ["something"]

            def get_tool_objects(self, run_id):
                # No real Tool objects → legacy single-shot path in execute().
                # (The base class now returns a delegate_task tool by default.)
                return None

        agent = LegacyAgent(goal="test goal")
        agent.write_event = MagicMock()
        legacy_reply = json.dumps({
            "outcomes": [{"step": "s", "result": "r", "status": "success"}]
        })
        with patch("harness.generate_tracked", return_value=legacy_reply) as gen:
            result = agent.execute({"steps": ["s"]}, "run-2")
        assert gen.call_count == 1  # single-shot, no loop
        assert result["outcomes"][0]["result"] == "r"

    def test_low_risk_tools_skip_critic_llm(self):
        import harness
        agent = self._make_agent(harness, [make_tool(risk="low")])
        registry = harness.ToolRegistry(agent.get_tool_objects("run-3"))
        critic = agent._build_action_critic("run-3", "goal", registry)
        with patch("agents.safety.critic.CriticGate.evaluate") as ev:
            allowed, reason = critic({"tool": "echo", "args": {}, "thought": ""})
        assert allowed is True
        ev.assert_not_called()
