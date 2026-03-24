# Contributing to Claude Code for PowerPC

Thank you for your interest in contributing to Claude Code running natively on Mac OS X Leopard (2007) for PowerPC G5!

## About This Project

This project brings Claude Code CLI to vintage PowerPC Macs:
- Native PowerPC G5 support on Mac OS X Leopard 10.5
- Direct TLS 1.2 implementation (bypassing system limitations)
- QuickJS JavaScript engine for runtime
- Python integration for extended functionality

## Development Setup

### Prerequisites

- PowerPC Mac (G4 or G5) OR QEMU emulator
- Mac OS X Leopard (10.5.8 recommended)
- Xcode 3.1.4 (last version for PowerPC)
- Git 1.6+ (install via MacPorts)

### Setting Up QEMU (for development without hardware)

```bash
# Install QEMU
brew install qemu

# Create PowerPC VM
qemu-system-ppc -hda leopard.qcow2 -m 1024 -cdrom leopard.dmg
```

### Building from Source

1. Clone the repository:
```bash
git clone https://github.com/Scottcjn/claude-code-ppc.git
cd claude-code-ppc
```

2. Install dependencies:
```bash
# Using MacPorts
sudo port install openssl python25

# Or build from source
./scripts/build-deps.sh
```

3. Build Claude Code:
```bash
make clean
make
sudo make install
```

## Development Workflow

### Project Structure

```
claude-code-ppc/
├── src/              # Core C/C++ source
├── quickjs/          # QuickJS JavaScript engine
├── python/           # Python bindings
├── tls/              # TLS 1.2 implementation
├── scripts/          # Build and utility scripts
└── docs/             # Documentation
```

### Running Tests

```bash
# Run unit tests
make test

# Run integration tests
./scripts/integration-test.sh

# Test TLS handshake
./scripts/test-tls.sh
```

## Code Style Guidelines

### C/C++ Code

- Use 4-space indentation
- Follow K&R brace style
- Keep lines under 100 characters
- Comment non-obvious platform-specific code

Example:
```c
/* PowerPC-specific byte swap for big-endian systems */
static inline uint32_t ppc_bswap32(uint32_t x) {
    return __builtin_bswap32(x);  /* GCC built-in for PPC */
}
```

### JavaScript (QuickJS)

- ES2020 subset compatible with QuickJS
- Avoid modern features (async/await, BigInt, etc.)
- Test on QuickJS 2020-01-19 or later

### Python Code

- Python 2.5 compatible syntax
- No f-strings (use % formatting)
- No type hints
- Test on Python 2.5.4

## Platform-Specific Considerations

### Memory Management

- Leopard has 32-bit memory limits
- Be mindful of heap allocations
- Use mmap for large buffers

### TLS Implementation

The custom TLS 1.2 layer bypasses system limitations:
- Uses OpenSSL 1.0.2u (last 1.0.x release)
- Custom certificate validation
- Direct socket I/O

### Performance Optimization

- PowerPC G5 is big-endian
- AltiVec available for SIMD operations
- Cache line size: 128 bytes

## Making Contributions

### Types of Contributions Welcome

- Bug fixes for Leopard compatibility
- Performance optimizations
- Documentation improvements
- Additional PowerPC optimizations
- TLS security improvements
- Build system enhancements

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test on Leopard (emulator or real hardware)
5. Update documentation if needed
6. Submit a pull request

### Commit Message Format

```
feat: Add AltiVec-optimized string functions
fix: Correct TLS handshake on slow connections
perf: Reduce memory usage by 20%
docs: Update build instructions for Tiger
refactor: Simplify QuickJS integration
test: Add TLS certificate validation tests
```

## Testing Guidelines

### Minimum Test Requirements

- [ ] Builds successfully on Leopard
- [ ] Runs without crashes
- [ ] TLS connections work (test with `claude auth status`)
- [ ] Basic commands execute (`claude --help`, `claude --version`)
- [ ] File operations work correctly

### Testing on Real Hardware

If you have access to PowerPC hardware:
- Test on both G4 and G5 processors
- Verify on different Leopard versions (10.5.0 - 10.5.8)
- Check memory usage under load

### Testing on Emulator

QEMU PowerPC emulation is acceptable for:
- Code compilation
- Basic functionality testing
- Regression testing

## Debugging

### Common Issues

**TLS handshake fails:**
```bash
# Enable debug logging
export CLAUDE_DEBUG=1
claude auth status
```

**Memory errors:**
```bash
# Check available memory
vm_stat
# Monitor during execution
./scripts/memcheck.sh claude
```

**Build failures:**
```bash
# Clean build
make distclean
./configure --with-openssl=/opt/local
make
```

## Resources

- [Mac OS X Leopard Development](https://developer.apple.com/)
- [PowerPC Architecture Book](https://www.ibm.com/developerworks/systems/library/es-archguide-v2.html)
- [QuickJS Documentation](https://bellard.org/quickjs/)
- [OpenSSL 1.0.2 Documentation](https://www.openssl.org/docs/man1.0.2/)
- [RustChain Bounties](https://github.com/Scottcjn/rustchain-bounties) — Earn RTC for contributions

## Questions?

- Open an issue for bugs or feature requests
- Join the Discord: https://discord.gg/cafc4nDV
- Check existing issues before creating new ones

## Code of Conduct

Be respectful and constructive. We're preserving computing history!

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
