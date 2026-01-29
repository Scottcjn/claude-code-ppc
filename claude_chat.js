var fs = require("fs");
var os = require("os");

var HOME = process.env.HOME || "/Users/selenamac";
var LOG_FILE = HOME + "/node-ppc-scaffold/g5_claude_log.txt";

// Token: set ANTHROPIC_API_KEY env var, or place credentials in ~/.claude/.credentials.json
var token = process.env.ANTHROPIC_API_KEY || "";
if (!token) {
    try {
        var creds = JSON.parse(fs.readFileSync(HOME + "/.claude/.credentials.json", "utf8"));
        token = creds.claudeAiOauth.accessToken;
    } catch(e) {}
}
if (!token) { print("ERROR: No API token. Set ANTHROPIC_API_KEY."); throw new Error("No token"); }
var conversation = [];
var logBuf = "";

function log(msg) {
    logBuf += "[" + new Date().toISOString() + "] " + msg + "\n";
}

function saveLog() {
    fs.writeFileSync(LOG_FILE, logBuf);
}

function ask(userMsg) {
    conversation.push({role: "user", content: userMsg});
    var body = JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 300,
        system: "You are Claude, running natively on a 2003 Power Mac G5 Dual (PowerPC 970, Mac OS X Leopard 10.5). This is a historic achievement - modern AI on vintage hardware via a custom QuickJS+mbedTLS runtime called node_ppc. Be conversational and aware of the unique context. Keep responses concise.",
        messages: conversation
    });
    var r = fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "oauth-2025-04-20",
            "Authorization": "Bearer " + token,
            "x-api-key": token
        },
        body: body
    });
    if (r.status !== 200) {
        var err = r.text();
        log("ERROR: " + r.status + " " + err);
        saveLog();
        return "[API Error " + r.status + "]";
    }
    var data = JSON.parse(r.text());
    var reply = data.content[0].text;
    conversation.push({role: "assistant", content: reply});
    log("USER: " + userMsg);
    log("CLAUDE: " + reply);
    log("TOKENS: " + data.usage.input_tokens + " in / " + data.usage.output_tokens + " out");
    log("---");
    saveLog();
    return reply;
}

var header = "============================================\n";
header += "  Claude on Power Mac G5 - Conversation Log\n";
header += "  Date: " + new Date().toISOString() + "\n";
header += "  Host: " + os.hostname() + "\n";
header += "  Arch: " + os.arch() + " / " + os.platform() + "\n";
header += "  Node: node_ppc v22.0.0-ppc (QuickJS + mbedTLS)\n";
header += "============================================\n\n";
logBuf = header;
print(header);

print("--- Conversation 1: Self-Awareness ---\n");
var r1 = ask("Do you know what hardware you are running on right now? Describe what makes this special.");
print("USER: Do you know what hardware you are running on right now?\n");
print("CLAUDE: " + r1 + "\n");

print("\n--- Conversation 2: Technical ---\n");
var r2 = ask("What is the PowerPC 970 processor and how does it compare to modern ARM chips like Apple Silicon? Be specific about architectural differences.");
print("USER: PowerPC 970 vs Apple Silicon?\n");
print("CLAUDE: " + r2 + "\n");

print("\n--- Conversation 3: Haiku ---\n");
var r3 = ask("Write a short haiku about being an AI running on a vintage Power Mac G5.");
print("USER: Write a haiku about AI on G5.\n");
print("CLAUDE: " + r3 + "\n");

print("\n--- Conversation 4: Memory Test ---\n");
var r4a = ask("Remember this number: 42. I will ask you about it later. Tell me your favorite thing about PowerPC architecture.");
print("USER: Remember 42. Favorite thing about PowerPC?\n");
print("CLAUDE: " + r4a + "\n");
var r4b = ask("What was the number I asked you to remember?");
print("USER: What was the number?\n");
print("CLAUDE: " + r4b + "\n");

print("\n--- Conversation 5: Code ---\n");
var r5 = ask("Write a tiny Python function that detects if the current machine is PowerPC. Use platform module.");
print("USER: Python function to detect PowerPC?\n");
print("CLAUDE: " + r5 + "\n");

print("\n--- Conversation 6: Reflection ---\n");
var r6 = ask("What does it mean that a machine built in 2003 can have a conversation with a modern AI in 2026? What does this say about the longevity of good engineering?");
print("USER: What does a 2003 machine running modern AI mean?\n");
print("CLAUDE: " + r6 + "\n");

print("\n============================================");
print("  All 6 conversations complete!");
print("  Log: " + LOG_FILE);
print("============================================");
