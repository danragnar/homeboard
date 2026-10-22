"""Shared configuration for Homeboard TV."""
DOMAIN = "homeboard_tv"
VERSION = "0.2.0"
DEFAULTS = {
    "name": "Living room",
    "mode": "cast",
    "dashboard_path": "homeboard-home",
    "view_path": "overview",
    "idle_seconds": 45,
    "cooldown_seconds": 300,
    "app_grace_seconds": 600,
    "idle_apps": "com.google.android.apps.tv.launcher,com.google.android.tvlauncher",
    "dashboard_app": "Home Assistant Lovelace",
}
