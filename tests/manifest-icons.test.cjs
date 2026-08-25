const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

function pngDimensions(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  assert.equal(header.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test("manifest declares every standard extension icon size", () => {
  assert.deepEqual(manifest.icons, {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png"
  });
});

test("panel icon is exposed to the matched toolbox page", () => {
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ["icons/icon-48.png"],
    matches: ["https://game.bilibili.com/*"]
  }]);
});

test("request protection loads before the content search workflow", () => {
  const isolatedScripts = manifest.content_scripts.find((entry) => entry.world !== "MAIN").js;
  assert.ok(isolatedScripts.includes("request-guard.js"));
  assert.ok(isolatedScripts.indexOf("request-guard.js") < isolatedScripts.indexOf("content.js"));
});

test("declared extension icons are valid square PNGs at their exact sizes", () => {
  for (const [size, relativePath] of Object.entries(manifest.icons)) {
    const filePath = path.join(root, relativePath);
    assert.equal(fs.existsSync(filePath), true, `missing ${relativePath}`);
    assert.deepEqual(pngDimensions(filePath), {
      width: Number(size),
      height: Number(size)
    });
  }
});
