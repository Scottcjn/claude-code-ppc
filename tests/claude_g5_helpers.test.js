var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var test = require("node:test");

var helpers = require("../claude_g5.js");

function stripAnsi(value) {
    return value.replace(/\x1b\[[0-9;]*m/g, "");
}

test("repeatStr handles normal and empty repetitions", function () {
    assert.equal(helpers.repeatStr("=", 5), "=====");
    assert.equal(helpers.repeatStr("*", 0), "");
});

test("estimateCost uses model-specific token pricing", function () {
    assert.equal(
        helpers.estimateCost(1000000, 500000, "claude-3-5-haiku-20241022"),
        2.8
    );
    assert.equal(
        helpers.estimateCost(1000000, 500000, "unknown-model"),
        2.8
    );
});

test("formatCost renders tiny and regular dollar amounts", function () {
    assert.equal(helpers.formatCost(0.009), "<$0.01");
    assert.equal(helpers.formatCost(1.23456), "$1.2346");
});

test("renderMarkdown formats headings, bullets, inline code, and code blocks", function () {
    var rendered = helpers.renderMarkdown([
        "# Title",
        "- item with `code`",
        "```js",
        "console.log('ok')",
        "```"
    ].join("\n"));
    var plain = stripAnsi(rendered);

    assert.match(plain, /^Title/);
    assert.match(plain, /\* item with code/);
    assert.match(plain, /\(js\) -+/);
    assert.match(plain, /console\.log\('ok'\)/);
});

test("processFileReferences injects readable @file context", function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-g5-test-"));
    var filePath = path.join(tmpDir, "notes.txt");
    fs.writeFileSync(filePath, "alpha\nbeta\n", "utf8");

    var processed = helpers.processFileReferences("Summarize @" + filePath);

    assert.match(processed, new RegExp("Summarize " + filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(processed, /File: .*notes\.txt/);
    assert.match(processed, /```\nalpha\nbeta\n\n```/);
});

test("processFileReferences leaves missing references untouched", function () {
    var input = "Read @/definitely/missing/file.txt please";

    assert.equal(helpers.processFileReferences(input), input);
});
