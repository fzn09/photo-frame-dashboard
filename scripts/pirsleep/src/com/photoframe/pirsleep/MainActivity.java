package com.photoframe.pirsleep;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        TextView text = new TextView(this);
        text.setText("Screen goes dark after " + PirService.IDLE_MS / 1000
                + " s without motion at the PIR sensor and wakes on motion.\n"
                + "Step 1: allow device admin (needed to turn the screen off). Step 2: start.");
        text.setTextSize(22);
        layout.addView(text);
        Button admin = new Button(this);
        admin.setText("1. Allow screen lock");
        admin.setOnClickListener(v -> startActivity(
                new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, new ComponentName(this, Admin.class))));
        layout.addView(admin);
        Button on = new Button(this);
        on.setText("2. Start");
        on.setOnClickListener(v -> {
            getSharedPreferences("pir", 0).edit().putBoolean("enabled", true).apply();
            startService(new Intent(this, PirService.class));
        });
        layout.addView(on);
        Button off = new Button(this);
        off.setText("Stop");
        off.setOnClickListener(v -> {
            getSharedPreferences("pir", 0).edit().putBoolean("enabled", false).apply();
            stopService(new Intent(this, PirService.class));
        });
        layout.addView(off);
        setContentView(layout);
    }
}
