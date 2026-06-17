"""
conductor/ — Agent Mesh × Conductor OSS integration

Provides a drop-in replacement for the DBOS harness that routes
agent workflows through Conductor's durable execution engine.

Usage:
    from conductor_bridge.bridge import run_agent, register_agent_workflow

Environment:
    CONDUCTOR_SERVER_URL  — default http://localhost:8080/api
    CONDUCTOR_AUTH_TOKEN  — optional, for Orkes Cloud
"""
from .bridge import ConductorBridge, run_agent_via_conductor
from .workflows import register_all_agent_workflows

__all__ = ["ConductorBridge", "run_agent_via_conductor", "register_all_agent_workflows"]
