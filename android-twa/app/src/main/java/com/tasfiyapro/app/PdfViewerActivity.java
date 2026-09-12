package com.tasfiyapro.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native PDF preview used because Android WebView does not render PDF/blob URLs. */
public final class PdfViewerActivity extends Activity {
    public static final String EXTRA_FILE_PATH = "pdf_file_path";
    public static final String EXTRA_FILE_NAME = "pdf_file_name";
    public static final String EXTRA_TITLE = "pdf_title";
    private static final int SAVE_REQUEST = 7302;

    private final ExecutorService renderExecutor = Executors.newSingleThreadExecutor();
    private File pdfFile;
    private String fileName;
    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private ImageView pageImage;
    private ProgressBar progress;
    private TextView pageLabel;
    private Button previousButton;
    private Button nextButton;
    private int pageIndex;
    private Bitmap currentBitmap;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(10, 54, 49));
        getWindow().setNavigationBarColor(Color.rgb(10, 54, 49));

        pdfFile = new File(valueOrEmpty(getIntent().getStringExtra(EXTRA_FILE_PATH)));
        fileName = valueOrFallback(getIntent().getStringExtra(EXTRA_FILE_NAME), "tasfiya-report.pdf");
        if (!pdfFile.isFile() || pdfFile.length() == 0) {
            Toast.makeText(this, "ملف PDF غير متاح.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        buildUi(valueOrFallback(getIntent().getStringExtra(EXTRA_TITLE), "معاينة التقرير"));
        try {
            descriptor = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);
            if (renderer.getPageCount() == 0) throw new IllegalStateException("Empty PDF");
            showPage(0);
        } catch (Exception ignored) {
            Toast.makeText(this, "تعذر عرض ملف PDF.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void buildUi(String title) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(232, 238, 236));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(10), dp(8), dp(10), dp(8));
        toolbar.setBackgroundColor(Color.rgb(14, 58, 54));

        Button close = toolbarButton("إغلاق");
        close.setOnClickListener(view -> finish());
        toolbar.addView(close);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(16);
        titleView.setGravity(Gravity.CENTER);
        titleView.setMaxLines(1);
        titleView.setPadding(dp(8), 0, dp(8), 0);
        toolbar.addView(titleView, new LinearLayout.LayoutParams(0, dp(48), 1));

        Button save = toolbarButton("حفظ");
        save.setOnClickListener(view -> requestSave());
        toolbar.addView(save);
        Button share = toolbarButton("مشاركة");
        share.setOnClickListener(view -> share());
        toolbar.addView(share);
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(64)));

        FrameLayout canvas = new FrameLayout(this);
        canvas.setForegroundGravity(Gravity.CENTER);
        canvas.setPadding(dp(8), dp(8), dp(8), dp(8));
        pageImage = new ImageView(this);
        pageImage.setAdjustViewBounds(true);
        pageImage.setScaleType(ImageView.ScaleType.FIT_CENTER);
        pageImage.setBackgroundColor(Color.WHITE);
        canvas.addView(pageImage, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        progress = new ProgressBar(this);
        canvas.addView(progress, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER));
        root.addView(canvas, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout navigation = new LinearLayout(this);
        navigation.setGravity(Gravity.CENTER);
        navigation.setPadding(dp(10), dp(7), dp(10), dp(7));
        navigation.setBackgroundColor(Color.rgb(14, 58, 54));
        previousButton = toolbarButton("السابق");
        previousButton.setOnClickListener(view -> showPage(pageIndex - 1));
        navigation.addView(previousButton);
        pageLabel = new TextView(this);
        pageLabel.setTextColor(Color.WHITE);
        pageLabel.setTextSize(15);
        pageLabel.setGravity(Gravity.CENTER);
        navigation.addView(pageLabel, new LinearLayout.LayoutParams(dp(130), dp(44)));
        nextButton = toolbarButton("التالي");
        nextButton.setOnClickListener(view -> showPage(pageIndex + 1));
        navigation.addView(nextButton);
        root.addView(navigation, new LinearLayout.LayoutParams(-1, dp(60)));
        setContentView(root);
    }

    private Button toolbarButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(13);
        button.setAllCaps(false);
        button.setTextColor(Color.rgb(8, 45, 42));
        button.setBackgroundColor(Color.rgb(218, 244, 240));
        return button;
    }

    private void showPage(int requestedIndex) {
        if (renderer == null || requestedIndex < 0 || requestedIndex >= renderer.getPageCount()) return;
        pageIndex = requestedIndex;
        progress.setVisibility(View.VISIBLE);
        pageImage.setVisibility(View.INVISIBLE);
        previousButton.setEnabled(pageIndex > 0);
        nextButton.setEnabled(pageIndex + 1 < renderer.getPageCount());
        pageLabel.setText((pageIndex + 1) + " / " + renderer.getPageCount());
        final int renderIndex = pageIndex;
        final int targetWidth = Math.max(getResources().getDisplayMetrics().widthPixels * 2, 1200);

        renderExecutor.execute(() -> {
            Bitmap rendered = null;
            try (PdfRenderer.Page page = renderer.openPage(renderIndex)) {
                int targetHeight = Math.max(1, Math.round(targetWidth * (page.getHeight() / (float) page.getWidth())));
                rendered = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
                rendered.eraseColor(Color.WHITE);
                page.render(rendered, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            } catch (Exception ignored) { }
            final Bitmap result = rendered;
            runOnUiThread(() -> {
                if (renderIndex != pageIndex || isFinishing()) {
                    if (result != null) result.recycle();
                    return;
                }
                if (currentBitmap != null && currentBitmap != result) currentBitmap.recycle();
                currentBitmap = result;
                progress.setVisibility(View.GONE);
                if (result == null) {
                    Toast.makeText(this, "تعذر عرض هذه الصفحة.", Toast.LENGTH_SHORT).show();
                } else {
                    pageImage.setImageBitmap(result);
                    pageImage.setVisibility(View.VISIBLE);
                }
            });
        });
    }

    private void share() {
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pdfFile);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/pdf");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.setClipData(ClipData.newRawUri(fileName, uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, "مشاركة تقرير PDF"));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "لا يوجد تطبيق مناسب للمشاركة.", Toast.LENGTH_LONG).show();
        }
    }

    private void requestSave() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        try {
            startActivityForResult(intent, SAVE_REQUEST);
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "لا يوجد مدير ملفات لحفظ التقرير.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SAVE_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri destination = data.getData();
        renderExecutor.execute(() -> {
            boolean saved = copyTo(pdfFile, destination);
            runOnUiThread(() -> Toast.makeText(this,
                    saved ? "تم حفظ ملف PDF" : "تعذر حفظ ملف PDF",
                    Toast.LENGTH_LONG).show());
        });
    }

    private boolean copyTo(File source, Uri destination) {
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
    protected void onDestroy() {
        renderExecutor.shutdownNow();
        if (currentBitmap != null) currentBitmap.recycle();
        if (renderer != null) renderer.close();
        try { if (descriptor != null) descriptor.close(); } catch (Exception ignored) { }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String valueOrFallback(String value, String fallback) {
        String normalized = valueOrEmpty(value);
        return normalized.isEmpty() ? fallback : normalized;
    }
}
