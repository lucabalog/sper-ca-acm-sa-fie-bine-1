package com.notifye.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restarts Notifye's background listener after a reboot or app update, if the phone is paired. */
public class NotifyeBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        String topic = context.getSharedPreferences(NotifyeListenerService.PREFS, Context.MODE_PRIVATE)
            .getString(NotifyeListenerService.KEY_TOPIC, "");
        if (topic == null || topic.isEmpty()) return;
        try {
            NotifyeListenerService.start(context);
        } catch (Exception ignored) {
            // Starting may be refused on some devices; it restarts next time Notifye opens.
        }
    }
}
