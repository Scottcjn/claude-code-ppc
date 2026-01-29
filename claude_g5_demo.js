var fs = require("fs");
var os = require("os");
var readline = require("readline");

// Token: set ANTHROPIC_API_KEY env var, or place credentials in ~/.claude/.credentials.json
var token = process.env.ANTHROPIC_API_KEY || "";
if (!token) {
    try {
        var creds = JSON.parse(fs.readFileSync(
            (process.env.HOME || "/Users/selenamac") + "/.claude/.credentials.json", "utf8"));
        token = creds.claudeAiOauth.accessToken;
    } catch(e) {}
}
if (!token) {
    print("ERROR: No API token found.");
    print("Set ANTHROPIC_API_KEY or place credentials in ~/.claude/.credentials.json");
    // exit
    throw new Error("No token");
}
var conversation = [];
var totalIn = 0, totalOut = 0, msgCount = 0;

function ask(userMsg) {
    conversation.push({role: "user", content: userMsg});
    var body = JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        system: "You are Claude, running natively on a 2003 Power Mac G5 Dual (PowerPC 970, Mac OS X 10.5 Leopard) via node_ppc - a custom QuickJS+mbedTLS runtime. Keep responses conversational and concise. You are aware of running on vintage hardware.",
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
    if (r.status \!== 200) {
        return "[Error " + r.status + ": " + r.text().substring(0, 100) + "]";
    }
    var data = JSON.parse(r.text());
    var reply = data.content[0].text;
    conversation.push({role: "assistant", content: reply});
    totalIn += data.usage.input_tokens;
    totalOut += data.usage.output_tokens;
    msgCount++;
    return reply;
}

// Banner
print("");
print("  ╔══════════════════════════════════════════════╗");
print("  ║     Claude AI on Power Mac G5                ║");
print("  ║     Elyan Labs - node_ppc Runtime            ║");
print("  ╚══════════════════════════════════════════════╝");
print("");
print("  Host:    " + os.hostname());
print("  Arch:    " + os.arch() + " (" + os.platform() + ")");
print("  Runtime: node_ppc v22.0.0-ppc (QuickJS+mbedTLS)");
print("  Model:   claude-3-5-haiku-20241022");
print("  TLS:     1.2 (mbedTLS 2.28)");
print("");
print("  Type your message and press Enter.");
print("  Type quit or exit to end.");
print("  ────────────────────────────────────────────────");
print("");

while (true) {
    var input = prompt("You > ");
    if (\!input || input === "quit" || input === "exit") break;
    if (input === "clear") { conversation = []; print("[Conversation cleared]\n"); continue; }
    if (input === "stats") {
        print("[Messages: " + msgCount + " | Tokens in: " + totalIn + " out: " + totalOut + "]\n");
        continue;
    }
    print("");
    var reply = ask(input);
    print("Claude > " + reply);
    print("");
}

print("\n  Session complete. " + msgCount + " messages, " + totalIn + "/" + totalOut + " tokens.");
print("  Goodbye from G5\!\n");
