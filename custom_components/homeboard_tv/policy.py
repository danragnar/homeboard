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
    if not playback or playback.state in OFFLINE:
        return "TV offline"
    power = config.get("power_entity")
    if power and (power not in states or states[power].state in OFFLINE):
        return "screen off"
    if playback.state in {"playing", "paused", "buffering"}:
        return "media in use"
    if playback.attributes.get("app_name") == config.get("dashboard_app", "Home Assistant Lovelace"):
        return "dashboard visible"
    # 'on' is allowed only with an explicit independent idle guard (LG reports 'on').
    guard = config.get("idle_guard")
    if playback.state != "idle" and not (playback.state == "on" and guard):
        return "playback not idle"
    if guard and (guard not in states or states[guard].state != "on"):
        return "idle guard closed"
    activity_id = config.get("activity_entity")
    if activity_id:
        activity = states.get(activity_id)
        if not activity or activity.state in OFFLINE:
            return "activity unavailable"
        current = activity.attributes.get(config.get("activity_attribute", "current_activity"))
        allowed = {app.strip() for app in config.get("idle_apps", "").split(",") if app.strip()}
        if not current or current not in allowed:
            return "another app is open"
    if not activity_id and not guard:
        return "idle detection not configured"
    return "ready"
