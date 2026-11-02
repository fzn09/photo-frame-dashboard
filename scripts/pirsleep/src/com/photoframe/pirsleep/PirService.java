package com.photoframe.pirsleep;

import android.app.Notification;
import android.app.Service;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import java.io.FileInputStream;

/** Polls the PIR; locks the screen after IDLE_MS without motion and wakes it on motion. */
public final class PirService extends Service {
    static final long IDLE_MS = 30000;   // calibration knob: no-motion time before the screen goes dark
    private static final long POLL_MS = 500;
    private static final String PIR = "/sys/pir_s18/data";
    private static final String TAG = "pirsleep";

    private final Handler handler = new Handler();
    private PowerManager power;
    private PowerManager.WakeLock cpu;
    private long lastMotion;
    private boolean wasOn = true, wasMotion;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            long now = SystemClock.elapsedRealtime();
            boolean on = power.isScreenOn();
            if (on && !wasOn) lastMotion = now;   // screen woken by touch/power: restart the idle timer
            wasOn = on;
            boolean m = motion();
            if (m != wasMotion) { Log.i(TAG, "pir=" + (m ? 1 : 0) + " screen=" + on); wasMotion = m; }
            if (m) {
                lastMotion = now;
                if (!on) {
                    Log.i(TAG, "motion: wake");
                    power.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                            | PowerManager.ACQUIRE_CAUSES_WAKEUP, TAG + ":wake").acquire(2000);
                }
            } else if (on && now - lastMotion >= IDLE_MS) {
                Log.i(TAG, "idle: lock");
                DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
                try { dpm.lockNow(); } catch (SecurityException e) { Log.w(TAG, "device admin not granted"); }
                lastMotion = now;   // retry after another IDLE_MS if the lock did not take
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    private static boolean motion() {
        try (FileInputStream in = new FileInputStream(PIR)) {
            return in.read() == '1';
        } catch (Exception e) {
            return false;
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (power != null) return START_STICKY;
        power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        cpu = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, TAG + ":cpu");   // keep polling while screen is off
        cpu.acquire();
        startForeground(1, new Notification.Builder(this).setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("PIR Sleep").setContentText("Screen sleeps without motion").build());
        lastMotion = SystemClock.elapsedRealtime();
        handler.post(tick);
        return START_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        if (cpu != null && cpu.isHeld()) cpu.release();
        stopForeground(true);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
