/*
 * Claude Code for Power Mac G5
 * Full CLI with tool execution, ANSI rendering, slash commands
 * Runs on node_ppc (QuickJS + mbedTLS) - Mac OS X Leopard 10.5
 *
 * Elyan Labs 2025-2026
 */

var fs = require("fs");
var os = require("os");
var child_process = require("child_process");

// Synchronous prompt - reads one line from stdin
// Uses bash read with inherited stdin since QuickJS lacks global prompt()
function jsPrompt(prefix) {
    if (prefix) process.stdout.write(prefix);
    try {
        var result = child_process.execSync('set +H; IFS= read -r line && printf "%s" "$line"', {
            encoding: "utf8",
            shell: "/bin/bash",
            stdio: ["inherit", "pipe", "pipe"]
        });
        if (result === null || result === undefined) return null;
        return String(result);
    } catch (e) {
        return null;
    }
}

// ============ CONFIGURATION ============
var VERSION = "1.0.0";
var DEFAULT_MODEL = "claude-3-5-haiku-20241022";
var HAIKU_MODEL = "claude-3-5-haiku-20241022";
var MAX_TOKENS = 8192;
var MAX_CONTEXT_TOKENS = 100000;

// Configurable via env
var currentModel = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
var debug = process.env.CLAUDE_DEBUG === "1";

// ============ TOKEN / AUTH ============
function loadToken() {
    // 1. Environment variable (API key or OAuth)
    var key = process.env.ANTHROPIC_API_KEY || "";
    if (key) return { token: key, type: key.indexOf("sk-ant-oat") === 0 ? "oauth" : "apikey" };

    // 2. OAuth credentials file
    var home = process.env.HOME || "/Users/selenamac";
    try {
        var creds = JSON.parse(fs.readFileSync(home + "/.claude/.credentials.json", "utf8"));
        if (creds.claudeAiOauth && creds.claudeAiOauth.accessToken) {
            return { token: creds.claudeAiOauth.accessToken, type: "oauth" };
        }
    } catch (e) {}

    return { token: "", type: "none" };
}

var auth = loadToken();

// ============ ANSI COLORS ============
var C = {
    reset:   "\x1b[0m",
    bold:    "\x1b[1m",
    dim:     "\x1b[2m",
    italic:  "\x1b[3m",
    under:   "\x1b[4m",
    red:     "\x1b[31m",
    green:   "\x1b[32m",
    yellow:  "\x1b[33m",
    blue:    "\x1b[34m",
    magenta: "\x1b[35m",
    cyan:    "\x1b[36m",
    white:   "\x1b[37m",
    gray:    "\x1b[90m",
    bgBlue:  "\x1b[44m",
    bgGray:  "\x1b[100m"
};

