# 吗哩吗哩官方因子配色取证

日期：2026-08-24

## Scope

- 目标页面：`https://game.bilibili.com/tool/pd`
- 目标脚本：`https://s1.hdslb.com/bfs/static/game-static/game-tool-pd/static/js/index-1363145f.js`
- 目标：确认因子类型与前景色、背景色的当前映射；不采集登录态或用户数据。

## Evidence

### E-001

- title: 当前页面加载的主构建脚本
- observed_at: 2026-08-24
- source_type: network
- source_ref: `https://game.bilibili.com/tool/pd`
- content_hash: `edbd367811f72ea965f01ec2d0a3878656a58a29c9f86eb5defef947c445ee47`
- artifact_path: n/a
- repro_command:

```powershell
$bundle = Invoke-WebRequest -UseBasicParsing -Uri 'https://s1.hdslb.com/bfs/static/game-static/game-tool-pd/static/js/index-1363145f.js'
$bytes = [Text.Encoding]::UTF8.GetBytes($bundle.Content)
[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
```

- raw_excerpt: `factor_map` 为类型 1～6 分别声明 `color`、`background` 与 `active`。
- linked_workitem: n/a
- supersedes: none

## Finding

### F-001

- title: 因子颜色按六种服务端类型映射
- severity: n/a_re
- category: reverse_algo
- status: validated
- evidence_ids: [E-001]
- location: `index-1363145f.js: factor_map`
- impact: 扩展应对齐官方类型色；白因子不能全部使用同一颜色。
- confidence: high
- repro_steps:
  1. 读取当前页面 HTML 中的主构建脚本地址。
  2. 在脚本中定位 `factor_map:new Map`。
  3. 对照类型 1～6 的 `color` 与 `background`。
- remediation: n/a

| 服务端类型 | 因子类别 | 前景色 | 背景色 |
| --- | --- | --- | --- |
| 1 | 蓝·属性 | `#008AC5` | `#DFF6FD` |
| 2 | 红·适性 | `#E84B85` | `#FFECF1` |
| 3 | 绿·固有技能 | `#4E8E04` | `#E3F2C8` |
| 4 | 白·技能 | `#4D5D7C` | `#EBEFF4` |
| 5 | 白·比赛 | `#4D5D7C` | `#EBEFF4` |
| 6 | 白·剧本 | `#AA7D00` | `#FFF5BF` |

## Path

### P-001

- title: 页面类型到扩展视觉令牌
- path_type: callflow
- start: 官方 `factor_map`
- goal: 扩展因子目录、优先级区和结果标签
- steps:
  1. action: 读取类型 1～6 的官方前景色和背景色 — evidence: E-001 — finding: F-001
  2. action: 将类型 1～3 映射为蓝、红、绿主题 — evidence: E-001 — finding: F-001
  3. action: 将类型 4、5 映射为蓝灰，将类型 6 映射为金色 — evidence: E-001 — finding: F-001
- residual_risks: 官方前端未来更换构建脚本或色值时，需要重新取证并更新令牌。

## Output

- 当前配色可由公开脚本稳定复现。
- 扩展在颜色排序、具体因子目录、P1～P3、结果明细中复用同一映射。
- 无 Node 补环境、运行时 Hook 或用户会话数据需求。
