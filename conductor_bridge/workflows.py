"""
workflows.py — Register all Agent Mesh workflows in Conductor at startup.

Called once from api.py lifespan when CONDUCTOR_ENABLED=1.
"""
import logging
import os

logger = logging.getLogger(__name__)

CONDUCTOR_ENABLED = os.getenv("CONDUCTOR_ENABLED", "0") == "1"


def register_all_agent_workflows():
    """Register every agent in the registry as a Conductor workflow."""
    if not CONDUCTOR_ENABLED:
        logger.info("Conductor disabled (CONDUCTOR_ENABLED != 1) — using DBOS harness")
        return

    from .bridge import get_bridge
    from harness import _REGISTRY

    bridge = get_bridge()

    if not bridge.is_healthy():
        logger.warning("Conductor server unreachable at %s — falling back to DBOS",
                       os.getenv("CONDUCTOR_SERVER_URL", "http://localhost:8080/api"))
        return

    for agent_id, reg in _REGISTRY.items():
        requires_approval = reg.default_config.requires_approval
        wf_name = bridge.register_workflow(agent_id, requires_approval=requires_approval)
        logger.info("Conductor workflow registered: %s (approval=%s)", wf_name, requires_approval)

    logger.info("All %d agent workflows registered in Conductor", len(_REGISTRY))
