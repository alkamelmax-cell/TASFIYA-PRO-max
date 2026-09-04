package com.tasfiyapro.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import com.onesignal.OneSignal;
import com.onesignal.user.subscriptions.IPushSubscription;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Native OneSignal bridge for the Android APK.
 *
 * Browser Web Push and Android Native Push are different OneSignal channels.
 * The WebView cannot reliably create a real Android push subscription by
 * itself, so this bridge initializes the Android SDK directly, logs in with
 * the same Tasfiya external_id, exposes diagnostics to the web app, and lets
 * the web app register the native subscription with the server.
 */
public final class TasfiyaOneSignalBridge {
    private final Activity activity;
    private final String appId;
    private volatile boolean initialized = false;
    private volatile String configuredExternalId = "";
    private volatile String lastError = "";
    private volatile long lastConfiguredAt = 0L;

    public TasfiyaOneSignalBridge(Activity activity, String appId) {
        this.activity = activity;
        this.appId = appId == null ? "" : appId.trim();
        initialize();
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public void configure(String payloadJson) {
        initialize();
        requestAndroidNotificationPermission();

        try {
            JSONObject payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
            String externalId = payload.optString("externalId", "").trim();
            if (!externalId.isEmpty()) {
                configuredExternalId = externalId;
                OneSignal.login(externalId);
            }

            JSONObject tagsJson = payload.optJSONObject("tags");
            if (tagsJson != null) {
                OneSignal.getUser().addTags(toStringMap(tagsJson));
            }

            IPushSubscription pushSubscription = OneSignal.getUser().getPushSubscription();
            if (pushSubscription != null) {
                pushSubscription.optIn();
            }

            lastConfiguredAt = System.currentTimeMillis();
            lastError = "";
        } catch (Exception error) {
            lastError = error.getClass().getSimpleName() + ": " + safeMessage(error);
        }
    }

    @JavascriptInterface
    public String getStatusJson() {
        JSONObject status = new JSONObject();
        try {
            initialize();
            IPushSubscription pushSubscription = OneSignal.getUser().getPushSubscription();

            status.put("available", true);
            status.put("native", true);
            status.put("initialized", initialized || OneSignal.isInitialized());
            status.put("appId", appId);
            status.put("externalId", firstNonEmpty(OneSignal.getUser().getExternalId(), configuredExternalId));
            status.put("oneSignalId", OneSignal.getUser().getOnesignalId());
            status.put("subscriptionId", pushSubscription == null ? "" : stringOrEmpty(pushSubscription.getId()));
            status.put("tokenPresent", pushSubscription != null && !stringOrEmpty(pushSubscription.getToken()).isEmpty());
            status.put("optedIn", pushSubscription != null && pushSubscription.getOptedIn());
            status.put("permission", hasNotificationPermission());
            status.put("lastConfiguredAt", lastConfiguredAt);
            status.put("lastError", lastError);
        } catch (Exception error) {
            try {
                status.put("available", true);
                status.put("native", true);
                status.put("initialized", initialized);
                status.put("appId", appId);
                status.put("externalId", configuredExternalId);
                status.put("permission", hasNotificationPermission());
                status.put("lastConfiguredAt", lastConfiguredAt);
                status.put("lastError", error.getClass().getSimpleName() + ": " + safeMessage(error));
            } catch (Exception ignored) {
                return "{\"available\":true,\"native\":true,\"lastError\":\"status serialization failed\"}";
            }
        }

        return status.toString();
    }

    public void onAndroidNotificationPermissionResult(int requestCode, int[] grantResults) {
        if (requestCode != 5120) {
            return;
        }

        try {
            IPushSubscription pushSubscription = OneSignal.getUser().getPushSubscription();
            if (pushSubscription != null && hasNotificationPermission()) {
                pushSubscription.optIn();
            }
            lastConfiguredAt = System.currentTimeMillis();
            lastError = "";
        } catch (Exception error) {
            lastError = error.getClass().getSimpleName() + ": " + safeMessage(error);
        }
    }

    private void initialize() {
        if (initialized || appId.isEmpty()) {
            return;
        }

        try {
            OneSignal.initWithContext((Context) activity.getApplicationContext(), appId);
            initialized = true;
            lastError = "";
        } catch (Exception error) {
            lastError = error.getClass().getSimpleName() + ": " + safeMessage(error);
        }
    }

    private Map<String, String> toStringMap(JSONObject tagsJson) {
        Map<String, String> tags = new HashMap<>();
        Iterator<String> keys = tagsJson.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            tags.put(key, String.valueOf(tagsJson.opt(key)));
        }
        return tags;
    }

    private boolean hasNotificationPermission() {
        try {
            return OneSignal.getNotifications().getPermission();
        } catch (Exception ignored) {
            return Build.VERSION.SDK_INT < 33
                || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private void requestAndroidNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33 || hasNotificationPermission()) {
            return;
        }

        activity.runOnUiThread(() ->
            activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 5120)
        );
    }

    private String firstNonEmpty(String first, String second) {
        String normalizedFirst = stringOrEmpty(first);
        return normalizedFirst.isEmpty() ? stringOrEmpty(second) : normalizedFirst;
    }

    private String stringOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null ? "" : message;
    }
}
