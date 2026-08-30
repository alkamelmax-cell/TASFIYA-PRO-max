// Compatibility shim for previously installed clients.
// New registrations use /push/onesignal/OneSignalSDKWorker.js so this root
// worker never conflicts with the PWA service worker.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
