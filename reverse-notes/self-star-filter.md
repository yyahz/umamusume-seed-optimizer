# 吗哩吗哩双星级筛选取证

## 目标

- 页面：`https://game.bilibili.com/tool/pd`
- 请求：`POST /game/player/tools/uma/hero_card/search`
- 关注参数：家系合计星级与本体星级
- 取证日期：2026-08-24

## Observe

- 当前脚本：`https://s1.hdslb.com/bfs/static/game-static/game-tool-pd/static/js/index-1363145f.js`
- 脚本文本长度：`139685`
- UTF-8 SHA-256：`edbd367811f72ea965f01ec2d0a3878656a58a29c9f86eb5defef947c445ee47`
- 请求体把 `factor_filters` 序列化为 JSON 字符串。
- 调用线索：`rent` 组件的筛选函数构造 `factor_filters`，随后由 `ps` 调用 `POST /game/player/tools/uma/hero_card/search`。
- 页面状态中的星级映射：
  - `1～9`：不限/至少 2～9 星，对应家系合计门槛。
  - `11～13`：本体至少 1～3 星。

## Capture

页面构造每个因子筛选值时采用以下分支：

```js
V > 9 ? { num: D, self_rarity: V % 10 } : { num: D, rarity: V }
```

候选因子对象同时读取：

```js
const { rarity, total_rarity } = factor;
```

其中页面把 `rarity > 0` 的值显示为“本体 N”，把 `total_rarity` 作为家系合计星数。

## Rebuild / Patch 决策

- 已确认字段：`rarity`（家系合计 1～9）、`self_rarity`（本体 1～3）。
- 原站对单个因子一次只发送一个字段；没有观察到同一 value 同时带两个字段的请求。
- 扩展采用已证实的请求形状做候选召回：根据两个目标的相对严格程度，选择 `rarity` 或 `self_rarity` 之一发送。
- 返回候选在本地同时使用 `total_rarity` 与 `rarity` 校验和评分，因此两个条件会同时生效，也不会依赖未经证实的服务端组合字段契约。

## 输出

- 参数位置已确定。
- 请求构造和候选字段均可在当前公开脚本中稳定复现。
- 无需浏览器环境补丁或 AST 去混淆。
