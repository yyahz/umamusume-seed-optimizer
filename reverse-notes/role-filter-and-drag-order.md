# 角色筛选与颜色自由拖放取证

日期：2026-08-24

## Observe

- 目标页面：`https://game.bilibili.com/tool/pd`
- 当前主脚本：`https://s1.hdslb.com/bfs/static/game-static/game-tool-pd/static/js/index-1363145f.js`
- 角色目录请求：`GET /game/player/tools/uma/hero_cards`
- 好友种马搜索请求：`POST /game/player/tools/uma/hero_card/search`
- 关注参数：`card_ids`
- initiator 线索：页面 store 的 `getHeroCards()` 调用角色目录接口；`rent-hero` 组件维护多选角色集合；`rent` 组件把所选角色数组以逗号连接后写入搜索请求的 `card_ids`。

## Capture

- 静态脚本显示角色目录数据按数组返回，选择器使用 `card_id`、`name`、`rarity` 和 `icon_url`。
- 搜索请求构造形状为 `card_ids: selectedCardIds.join()`。
- 页面角色选择器允许多选，并提供全部、三星、二星、一星目录筛选。

## Rebuild / Patch

- 页面桥新增 `GET_HERO_CARDS`，沿用现有已验证的签名函数与页面登录态。
- 扩展保存 `cardIds`，搜索每一组候选时均传给 `SEARCH_PAGE`。
- 角色初始星级仅用于浏览目录，不作为额外搜索参数。
- 颜色排序修复为基于目标条目上下半区计算 `before` / `after`，因此首项可一次拖到末项之后，末项也可一次拖到首项之前。
- 因子内部优先级改为始终可见的 P1 / P2 / P3 投放区；新增因子默认 P1，拖放时直接更新持久化记录中的 `tier`，并保留下拉框作为触屏和键盘替代操作。

## Output

- 角色目录与搜索参数位置均已确认。
- 本地请求构造与排序函数已有自动化回归测试；浏览器验证已覆盖角色多选、`cardIds` 请求透传、颜色首尾双向拖放、因子 P1 到 P3 跨区拖放及因子名称检索。
- 当前无剩余环境缺口；真实角色图片和完整目录仍以官方接口实时返回为准。