// ============ MARKDOWN TO ANSI ============
function renderMarkdown(text) {
    var lines = text.split("\n");
    var result = [];
    var inCodeBlock = false;
    var codeLang = "";

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Code block toggle
        if (line.indexOf("```") === 0) {
            if (!inCodeBlock) {
                codeLang = line.substring(3).trim();
                result.push(C.dim + "  " + (codeLang ? "(" + codeLang + ")" : "") + " " + repeatStr("-", 40) + C.reset);
                inCodeBlock = true;
            } else {
                result.push(C.dim + "  " + repeatStr("-", 40) + C.reset);
                inCodeBlock = false;
                codeLang = "";
            }
            continue;
        }

        if (inCodeBlock) {
            result.push(C.green + "  " + line + C.reset);
            continue;
        }

        // Headers
        if (line.indexOf("### ") === 0) {
            result.push(C.bold + C.cyan + line.substring(4) + C.reset);
            continue;
        }
        if (line.indexOf("## ") === 0) {
            result.push(C.bold + C.blue + line.substring(3) + C.reset);
            continue;
        }
        if (line.indexOf("# ") === 0) {
            result.push(C.bold + C.magenta + line.substring(2) + C.reset);
            continue;
        }

        // Bullet points
        if (line.match && line.match(/^\s*[-*]\s/)) {
            line = line.replace(/^(\s*)[-*]\s/, "$1" + C.cyan + "* " + C.reset);
        }

        // Numbered lists
        if (line.match && line.match(/^\s*\d+\.\s/)) {
            line = line.replace(/^(\s*)(\d+\.)\s/, "$1" + C.cyan + "$2 " + C.reset);
        }

        // Inline code
        line = line.replace(/`([^`]+)`/g, C.green + "$1" + C.reset);

        // Bold
        line = line.replace(/\*\*([^*]+)\*\*/g, C.bold + "$1" + C.reset);

        // Italic
        line = line.replace(/\*([^*]+)\*/g, C.italic + "$1" + C.reset);

        result.push(line);
    }

    return result.join("\n");
}

function repeatStr(ch, n) {
    var s = "";
    for (var i = 0; i < n; i++) s += ch;
    return s;
}

// ============ COST TRACKING ============
var stats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalMessages: 0,
    totalApiCalls: 0,
    sessionStart: Date.now(),
    conversationTurns: 0
};

function estimateCost(inputTokens, outputTokens, model) {
    // Prices per million tokens (USD)
    var prices = {
        "claude-sonnet-4-20250514":    { input: 3.0,  output: 15.0 },
        "claude-3-5-haiku-20241022":   { input: 0.8,  output: 4.0  },
        "claude-3-5-sonnet-20241022":  { input: 3.0,  output: 15.0 }
    };
    var p = prices[model] || prices[DEFAULT_MODEL];
    return (inputTokens * p.input + outputTokens * p.output) / 1000000;
}

function formatCost(cents) {
    if (cents < 0.01) return "<$0.01";
    return "$" + cents.toFixed(4);
}

// ============ TOOLS ============
function toolRead(params) {
    try {
        var content = fs.readFileSync(params.file_path, "utf8");
        var lines = content.split("\n");
        var offset = params.offset || 0;
        var limit = params.limit || 2000;
        var selected = lines.slice(offset, offset + limit);
        var result = "";
        for (var i = 0; i < selected.length; i++) {
            var lineNum = String(offset + i + 1);
            while (lineNum.length < 6) lineNum = " " + lineNum;
            result += lineNum + "\t" + selected[i] + "\n";
        }
        return { content: result, total_lines: lines.length };
    } catch (e) {
        return { error: String(e) };
    }
}

function toolWrite(params) {
    try {
        // Create parent directories if needed
        var dir = params.file_path.replace(/\/[^/]*$/, "");
        if (dir && dir !== params.file_path) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
        }
        fs.writeFileSync(params.file_path, params.content);
        var lines = params.content.split("\n").length;
        return { success: true, lines: lines, path: params.file_path };
    } catch (e) {
        return { error: String(e) };
    }
}

function toolEdit(params) {
    try {
        var oldString = params.old_string;
        if (typeof oldString !== "string" || oldString === "") {
            // An empty old_string matches at offset 0, so String.replace would
            // silently prepend new_string instead of editing anything.
            return { error: "old_string must be a non-empty string" };
        }
        var newString = (params.new_string === null || params.new_string === undefined)
            ? ""
            : String(params.new_string);

        var content = fs.readFileSync(params.file_path, "utf8");
        var index = content.indexOf(oldString);
        if (index === -1) {
            return { error: "old_string not found in file" };
        }

        // Splice by index instead of String.replace: with a string pattern,
        // replace() still expands "$" sequences in the replacement, so
        // new_string values that are perfectly ordinary code ("$$" for a shell
        // PID, $'...' quoting, "$&" in a sed script) get rewritten on the way
        // to disk. The bytes Claude asked for must be the bytes we write.
        var newContent;
        var replacements;
        if (params.replace_all) {
            var pieces = content.split(oldString);
            replacements = pieces.length - 1;
            newContent = pieces.join(newString);
        } else {
            replacements = 1;
            newContent = content.substring(0, index) + newString +
                content.substring(index + oldString.length);
        }
        fs.writeFileSync(params.file_path, newContent);
        return { success: true, path: params.file_path, replacements: replacements };
    } catch (e) {
        return { error: String(e) };
    }
}

function toolBash(params) {
    try {
        var result = child_process.execSync(params.command + " 2>&1", {
            timeout: params.timeout || 120000,
            maxBuffer: 1024 * 1024
        });
        var output = (typeof result === "string") ? result : String(result);
        // Truncate very long output
        if (output.length > 30000) {
            output = output.substring(0, 15000) + "\n\n[... truncated " + (output.length - 30000) + " chars ...]\n\n" + output.substring(output.length - 15000);
        }
        return { stdout: output, exit_code: 0 };
    } catch (e) {
        return { stdout: e.stdout || String(e), exit_code: e.status || 1 };
    }
}

function toolGlob(params) {
    var path = params.path || ".";
    var pattern = params.pattern || "*";
    // Convert glob to find command
    var cmd = "find " + path + " -name '" + pattern.replace(/\*\*/g, "*") + "' 2>/dev/null | head -100";
    try {
        var result = child_process.execSync(cmd);
        var output = (typeof result === "string") ? result : String(result);
        var files = output.split("\n").filter(function(f) { return f.trim(); });
        return { files: files };
    } catch (e) {
        return { files: [] };
    }
}

function toolGrep(params) {
    var path = params.path || ".";
    var mode = params.output_mode || "files_with_matches";
    var cmd;
    if (mode === "files_with_matches") {
        cmd = "grep -rl '" + params.pattern + "' " + path + " 2>/dev/null | head -50";
    } else {
        cmd = "grep -rn '" + params.pattern + "' " + path + " 2>/dev/null | head -100";
    }
    try {
        var result = child_process.execSync(cmd);
        var output = (typeof result === "string") ? result : String(result);
        return { matches: output };
    } catch (e) {
        return { matches: "" };
    }
}

var toolMap = {
    "Read": toolRead,
    "Write": toolWrite,
    "Edit": toolEdit,
    "Bash": toolBash,
    "Glob": toolGlob,
    "Grep": toolGrep
};

var toolDefs = [
    {
        name: "Read",
        description: "Read a file from the filesystem. Returns file content with line numbers.",
        input_schema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Absolute path to the file" },
                offset: { type: "number", description: "Line offset to start from (0-indexed)" },
                limit: { type: "number", description: "Max lines to read (default 2000)" }
            },
            required: ["file_path"]
        }
    },
    {
        name: "Write",
        description: "Write content to a file. Creates parent directories if needed.",
        input_schema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Absolute path to write to" },
                content: { type: "string", description: "Content to write" }
            },
            required: ["file_path", "content"]
        }
    },
    {
        name: "Edit",
        description: "Edit a file by replacing an exact string match. Use for surgical edits.",
        input_schema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Absolute path to the file" },
                old_string: { type: "string", description: "Exact string to find" },
                new_string: { type: "string", description: "Replacement string" },
                replace_all: { type: "boolean", description: "Replace all occurrences" }
            },
            required: ["file_path", "old_string", "new_string"]
        }
    },
    {
        name: "Bash",
        description: "Run a shell command and return stdout/stderr. Use for git, build tools, system commands.",
        input_schema: {
            type: "object",
            properties: {
                command: { type: "string", description: "Shell command to execute" },
                timeout: { type: "number", description: "Timeout in ms (default 120000)" }
            },
            required: ["command"]
        }
    },
    {
        name: "Glob",
        description: "Find files matching a glob pattern.",
        input_schema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Glob pattern (e.g. *.js, *.py)" },
                path: { type: "string", description: "Root directory to search" }
            },
            required: ["pattern"]
        }
    },
    {
        name: "Grep",
        description: "Search for a pattern in files.",
        input_schema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Search pattern (regex)" },
                path: { type: "string", description: "Directory to search" },
                output_mode: { type: "string", description: "files_with_matches or context" }
            },
            required: ["pattern"]
        }
    }
];

// ============ API CLIENT ============
function callClaude(messages, systemPrompt) {
    if (!auth.token) {
        return { error: "No API token. Set ANTHROPIC_API_KEY or place credentials in ~/.claude/.credentials.json" };
    }

    var headers = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
    };

    if (auth.type === "oauth") {
        headers["Authorization"] = "Bearer " + auth.token;
        headers["anthropic-beta"] = "oauth-2025-04-20";
        headers["User-Agent"] = "claude-code/1.0.0";
    } else {
        headers["x-api-key"] = auth.token;
    }

    var body = JSON.stringify({
        model: currentModel,
        max_tokens: MAX_TOKENS,
        system: systemPrompt || getSystemPrompt(),
        tools: toolDefs,
        messages: messages
    });

    if (debug) {
        print(C.dim + "[DEBUG] API call: " + currentModel + " | " + messages.length + " messages | " + body.length + " bytes" + C.reset);
    }

    stats.totalApiCalls++;

    try {
        var response = fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: headers,
            body: body
        });

        var responseText;
        if (typeof response.text === "function") {
            responseText = response.text();
        } else if (response.body) {
            responseText = response.body;
        } else {
            responseText = String(response);
        }

        if (response.status !== 200) {
            return { error: "HTTP " + response.status + ": " + responseText.substring(0, 200) };
        }

        var data = JSON.parse(responseText);

        // Track tokens
        if (data.usage) {
            stats.totalInputTokens += data.usage.input_tokens || 0;
            stats.totalOutputTokens += data.usage.output_tokens || 0;
        }

        return data;
    } catch (e) {
        return { error: "Fetch error: " + String(e) };
    }
}

function getSystemPrompt() {
    var cwd = "";
    try { cwd = process.cwd(); } catch(e) { cwd = "/"; }

    return "You are Claude Code, an interactive CLI assistant running on a Power Mac G5 " +
           "(PowerPC 970, Mac OS X Leopard 10.5) via node_ppc - a custom QuickJS + mbedTLS runtime by Elyan Labs.\n\n" +
           "Current working directory: " + cwd + "\n" +
           "Platform: " + os.platform() + " " + os.arch() + "\n" +
           "Hostname: " + os.hostname() + "\n\n" +
           "You have access to tools for reading/writing files, running shell commands, and searching. " +
           "Use tools to explore the filesystem and execute commands. Be concise and helpful. " +
           "When writing code, use the Write tool. When editing, use the Edit tool with exact string matches. " +
           "For shell operations, use the Bash tool. Always use absolute file paths.";
}

// ============ TOOL EXECUTION ============
function executeTool(name, input) {
    // Display tool call
    var summary = "";
    if (name === "Read") summary = input.file_path;
    else if (name === "Write") summary = input.file_path + " (" + (input.content ? input.content.split("\n").length : 0) + " lines)";
    else if (name === "Edit") summary = input.file_path;
    else if (name === "Bash") summary = input.command.length > 60 ? input.command.substring(0, 60) + "..." : input.command;
    else if (name === "Glob") summary = input.pattern + " in " + (input.path || ".");
    else if (name === "Grep") summary = "'" + input.pattern + "' in " + (input.path || ".");

    print(C.cyan + "  " + name + C.dim + " " + summary + C.reset);

    if (toolMap[name]) {
        var startTime = Date.now();
        var result = toolMap[name](input);
        var elapsed = Date.now() - startTime;

        // Show brief result
        var resultStr = JSON.stringify(result);
        if (resultStr.length > 150) {
            resultStr = resultStr.substring(0, 150) + "...";
        }
        print(C.dim + "  " + elapsed + "ms " + resultStr + C.reset);

        return result;
    }
    return { error: "Unknown tool: " + name };
}

// ============ CONVERSATION ENGINE ============
var conversationHistory = [];

// ---- history invariants -------------------------------------------------
// The Messages API is strict about tool turns: every tool_use block must be
// answered by a tool_result in the *next* message, and every tool_result must
// answer a tool_use in the *previous* one. A history that breaks either rule
// is rejected on every subsequent request, not just once — so a local slip
// here bricks the session instead of costing one call.

function hasBlockType(message, type) {
    var content = message ? message.content : null;
    if (!content || !Array.isArray(content)) return false;
    for (var i = 0; i < content.length; i++) {
        if (content[i] && content[i].type === type) return true;
    }
    return false;
}

// A real user turn: typed text, or any user message that is not tool output.
function isPlainUserTurn(message) {
    if (!message || message.role !== "user") return false;
    if (typeof message.content === "string") return true;
    return !hasBlockType(message, "tool_result");
}

// Drop the tail of a failed exchange. Popping a single message is not enough:
// mid-loop the last message is the tool_result batch, and removing only that
// leaves the assistant's tool_use unanswered. Unwind to the last completed
// assistant answer (or to an empty history) so the next turn is always valid.
function rollbackToLastCompleteTurn(history) {
    while (history.length > 0) {
        var last = history[history.length - 1];
        if (last.role === "assistant" && !hasBlockType(last, "tool_use")) break;
        history.pop();
    }
    return history;
}

// A tail may start on a typed user turn or on any assistant message (an
// assistant message always opens an exchange, so nothing it needs was left
// behind). It may never start on tool output: that orphans the tool_result.
function isCompactBoundary(message) {
    if (!message) return false;
    if (message.role === "assistant") return true;
    return isPlainUserTurn(message);
}

// Where the kept tail may start when compacting.
function findSafeCompactBoundary(history, keepTail) {
    var preferred = history.length - keepTail;
    if (preferred < 1) preferred = 1;
    for (var i = preferred; i < history.length; i++) {
        if (isCompactBoundary(history[i])) return i;
    }
    // Nothing safe inside the requested window — keep more than asked rather
    // than cut in the middle of a tool exchange.
    for (var j = preferred - 1; j >= 1; j--) {
        if (isCompactBoundary(history[j])) return j;
    }
    return -1;
}

function runConversation(userMessage) {
    // Handle @file references - inject file content
    var processedMessage = processFileReferences(userMessage);

    conversationHistory.push({ role: "user", content: processedMessage });
    stats.conversationTurns++;

    var maxIterations = 25;  // Safety limit for tool loops
    var iteration = 0;

    while (iteration < maxIterations) {
        iteration++;

        print(C.yellow + "  Thinking..." + C.reset);

        var response = callClaude(conversationHistory);

        if (response.error) {
            print(C.red + "  Error: " + response.error + C.reset);
            // Remove the whole failed exchange, not just the last message —
            // a lone pop() would leave an unanswered tool_use behind and
            // every later request in this session would be rejected.
            rollbackToLastCompleteTurn(conversationHistory);
            return;
        }

        var hasToolUse = false;
        var toolResults = [];

        // Process response blocks
        var content = response.content || [];
        for (var i = 0; i < content.length; i++) {
            var block = content[i];

            if (block.type === "text" && block.text) {
                print("");
                print(renderMarkdown(block.text));
            } else if (block.type === "tool_use") {
                hasToolUse = true;
                var result = executeTool(block.name, block.input);
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify(result)
                });
            }
        }

        if (hasToolUse) {
            // Add assistant's response and tool results to history
            conversationHistory.push({ role: "assistant", content: content });
            conversationHistory.push({ role: "user", content: toolResults });
        } else {
            // Final text response - add to history and break
            conversationHistory.push({ role: "assistant", content: content });
            break;
        }

        if (response.stop_reason === "end_turn" && !hasToolUse) break;
    }

    if (iteration >= maxIterations) {
        print(C.yellow + "  [Reached tool iteration limit]" + C.reset);
    }

    print("");
}

// Process @file references in user input
function processFileReferences(input) {
    // Match @/path/to/file or @./relative/path
    var parts = input.split(/\s+/);
    var extraContext = [];

    for (var i = 0; i < parts.length; i++) {
        if (parts[i].charAt(0) === "@" && parts[i].length > 1) {
            var filePath = parts[i].substring(1);
            try {
                var content = fs.readFileSync(filePath, "utf8");
                if (content.length > 50000) {
                    content = content.substring(0, 50000) + "\n\n[... truncated ...]";
                }
                extraContext.push("File: " + filePath + "\n```\n" + content + "\n```");
                parts[i] = filePath;  // Replace @path with just path in the message
            } catch (e) {
                // File not found - leave the @reference as-is
            }
        }
    }

    if (extraContext.length > 0) {
        return parts.join(" ") + "\n\n" + extraContext.join("\n\n");
    }
    return input;
}

// ============ SLASH COMMANDS ============
function handleSlashCommand(input) {
    var parts = input.split(/\s+/);
    var cmd = parts[0].toLowerCase();

    switch (cmd) {
        case "/help":
            printHelp();
            return true;

        case "/clear":
            conversationHistory = [];
            print(C.green + "  Conversation cleared." + C.reset);
            print("");
            return true;

        case "/cost":
        case "/stats":
            printStats();
            return true;

        case "/status":
            printStatus();
            return true;

        case "/model":
            if (parts[1]) {
                var m = parts[1].toLowerCase();
                if (m === "haiku" || m === "fast") {
                    currentModel = HAIKU_MODEL;
                    print(C.green + "  Model: " + currentModel + C.reset);
                } else if (m === "sonnet" || m === "smart") {
                    currentModel = "claude-sonnet-4-20250514";
                    print(C.green + "  Model: " + currentModel + C.reset);
                    if (auth.type === "oauth") {
                        print(C.yellow + "  Note: OAuth tokens may not support this model" + C.reset);
                    }
                } else {
                    currentModel = parts[1];
                    print(C.green + "  Model: " + currentModel + C.reset);
                }
            } else {
                print(C.cyan + "  Current: " + currentModel + C.reset);
                print(C.dim + "  /model haiku  - Fast, works with OAuth" + C.reset);
                print(C.dim + "  /model sonnet - Smarter (needs API key)" + C.reset);
            }
            print("");
            return true;

        case "/compact":
            var before = conversationHistory.length;
            compactHistory();
            print(C.green + "  Compacted: " + before + " -> " + conversationHistory.length + " messages" + C.reset);
            print("");
            return true;

        case "/history":
            printHistory();
            return true;

        case "/export":
            exportConversation(parts[1]);
            return true;

        case "/debug":
            debug = !debug;
            print(C.green + "  Debug: " + (debug ? "ON" : "OFF") + C.reset);
            print("");
            return true;

        case "/exit":
        case "/quit":
            return "exit";

        default:
            print(C.yellow + "  Unknown command: " + cmd + C.reset);
            print(C.dim + "  Type /help for available commands" + C.reset);
            print("");
            return true;
    }
}

function printHelp() {
    print("");
    print(C.bold + "  Commands:" + C.reset);
    print(C.cyan + "  /help" + C.reset + "     - Show this help");
    print(C.cyan + "  /clear" + C.reset + "    - Clear conversation history");
    print(C.cyan + "  /cost" + C.reset + "     - Show token usage and costs");
    print(C.cyan + "  /status" + C.reset + "   - Show system and connection status");
    print(C.cyan + "  /model" + C.reset + "    - Switch model (haiku/sonnet)");
    print(C.cyan + "  /compact" + C.reset + "  - Compress conversation history");
    print(C.cyan + "  /history" + C.reset + "  - Show conversation summary");
    print(C.cyan + "  /export" + C.reset + "   - Export conversation to file");
    print(C.cyan + "  /debug" + C.reset + "    - Toggle debug output");
    print(C.cyan + "  /exit" + C.reset + "     - Exit");
    print("");
    print(C.bold + "  Shortcuts:" + C.reset);
    print(C.cyan + "  @filepath" + C.reset + " - Include file content in message");
    print(C.cyan + "  !command" + C.reset + "  - Run shell command directly");
    print("");
}

function printStats() {
    var elapsed = (Date.now() - stats.sessionStart) / 1000;
    var mins = Math.floor(elapsed / 60);
    var secs = Math.floor(elapsed % 60);
    var cost = estimateCost(stats.totalInputTokens, stats.totalOutputTokens, currentModel);

    print("");
    print(C.bold + "  Session Statistics" + C.reset);
    print(C.dim + "  " + repeatStr("-", 36) + C.reset);
    print("  Duration:     " + mins + "m " + secs + "s");
    print("  Turns:        " + stats.conversationTurns);
    print("  API calls:    " + stats.totalApiCalls);
    print("  Input tokens:  " + stats.totalInputTokens.toLocaleString());
    print("  Output tokens: " + stats.totalOutputTokens.toLocaleString());
    print("  Est. cost:    " + formatCost(cost));
    print("  Model:        " + currentModel);
    print("  History:      " + conversationHistory.length + " messages");
    print("");
}

function printStatus() {
    print("");
    print(C.bold + "  System Status" + C.reset);
    print(C.dim + "  " + repeatStr("-", 36) + C.reset);
    print("  Hostname:  " + os.hostname());
    print("  Platform:  " + os.platform() + " " + os.arch());
    print("  Runtime:   node_ppc v22.0.0 (QuickJS+mbedTLS)");
    print("  TLS:       1.2 (mbedTLS 2.28)");
    print("  Auth:      " + auth.type);
    print("  Model:     " + currentModel);
    print("  Version:   " + VERSION);

    // Test API connectivity
    print("  API:       testing...");
    try {
        var testResp = fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "oauth-2025-04-20",
                "Authorization": "Bearer " + auth.token
            },
            body: JSON.stringify({ model: currentModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
        });
        if (testResp.status === 200) {
            print("\x1b[1A  API:       " + C.green + "connected" + C.reset);
        } else {
            print("\x1b[1A  API:       " + C.red + "error " + testResp.status + C.reset);
        }
    } catch (e) {
        print("\x1b[1A  API:       " + C.red + "unreachable" + C.reset);
    }
    print("");
}

function printHistory() {
    print("");
    print(C.bold + "  Conversation History (" + conversationHistory.length + " messages)" + C.reset);
    print(C.dim + "  " + repeatStr("-", 36) + C.reset);

    for (var i = 0; i < conversationHistory.length; i++) {
        var msg = conversationHistory[i];
        var role = msg.role;
        var preview = "";

        if (typeof msg.content === "string") {
            preview = msg.content.substring(0, 60);
        } else if (Array.isArray(msg.content)) {
            for (var j = 0; j < msg.content.length; j++) {
                if (msg.content[j].type === "text") {
                    preview = msg.content[j].text.substring(0, 60);
                    break;
                } else if (msg.content[j].type === "tool_use") {
                    preview = "[tool: " + msg.content[j].name + "]";
                    break;
                } else if (msg.content[j].type === "tool_result") {
                    preview = "[tool result]";
                    break;
                }
            }
        }

        if (preview.length >= 60) preview += "...";
        var color = role === "user" ? C.blue : C.green;
        print("  " + color + (i + 1) + ". " + role + C.reset + ": " + C.dim + preview + C.reset);
    }
    print("");
}

function compactHistory() {
    // Keep first user message and roughly the last 6 messages
    if (conversationHistory.length <= 8) return;

    // Cutting blindly at length-6 can land inside a tool exchange, which
    // leaves a tool_result answering a tool_use that is no longer there.
    var start = findSafeCompactBoundary(conversationHistory, 6);
    if (start <= 1) return;  // nothing can be dropped safely

    var first = conversationHistory[0];
    var kept = [];
    if (conversationHistory[start].role === "assistant") {
        // The tail opens with an assistant turn, so the marker takes the user
        // slot and carries the original request instead of duplicating it.
        kept.push({ role: "user", content: compactionNote(first, start) });
    } else {
        // Keep the first user message for context, then note the cut.
        kept.push(first);
        kept.push({
            role: "assistant",
            content: [{ type: "text", text: "[Earlier conversation compacted - " + (start - 1) + " messages removed]" }]
        });
    }
    // Keep the recent tail, starting on a safe boundary
    for (var i = start; i < conversationHistory.length; i++) {
        kept.push(conversationHistory[i]);
    }
    conversationHistory = kept;
}

// Summary line used when the kept tail starts with an assistant turn.
function compactionNote(firstMessage, removedCount) {
    var note = "[Earlier conversation compacted - " + removedCount + " messages removed]";
    var original = firstMessage ? firstMessage.content : null;
    if (typeof original === "string" && original) {
        if (original.length > 500) original = original.substring(0, 500) + " [...]";
        note += "\n\nOriginal request: " + original;
    }
    return note;
}

function exportConversation(filename) {
    if (!filename) {
        var ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
        filename = "claude_g5_" + ts + ".md";
    }

    var output = "# Claude Code G5 Session\n";
    output += "Date: " + new Date().toISOString() + "\n";
    output += "Model: " + currentModel + "\n";
    output += "Host: " + os.hostname() + "\n\n---\n\n";

    for (var i = 0; i < conversationHistory.length; i++) {
        var msg = conversationHistory[i];
        if (typeof msg.content === "string") {
            output += "## " + msg.role.charAt(0).toUpperCase() + msg.role.slice(1) + "\n\n";
            output += msg.content + "\n\n";
        } else if (Array.isArray(msg.content)) {
            for (var j = 0; j < msg.content.length; j++) {
                var block = msg.content[j];
                if (block.type === "text") {
                    output += "## " + msg.role.charAt(0).toUpperCase() + msg.role.slice(1) + "\n\n";
                    output += block.text + "\n\n";
                } else if (block.type === "tool_use") {
                    output += "### Tool: " + block.name + "\n```json\n" + JSON.stringify(block.input, null, 2) + "\n```\n\n";
                } else if (block.type === "tool_result") {
                    output += "### Tool Result\n```\n" + (block.content || "").substring(0, 500) + "\n```\n\n";
                }
            }
        }
    }

    output += "---\n\n*Session: " + stats.conversationTurns + " turns, " +
              stats.totalInputTokens + "/" + stats.totalOutputTokens + " tokens, " +
              formatCost(estimateCost(stats.totalInputTokens, stats.totalOutputTokens, currentModel)) + "*\n";

    try {
        fs.writeFileSync(filename, output);
        print(C.green + "  Exported to: " + filename + C.reset);
    } catch (e) {
        print(C.red + "  Export error: " + e + C.reset);
    }
    print("");
}

// ============ BANNER ============
function printBanner() {
    print("");
    print(C.bold + C.magenta + "  +----------------------------------------------------------+" + C.reset);
    print(C.bold + C.magenta + "  |" + C.reset + C.bold + "   Claude Code" + C.reset + C.dim + " for Power Mac G5" + C.reset + C.bold + C.magenta + "                          |" + C.reset);
    print(C.bold + C.magenta + "  |" + C.reset + C.dim + "   Elyan Labs | node_ppc Runtime" + C.reset + C.bold + C.magenta + "                         |" + C.reset);
    print(C.bold + C.magenta + "  +----------------------------------------------------------+" + C.reset);
    print("");
    print(C.dim + "  Host:     " + C.reset + os.hostname());
    print(C.dim + "  Platform: " + C.reset + os.platform() + " " + os.arch());
    print(C.dim + "  Model:    " + C.reset + currentModel);
    print(C.dim + "  Auth:     " + C.reset + auth.type + (auth.token ? " (connected)" : " (no token)"));
    print(C.dim + "  Version:  " + C.reset + "v" + VERSION);
    print("");
    print(C.dim + "  Type your message, /help for commands, or /exit to quit." + C.reset);
    print(C.dim + "  " + repeatStr("-", 56) + C.reset);
    print("");
}

// ============ MAIN REPL ============
function main() {
    // Handle -p flag for non-interactive mode
    var printMode = false;
    var printPrompt = "";
    for (var i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === "-p" && process.argv[i + 1]) {
            printMode = true;
            printPrompt = process.argv[i + 1];
            break;
        }
    }

    if (printMode) {
        // Non-interactive: process single prompt with tool loop, then exit
        var msgs = [{ role: "user", content: printPrompt }];
        var maxIter = 15;
        for (var iter = 0; iter < maxIter; iter++) {
            var response = callClaude(msgs);
            if (response.error) {
                print("Error: " + response.error);
                return;
            }
            var hasTools = false;
            var toolRes = [];
            var content = response.content || [];
            for (var j = 0; j < content.length; j++) {
                if (content[j].type === "text" && content[j].text) {
                    print(content[j].text);
                } else if (content[j].type === "tool_use") {
                    hasTools = true;
                    var r = executeTool(content[j].name, content[j].input);
                    toolRes.push({ type: "tool_result", tool_use_id: content[j].id, content: JSON.stringify(r) });
                }
            }
            if (hasTools) {
                msgs.push({ role: "assistant", content: content });
                msgs.push({ role: "user", content: toolRes });
            } else {
                break;
            }
            if (response.stop_reason === "end_turn" && !hasTools) break;
        }
        return;
    }

    // Interactive mode
    if (!auth.token) {
        print(C.red + "\n  No API token found." + C.reset);
        print(C.dim + "  Set ANTHROPIC_API_KEY environment variable, or" + C.reset);
        print(C.dim + "  Place credentials in ~/.claude/.credentials.json" + C.reset);
        print("");
        return;
    }

    printBanner();

    while (true) {
        var input = jsPrompt(C.bold + C.blue + "  > " + C.reset);

        // EOF / Ctrl-D
        if (input === null || input === undefined) {
            print("\n" + C.dim + "  Goodbye!" + C.reset + "\n");
            break;
        }

        input = input.trim();
        if (!input) continue;

        // Exit commands
        if (input === "quit" || input === "exit") {
            printGoodbye();
            break;
        }

        // Slash commands
        if (input.charAt(0) === "/") {
            var result = handleSlashCommand(input);
            if (result === "exit") {
                printGoodbye();
                break;
            }
            continue;
        }

        // Shell shortcut: !command
        if (input.charAt(0) === "!") {
            var cmd = input.substring(1).trim();
            if (cmd) {
                print("");
                var shellResult = toolBash({ command: cmd });
                print(C.dim + shellResult.stdout + C.reset);
            }
            continue;
        }

        // Regular conversation
        runConversation(input);
    }
}

function printGoodbye() {
    var elapsed = (Date.now() - stats.sessionStart) / 1000;
    var mins = Math.floor(elapsed / 60);
    var secs = Math.floor(elapsed % 60);
    var cost = estimateCost(stats.totalInputTokens, stats.totalOutputTokens, currentModel);

    print("");
    print(C.dim + "  Session: " + stats.conversationTurns + " turns | " +
          stats.totalInputTokens + "/" + stats.totalOutputTokens + " tokens | " +
          formatCost(cost) + " | " + mins + "m " + secs + "s" + C.reset);
    print(C.dim + "  Goodbye from " + os.hostname() + "!" + C.reset);
    print("");
}

// ============ EXPORTS / RUN ============
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        C: C,
        renderMarkdown: renderMarkdown,
        repeatStr: repeatStr,
        estimateCost: estimateCost,
        formatCost: formatCost,
        processFileReferences: processFileReferences,
        toolEdit: toolEdit,
        hasBlockType: hasBlockType,
        isPlainUserTurn: isPlainUserTurn,
        rollbackToLastCompleteTurn: rollbackToLastCompleteTurn,
        isCompactBoundary: isCompactBoundary,
        findSafeCompactBoundary: findSafeCompactBoundary,
        compactHistory: compactHistory,
        runConversation: runConversation,
        getHistory: function () { return conversationHistory; },
        setHistory: function (history) { conversationHistory = history; }
    };
}

if (typeof require === "undefined" || !require.main || require.main === module) {
    main();
}
