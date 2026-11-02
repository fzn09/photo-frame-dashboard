package com.photoframe.pirsleep;

import android.app.admin.DeviceAdminReceiver;

/** Only needed so DevicePolicyManager.lockNow() is allowed; it holds the force-lock policy only. */
public final class Admin extends DeviceAdminReceiver {}
