"""Shared configuration for Homeboard TV."""
DOMAIN = "homeboard_tv"
VERSION = "0.7.0"
LEGACY_IDLE_APPS = "com.google.android.apps.tv.launcher,com.google.android.tvlauncher"
DEFAULTS = {
    "name": "Living room",
    "mode": "cast",
    "browser_url": "",
    "browser_app": "com.phlox.tvwebbrowser",
    "dashboard_path": "homeboard-home",
    "view_path": "overview",
    "idle_seconds": 45,
    "cooldown_seconds": 300,
    "app_grace_seconds": 600,
    "idle_apps": "com.google.android.apps.tv.launcher,com.google.android.tvlauncher,com.google.android.apps.tv.launcherx,com.google.android.apps.tv.dreamx",
    "dashboard_app": "Home Assistant Lovelace",
    "cast_retry_seconds": 45,
    "cast_retry_limit": 1,
    "cast_receiver_apps": "com.google.android.apps.mediashell",
}

def migrate_idle_apps(values):
    """Expand the previous defaults without changing a customized allowlist."""
    updated = dict(values)
    if updated.get("idle_apps") == LEGACY_IDLE_APPS:
        updated["idle_apps"] = DEFAULTS["idle_apps"]
    return updated
