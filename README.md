# Claude Code for PowerPC

**World's first: Claude Code running natively on Mac OS X Leopard (2007)**

A full Claude Code-like CLI running on a **Power Mac G5** (PowerPC 970, Mac OS X 10.5 Leopard) with **direct TLS 1.2 connections** to the Anthropic API. No proxy. No relay. No modern machine in the middle.

```
┌─────────────────────────────────────┐
│  Power Mac G5 (Mac OS X 10.5)      │
│  claude_g5.js ─► node_ppc runtime  │
│  QuickJS ─► mbedTLS ─► TLS 1.2    │
└───────────────┬─────────────────────┘
                │ direct HTTPS (no proxy)
                ▼
        api.anthropic.com:443
```

## What This Is

An agentic coding CLI — Claude reads files, writes code, executes shell commands, and searches the filesystem, all running natively on big-endian PowerPC hardware from 2003. The full tool execution loop works, not just chat.

## Requirements

- [**node_ppc**](https://github.com/Scottcjn/node-ppc) — custom QuickJS + mbedTLS runtime for PowerPC Mac OS X
- An Anthropic API key or OAuth credentials (`~/.claude/.credentials.json`)

## Quick Start

```bash
# On the G5 (or any machine with node_ppc)
cd ~/node-ppc-scaffold
./node_ppc claude_g5.js
```

```bash
# Non-interactive mode
./node_ppc claude_g5.js -p "List the files in /etc"
```

```bash
# With explicit API key
ANTHROPIC_API_KEY=sk-ant-... ./node_ppc claude_g5.js
```

## Features

### Tool Execution
Claude has full access to the local filesystem and shell:
- **Read** — Read files with line numbers
- **Write** — Create/overwrite files
- **Edit** — Surgical string replacement in files
- **Bash** — Execute shell commands
- **Glob** — Find files by pattern
- **Grep** — Search file contents

The tool loop runs up to 25 iterations per turn — Claude can chain tool calls just like the real Claude Code.

### Slash Commands
| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation history |
| `/cost` | Show token usage and estimated cost |
| `/status` | System info and API connectivity test |
| `/model` | Switch model (`/model haiku` or `/model sonnet`) |
| `/compact` | Compress conversation history to save tokens |
| `/history` | Show conversation summary |
| `/export` | Export conversation to markdown file |
| `/debug` | Toggle debug output |
| `/exit` | Exit |

### Shortcuts
| Syntax | Description |
|--------|-------------|
| `@filepath` | Include file content in your message |
| `!command` | Run a shell command directly |

### Other Features
- ANSI-colored markdown rendering (headers, code blocks, bold, bullets)
- Per-message and session token/cost tracking
- Model switching between Haiku (fast) and Sonnet (smart)
- OAuth and API key authentication
- Conversation export to markdown

## Files

| File | Description |
|------|-------------|
| `claude_g5.js` | Full Claude Code CLI (972 lines) — the main event |
| `claude_g5_demo.js` | Minimal interactive REPL (no tools, ~90 lines) |
| `claude_chat.js` | Batch conversation logger (~110 lines) |
| `CLAUDE_G5_ARCHITECTURE.md` | Deep technical breakdown of the native TLS stack |

## Why This Is Hard

Mac OS X Leopard ships with OpenSSL 0.9.7, which only supports TLS 1.0. The Anthropic API requires TLS 1.2 minimum. For 18 years the answer has been "upgrade your OS" or "route through a proxy."

We compiled [mbedTLS](https://github.com/Mbed-TLS/mbedtls) directly into the JavaScript runtime, bypassing the OS crypto stack entirely. mbedTLS is written in portable C with no architecture assumptions — it handles big-endian PowerPC correctly out of the box.

The TLS 1.2 handshake originates from the G5 itself:

```
claude_g5.js (JavaScript)
    │
    ▼
node_ppc (QuickJS engine)
    │
    ▼
node_ppc_https.c (HTTP/1.1 parser + connection pooling)
    │
    ▼
mbedTLS 2.28 (TLS 1.2 handshake, ECDHE + AES-GCM)
    │
    ▼
Darwin 9.8 kernel (BSD sockets, DNS)
    │
    ▼
api.anthropic.com:443
```

See [CLAUDE_G5_ARCHITECTURE.md](CLAUDE_G5_ARCHITECTURE.md) for the full technical breakdown.

## QuickJS Compatibility Notes

The `node_ppc` runtime uses QuickJS, not V8. This means:
- `fetch()` is synchronous — blocks until full response (no streaming)
- `var` used throughout (consistent with the runtime's JS patterns)
- `prompt()` not available in all builds — uses bash `read` builtin via `child_process.execSync`
- No `\u{XXXX}` extended unicode escapes
- `JSON.parse(response.text())` instead of `response.json()`

## Hardware Tested

| Machine | CPU | OS | Status |
|---------|-----|----|--------|
| Power Mac G5 Dual 2.0 GHz | PowerPC 970 | Leopard 10.5 | Working |
| Power Mac G4 MDD | PowerPC 7455 | Tiger 10.4 | Supported |
| PowerBook G4 | PowerPC 7447 | Leopard 10.5 | Supported |

## Related Projects

- [**node-ppc**](https://github.com/Scottcjn/node-ppc) — The runtime that makes this possible (QuickJS + mbedTLS for PowerPC)
- [rust-ppc-tiger](https://github.com/Scottcjn/rust-ppc-tiger) — Rust compiler for PowerPC Mac OS X
- [ppc-compilers](https://github.com/Scottcjn/ppc-compilers) — Pre-built GCC 7/10 for PowerPC

## License

MIT

---

*Built by [Elyan Labs](https://github.com/Scottcjn)*


## 中文简介

Claude Code Ppc - Elyan Labs 项目

为中文用户提供中文文档支持。

Contributed by eelaine-wzw
