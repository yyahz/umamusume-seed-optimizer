(function seedOptimizerBackground() {
  "use strict";

  const SESSION_STORAGE_KEY = "umaSeedOptimizerSessionV1";
  const SESSION_GET = "UMA_SEED_SESSION_GET_V1";
  const SESSION_SET = "UMA_SEED_SESSION_SET_V1";
  let writeQueue = Promise.resolve();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    if (message?.type === SESSION_GET) {
      writeQueue
        .then(() => chrome.storage.session.get(SESSION_STORAGE_KEY))
        .then((document) => sendResponse({ ok: true, value: document[SESSION_STORAGE_KEY] || {} }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message?.type === SESSION_SET) {
      const value = message.value && typeof message.value === "object" ? message.value : {};
      writeQueue = writeQueue.then(() => chrome.storage.session.set({ [SESSION_STORAGE_KEY]: value }));
      writeQueue
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    return false;
  });
})();
