package com.tasfiyapro.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Small native bridge used by the Tasfiya web app inside Android WebView.
 *
 * The normal browser/PWA path uses Web Push. Android WebView does not expose
 * reliable Web Push to the page, so the APK must register with OneSignal
 * natively and share the same external_id used by the web server:
 * tasfiya-admin-{id}.
 */
public final class TasfiyaOneSignalBridge {
    private final Activity activity;
    private final String appId;
    private volatile boolean initialized = false;

    public TasfiyaOneSignalBridge(Activity activity, String appId) {
        this.activity = activity;
        this.appId = appId == null ? "" : appId.trim();
        initialize();
    }

    @JavascriptInterface
    public void configure(String payloadJson) {
        initialize();
        requestAndroidNotificationPermission();

        try {
            JSONObject payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
            String externalId = payload.optString("externalId", "").trim();
            if (!externalId.isEmpty()) {
                login(externalId);
            }

            JSONObject tagsJson = payload.optJSONObject("tags");
            if (tagsJson != null) {
                Map<String, String> tags = new HashMap<>();
                Iterator<String> keys = tagsJson.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    tags.put(key, String.valueOf(tagsJson.opt(key)));
                }
                addTags(tags);
            }

            optInPushSubscription();
            promptForPushPermission();
        } catch (Exception ignored) {
            // Notifications must never crash or block the accounting app.
        }
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    private void initialize() {
        if (initialized || appId.isEmpty()) {
            return;
        }

        try {
            Class<?> oneSignalClass = Class.forName("com.onesignal.OneSignal");

            // OneSignal Android SDK v5
            try {
                Method init = oneSignalClass.getMethod("initWithContext", Context.class, String.class);
                init.invoke(null, activity.getApplicationContext(), appId);
                initialized = true;
                return;
            } catch (NoSuchMethodException ignored) {
                // Try legacy v4 below.
            }

            // OneSignal Android SDK v4 compatibility.
            try {
                Method init = oneSignalClass.getMethod("initWithContext", Context.class);
                init.invoke(null, activity.getApplicationContext());
                Method setAppId = oneSignalClass.getMethod("setAppId", String.class);
                setAppId.invoke(null, appId);
                initialized = true;
            } catch (NoSuchMethodException ignored) {
                // Unsupported SDK shape; fail silently.
            }
        } catch (Exception ignored) {
            // Dependency missing or SDK failed to initialize.
        }
    }

    private void login(String externalId) {
        try {
            Class<?> oneSignalClass = Class.forName("com.onesignal.OneSignal");

            try {
                Method login = oneSignalClass.getMethod("login", String.class);
                login.invoke(null, externalId);
                return;
            } catch (NoSuchMethodException ignored) {
                // Try legacy v4.
            }

            try {
                Method setExternalUserId = oneSignalClass.getMethod("setExternalUserId", String.class);
                setExternalUserId.invoke(null, externalId);
            } catch (NoSuchMethodException ignored) {
                // Unsupported SDK shape.
            }
        } catch (Exception ignored) {
            // No-op by design.
        }
    }

    private void addTags(Map<String, String> tags) {
        if (tags == null || tags.isEmpty()) {
            return;
        }

        try {
            Class<?> oneSignalClass = Class.forName("com.onesignal.OneSignal");

            Object userApi = getStaticMember(oneSignalClass, "User");
            if (userApi != null) {
                try {
                    Method addTags = userApi.getClass().getMethod("addTags", Map.class);
                    addTags.invoke(userApi, tags);
                    return;
                } catch (NoSuchMethodException ignored) {
                    // Try legacy below.
                }
            }

            try {
                JSONObject tagsJson = new JSONObject(tags);
                Method sendTags = oneSignalClass.getMethod("sendTags", JSONObject.class);
                sendTags.invoke(null, tagsJson);
            } catch (NoSuchMethodException ignored) {
                // Unsupported SDK shape.
            }
        } catch (Exception ignored) {
            // No-op by design.
        }
    }

    private void promptForPushPermission() {
        try {
            Class<?> oneSignalClass = Class.forName("com.onesignal.OneSignal");

            Object notificationsApi = getStaticMember(oneSignalClass, "Notifications");
            if (notificationsApi != null) {
                for (Method method : notificationsApi.getClass().getMethods()) {
                    if (!"requestPermission".equals(method.getName())) {
                        continue;
                    }

                    Class<?>[] params = method.getParameterTypes();
                    if (params.length == 1 && params[0] == boolean.class) {
                        method.invoke(notificationsApi, true);
                        return;
                    }
                    if (params.length == 0) {
                        method.invoke(notificationsApi);
                        return;
                    }
                }
            }

            try {
                Method prompt = oneSignalClass.getMethod("promptForPushNotifications");
                prompt.invoke(null);
            } catch (NoSuchMethodException ignored) {
                // Unsupported SDK shape.
            }
        } catch (Exception ignored) {
            // No-op by design.
        }
    }

    private void optInPushSubscription() {
        try {
            Class<?> oneSignalClass = Class.forName("com.onesignal.OneSignal");
            Object userApi = getStaticMember(oneSignalClass, "User");
            if (userApi == null) {
                return;
            }

            Object pushSubscriptionApi = getMember(userApi, "PushSubscription");
            if (pushSubscriptionApi == null) {
                return;
            }

            try {
                Method optIn = pushSubscriptionApi.getClass().getMethod("optIn");
                optIn.invoke(pushSubscriptionApi);
            } catch (NoSuchMethodException ignored) {
                // Unsupported SDK shape.
            }
        } catch (Exception ignored) {
            // No-op by design.
        }
    }

    private Object getStaticMember(Class<?> clazz, String name) {
        try {
            Method getter = clazz.getMethod("get" + name);
            return getter.invoke(null);
        } catch (Exception ignored) {
            // Try field below.
        }

        try {
            Field field = clazz.getField(name);
            return field.get(null);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Object getMember(Object target, String name) {
        try {
            Method getter = target.getClass().getMethod("get" + name);
            return getter.invoke(target);
        } catch (Exception ignored) {
            // Try field below.
        }

        try {
            Field field = target.getClass().getField(name);
            return field.get(target);
        } catch (Exception ignored) {
            return null;
        }
    }

    private void requestAndroidNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) {
            return;
        }

        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        activity.runOnUiThread(() ->
            activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 5120)
        );
    }
}
