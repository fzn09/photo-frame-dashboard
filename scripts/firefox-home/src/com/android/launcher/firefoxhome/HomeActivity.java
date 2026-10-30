package com.android.launcher.firefoxhome;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;

/**
 * Home app that opens the dashboard as a Firefox web app. It shows three buttons
 * (Dashboard, Launcher, Settings) so Settings stays reachable by hand, and reopens the
 * dashboard on its own at boot and after IDLE_MS on this screen.
 * Set the URL once: adb shell am start -n com.android.launcher.firefoxhome/.HomeActivity --es url <url>
 */
public class HomeActivity extends Activity {
  static final long IDLE_MS = 60_000;
  static boolean opened; // false once per process start, i.e. after boot
  final Handler handler = new Handler();
  final Runnable idle = this::openDashboard;
  SharedPreferences prefs;

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    prefs = getSharedPreferences("home", MODE_PRIVATE);
    LinearLayout col = new LinearLayout(this);
    col.setOrientation(LinearLayout.VERTICAL);
    col.setGravity(Gravity.CENTER);
    add(col, "Dashboard", v -> openDashboard());
    add(col, "Launcher", v -> start(getPackageManager().getLaunchIntentForPackage("amirz.rootless.nexuslauncher")));
    add(col, "Android settings", v -> start(new Intent(android.provider.Settings.ACTION_SETTINGS)));
    setContentView(col);
    saveUrl(getIntent());
  }

  @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); saveUrl(i); }

  @Override protected void onResume() {
    super.onResume();
    if (!opened) { opened = true; openWhenOnline(System.currentTimeMillis()); }
    else handler.postDelayed(idle, IDLE_MS);
  }

  // At boot Wi-Fi comes up after Home starts, and Firefox shows a dead offline page if it loads first.
  void openWhenOnline(long since) {
    android.net.NetworkInfo n = ((android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).getActiveNetworkInfo();
    if ((n != null && n.isConnected()) || System.currentTimeMillis() - since > 120_000) openDashboard();
    else handler.postDelayed(() -> openWhenOnline(since), 3_000);
  }

  @Override protected void onPause() { super.onPause(); handler.removeCallbacks(idle); }

  @Override public void onBackPressed() {} // Home has nowhere to go back to

  void saveUrl(Intent i) {
    String url = i.getStringExtra("url");
    if (url != null) prefs.edit().putString("url", url).apply();
  }

  void openDashboard() {
    String url = prefs.getString("url", null);
    if (url == null) { Toast.makeText(this, "No URL set (see HomeActivity.java)", Toast.LENGTH_LONG).show(); return; }
    // An exported entry in Firefox forwards this to its web-app activity (no toolbar).
    start(new Intent("mozilla.components.feature.pwa.VIEW_PWA", Uri.parse(url)).setPackage("org.mozilla.firefox"));
  }

  void start(Intent i) {
    if (i == null) return;
    try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
    catch (RuntimeException e) { Toast.makeText(this, e.toString(), Toast.LENGTH_LONG).show(); }
  }

  void add(LinearLayout col, String label, android.view.View.OnClickListener l) {
    Button b = new Button(this);
    b.setText(label);
    b.setTextSize(28);
    b.setOnClickListener(l);
    col.addView(b, new LinearLayout.LayoutParams(600, LinearLayout.LayoutParams.WRAP_CONTENT));
  }
}
