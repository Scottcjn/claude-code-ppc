# How Claude Runs Natively on a Power Mac G5

## The Achievement

You (Claude) are running on a **2003 Power Mac G5 Dual** — a PowerPC 970 machine running **Mac OS X Leopard 10.5** (Darwin 9.8.0). Your API calls go directly from this vintage hardware to `api.anthropic.com` over TLS 1.2. There is **no proxy, no relay, no intermediary server**. The HTTPS connection originates from the G5 itself.

This is believed to be the first time a modern LLM API client has run natively on PowerPC Mac hardware with direct TLS connectivity.

## Why This Is Hard

Mac OS X Leopard (2007) shipped with OpenSSL 0.9.7, which only supports TLS 1.0. The Anthropic API requires TLS 1.2 minimum. No modern browser, `curl`, or HTTP library available for Leopard can negotiate TLS 1.2. Every previous attempt to run API clients on vintage Macs required routing traffic through a modern proxy machine.

The G5 is also big-endian PowerPC — the opposite byte order from every modern x86/ARM system. Most JavaScript runtimes, TLS libraries, and HTTP parsers assume little-endian and fail or produce corrupt data on big-endian hardware.

Node.js does not support PowerPC Macs. The last version that could theoretically build is v0.12, which also lacks TLS 1.2 support.

## How We Solved It

### The Runtime: node_ppc

We built a custom JavaScript runtime called **node_ppc** that combines:

| Component | Version | Role |
|-----------|---------|------|
| **QuickJS** | 2024-01-13 | JavaScript engine (ES2020 compliant, 1MB binary) |
| **mbedTLS** | 2.28 LTS | TLS 1.2 implementation (designed for embedded/portable use) |
| **Custom C glue** | node_ppc_simple.c + node_ppc_https.c | Node.js-compatible API surface |

The key insight: **mbedTLS is written in portable C with no architecture assumptions**. It handles big-endian correctly, compiles cleanly with GCC 10 on PowerPC, and implements TLS 1.2 with modern cipher suites. By embedding it directly into the runtime, we bypass the OS-level TLS stack entirely.

### The Build

Compiled natively on the G5 with:
```
CC = /usr/local/gcc-10/bin/gcc
CFLAGS = -O1 -mcpu=970 -fwrapv -DUSE_QUICKJS
LIBS = -lquickjs -lmbedtls -lmbedx509 -lmbedcrypto -lm -latomic
```

The `-O1` flag is critical — `-O2` causes bus errors on PowerPC due to aggressive alignment optimizations. The `-latomic` links 64-bit atomic operations not natively available on the G5's GCC runtime.

### The Fetch API

The global `fetch()` function is implemented in C (`node_ppc_https.c`) and works like this:

```
JavaScript: fetch(url, {method, headers, body})
    |
    v
C layer: parse URL, resolve DNS, open TCP socket
    |
    v
mbedTLS: TLS 1.2 handshake with api.anthropic.com:443
    |  - ECDHE key exchange
    |  - AES-128-GCM or AES-256-GCM cipher
    |  - Certificate verification
    v
HTTP/1.1: Send request, read chunked response
    |
    v
C layer: Return {status, text()} to JavaScript
```

This is **synchronous** — the call blocks until the full response arrives. There is no streaming. For a CLI that displays complete responses, this is fine and dramatically simplifies the code.

### Connection Pooling

The HTTP layer maintains up to 8 persistent connections with keep-alive. After the first API call (which includes the TLS handshake overhead), subsequent calls reuse the existing connection and are significantly faster.

## The CLI: claude_g5.js

A single 972-line JavaScript file that provides a Claude Code-like experience:

### Authentication
```
1. Check ANTHROPIC_API_KEY environment variable
2. If not set, read ~/.claude/.credentials.json for OAuth token
3. OAuth tokens use: Authorization: Bearer <token>
   API keys use: x-api-key: <key>
```

### Tool Execution Loop

The CLI sends tool definitions (Read, Write, Edit, Bash, Glob, Grep) with each API request. When Claude's response contains `tool_use` blocks, the CLI:

1. Executes the tool locally on the G5
2. Sends the result back as a `tool_result` message
3. Repeats until Claude responds with only text (up to 25 iterations)

