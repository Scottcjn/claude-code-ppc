# Contributing to Claude Code for PowerPC

Thank you for your interest in contributing to Claude Code for PowerPC! This project brings AI-powered coding assistance to vintage Power Mac G5 hardware running Mac OS X Leopard.

## Project Overview

This is a Claude Code-like CLI that runs natively on PowerPC G5 hardware with:
- **PowerPC 970 / G5** native execution (no emulation)
- **QuickJS + mbedTLS runtime** bypassing OS crypto (OpenSSL 0.9.7 doesn't support TLS 1.2)
- **Direct TLS 1.2** connections to the Anthropic API
- Full tool execution loop: Read, Write, Edit, Bash, Glob, Grep

## Development Setup

### Prerequisites

- Power Mac G5 with Mac OS X 10.5 Leopard, **OR**
- [node_ppc](https://github.com/Scottcjn/node-ppc) runtime for cross-compilation
- Anthropic API key

### Quick Start

```bash
# Clone the repo
git clone https://github.com/Scottcjn/claude-code-ppc.git
cd claude-code-ppc

# Set up node_ppc runtime
# See: https://github.com/Scottcjn/node-ppc

# Run the CLI
./node_ppc claude_g5.js

# Non-interactive mode
./node_ppc claude_g5.js -p "List files in /etc"
```

## Making Changes

### Branching Strategy

- `main` — stable, BCOS-certified code
- Work on feature branches: `feature/your-feature-name`

### Code Style

- JavaScript: Follow existing patterns in `claude_g5.js`
- Use meaningful variable names matching the PowerPC/leopard context
- Add comments for non-obvious PowerPC-specific code

### Pull Request Process

1. **Fork** the repository and create a feature branch
2. **Test** your changes on real hardware (G5) or node_ppc cross-compile environment
3. **Document** any new features or changed behavior in code comments
4. **PR** with a clear description of what changed and why
5. Reference any related [RustChain bounty issues](https://github.com/Scottcjn/rustchain-bounties/issues)

## What to Contribute

- Bug fixes for PowerPC-specific issues
- Improved error messages
- Additional slash commands (`/help`, `/model`, etc.)
- Documentation improvements
- TLS/mbedTLS handshake optimizations
- QuickJS runtime patches

## Reporting Issues

- Check if the issue reproduces on real G5 hardware vs. node_ppc cross-compile
- Include: OS version, hardware model, node_ppc version, error output
- Tag with `bug`, `enhancement`, or `question`

## Related Repositories

- [node-ppc](https://github.com/Scottcjn/node-ppc) — Custom QuickJS + mbedTLS runtime
- [RustChain](https://github.com/Scottcjn/RustChain) — Proof-of-Antiquity blockchain
- [rustchain-bounties](https://github.com/Scottcjn/rustchain-bounties) — Earn RTC for contributions

---

*Part of the [Elyan Labs](https://github.com/Scottcjn) ecosystem*
