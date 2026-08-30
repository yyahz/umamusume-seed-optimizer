# Android 轻量验证版

这是“种马搜索器”的 Android 可行性验证工程。它使用系统 WebView 打开吗哩吗哩工具箱，并从同一仓库复制现有扩展脚本，在页面加载完成后注入手机版搜索界面。

首版只验证以下关键路径：

- App 内打开吗哩吗哩工具箱并由用户自行登录。
- 关闭并重新打开 App 后保留 WebView 登录状态。
- 复用现有因子目录、角色目录、识别、搜索、评分和访问保护逻辑。
- 使用“角色 / 因子 / 结果”三页式手机界面；因子选择、星级与优先级调整、搜索设置集中在因子页。未登录时显示官方登录页，登录有效时先显示 App 加载页，再直接进入搜索器。
- 角色目录采用两列两行的四角色分组切换，因子星级与优先级编辑采用紧凑单行卡片，避免窄屏出现过大的控件。
- Android 版取消角色目录和因子目录的嵌套滚动，并以底部导航、触控尺寸和固定搜索操作区适配手机单手使用。

## 隐私边界

- App 不包含服务器，也不申请读取手机文件、相册、通讯录或定位等权限。
- App 只申请网络权限；B 站登录发生在 B 站网页中。
- App 不提供读取、显示、导出或上传 Cookie 的接口，也不要求用户粘贴 Cookie。
- 因子偏好保存在吗哩吗哩页面来源对应的本机 WebView 存储中。
- `bilibili.com`及 B 站游戏登录必需的`passport.biligame.com`页面保留在 App 内；其他网站交给手机系统浏览器打开，SSL 证书异常时停止加载。

## 构建

需要 JDK 17 或更高版本、Android SDK 35，以及 Gradle 8.9。使用标准 Gradle 工程时，进入本目录后运行：

```powershell
.\gradlew.bat assembleDebug
```

调试 APK 位于：

```text
app/build/outputs/apk/debug/app-debug.apk
```

构建时会自动把仓库根目录下的扩展 JavaScript 和图标复制进 APK，因此不维护第二份搜索逻辑。

没有安装 Gradle 时，也可以使用仓库提供的纯 Android SDK 构建脚本：

```powershell
.\scripts\build-debug.ps1 -SdkRoot "C:\Android\Sdk"
```

脚本输出为`app/build/outputs/apk/debug/uma-seed-searcher-android-v0.1.7-debug.apk`。调试包只用于本机安装测试，正式分发前需要改用单独保管的发布签名。
