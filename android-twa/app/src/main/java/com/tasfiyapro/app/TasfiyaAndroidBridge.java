package com.tasfiyapro.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.PushbackInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Android helpers used by the web UI inside the APK. */
public final class TasfiyaAndroidBridge {
    private static final long MAX_PDF_BYTES = 20L * 1024L * 1024L;

    private final Activity activity;
    private final String allowedHost;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public TasfiyaAndroidBridge(Activity activity, String launchUrl) {
        this.activity = activity;
        Uri launchUri = Uri.parse(launchUrl);
        this.allowedHost = launchUri.getHost();
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public boolean openPdfFromUrl(String url, String fileName, String title) {
        return fetchPdfThen(url, fileName, "جاري فتح ملف PDF...", pdfFile -> {
            Intent intent = new Intent(activity, PdfViewerActivity.class);
            intent.putExtra(PdfViewerActivity.EXTRA_FILE_PATH, pdfFile.getAbsolutePath());
            intent.putExtra(PdfViewerActivity.EXTRA_FILE_NAME, pdfFile.getName());
            intent.putExtra(PdfViewerActivity.EXTRA_TITLE,
                    stringOrEmpty(title).isEmpty() ? "معاينة التقرير" : title);
            activity.startActivity(intent);
        });
    }

    @JavascriptInterface
    public boolean sharePdfFromUrl(String url, String fileName, String title) {
        final String safeTitle = stringOrEmpty(title).isEmpty() ? "مشاركة تقرير PDF" : title;
        return fetchPdfThen(url, fileName, "جاري تجهيز ملف PDF للمشاركة...",
                pdfFile -> sharePdfFile(pdfFile, safeTitle));
    }

    @JavascriptInterface
    public boolean downloadPdfFromUrl(String url, String fileName, String title) {
        return fetchPdfThen(url, fileName, "جاري تجهيز ملف PDF للحفظ...",
                pdfFile -> ((MainActivity) activity).requestPdfSave(pdfFile, pdfFile.getName()));
    }

    /** Backward-compatible fallback for older web pages. Prefer sharePdfFromUrl. */
    @JavascriptInterface
    public boolean sharePdf(String base64Pdf, String fileName, String title) {
        try {
            byte[] bytes = Base64.decode(stringOrEmpty(base64Pdf), Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_PDF_BYTES) {
                toast("حجم ملف PDF غير مناسب للمشاركة.");
                return false;
            }

            File pdfFile = createShareFile(sanitizePdfFileName(fileName));
            try (FileOutputStream output = new FileOutputStream(pdfFile)) {
                output.write(bytes);
            }

            sharePdfFile(pdfFile, stringOrEmpty(title).isEmpty() ? "مشاركة تقرير PDF" : title);
            return true;
        } catch (Exception ignored) {
            toast("تعذر مشاركة ملف PDF.");
            return false;
        }
    }

    public void destroy() {
        ioExecutor.shutdownNow();
    }

    private boolean fetchPdfThen(String url, String fileName, String progressMessage, PdfAction action) {
        final String safeUrl = stringOrEmpty(url);
        if (!isAllowedReportUrl(safeUrl)) {
            toast("رابط التقرير غير مسموح.");
            return false;
        }

        final String safeFileName = sanitizePdfFileName(fileName);
        toast(progressMessage);
        ioExecutor.execute(() -> {
            try {
                File pdfFile = downloadPdf(safeUrl, safeFileName);
                mainHandler.post(() -> {
                    try {
                        action.run(pdfFile);
                    } catch (Exception ignored) {
                        toast("تعذر إكمال عملية ملف PDF.");
                    }
                });
            } catch (Exception ignored) {
                toast("تعذر تجهيز ملف PDF. تحقق من الاتصال ثم حاول مرة أخرى.");
            }
        });
        return true;
    }

    private File downloadPdf(String urlText, String fileName) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("Accept", "application/pdf");

        String cookies = CookieManager.getInstance().getCookie(urlText);
        if (cookies != null && !cookies.trim().isEmpty()) {
            connection.setRequestProperty("Cookie", cookies);
        }

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("PDF request failed with HTTP " + status);
        }

        long contentLength = connection.getContentLengthLong();
        if (contentLength > MAX_PDF_BYTES) {
            throw new IllegalStateException("PDF file is too large");
        }

        String contentType = connection.getContentType();
        if (contentType != null && !contentType.toLowerCase(Locale.ROOT).contains("pdf")) {
            throw new IllegalStateException("Response is not a PDF");
        }

        File pdfFile = createShareFile(fileName);
        try (PushbackInputStream input = new PushbackInputStream(
                    new BufferedInputStream(connection.getInputStream()), 5);
             FileOutputStream output = new FileOutputStream(pdfFile)) {
            byte[] signature = new byte[5];
            int signatureLength = input.read(signature);
            if (signatureLength != 5
                    || signature[0] != '%' || signature[1] != 'P' || signature[2] != 'D'
                    || signature[3] != 'F' || signature[4] != '-') {
                throw new IllegalStateException("Response does not contain a valid PDF signature");
            }
            input.unread(signature);
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_PDF_BYTES) {
                    throw new IllegalStateException("PDF file is too large");
                }
                output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }

        if (pdfFile.length() <= 0) {
            throw new IllegalStateException("PDF file is empty");
        }

        return pdfFile;
    }

    private File createShareFile(String fileName) throws Exception {
        File dir = new File(activity.getCacheDir(), "shared-pdf");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Cannot create PDF cache directory");
        }
        return new File(dir, fileName);
    }

    private void sharePdfFile(File file, String title) {
        mainHandler.post(() -> {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("application/pdf");
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.setClipData(ClipData.newRawUri(file.getName(), uri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                activity.startActivity(chooser);
            } catch (ActivityNotFoundException ignored) {
                toast("لا يوجد تطبيق مناسب لمشاركة PDF.");
            }
        });
    }

    private boolean isAllowedReportUrl(String urlText) {
        try {
            Uri uri = Uri.parse(urlText);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) return false;
            if ("https".equalsIgnoreCase(scheme) && allowedHost != null && allowedHost.equalsIgnoreCase(host)) {
                return true;
            }
            if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host))) {
                return true;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private String sanitizePdfFileName(String value) {
        String clean = stringOrEmpty(value).replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "-").trim();
        if (clean.isEmpty()) clean = "tasfiya-report.pdf";
        if (!clean.toLowerCase(Locale.ROOT).endsWith(".pdf")) clean += ".pdf";
        return clean;
    }

    private String stringOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private void toast(String message) {
        mainHandler.post(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }

    private interface PdfAction {
        void run(File pdfFile) throws Exception;
    }
}
