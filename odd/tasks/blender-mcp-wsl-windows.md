# Blender MCP from Pi on WSL to Windows Blender

## Goal

Prepare Pi in Fedora WSL2 to use Blender Lab's MCP bridge with Blender 5.2.2 on Windows. Codex remains Pi's LLM provider; Pi is the MCP client.

## Tasks

- [x] Install the official `blender-mcp` stdio bridge in Fedora WSL with `uv`.
- [x] Register the bridge in `~/.pi/agent/mcp-adapter.json`, bound to the current WSL gateway `172.30.128.1:9876`, with per-call approval enabled.
- [x] Install/enable the official add-on in Blender, enable Online Access, set Host/Port, and start the bridge.

## Constraints and risks

- Do not modify Windows Codex MCP configuration; it is not the client in this setup.
- Do not bind the Blender listener to `0.0.0.0`; keep it bound to the WSL gateway interface.
- The official Blender MCP page warns that generated Python runs in Blender without protections against data deletion or exfiltration. Keep the Pi MCP server's per-call approval enabled.
- The WSL gateway may change after WSL networking restarts; update both sides if it does.
- No tests or TDD requested. Do not claim the connection is active until the user enables the add-on in Blender and Pi can use the server.

## Progress

- Task 1: done. `uv tool install --python 3.11 --from 'git+https://projects.blender.org/lab/blender_mcp.git#subdirectory=mcp' blender-mcp` installed Blender MCP 1.0.2 from official commit `dbbf836ad4b1025f14a2b3b504c43903f39e0b04`.
- Task 2: done. Added the `blender` server to `~/.pi/agent/mcp-adapter.json` with `inheritEnv: false` and per-call approval enabled.
- Task 3: done. Pi connected to Blender MCP and exposed 26 tools. Created `Sphere` (radius 1 BU), `Cube` (edge 1 BU), and `Tetrahedron` (all six edges 1 BU); all are aligned along X on Z=0. Scene changes remain unsaved.
- No commit: this is a user-level environment setup, not a repository feature commit.
