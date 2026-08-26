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

test("manifest declares Simplified Chinese store metadata", () => {
  assert.equal(manifest.default_locale, "zh_CN");
  assert.equal(manifest.name, "__MSG_extensionName__");
  assert.equal(manifest.description, "__MSG_extensionDescription__");

  const messagesPath = path.join(root, "_locales", "zh_CN", "messages.json");
  const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
  assert.equal(messages.extensionName.message, "闪耀优俊少女 · 种马搜索器");
  assert.match(messages.extensionDescription.message, /吗哩吗哩工具箱/);
});

test("panel icon is exposed to the matched toolbox page", () => {
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ["icons/icon-48.png"],
    matches: ["https://game.bilibili.com/*"]
  }]);
});

test("manifest stays within the Chrome APIs supported by current 360 Chromium browsers", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.action, undefined);
  assert.equal(manifest.side_panel, undefined);

  const mainWorldBridge = manifest.content_scripts.find((entry) => entry.world === "MAIN");
  assert.deepEqual(mainWorldBridge.js, ["page-bridge.js"]);
  assert.equal(mainWorldBridge.run_at, "document_start");
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
