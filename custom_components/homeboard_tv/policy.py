"""Pure idle policy; no Home Assistant imports, easy to regression-test."""
from dataclasses import dataclass, field
from typing import Mapping, Any

OFFLINE = {"off", "unavailable", "unknown", "standby"}

@dataclass(frozen=True)
class Snapshot:
    state: str
    attributes: Mapping[str, Any] = field(default_factory=dict)

def idle_reason(config: dict, states: Mapping[str, Snapshot], enabled=True, suspended=False) -> str:
    """Return 'ready' only when every configured signal permits casting."""
    if not enabled:
        return "disabled"
    if suspended:
        return "app grace period"
    playback = states.get(config.get("playback_entity"))
    if not playback:
        return "TV offline"
    power = config.get("power_entity")
    if power and (power not in states or states[power].state in OFFLINE):
        return "screen off"
    activity_id = config.get("activity_entity")
    activity = states.get(activity_id) if activity_id else None
    current = activity.attributes.get(config.get("activity_attribute", "current_activity")) if activity else None
    allowed = {app.strip() for app in config.get("idle_apps", "").split(",") if app.strip()}
    known_idle_activity = bool(activity and activity.state not in OFFLINE and current and current in allowed)
    # 'off' on a Cast media player means no receiver app, not necessarily an
    # off TV. Require both the real screen's power and its idle foreground app.
    receiver_idle = bool(config.get("mode", "cast") == "cast" and playback.state == "off"
                         and power and power in states and states[power].state not in OFFLINE
                         and known_idle_activity)
    if playback.state in OFFLINE and not receiver_idle:
        return "TV offline"
    own_dashboard = playback.attributes.get("app_name") == config.get("dashboard_app", "Home Assistant Lovelace")
    # Google TV can retain a 'playing' HA Cast session after returning home.
    # Only our own dashboard may bypass stale playback, with independent proof
    # that an explicitly allowed launcher/screensaver is in the foreground.
    stale_dashboard = config.get("mode", "cast") == "cast" and own_dashboard and known_idle_activity and bool(power)
    if own_dashboard and not stale_dashboard:
        return "dashboard reported" if playback.attributes.get("media_title") else "receiver active; dashboard unconfirmed"
    if playback.state in {"playing", "paused", "buffering"} and not stale_dashboard:
        return "media in use"
    # 'on' is allowed only with an explicit independent idle guard (LG reports 'on').
    guard = config.get("idle_guard")
    if playback.state != "idle" and not receiver_idle and not stale_dashboard and not (playback.state == "on" and guard):
        return "playback not idle"
    if guard and (guard not in states or states[guard].state != "on"):
        return "idle guard closed"
    if activity_id:
        if not activity or activity.state in OFFLINE:
            return "activity unavailable"
        if not current or current not in allowed:
            return "another app is open"
    if not activity_id and not guard:
        return "idle detection not configured"
    return "ready"

def connection_retry_reason(config, states, enabled=True, suspended=False):
    """Retry only an untitled HA receiver in a verified Cast foreground app."""
    playback = states.get(config.get("playback_entity"))
    if not playback or playback.attributes.get("app_name") != config.get("dashboard_app", "Home Assistant Lovelace"):
        return "receiver changed"
    if playback.state in OFFLINE:
        return "TV offline"
    if playback.attributes.get("media_title"):
        return "dashboard reported"
    if not config.get("power_entity") or not config.get("activity_entity"):
        return "independent signals required"
    retry_config = {**config, "idle_apps": config.get("cast_receiver_apps", "com.google.android.apps.mediashell")}
    retry_states = {**states, config["playback_entity"]: Snapshot("idle")}
    return idle_reason(retry_config, retry_states, enabled, suspended)
