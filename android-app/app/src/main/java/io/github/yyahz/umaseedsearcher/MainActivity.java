package io.github.yyahz.umaseedsearcher;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

public final class MainActivity extends Activity {
    private static final String TOOL_URL = "https://game.bilibili.com/tool/pd";
    private static final List<String> EXTENSION_SCRIPTS = Arrays.asList(
        "page-bridge.js",
        "ranking.js",
        "gold-skill-map.js",
        "traditional-name-map.js",
        "factor-recognizer.js",
        "request-guard.js",
        "content.js",
        "mobile-ui.js"
    );

    private WebView webView;
    private ProgressBar progressBar;
    private View startupPanel;
    private View errorPanel;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int readinessAttempts;
    private boolean searchInterfaceReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(247, 249, 248));
        getWindow().setNavigationBarColor(Color.WHITE);
        int systemUiFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systemUiFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        getWindow().getDecorView().setSystemUiVisibility(systemUiFlags);
        buildInterface();
        configureWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(TOOL_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void buildInterface() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 248, 244));

        webView = new WebView(this);
        webView.setVisibility(View.INVISIBLE);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        );
        progressParams.gravity = Gravity.TOP;
        root.addView(progressBar, progressParams);

        LinearLayout startup = new LinearLayout(this);
        startup.setOrientation(LinearLayout.VERTICAL);
        startup.setGravity(Gravity.CENTER);
        startup.setPadding(dp(28), dp(28), dp(28), dp(28));
        startup.setBackgroundColor(Color.rgb(247, 248, 244));

        ImageView startupIcon = new ImageView(this);
        startupIcon.setImageResource(R.drawable.app_icon);
        startupIcon.setContentDescription(null);
        startup.addView(startupIcon, new LinearLayout.LayoutParams(dp(92), dp(92)));

        TextView startupTitle = new TextView(this);
        startupTitle.setText(R.string.startup_title);
        startupTitle.setTextColor(Color.rgb(7, 88, 52));
        startupTitle.setTextSize(24);
        startupTitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams startupTitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        startupTitleParams.topMargin = dp(18);
        startup.addView(startupTitle, startupTitleParams);

        TextView startupMessage = new TextView(this);
        startupMessage.setText(R.string.startup_message);
        startupMessage.setTextColor(Color.rgb(102, 114, 107));
        startupMessage.setTextSize(14);
        startupMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams startupMessageParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        startupMessageParams.topMargin = dp(8);
        startup.addView(startupMessage, startupMessageParams);

        ProgressBar startupProgress = new ProgressBar(this);
        LinearLayout.LayoutParams startupProgressParams = new LinearLayout.LayoutParams(dp(44), dp(44));
        startupProgressParams.topMargin = dp(18);
        startup.addView(startupProgress, startupProgressParams);

        startupPanel = startup;
        root.addView(startup, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(Gravity.CENTER);
        error.setPadding(dp(28), dp(28), dp(28), dp(28));
        error.setBackgroundColor(Color.rgb(247, 248, 244));

        TextView message = new TextView(this);
        message.setText(R.string.load_failed);
        message.setTextColor(Color.rgb(23, 35, 29));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        error.addView(message, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setAllCaps(false);
        retry.setOnClickListener(view -> {
            errorPanel.setVisibility(View.GONE);
            showStartup();
            webView.reload();
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(180), dp(52));
        retryParams.topMargin = dp(18);
        error.addView(retry, retryParams);

        error.setVisibility(View.GONE);
        errorPanel = error;
        root.addView(error, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isTrustedBilibiliPage(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorPanel.setVisibility(View.GONE);
                searchInterfaceReady = false;
                if (isToolPage(Uri.parse(url))) showStartup();
                else showWebView();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (isToolPage(Uri.parse(url))) injectExtension();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                errorPanel.setVisibility(View.VISIBLE);
            }
        });
    }

    private boolean isTrustedBilibiliPage(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        if (host == null) return false;
        String normalizedHost = host.toLowerCase(java.util.Locale.ROOT);
        return normalizedHost.equals("bilibili.com")
            || normalizedHost.endsWith(".bilibili.com")
            || normalizedHost.equals("passport.biligame.com")
            || normalizedHost.endsWith(".passport.biligame.com");
    }

    private boolean isToolPage(Uri uri) {
        return isTrustedBilibiliPage(uri)
            && "game.bilibili.com".equalsIgnoreCase(uri.getHost())
            && uri.getPath() != null
            && uri.getPath().startsWith("/tool/pd");
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // Keep the current page intact if the device has no handler for the URL.
        }
    }

    private void injectExtension() {
        try {
            String iconDataUrl = "data:image/png;base64," + Base64.encodeToString(
                readAssetBytes("icon-128.png"),
                Base64.NO_WRAP
            );
            String shim = "(() => {"
                + "const icon=" + quoteJs(iconDataUrl) + ";"
                + "const storage={local:{"
                + "get:(key)=>{const keys=Array.isArray(key)?key:[key];const out={};"
                + "for(const k of keys){try{const raw=localStorage.getItem('uma-app:'+k);if(raw!==null)out[k]=JSON.parse(raw);}catch(_){}}return Promise.resolve(out);},"
                + "set:(values)=>{for(const [k,v] of Object.entries(values||{})){try{localStorage.setItem('uma-app:'+k,JSON.stringify(v));}catch(_){}}return Promise.resolve();}"
                + "}};"
                + "globalThis.chrome={...(globalThis.chrome||{}),runtime:{getURL:()=>icon},storage};"
                + "})();";
            evaluateSequence(0, shim);
        } catch (IOException ignored) {
            errorPanel.setVisibility(View.VISIBLE);
        }
    }

    private void evaluateSequence(int scriptIndex, String source) {
        webView.evaluateJavascript(source, ignored -> {
            if (scriptIndex < EXTENSION_SCRIPTS.size()) {
                try {
                    String nextSource = readAssetText(EXTENSION_SCRIPTS.get(scriptIndex));
                    evaluateSequence(scriptIndex + 1, nextSource);
                } catch (IOException error) {
                    errorPanel.setVisibility(View.VISIBLE);
                }
                return;
            }
            waitForSearchInterface();
        });
    }

    private void waitForSearchInterface() {
        readinessAttempts = 0;
        pollSearchInterface();
    }

    private void pollSearchInterface() {
        String probe = "(() => {"
            + "const host=document.getElementById('uma-seed-optimizer-host');"
            + "const root=host&&host.shadowRoot;if(!root)return 'loading';"
            + "const status=(root.getElementById('status')?.textContent||'').trim();"
            + "if(status.startsWith('已读取 ')){"
            + "const close=root.getElementById('close');if(close)close.style.display='none';"
            + "const panel=root.getElementById('panel');const launcher=root.getElementById('launcher');"
            + "if(panel&&launcher&&!panel.classList.contains('open'))launcher.click();"
            + "return 'ready';}"
            + "if(status&&!status.startsWith('正在'))return 'login';"
            + "return 'loading';"
            + "})();";
        webView.evaluateJavascript(probe, result -> {
            String state = result == null ? "" : result.replace("\"", "");
            if ("ready".equals(state)) {
                searchInterfaceReady = true;
                showWebView();
                return;
            }
            if ("login".equals(state) || readinessAttempts >= 60) {
                showWebView();
                return;
            }
            readinessAttempts += 1;
            handler.postDelayed(this::pollSearchInterface, 250);
        });
    }

    private void showStartup() {
        webView.setVisibility(View.INVISIBLE);
        startupPanel.setVisibility(View.VISIBLE);
    }

    private void showWebView() {
        webView.setVisibility(View.VISIBLE);
        startupPanel.setVisibility(View.GONE);
    }

    private String readAssetText(String path) throws IOException {
        return new String(readAssetBytes(path), StandardCharsets.UTF_8);
    }

    private byte[] readAssetBytes(String path) throws IOException {
        try (InputStream input = getAssets().open(path);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private String quoteJs(String value) {
        return "\"" + value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\r", "\\r")
            .replace("\n", "\\n")
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029") + "\"";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (searchInterfaceReady) {
            String mobileBack = "(() => Boolean(globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__?.back?.()))();";
            webView.evaluateJavascript(mobileBack, handled -> {
                if (!"true".equals(handled)) finish();
            });
            return;
        }
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
