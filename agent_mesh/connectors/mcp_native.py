import asyncio
import os
from typing import Any, Dict, List, Optional
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from loop import Tool
from .base import BaseConnector, ConnectorConfig
from .registry import registry
import logging

logger = logging.getLogger(__name__)

class MCPNativeConnector(BaseConnector):
    def _build_params(self) -> StdioServerParameters:
        command = self.config.get("command") or self.config.get("mcp_command")
        if not command:
            # Fallback to config schema default if not provided dynamically
            command = registry.get_config(self.config.get("provider_id", "")).mcp_command
            
        args = self.config.get("args") or self.config.get("mcp_args") or []
        if not args:
            args_str = self.config.get("args_string")
            if args_str:
                import shlex
                args = shlex.split(args_str)
            else:
                args = registry.get_config(self.config.get("provider_id", "")).mcp_args or []
            
        env = os.environ.copy()
        # Inject dynamic config fields into environment or args
        for k, v in self.config.items():
            if k not in ("command", "args", "mcp_command", "mcp_args", "provider_id"):
                env[k] = str(v)
                # Also do arg replacement like {DATABASE_URL}
                args = [arg.replace(f"{{{k}}}", str(v)) for arg in args]
                
        return StdioServerParameters(command=command, args=args, env=env)

    def test(self) -> bool:
        async def _test():
            try:
                params = self._build_params()
                async with stdio_client(params) as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        return True
            except Exception as e:
                logger.error(f"MCP Test Failed: {e}")
                return False
        return asyncio.run(_test())

    def get_tools(self) -> List[Tool]:
        async def _fetch():
            tools = []
            try:
                params = self._build_params()
                # We can't keep the connection open forever across DBOS steps easily without complex state.
                # For this prototype, we'll fetch tools, and the Tool.run method will establish a quick 
                # session to execute. In a production system, we'd use a persistent MCP connection manager.
                async with stdio_client(params) as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        mcp_tools = await session.list_tools()
                        
                        for mcp_tool in mcp_tools.tools:
                            # Capture closure variables correctly
                            def make_runner(t_name=mcp_tool.name):
                                def run_tool(args: Dict[str, Any]) -> str:
                                    async def _run():
                                        async with stdio_client(self._build_params()) as (r, w):
                                            async with ClientSession(r, w) as s:
                                                await s.initialize()
                                                result = await s.call_tool(t_name, arguments=args)
                                                
                                                out = []
                                                for content in result.content:
                                                    if content.type == "text":
                                                        out.append(content.text)
                                                    else:
                                                        out.append(f"[{content.type} content]")
                                                return "\n".join(out)
                                    return asyncio.run(_run())
                                return run_tool

                            # Build parameters dict
                            params_dict = {}
                            if mcp_tool.inputSchema and "properties" in mcp_tool.inputSchema:
                                for p_name, p_details in mcp_tool.inputSchema["properties"].items():
                                    params_dict[p_name] = p_details.get("description", p_details.get("type", "string"))

                            tools.append(Tool(
                                name=f"{self.config.get('provider_id', 'mcp')}_{mcp_tool.name}",
                                description=mcp_tool.description or f"MCP tool: {mcp_tool.name}",
                                parameters=params_dict,
                                run=make_runner(),
                                risk_level="medium"
                            ))
            except Exception as e:
                logger.error(f"Failed to fetch MCP tools: {e}")
            return tools

        return asyncio.run(_fetch())


# ── Register Official MCP Servers ─────────────────────────────────────────────

registry.register(
    "mcp-postgres",
    ConnectorConfig(
        provider_id="mcp-postgres",
        connector_type="mcp",
        name="PostgreSQL",
        description="Official MCP Server for PostgreSQL database access.",
        icon="database",
        category="database",
        auth_type="mcp_env",
        mcp_command="npx",
        mcp_args=["-y", "@modelcontextprotocol/server-postgres", "{DATABASE_URL}"],
        config_schema=[
            {"name": "DATABASE_URL", "label": "Database URL", "type": "password", "required": True, "placeholder": "postgresql://user:pass@host/db"}
        ]
    ),
    MCPNativeConnector
)

registry.register(
    "mcp-github",
    ConnectorConfig(
        provider_id="mcp-github",
        connector_type="mcp",
        name="GitHub (MCP)",
        description="Official MCP Server for GitHub repositories, issues, and PRs.",
        icon="github",
        category="source-control",
        auth_type="mcp_env",
        mcp_command="npx",
        mcp_args=["-y", "@modelcontextprotocol/server-github"],
        config_schema=[
            {"name": "GITHUB_PERSONAL_ACCESS_TOKEN", "label": "Personal Access Token", "type": "password", "required": True, "placeholder": "ghp_..."}
        ]
    ),
    MCPNativeConnector
)

registry.register(
    "mcp-slack",
    ConnectorConfig(
        provider_id="mcp-slack",
        connector_type="mcp",
        name="Slack (MCP)",
        description="Official MCP Server for Slack messaging and channel reading.",
        icon="message-square",
        category="communication",
        auth_type="mcp_env",
        mcp_command="npx",
        mcp_args=["-y", "@modelcontextprotocol/server-slack"],
        config_schema=[
            {"name": "SLACK_BOT_TOKEN", "label": "Bot Token", "type": "password", "required": True, "placeholder": "xoxb-..."},
            {"name": "SLACK_TEAM_ID", "label": "Team ID", "type": "text", "required": True, "placeholder": "T01234567"}
        ]
    ),
    MCPNativeConnector
)

registry.register(
    "mcp-brave-search",
    ConnectorConfig(
        provider_id="mcp-brave-search",
        connector_type="mcp",
        name="Brave Search",
        description="Web search via Brave's Search API.",
        icon="search",
        category="search",
        auth_type="mcp_env",
        mcp_command="npx",
        mcp_args=["-y", "@modelcontextprotocol/server-brave-search"],
        config_schema=[
            {"name": "BRAVE_API_KEY", "label": "Brave API Key", "type": "password", "required": True, "placeholder": "BSA..."}
        ]
    ),
    MCPNativeConnector
)

registry.register(
    "mcp-google-drive",
    ConnectorConfig(
        provider_id="mcp-google-drive",
        connector_type="mcp",
        name="Google Drive",
        description="Access and read documents from Google Drive.",
        icon="cloud",
        category="cloud",
        auth_type="mcp_env",
        mcp_command="npx",
        mcp_args=["-y", "@modelcontextprotocol/server-google-drive"],
        config_schema=[] # Requires complex local auth, simplified for UI
    ),
    MCPNativeConnector
)

registry.register(
    "generic-mcp",
    ConnectorConfig(
        provider_id="generic-mcp",
        connector_type="mcp",
        name="Custom MCP Server",
        description="Connect any standard MCP server via command line execution.",
        icon="tool",
        category="tool",
        auth_type="mcp_stdio",
        config_schema=[
            {"name": "command", "label": "Command", "type": "text", "required": True, "placeholder": "npx"},
            {"name": "args_string", "label": "Arguments (space separated)", "type": "text", "required": True, "placeholder": "-y @modelcontextprotocol/server-everything"}
        ]
    ),
    MCPNativeConnector
)