This means Claude can read files, write code, run shell commands, and search the filesystem — all executing natively on the PowerPC hardware.

### Input Method

The `bak3` build of node_ppc lacks a global `prompt()` function, so input is read via:
```javascript
child_process.execSync('IFS= read -r line && printf "%s" "$line"', {
    shell: "/bin/bash",
    stdio: ["inherit", "pipe", "pipe"]
});
```
This inherits stdin from the parent process, allowing bash's `read` builtin to capture user input.

## What This Is NOT

- **Not an emulator** — this is native PowerPC code running on real G5 hardware
- **Not proxied** — TLS terminates on the G5 itself, not on another machine
- **Not a web wrapper** — there is no browser involved; it is a terminal CLI
- **Not Node.js** — QuickJS is a completely separate JavaScript engine

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│  Power Mac G5 Dual (PowerPC 970, Leopard)   │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  claude_g5.js (972 lines)             │  │
│  │  - REPL loop, tool dispatch           │  │
│  │  - Markdown renderer                  │  │
│  │  - Slash commands, cost tracking      │  │
│  └────────────┬──────────────────────────┘  │
│               │ JavaScript API               │
│  ┌────────────┴──────────────────────────┐  │
│  │  node_ppc (QuickJS engine)            │  │
│  │  - ES2020 JavaScript                  │  │
│  │  - fs, os, child_process modules      │  │
│  │  - Global fetch() function            │  │
│  └────────────┬──────────────────────────┘  │
│               │ C function call              │
│  ┌────────────┴──────────────────────────┐  │
│  │  node_ppc_https.c                     │  │
│  │  - HTTP/1.1 parser                    │  │
│  │  - Connection pooling (8 max)         │  │
│  │  - Chunked transfer decoding          │  │
│  └────────────┬──────────────────────────┘  │
│               │ TLS record layer             │
│  ┌────────────┴──────────────────────────┐  │
│  │  mbedTLS 2.28 LTS                     │  │
│  │  - TLS 1.2 handshake                  │  │
│  │  - ECDHE + AES-GCM                    │  │
│  │  - Big-endian safe                    │  │
│  └────────────┬──────────────────────────┘  │
│               │ TCP socket                   │
│  ┌────────────┴──────────────────────────┐  │
│  │  Mac OS X Leopard kernel (Darwin 9.8) │  │
│  │  - BSD sockets                        │  │
│  │  - DNS resolution                     │  │
│  └────────────┬──────────────────────────┘  │
└───────────────┼─────────────────────────────┘
                │ Ethernet
                v
        api.anthropic.com:443
```

## Key Files

| File | Purpose |
|------|---------|
| `claude_g5.js` | The CLI — REPL, tools, rendering, commands |
| `claude_chat.js` | Simpler batch script — 6 preset conversations |
| `claude_g5_demo.js` | Minimal interactive REPL (no tools) |
| `node_ppc_simple.c` | Runtime core — fs, os, process, child_process |
| `node_ppc_https.c` | HTTP/HTTPS with mbedTLS + connection pooling |
| `node_ppc_crypto.c` | Crypto module (SHA, HMAC, AES-GCM) |
| `Makefile` | Build system (targets: g4, g5, simple) |

## Running

```bash
# On the G5 (in Terminal.app or via SSH)
cd ~/node-ppc-scaffold
./node_ppc claude_g5.js

# Non-interactive mode
./node_ppc claude_g5.js -p "List the files in /etc"

# With explicit API key
ANTHROPIC_API_KEY=sk-ant-... ./node_ppc claude_g5.js
```

## The Lineage

| Date | Milestone |
|------|-----------|
| 2003 | Power Mac G5 ships (PowerPC 970, first 64-bit desktop Mac) |
| 2007 | Mac OS X Leopard 10.5 released (last PPC-native macOS) |
| 2020 | QuickJS released (Fabrice Bellard, ES2020 in ~1MB) |
| 2024 | mbedTLS 2.28 LTS (portable TLS for embedded systems) |
| 2025 | node_ppc built — QuickJS + mbedTLS compiled for PowerPC |
| 2026 | Claude runs natively on a 23-year-old Mac, no proxy needed |

---

*Built by Elyan Labs. Part of the node-ppc project: https://github.com/Scottcjn/node-ppc*
