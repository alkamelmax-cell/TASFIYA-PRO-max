package com.tasfiyapro.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Native, dependency-free host for the Tasfiya Pro web application.
 *
 * This deliberately does not use Custom Tabs or Trusted Web Activity. Those
 * components can close immediately when a compatible browser is absent on a
 * phone. Android System WebView is part of Android and provides a stable host.
 */
public final class MainActivity extends Activity {
    private static final String APP_HOST = "server.tail22db51.ts.net";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(18, 35, 61));
        getWindow().setNavigationBarColor(Color.rgb(18, 35, 61));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(18, 35, 61));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        CookieManager.setAcceptFileSchemeCookies(false);

        webView.setWebViewClient(new TasfiyaWebViewClient());
        webView.addJavascriptInterface(new TasfiyaShareBridge(), "TasfiyaAndroid");
        if (savedInstanceState == null) {
            webView.loadUrl(getString(R.string.launch_url));
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private final class TasfiyaWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return open(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return open(Uri.parse(url));
        }

        private boolean open(Uri uri) {
            String scheme = uri.getScheme();
            if ("https".equalsIgnoreCase(scheme) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                // Keep the user inside the app when Android has no handler.
            }
            return true;
        }
    }

    /**
     * Lets the trusted Tasfiya dashboard hand a generated PDF to Android's
     * native chooser. WebView itself does not implement the browser Web Share
     * API consistently, so this keeps sharing inside the app and always offers
     * WhatsApp, e-mail, files, and other installed targets.
     */
    private final class TasfiyaShareBridge {
        @JavascriptInterface
        public boolean sharePdf(String base64Pdf, String requestedFileName) {
            try {
                String safeFileName = requestedFileName == null
                        ? "tasfiya-reconciliation.pdf"
                        : requestedFileName.replaceAll("[^A-Za-z0-9._\\-\u0600-\u06FF]", "_");
                if (!safeFileName.endsWith(".pdf")) safeFileName += ".pdf";

                File reportDirectory = new File(getCacheDir(), "shared_reports");
                if (!reportDirectory.exists() && !reportDirectory.mkdirs()) {
                    throw new IOException("Unable to create the temporary report directory");
                }
                File reportFile = new File(reportDirectory, safeFileName);
                try (FileOutputStream output = new FileOutputStream(reportFile, false)) {
                    output.write(Base64.decode(base64Pdf, Base64.DEFAULT));
                }

                Uri reportUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        reportFile
                );
                runOnUiThread(() -> {
                    Intent shareIntent = new Intent(Intent.ACTION_SEND);
                    shareIntent.setType("application/pdf");
                    shareIntent.putExtra(Intent.EXTRA_STREAM, reportUri);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    shareIntent.setClipData(ClipData.newRawUri("تقرير تصفية", reportUri));
                    startActivity(Intent.createChooser(shareIntent, "مشاركة تقرير التصفية"));
                });
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }
}
