package com.tasfiyapro.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Native, dependency-free host for the Tasfiya Pro web application. */
public final class MainActivity extends Activity {
    private static final String APP_HOST = "server.tail22db51.ts.net";
    private static final int SAVE_PDF_REQUEST = 7301;
    private WebView webView;
    private TasfiyaOneSignalBridge oneSignalBridge;
    private TasfiyaAndroidBridge androidBridge;
    private File pendingPdfSave;

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
        oneSignalBridge = new TasfiyaOneSignalBridge(this, getString(R.string.onesignal_app_id));
        webView.addJavascriptInterface(oneSignalBridge, "TasfiyaNativeOneSignal");
        androidBridge = new TasfiyaAndroidBridge(this, getString(R.string.launch_url));
        webView.addJavascriptInterface(androidBridge, "TasfiyaAndroid");
        webView.setWebViewClient(new TasfiyaWebViewClient());
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
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (oneSignalBridge != null) {
            oneSignalBridge.onAndroidNotificationPermissionResult(requestCode, grantResults);
        }
    }

    @Override
    protected void onDestroy() {
        if (androidBridge != null) {
            androidBridge.destroy();
        }
        super.onDestroy();
    }

    public void requestPdfSave(File file, String fileName) {
        pendingPdfSave = file;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        try {
            startActivityForResult(intent, SAVE_PDF_REQUEST);
        } catch (ActivityNotFoundException ignored) {
            pendingPdfSave = null;
            Toast.makeText(this, "لا يوجد مدير ملفات لحفظ التقرير.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SAVE_PDF_REQUEST) return;
        File source = pendingPdfSave;
        pendingPdfSave = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || source == null) return;
        Uri destination = data.getData();
        new Thread(() -> {
            boolean saved = copyPdf(source, destination);
            runOnUiThread(() -> Toast.makeText(this,
                    saved ? "تم حفظ ملف PDF" : "تعذر حفظ ملف PDF",
                    Toast.LENGTH_LONG).show());
        }, "tasfiya-pdf-save").start();
    }

    private boolean copyPdf(File source, Uri destination) {
        try (InputStream input = new FileInputStream(source);
             OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) return false;
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.flush();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
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
            if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
            return true;
        }
    }
}
