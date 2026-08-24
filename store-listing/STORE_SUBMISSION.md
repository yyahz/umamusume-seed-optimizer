# Chrome / Edge 商店发布指南

版本 0.7.0 的商店包、文案和素材由仓库脚本统一生成或校验。实际提交必须由发布者在自己的 Google 和 Microsoft 开发者账号中完成。

## 生成发布包

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-store-packages.ps1
```

输出文件：

- `dist/umamusume-seed-optimizer-chrome-v0.7.0.zip`
- `dist/umamusume-seed-optimizer-edge-v0.7.0.zip`

两个 ZIP 的运行代码相同，根目录直接包含 `manifest.json`。脚本会拒绝把测试、反向分析、Git 文件或名称疑似包含凭据的文件打入商店包。

## Chrome 网上应用店

1. 登录 Chrome Web Store Developer Dashboard，创建新项目并上传 Chrome ZIP。
2. 默认语言选择简体中文，复制 [`zh-CN.md`](./zh-CN.md) 的名称、简短说明和详细说明。
3. 上传 `store-assets/icon-128.png`、两张 `screenshot-*-1280x800.png` 和 `promo-small-440x280.png`；`promo-marquee-1400x560.png` 可选。
4. 在隐私实践中复制 [`PRIVACY_DISCLOSURES.md`](./PRIVACY_DISCLOSURES.md) 的单一用途、权限理由、远程代码和数据声明。
5. 隐私政策 URL 使用 `https://github.com/yyahz/umamusume-seed-optimizer/blob/main/PRIVACY.md`。
6. 主页使用 `https://github.com/yyahz/umamusume-seed-optimizer`，支持页使用 `https://github.com/yyahz/umamusume-seed-optimizer/issues`。
7. 发行地区应以游戏简体中文服和工具实际可用地区为准，检查预览后提交审核。

## Microsoft Edge 加载项

1. 登录 Partner Center 的 Microsoft Edge 项目，创建新扩展并上传 Edge ZIP。
2. 添加简体中文商店语言，复制 [`zh-CN.md`](./zh-CN.md)；详细说明已超过 Edge 要求的 250 字符下限。
3. 上传 `store-assets/logo-300.png`。建议同时上传两张 `screenshot-*-1280x800.png` 和 `promo-small-440x280.png`；大宣传图可使用 `promo-marquee-1400x560.png`。
4. 在隐私页面复制 [`PRIVACY_DISCLOSURES.md`](./PRIVACY_DISCLOSURES.md)，隐私政策 URL 与 Chrome 相同。
5. 在认证备注中复制 [`REVIEW_NOTES.md`](./REVIEW_NOTES.md) 的测试步骤和审核说明，再提交认证。

## 提交前检查

- ZIP 内的 `manifest.json` 位于根目录，版本号高于此前商店版本。
- 截图中没有账号昵称、头像、UID、好友 ID、Cookie、通知、浏览器书签或本机路径。
- 开发者后台的公开发布者名称和联系资料由账号持有人自行确认；不要把私人邮箱复制进商店文案。
- 确认拥有扩展图标和宣传素材的发布权，并保留非官方免责声明。角色形象、游戏名称或商标的权利争议可能导致商店要求替换素材。
- 若审核平台要求可访问的测试账号，需要由发布者通过平台提供的私密审核字段提供；不要写入仓库、ZIP、截图、Issue 或公开说明。

## 官方参考

- [Chrome：准备扩展](https://developer.chrome.com/docs/webstore/prepare)
- [Chrome：商店详情与素材](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Chrome：图片尺寸](https://developer.chrome.com/docs/webstore/images)
- [Chrome：隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome：用户数据常见问题](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Edge：发布扩展](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
