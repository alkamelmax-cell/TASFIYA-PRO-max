package com.tasfiyapro.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
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
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
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
    private ScrollView pageScroll;
    private LinearLayout pageContainer;
    private ProgressBar progress;
    private LinearLayout floatingActions;
    private Button floatingMenuButton;
    private boolean floatingActionsVisible;
    private final List<Bitmap> renderedPages = new ArrayList<>();

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
            renderAllPages();
        } catch (Exception ignored) {
            Toast.makeText(this, "تعذر عرض ملف PDF.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void buildUi(String title) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(232, 238, 236));

        FrameLayout toolbar = new FrameLayout(this);
        toolbar.setPadding(dp(18), dp(8), dp(18), dp(8));
        toolbar.setBackgroundColor(Color.rgb(14, 58, 54));

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(16);
        titleView.setGravity(Gravity.CENTER);
        titleView.setMaxLines(1);
        titleView.setPadding(dp(8), 0, dp(8), 0);
        toolbar.addView(titleView, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(56)));

        FrameLayout canvas = new FrameLayout(this);
        canvas.setForegroundGravity(Gravity.CENTER);
        canvas.setPadding(dp(8), dp(8), dp(8), dp(8));
        pageScroll = new ScrollView(this);
        pageScroll.setFillViewport(false);
        pageScroll.setBackgroundColor(Color.rgb(232, 238, 236));
        pageScroll.setClipToPadding(false);
        pageContainer = new LinearLayout(this);
        pageContainer.setOrientation(LinearLayout.VERTICAL);
        pageContainer.setPadding(0, dp(2), 0, dp(86));
        pageScroll.addView(pageContainer, new ScrollView.LayoutParams(-1, -2));
        canvas.addView(pageScroll, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        progress = new ProgressBar(this);
        canvas.addView(progress, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER));
        addFloatingActionMenu(canvas);
        root.addView(canvas, new LinearLayout.LayoutParams(-1, 0, 1));

        setContentView(root);
    }

    private void addFloatingActionMenu(FrameLayout canvas) {
        floatingActions = new LinearLayout(this);
        floatingActions.setOrientation(LinearLayout.VERTICAL);
        floatingActions.setGravity(Gravity.CENTER_HORIZONTAL);
        floatingActions.setPadding(0, 0, 0, 0);

        Button close = floatingLabelButton("إغلاق  ×", "إغلاق العارض",
                Color.rgb(255, 235, 235), Color.rgb(151, 47, 61));
        close.setOnClickListener(view -> finish());
        floatingActions.addView(close, floatingLabelButtonParams());
        addFloatingGap();

        Button save = floatingLabelButton("حفظ  ↓", "حفظ ملف PDF",
                Color.WHITE, Color.rgb(15, 78, 70));
        save.setOnClickListener(view -> {
            hideFloatingActions();
            requestSave();
        });
        floatingActions.addView(save, floatingLabelButtonParams());
        addFloatingGap();

        Button share = floatingLabelButton("مشاركة  ↗", "مشاركة ملف PDF",
                Color.WHITE, Color.rgb(15, 78, 70));
        share.setOnClickListener(view -> {
            hideFloatingActions();
            share();
        });
        floatingActions.addView(share, floatingLabelButtonParams());
        addFloatingGap();

        floatingMenuButton = floatingButton("PDF", "خيارات ملف PDF", Color.rgb(14, 83, 74), Color.WHITE);
        floatingMenuButton.setTextSize(12);
        floatingMenuButton.setOnClickListener(view -> toggleFloatingActions());
        floatingActions.addView(floatingMenuButton, floatingButtonParams());

        FrameLayout.LayoutParams menuParams = new FrameLayout.LayoutParams(dp(132), -2, Gravity.BOTTOM | Gravity.LEFT);
        menuParams.setMargins(dp(18), dp(18), dp(18), dp(18));
        canvas.addView(floatingActions, menuParams);
        hideFloatingActions();
    }

    private Button floatingButton(String icon, String description, int backgroundColor, int foregroundColor) {
        Button button = new Button(this);
        button.setText(icon);
        button.setTextColor(foregroundColor);
        button.setContentDescription(description);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinHeight(0);
        button.setPadding(0, 0, 0, dp(2));
        button.setElevation(dp(8));
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(backgroundColor);
        background.setStroke(dp(1), Color.argb(38, 9, 54, 49));
        button.setBackground(background);
        return button;
    }

    private Button floatingLabelButton(String text, String description, int backgroundColor, int foregroundColor) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(foregroundColor);
        button.setContentDescription(description);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setMinWidth(0);
        button.setMinHeight(0);
        button.setPadding(dp(12), 0, dp(12), dp(1));
        button.setElevation(dp(7));
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.RECTANGLE);
        background.setCornerRadius(dp(26));
        background.setColor(backgroundColor);
        background.setStroke(dp(1), Color.argb(38, 9, 54, 49));
        button.setBackground(background);
        return button;
    }

    private LinearLayout.LayoutParams floatingButtonParams() {
        return new LinearLayout.LayoutParams(dp(56), dp(56));
    }

    private LinearLayout.LayoutParams floatingLabelButtonParams() {
        return new LinearLayout.LayoutParams(dp(132), dp(52));
    }

    private void addFloatingGap() {
        View gap = new View(this);
        floatingActions.addView(gap, new LinearLayout.LayoutParams(1, dp(10)));
    }

    private void toggleFloatingActions() {
        if (floatingActionsVisible) hideFloatingActions(); else showFloatingActions();
    }

    private void showFloatingActions() {
        floatingActionsVisible = true;
        for (int index = 0; index < floatingActions.getChildCount() - 1; index++) {
            floatingActions.getChildAt(index).setVisibility(View.VISIBLE);
        }
        floatingMenuButton.setText("×");
        floatingMenuButton.setTextSize(25);
        floatingMenuButton.setContentDescription("إخفاء خيارات ملف PDF");
    }

    private void hideFloatingActions() {
        floatingActionsVisible = false;
        if (floatingActions == null) return;
        for (int index = 0; index < floatingActions.getChildCount() - 1; index++) {
            floatingActions.getChildAt(index).setVisibility(View.GONE);
        }
        if (floatingMenuButton != null) {
            floatingMenuButton.setText("PDF");
            floatingMenuButton.setTextSize(12);
            floatingMenuButton.setContentDescription("خيارات ملف PDF");
        }
    }

    private void renderAllPages() {
        if (renderer == null) return;
        progress.setVisibility(View.VISIBLE);
        pageScroll.setVisibility(View.VISIBLE);
        pageContainer.removeAllViews();
        final int pageCount = renderer.getPageCount();
        final int targetWidth = Math.min(1400,
                Math.max(Math.round(getResources().getDisplayMetrics().widthPixels * 1.35f), 900));

        renderExecutor.execute(() -> {
            for (int pageIndex = 0; pageIndex < pageCount && !Thread.currentThread().isInterrupted(); pageIndex++) {
                Bitmap rendered = null;
                try (PdfRenderer.Page page = renderer.openPage(pageIndex)) {
                    int targetHeight = Math.max(1,
                            Math.round(targetWidth * (page.getHeight() / (float) page.getWidth())));
                    rendered = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
                    rendered.eraseColor(Color.WHITE);
                    page.render(rendered, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                } catch (Exception ignored) { }

                final int renderedIndex = pageIndex;
                final Bitmap result = rendered;
                runOnUiThread(() -> appendRenderedPage(result, renderedIndex, pageCount));
                if (renderedIndex == 0) runOnUiThread(() -> progress.setVisibility(View.GONE));
            }
        });
    }

    private void appendRenderedPage(Bitmap bitmap, int pageIndex, int pageCount) {
        if (isFinishing() || isDestroyed()) {
            if (bitmap != null) bitmap.recycle();
            return;
        }
        if (bitmap == null) {
            if (pageIndex == 0) {
                progress.setVisibility(View.GONE);
                Toast.makeText(this, "تعذر عرض صفحات الملف.", Toast.LENGTH_SHORT).show();
            }
            return;
        }

        renderedPages.add(bitmap);
        LinearLayout pageCard = new LinearLayout(this);
        pageCard.setOrientation(LinearLayout.VERTICAL);
        pageCard.setBackgroundColor(Color.WHITE);
        pageCard.setElevation(dp(2));

        TextView pageNumber = new TextView(this);
        pageNumber.setText("صفحة " + (pageIndex + 1) + " من " + pageCount);
        pageNumber.setTextColor(Color.rgb(78, 102, 98));
        pageNumber.setTextSize(11);
        pageNumber.setGravity(Gravity.CENTER);
        pageNumber.setPadding(0, dp(7), 0, dp(7));

        ImageView image = new ImageView(this);
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_XY);
        image.setBackgroundColor(Color.WHITE);
        image.setImageBitmap(bitmap);
        pageCard.addView(image, new LinearLayout.LayoutParams(-1, -2));
        pageCard.addView(pageNumber, new LinearLayout.LayoutParams(-1, dp(34)));

        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(-1, -2);
        cardParams.setMargins(dp(2), dp(5), dp(2), dp(9));
        pageContainer.addView(pageCard, cardParams);
        if (pageIndex == 0) {
            progress.setVisibility(View.GONE);
            pageScroll.post(() -> pageScroll.scrollTo(0, 0));
        }
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
        for (Bitmap bitmap : renderedPages) {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
        renderedPages.clear();
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
