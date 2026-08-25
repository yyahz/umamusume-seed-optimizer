const test = require("node:test");
const assert = require("node:assert/strict");

const requestGuard = require("../request-guard.js");

function fakeClockOptions(overrides = {}) {
  let clock = 0;
  const delays = [];
  return {
    options: {
      now: () => clock,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
        clock += milliseconds;
      },
      random: () => 0.5,
      ...overrides
    },
    delays,
    advance(milliseconds) { clock += milliseconds; }
  };
}

test("serializes candidate requests with jittered pacing and caches identical payloads", async () => {
  const clock = fakeClockOptions();
  const guard = requestGuard.createSearchRequestGuard(clock.options);
  let calls = 0;
  const operation = async () => {
    calls += 1;
    return { code: 0, data: { records: [] } };
  };

  const first = await guard.request({ page: 1 }, operation);
  const cached = await guard.request({ page: 1 }, operation);
  const second = await guard.request({ page: 2 }, operation);

  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(second.cached, false);
  assert.equal(calls, 2);
  assert.deepEqual(clock.delays, [425]);
});

test("retries transient failures with exponential backoff at most twice", async () => {
  const clock = fakeClockOptions({
    minimumIntervalMs: 0,
    intervalJitterMs: 0,
    retryBaseMs: 100,
    random: () => 0
  });
  const guard = requestGuard.createSearchRequestGuard(clock.options);
  let calls = 0;

  const result = await guard.request({ page: 1 }, async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("temporary server failure");
      error.status = 503;
      throw error;
    }
    return { code: 0, data: {} };
  });

  assert.equal(result.value.code, 0);
  assert.equal(calls, 3);
  assert.deepEqual(clock.delays, [100, 200]);
});

test("stops immediately and applies a long cooldown on HTTP rate limiting", async () => {
  const clock = fakeClockOptions();
  const guard = requestGuard.createSearchRequestGuard(clock.options);
  let calls = 0;

  await assert.rejects(
    guard.request({ page: 1 }, async () => {
      calls += 1;
      const error = new Error("too many requests");
      error.status = 429;
      throw error;
    }),
    (error) => error.riskControl === true
  );

  assert.equal(calls, 1);
  assert.equal(guard.remainingCooldownMs(), 60_000);
});

test("treats an explicit frequent-access API message as risk control", async () => {
  const clock = fakeClockOptions();
  const guard = requestGuard.createSearchRequestGuard(clock.options);

  await assert.rejects(
    guard.request({ page: 1 }, async () => ({ code: -412, message: "请求过于频繁，请稍后再试" })),
    (error) => error.riskControl === true
  );
  assert.equal(guard.remainingCooldownMs(), 60_000);
});

test("provides a two-second cooldown for explicitly large searches", () => {
  const clock = fakeClockOptions();
  const guard = requestGuard.createSearchRequestGuard(clock.options);

  assert.equal(guard.finishSearch(), 2_000);
  clock.advance(1_250);
  assert.equal(guard.remainingCooldownMs(), 750);
});
