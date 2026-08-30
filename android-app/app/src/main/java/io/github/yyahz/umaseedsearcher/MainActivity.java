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
        "content.js"
    );

    private WebView webView;
    private ProgressBar progressBar;
    private View errorPanel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 88, 52));
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
                if (isBilibiliPage(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorPanel.setVisibility(View.GONE);
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

    private boolean isBilibiliPage(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return host != null && (host.equals("bilibili.com") || host.endsWith(".bilibili.com"));
    }

    private boolean isToolPage(Uri uri) {
        return isBilibiliPage(uri)
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
            String mobileGlue = "(() => {"
                + "const host=document.getElementById('uma-seed-optimizer-host');"
                + "const root=host&&host.shadowRoot;if(!root)return;"
                + "const style=document.createElement('style');"
                + "style.textContent='.panel{width:100vw!important;max-width:none!important}.result-actions{align-items:stretch;flex-direction:column}.copy-button{justify-content:center;width:100%}.scope-note{text-align:center}.launcher{width:auto!important;padding:0 14px!important;bottom:24px!important}.launcher span{display:inline!important}';"
                + "root.appendChild(style);"
                + "})();";
            webView.evaluateJavascript(mobileGlue, null);
        });
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
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
