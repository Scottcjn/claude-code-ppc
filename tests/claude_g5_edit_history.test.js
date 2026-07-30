// Regression tests for two ways the CLI used to damage state it could not
// recover from: the Edit tool rewriting "$" sequences on the way to disk, and
// the conversation history losing tool_use / tool_result pairing.
//
// print() is a QuickJS global that node does not have, and the module reads
// auth + stubs the API at require time, so both are installed first.
globalThis.print = function () {};
process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";

var apiQueue = [];
globalThis.fetch = function () {
    var next = apiQueue.shift();
    if (!next) return { status: 500, text: function () { return "{}"; } };
    return { status: next.status, text: function () { return JSON.stringify(next.body); } };
};

var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var test = require("node:test");

var helpers = require("../claude_g5.js");

function tmpFile(contents) {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-g5-edit-"));
    var file = path.join(dir, "sample.sh");
    fs.writeFileSync(file, contents, "utf8");
    return file;
}

// The locally checkable half of the Messages API tool contract: a tool_use
// must be answered in the next message, a tool_result must answer the
// previous one, and no tool call may be left open at the end.
function toolContractProblems(history) {
    var problems = [];
    function blocks(message) {
        return message && Array.isArray(message.content) ? message.content : [];
    }
    for (var i = 0; i < history.length; i++) {
        var uses = blocks(history[i]).filter(function (b) { return b.type === "tool_use"; });
        var answered = blocks(history[i + 1])
            .filter(function (b) { return b.type === "tool_result"; })
            .map(function (b) { return b.tool_use_id; });
        uses.forEach(function (use) {
            if (answered.indexOf(use.id) === -1) {
                problems.push("tool_use " + use.id + " in message " + i + " is never answered");
            }
        });

        var offered = blocks(history[i - 1])
            .filter(function (b) { return b.type === "tool_use"; })
            .map(function (b) { return b.id; });
        blocks(history[i])
            .filter(function (b) { return b.type === "tool_result"; })
            .forEach(function (result) {
                if (offered.indexOf(result.tool_use_id) === -1) {
                    problems.push("tool_result for " + result.tool_use_id + " in message " + i + " answers nothing");
                }
            });
    }
    return problems;
}

function assertRolesAlternate(history) {
    for (var i = 1; i < history.length; i++) {
        assert.notEqual(
            history[i].role,
            history[i - 1].role,
            "messages " + (i - 1) + " and " + i + " are both " + history[i].role
        );
    }
}

function toolUse(id) {
    return { role: "assistant", content: [{ type: "tool_use", id: id, name: "Bash", input: { command: "ls" } }] };
}

function toolResult(id) {
    return { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "{}" }] };
}

// ---- Edit tool: new_string must reach disk byte for byte ----------------

test("Edit writes shell $$ literally instead of collapsing it", function () {
    var file = tmpFile("LOCK=/tmp/app\n");

    var result = helpers.toolEdit({
        file_path: file,
        old_string: "LOCK=/tmp/app",
        new_string: "LOCK=/tmp/app.$$"
    });

    assert.equal(result.success, true);
    assert.equal(fs.readFileSync(file, "utf8"), "LOCK=/tmp/app.$$\n");
});

test("Edit preserves $&, $` and $' in the replacement", function () {
    var cases = [
        ["echo A", 'echo "$&"'],
        ["echo B", "echo \"$`\""],
        ["printf X", "printf $'\\n'"],
        ["cp a b", "cp a b # $$ $& $'"]
    ];

    cases.forEach(function (pair) {
        var file = tmpFile(pair[0] + "\n");
        helpers.toolEdit({ file_path: file, old_string: pair[0], new_string: pair[1] });
        assert.equal(fs.readFileSync(file, "utf8"), pair[1] + "\n");
    });
});

test("Edit single and replace_all paths agree on the same edit", function () {
    var single = tmpFile("x\nx\n");
    var all = tmpFile("x\nx\n");

    var singleResult = helpers.toolEdit({ file_path: single, old_string: "x", new_string: "y.$$" });
    var allResult = helpers.toolEdit({ file_path: all, old_string: "x", new_string: "y.$$", replace_all: true });

    assert.equal(fs.readFileSync(single, "utf8"), "y.$$\nx\n");
    assert.equal(fs.readFileSync(all, "utf8"), "y.$$\ny.$$\n");
    assert.equal(singleResult.replacements, 1);
    assert.equal(allResult.replacements, 2);
});

test("Edit refuses an empty old_string instead of prepending", function () {
    var file = tmpFile("keep me\n");

    var result = helpers.toolEdit({ file_path: file, old_string: "", new_string: "junk" });

    assert.match(result.error, /non-empty/);
    assert.equal(fs.readFileSync(file, "utf8"), "keep me\n");
});

