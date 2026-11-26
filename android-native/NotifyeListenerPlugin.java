package com.notifye.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge for NotifyeListenerService (src/utils/backgroundListener.ts). */
@CapacitorPlugin(name = "NotifyeListener")
public class NotifyeListenerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String topic = call.getString("topic", "");
        if (topic == null || !topic.matches("^notifye-[a-z0-9]{24}$")) {
            call.reject("Invalid topic");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(NotifyeListenerService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(NotifyeListenerService.KEY_TOPIC, topic)
            .putString(NotifyeListenerService.KEY_PARTNER, call.getString("partnerName", ""))
            .apply();
        try {
            NotifyeListenerService.start(ctx);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start background listener", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(NotifyeListenerService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(NotifyeListenerService.KEY_TOPIC)
            .apply();
        NotifyeListenerService.stop(ctx);
        call.resolve();
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings", e);
        }
    }
}
