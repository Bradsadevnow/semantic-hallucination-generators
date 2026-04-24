from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import subprocess
from threading import Lock
from typing import Any

from .tools import ToolRegistry


@dataclass
class MCPServerConfig:
    name: str
    command: str
    args: list[str]
    env: dict[str, str]


class MCPServerSession:
    def __init__(self, config: MCPServerConfig) -> None:
        self.config = config
        self._process: subprocess.Popen[str] | None = None
        self._request_id = 0
        self._lock = Lock()

    def start(self) -> None:
        if self._process is not None:
            return
        env = dict(os.environ)
        env.update(self.config.env)
        self._process = subprocess.Popen(
            [self.config.command, *self.config.args],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
        )
        self._rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "halcyon-runtime", "version": "0.1.0"}})
        self._notify("notifications/initialized", {})

    def close(self) -> None:
        if self._process is None:
            return
        self._process.terminate()
        self._process = None

    def list_tools(self) -> list[dict[str, Any]]:
        self.start()
        response = self._rpc("tools/list", {})
        return list(response.get("tools", []))

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.start()
        return self._rpc("tools/call", {"name": name, "arguments": arguments})

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        if self._process is None or self._process.stdin is None:
            raise RuntimeError("MCP process is not running")
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        self._process.stdin.write(json.dumps(payload) + "\n")
        self._process.stdin.flush()

    def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            if self._process is None or self._process.stdin is None or self._process.stdout is None:
                raise RuntimeError("MCP process is not running")
            self._request_id += 1
            request_id = self._request_id
            payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
            self._process.stdin.write(json.dumps(payload) + "\n")
            self._process.stdin.flush()

            while True:
                line = self._process.stdout.readline()
                if not line:
                    stderr = ""
                    if self._process.stderr is not None:
                        stderr = self._process.stderr.read()
                    raise RuntimeError(f"MCP server closed while waiting for {method}: {stderr}")
                message = json.loads(line)
                if message.get("id") != request_id:
                    continue
                if "error" in message:
                    raise RuntimeError(f"MCP error from {self.config.name}: {message['error']}")
                return message.get("result", {})


class MCPBridge:
    def __init__(self, config_path: Path) -> None:
        self.config_path = config_path
        self.sessions: dict[str, MCPServerSession] = {}

    def load(self) -> None:
        if not self.config_path.exists():
            return
        payload = json.loads(self.config_path.read_text(encoding="utf-8"))
        for raw in payload.get("servers", []):
            config = MCPServerConfig(
                name=raw["name"],
                command=raw["command"],
                args=list(raw.get("args", [])),
                env=dict(raw.get("env", {})),
            )
            self.sessions[config.name] = MCPServerSession(config)

    def register_tools(self, registry: ToolRegistry) -> list[str]:
        registered: list[str] = []
        for server_name, session in self.sessions.items():
            try:
                tool_specs = session.list_tools()
            except Exception:
                continue
            for tool in tool_specs:
                tool_name = tool["name"]
                description = tool.get("description", f"MCP tool from {server_name}")
                schema = tool.get("inputSchema", {"type": "object", "properties": {}})

                def handler(_session: MCPServerSession = session, _tool_name: str = tool_name, **kwargs: Any) -> dict[str, Any]:
                    return _session.call_tool(_tool_name, kwargs)

                registry.register(
                    name=f"{server_name}__{tool_name}",
                    description=description,
                    schema=schema,
                    handler=handler,
                    source=f"mcp:{server_name}",
                )
                registered.append(f"{server_name}__{tool_name}")
        return registered
