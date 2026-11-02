package com.photoframe.pirsleep;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (context.getSharedPreferences("pir", 0).getBoolean("enabled", true))
            context.startService(new Intent(context, PirService.class));
    }
}
