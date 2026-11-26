package com.notifye.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Notifye's own background listener (Android). Keeps a streaming HTTP connection to this
 * phone's private relay channel (https://ntfy.sh/<topic>/json) and shows every partner tap as a
 * Notifye notification, even while the app is closed. Nothing else needs to be installed.
 *
 * Android requires a visible "foreground service" notification for this; it uses a silent,
 * minimised channel. Restarted after reboot by NotifyeBootReceiver.
 */
public class NotifyeListenerService extends Service {

    static final String PREFS = "notifye_listener";
    static final String KEY_TOPIC = "topic";
    static final String KEY_PARTNER = "partner";
    private static final String KEY_LAST_ID = "last_id";

    private static final String CHANNEL_PINGS = "notifye_pings";
    private static final String CHANNEL_SERVICE = "notifye_listener";
    private static final int SERVICE_NOTIFICATION_ID = 7101;

    /** Set by MainActivity: while Notifye is on screen the in-app banner shows instead. */
    static volatile boolean appVisible = false;

    private volatile boolean running = false;
    private Thread worker;
    private volatile HttpURLConnection current;
    private int nextNotificationId = (int) (System.currentTimeMillis() % 100000);

    static void start(Context context) {
        Intent intent = new Intent(context, NotifyeListenerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, NotifyeListenerService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification ongoing = new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Notifye")
            .setContentText("Ready for " + partnerName() + "'s taps")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(openAppIntent())
            .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(SERVICE_NOTIFICATION_ID, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, ongoing);
        }

        if (topic().isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (worker == null || !worker.isAlive()) {
            running = true;
            worker = new Thread(this::listenLoop, "notifye-listener");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        HttpURLConnection c = current;
        if (c != null) c.disconnect();
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String topic() {
        String t = prefs().getString(KEY_TOPIC, "");
        return t != null && t.matches("^notifye-[a-z0-9]{24}$") ? t : "";
    }

    private String partnerName() {
        String p = prefs().getString(KEY_PARTNER, "");
        return p == null || p.isEmpty() ? "your partner" : p;
    }

    private void listenLoop() {
        long backoffMs = 2000;
        while (running) {
            String topic = topic();
            if (topic.isEmpty()) break;
            try {
                String lastId = prefs().getString(KEY_LAST_ID, "");
                // since=<last id> replays anything sent while we were reconnecting.
                String url = "https://ntfy.sh/" + topic + "/json" +
                    (lastId == null || lastId.isEmpty() ? "" : "?since=" + lastId);
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                current = conn;
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(90000); // server sends a keepalive every ~45 s
                conn.setRequestProperty("User-Agent", "Notifye-Android");
                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    backoffMs = 2000;
                    String line;
                    while (running && (line = reader.readLine()) != null) {
                        handleLine(line);
                    }
                } finally {
                    conn.disconnect();
                }
            } catch (Exception e) {
                // network change, timeout, airplane mode: reconnect below
            }
            if (!running) break;
            try {
                Thread.sleep(backoffMs);
            } catch (InterruptedException ie) {
                break;
            }
            backoffMs = Math.min(backoffMs * 2, 60000);
        }
    }

    private void handleLine(String line) {
        try {
            JSONObject msg = new JSONObject(line);
            if (!"message".equals(msg.optString("event"))) return;
            prefs().edit().putString(KEY_LAST_ID, msg.optString("id")).apply();
            // Skip replayed messages older than 10 minutes (e.g. after a long time offline).
            long ageSec = System.currentTimeMillis() / 1000 - msg.optLong("time", 0);
            if (ageSec > 600) return;
            if (appVisible) return;
            String title = msg.optString("title", "Notifye");
            String body = msg.optString("message", "Your partner wants your attention");
            boolean urgent = msg.optInt("priority", 3) >= 5;
            showPing(urgent ? "⚠ " + title : title, body);
        } catch (Exception ignored) {
            // keepalive / malformed line
        }
    }

    private void showPing(String title, String body) {
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return;
        Notification n = new NotificationCompat.Builder(this, CHANNEL_PINGS)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .build();
        try {
            NotificationManagerCompat.from(this).notify(nextNotificationId++, n);
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS revoked
        }
    }

    private PendingIntent openAppIntent() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel pings = new NotificationChannel(CHANNEL_PINGS, "Partner taps", NotificationManager.IMPORTANCE_HIGH);
        pings.setDescription("Notifications when your partner taps the button");
        pings.enableVibration(true);
        nm.createNotificationChannel(pings);
        NotificationChannel service = new NotificationChannel(CHANNEL_SERVICE, "Background connection", NotificationManager.IMPORTANCE_MIN);
        service.setDescription("Keeps Notifye ready to receive taps while it's closed. You can hide this.");
        service.setShowBadge(false);
        nm.createNotificationChannel(service);
    }
}
