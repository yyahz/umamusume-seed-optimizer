const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

function loadBackground() {
  let listener;
  const sessionValues = {};
  const chrome = {
    runtime: {
      id: "extension-id",
      onMessage: {
        addListener(value) {
          listener = value;
        }
      }
    },
    storage: {
      session: {
        async get(key) {
          return { [key]: sessionValues[key] };
        },
        async set(document) {
          Object.assign(sessionValues, document);
        }
      }
    }
  };
  vm.runInNewContext(backgroundSource, { chrome });
  return { listener, sessionValues };
}

function dispatch(listener, message, sender = { id: "extension-id" }) {
  return new Promise((resolve, reject) => {
    const keepChannelOpen = listener(message, sender, resolve);
    if (keepChannelOpen !== true) reject(new Error("message channel was not kept open"));
  });
}

test("session storage proxy saves and restores role and factor conditions", async () => {
  const { listener } = loadBackground();
  const value = {
    cardIds: ["1001"],
    desiredFactors: [{ type: 1, num: 101, minStars: 9, minSelfStars: 3 }]
  };

  const saved = await dispatch(listener, { type: "UMA_SEED_SESSION_SET_V1", value });
  assert.equal(saved.ok, true);
  const response = await dispatch(listener, { type: "UMA_SEED_SESSION_GET_V1" });
  assert.equal(response.ok, true);
  assert.equal(JSON.stringify(response.value), JSON.stringify(value));
});

test("session storage proxy rejects messages outside this extension", () => {
  const { listener } = loadBackground();
  assert.equal(listener({ type: "UMA_SEED_SESSION_GET_V1" }, { id: "another-extension" }, () => {}), false);
});

test("persistent preferences exclude one-session search conditions", () => {
  assert.match(contentSource, /function persistentPreferenceDocument\(\)[\s\S]*?colorOrder:[\s\S]*?depth:[\s\S]*?filterFull:/);
  const persistentBlock = contentSource.match(/function persistentPreferenceDocument\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.equal(persistentBlock.includes("cardIds"), false);
  assert.equal(persistentBlock.includes("desiredFactors"), false);
  assert.match(contentSource, /function sessionPreferenceDocument\(\)[\s\S]*?cardIds:[\s\S]*?desiredFactors:/);
  assert.match(contentSource, /Array\.isArray\(session\.cardIds\)/);
  assert.match(contentSource, /Array\.isArray\(session\.desiredFactors\)/);
});
