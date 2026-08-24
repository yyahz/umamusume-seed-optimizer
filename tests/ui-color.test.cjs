const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const contentSource = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

test("factor UI includes the current official foreground and background palette", () => {
  const officialTokens = [
    "#008AC5", "#DFF6FD",
    "#E84B85", "#FFECF1",
    "#4E8E04", "#E3F2C8",
    "#4D5D7C", "#EBEFF4",
    "#AA7D00", "#FFF5BF"
  ];

  for (const token of officialTokens) {
    assert.ok(contentSource.includes(token), `missing official factor color ${token}`);
  }
});

test("white factor subtypes keep scenario gold separate from skill and race blue-gray", () => {
  assert.match(contentSource, /剧本:\s*\{[^}]*color:\s*"#AA7D00"[^}]*soft:\s*"#FFF5BF"/);
  assert.match(contentSource, /技能:\s*\{[^}]*color:\s*"#4D5D7C"[^}]*soft:\s*"#EBEFF4"/);
  assert.match(contentSource, /比赛:\s*\{[^}]*color:\s*"#4D5D7C"[^}]*soft:\s*"#EBEFF4"/);
});

test("result cards keep names, star values, and the copy action compact", () => {
  assert.equal(contentSource.includes("好友种马 #"), false);
  assert.equal(contentSource.includes("${match.stars}/${match.minStars}★"), false);
  assert.equal(contentSource.includes("${match.selfStars}/${match.minSelfStars}★"), false);
  assert.match(contentSource, /\.copy-button\s*\{[^}]*white-space:nowrap/);
  assert.match(contentSource, /每页包含 20 位候选/);
});

test("selected factors can be reset in one click and restored", () => {
  assert.match(contentSource, /id="reset-factors"[^>]*>重置因子<\/button>/);
  assert.match(contentSource, /function resetSelectedFactors\(\)/);
  assert.match(contentSource, /state\.selected\.clear\(\)/);
  assert.match(contentSource, /撤销本次重置/);
  assert.match(contentSource, /角色、颜色顺序和搜索范围保持不变/);
  assert.match(contentSource, /state\.results = Array\.isArray\(undo\.results\)/);
});

test("white factors expose required after P1, P2, and P3", () => {
  assert.match(contentSource, /\[1, 2, 3, \.\.\.\(colorId === "white" \? \[ranking\.REQUIRED_TIER\]/);
  assert.match(contentSource, /value === ranking\.REQUIRED_TIER \? "必需" : `P\$\{value\}`/);
  assert.match(contentSource, /必须双门槛达标/);
  assert.match(contentSource, /必需达标/);
});

test("self star selectors include zero as no self-factor requirement", () => {
  assert.match(contentSource, /MAX_SELF_STARS \+ 1/);
  assert.match(contentSource, /stars === 0 \? " · 本体无要求"/);
  assert.match(contentSource, /本体 0★ 表示本体可以没有该因子/);
});