test("Edit still reports a missing old_string and leaves the file alone", function () {
    var file = tmpFile("alpha\n");

    var result = helpers.toolEdit({ file_path: file, old_string: "beta", new_string: "gamma" });

    assert.equal(result.error, "old_string not found in file");
    assert.equal(fs.readFileSync(file, "utf8"), "alpha\n");
});

// ---- history integrity ---------------------------------------------------

test("a failed API call mid tool loop leaves no unanswered tool_use", function () {
    apiQueue = [
        {
            status: 200,
            body: {
                role: "assistant",
                stop_reason: "tool_use",
                usage: { input_tokens: 10, output_tokens: 5 },
                content: [{ type: "tool_use", id: "toolu_A", name: "Bash", input: { command: "echo hi" } }]
            }
        },
        { status: 529, body: { type: "error", error: { type: "overloaded_error" } } }
    ];
    helpers.setHistory([]);

    helpers.runConversation("run echo hi");

    var history = helpers.getHistory();
    assert.deepEqual(toolContractProblems(history), []);
    assert.equal(history.length, 0, "the failed exchange should be unwound completely");
});

test("rollback keeps earlier completed turns and drops only the failed tail", function () {
    var history = [
        { role: "user", content: "first question" },
        { role: "assistant", content: [{ type: "text", text: "first answer" }] },
        { role: "user", content: "second question" },
        toolUse("toolu_B"),
        toolResult("toolu_B")
    ];

    helpers.rollbackToLastCompleteTurn(history);

    assert.equal(history.length, 2);
    assert.equal(history[1].content[0].text, "first answer");
    assert.deepEqual(toolContractProblems(history), []);
});

test("rollback is a no-op on an empty or already complete history", function () {
    var empty = [];
    helpers.rollbackToLastCompleteTurn(empty);
    assert.deepEqual(empty, []);

    var complete = [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "text", text: "hello" }] }
    ];
    helpers.rollbackToLastCompleteTurn(complete);
    assert.equal(complete.length, 2);
});

test("compact never cuts a tool exchange in half", function () {
    var history = [{ role: "user", content: "start" }];
    ["t1", "t2", "t3", "t4"].forEach(function (id) {
        history.push(toolUse(id));
        history.push(toolResult(id));
    });
    history.push({ role: "assistant", content: [{ type: "text", text: "done" }] });

    helpers.setHistory(history.slice());
    helpers.compactHistory();
    var compacted = helpers.getHistory();

    assert.deepEqual(toolContractProblems(compacted), []);
    assertRolesAlternate(compacted);
    assert.ok(compacted.length < history.length, "compaction should still shorten the history");
    // The tail opens on an assistant turn here, so the marker takes the user
    // slot and carries the original request forward.
    assert.equal(compacted[0].role, "user");
    assert.match(compacted[0].content, /compacted/);
    assert.match(compacted[0].content, /Original request: start/);
});

test("compact keeps the tail starting from a real user turn", function () {
    var history = [{ role: "user", content: "start" }];
    for (var i = 0; i < 3; i++) {
        history.push({ role: "user", content: "question " + i });
        history.push(toolUse("t" + i));
        history.push(toolResult("t" + i));
        history.push({ role: "assistant", content: [{ type: "text", text: "answer " + i }] });
    }

    helpers.setHistory(history.slice());
    helpers.compactHistory();
    var compacted = helpers.getHistory();

    assert.deepEqual(toolContractProblems(compacted), []);
    assertRolesAlternate(compacted);
    assert.ok(helpers.isPlainUserTurn(compacted[2]), "tail must open on a typed user turn");
});

test("compact leaves short histories untouched", function () {
    var history = [
        { role: "user", content: "one" },
        { role: "assistant", content: [{ type: "text", text: "two" }] }
    ];
    helpers.setHistory(history.slice());

    helpers.compactHistory();

    assert.equal(helpers.getHistory().length, 2);
});

test("compact still shortens a history made only of tool exchanges", function () {
    var history = [{ role: "user", content: "start" }];
    ["a", "b", "c", "d"].forEach(function (id) {
        history.push(toolUse(id));
        history.push(toolResult(id));
    });
    helpers.setHistory(history.slice());

    helpers.compactHistory();
    var compacted = helpers.getHistory();

    assert.ok(compacted.length < history.length, "a tool-only history must still compact");
    assert.deepEqual(toolContractProblems(compacted), []);
    assertRolesAlternate(compacted);
});

test("compact refuses a boundary that would orphan tool output", function () {
    var history = [{ role: "user", content: "start" }];
    ["a", "b", "c", "d"].forEach(function (id) {
        history.push(toolUse(id));
        history.push(toolResult(id));
    });

    // Every tool_result message is an unsafe place to start a kept tail.
    history.forEach(function (message, index) {
        if (index === 0) return;
        var safe = helpers.isCompactBoundary(message);
        var isToolOutput = helpers.hasBlockType(message, "tool_result");
        assert.equal(safe, !isToolOutput, "boundary check wrong at message " + index);
    });
});
