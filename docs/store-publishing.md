# Chrome / Edge 自动更新发布

工作流已经提供，但默认不自动提交商店。第一次需要维护者配置发布凭证；API 提交成功不等于审核通过。此流程仅更新已存在的扩展，不修改商店介绍、截图、隐私声明或账号资料。

## 第一次启用

1. 打开仓库 [Actions 工作流](https://github.com/yyahz/umamusume-seed-optimizer/actions/workflows/publish-stores.yml)，点击 **Run workflow**。
2. 分支选 `main`，`tag` 填 `v0.18.0`，`store` 选 `both`，`mode` 选 `validate`。此模式无需商店密钥，也不会上传或提交。
3. 配置下文所列 Secrets，再对单个商店选择 `upload` 验证授权和上传。它会更新商店草稿，请先确认没有需要保留的手动草稿。
4. 确认草稿正确后，选择 `publish` 上传并提交审核。若已有同版本草稿导致商店拒绝重复上传，可在商店后台提交该草稿；不要反复重跑工作流。
5. 两个商店都验证成功后，才开启下文的自动开关。

## 保存凭证

到仓库 [Settings → Secrets and variables → Actions](https://github.com/yyahz/umamusume-seed-optimizer/settings/secrets/actions)，选择 **New repository secret**，逐项填写。不要放在 Variables、源码、截图、聊天或 Release 附件里。

| Secret 名称 | 内容 | 获取位置 |
| --- | --- | --- |
| `CWS_PUBLISHER_ID` | Chrome 发布者 ID | Chrome 开发者后台 Publisher → Settings |
| `CWS_CLIENT_ID` | OAuth 客户端 ID | Google Cloud 的 OAuth 客户端 |
| `CWS_CLIENT_SECRET` | OAuth 客户端密钥 | 同上 |
| `CWS_REFRESH_TOKEN` | 发布账号授权的刷新令牌 | 使用自己的 OAuth 客户端进行授权 |
| `EDGE_PRODUCT_ID` | Edge 产品 GUID | Partner Center 的扩展概览 / Extension identity |
| `EDGE_CLIENT_ID` | Edge Publish API Client ID | Partner Center → Microsoft Edge → Publish API |
| `EDGE_API_KEY` | Edge Publish API API Key | 同上 |

Chrome 扩展 ID 已固定为本项目公开的商店 ID。Edge 所需 Product ID 是 GUID，**不是**商店网址中那串扩展 ID。

### Chrome 授权

按 [Chrome 官方配置说明](https://developer.chrome.com/docs/webstore/using-api)在 Google Cloud 启用 Chrome Web Store API，创建 OAuth 同意屏幕和客户端。使用自己的 OAuth 客户端在 OAuth Playground 授予 `https://www.googleapis.com/auth/chromewebstore` 权限，将刷新令牌直接保存到 Secret。

授权时必须使用拥有此扩展的开发者账号，并保持两步验证启用。访问令牌由工作流临时换取，不需要手动保存。刷新令牌失效时需重新授权；检查 OAuth 应用测试状态、账号授权撤销等原因。不要把普通浏览器 Cookie 当作凭证。

### Edge 授权

按 [Edge 官方配置说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api)，进入 Partner Center 的 Microsoft Edge → Publish API，启用 API Key 方式，创建凭证。保存 Client ID 和 API Key，并从扩展概览获取 Product ID。注意 API Key 有有效期，到期前替换 Secret。

工作流采用 API Key 认证，不使用旧式客户端 Secret / Bearer Token 流程。认证说明使用 [store-certification-notes.txt](../scripts/store-certification-notes.txt)，不含测试账号；第三方工具箱的登录依赖仍需审核员自行满足。若审核团队要求专用测试信息，应通过商店私密审核入口提供，不要提交到公开仓库。

## 开启正式 Release 自动提交

在 **Settings → Secrets and variables → Actions → Variables** 中创建仓库变量：

- 名称：`STORE_AUTO_PUBLISH`
- 值：`true`

开启后，新发布的正式 Release 自动尝试上传并提交两个商店。普通 Git push、草稿、预发布版和编辑旧 Release 不触发自动提交；已有 Release 可用手动工作流补交。删除此变量或设为 `false` 即关闭自动提交。

自动发布前不要在商店保留未完成的人工修改。API 提交的是当前草稿，可能同时包含之前手动保存的商店变更。两边任务独立，一边失败不取消另一边；失败后先检查后台，再只重跑需要处理的商店。

## 校验与安全边界

- 只接受已发布的 `vX.Y.Z` 正式 Release 和标准命名 ZIP；下载后核对 GitHub SHA256。
- ZIP 采用固定文件白名单，拒绝重复、缺失或额外文件，并与该 tag 的源码核对、运行对应测试。文本比较允许 Windows / Linux 换行符差异。
- 检查版本、常见本机路径和密钥痕迹；该扫描不是对所有隐私形式的绝对保证，发布前仍需人工检查。
- 使用官方 API，不读取 Cookie，不运行桌面自动点击脚本；权限仅为 GitHub 仓库只读，现有安装助手更新工作流不受影响。
- Secrets 只注入商店提交步骤，不输出令牌或原始响应；请求不跟随重定向，提交失败不自动重试。限制能修改 `main`、工作流和 Release 的人员，建议设置分支保护。
- Chrome 遇到审核警告时停止；Edge 上传完成后才提交认证。轮询有上限，超时后到后台核对，不视作发布成功。
- 第三方素材权利和商店政策仍需人工确认，详见 [第三方素材说明](../THIRD_PARTY_NOTICES.md)。自动化不代表素材已获得授权或一定过审。

## 常见结果

| 结果 | 下一步 |
| --- | --- |
| `validate` 成功 | ZIP 和测试通过，尚未联系商店 |
| Missing GitHub Secrets | 补全该商店的 Secret，无需重新发布 GitHub 版本 |
| HTTP 401 / 403 | 检查账号归属、授权、密钥有效期和 API 是否启用 |
| HTTP 409 / 有正在审核的提交 | 先在商店后台处理已有提交，不自动撤销 |
| 上传失败或版本冲突 | 检查后台草稿、版本号和 ZIP，避免盲目重试 |
| Submission accepted / created | 仅说明进入审核流程，不是审核通过 |

本工作流不新增扩展权限，也不要求用户重装；商店审核通过后的分发仍由浏览器负责。
