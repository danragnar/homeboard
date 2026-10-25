"""Validate shortcut destinations and build HA calls without HA imports."""
import json
import re
from urllib.parse import urlsplit

METHODS = {"androidtv_remote", "webostv"}


def config_errors(data):
    method = data.get("app_launch_method", "androidtv_remote")
    if method not in METHODS:
        return {"app_launch_method": "invalid_app_launch_method"}
    if method == "webostv" and not data.get("webos_entity"):
        return {"webos_entity": "missing_webos_entity"}
    if method == "webostv" and data.get("home_app") and not _text(data["home_app"]):
        return {"home_app": "invalid_home_app"}
    return {}


def _text(value):
    return isinstance(value, str) and bool(value.strip()) and value == value.strip()


def launch_call(config, activity=None, target=None):
    """Return (domain, service, data); reject unsupported destinations explicitly."""
    method = config.get("app_launch_method", "androidtv_remote")
    if method not in METHODS:
        raise ValueError("Choose a supported app launch method in screen settings")
    if (activity is None) == (target is None):
        raise ValueError("Provide exactly one of activity or target")
    if activity is not None:
        # Legacy callers remain Android activities; HTTP links also work on LG.
        if not _text(activity):
            raise ValueError("Activity must be a nonempty string")
        if method == "webostv":
            if not activity.startswith(("http://", "https://")):
                raise ValueError("Configure a webOS app target instead of an Android activity")
            target = {"type": "url", "url": activity}
        else:
            target = {"type": "activity", "activity": activity}
    if not isinstance(target, dict):
        raise ValueError("Shortcut target must be an object")
    kind = target.get("type")
    fields = {
        "activity": {"type", "activity"},
        "app": {"type", "app_id", "content_id", "params"},
        "url": {"type", "url"},
        "script": {"type", "entity_id", "variables"},
    }
    if not isinstance(kind, str) or kind not in fields or set(target) - fields[kind]:
        raise ValueError("Unknown shortcut type or fields")
    if kind == "script":
        entity = target.get("entity_id")
        if not isinstance(entity, str) or not re.fullmatch(r"script\.[a-z0-9_]+", entity):
            raise ValueError("Script target needs a script entity ID")
        variables = target.get("variables", {})
        if not isinstance(variables, dict):
            raise ValueError("Script variables must be an object")
        _json_object(variables)
        return "script", "turn_on", {"entity_id": entity, "variables": variables}
    if kind == "activity":
        if method != "androidtv_remote":
            raise ValueError("Android activity targets require Android TV Remote")
        if not _text(target.get("activity")):
            raise ValueError("Activity must be a nonempty string")
        remote = config.get("remote_entity")
        if not remote:
            raise ValueError("Configure an Android TV remote entity for this TV first")
        return "remote", "turn_on", {"entity_id": remote, "activity": target["activity"]}
    if kind == "url":
        url = target.get("url")
        try:
            parsed = urlsplit(url) if _text(url) and not re.search(r"[\\\s]", url) else None
            valid = parsed and parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("Browser target needs a full HTTP(S) URL without credentials")
        if method == "androidtv_remote":
            return launch_call(config, target={"type": "activity", "activity": url})
        command, payload = "system.launcher/open", {"target": url}
    else:
        if method != "webostv":
            raise ValueError("webOS app targets require LG webOS app launching")
        if not _text(target.get("app_id")):
            raise ValueError("webOS app target needs an app_id")
        payload = {"id": target["app_id"]}
        if "content_id" in target:
            if not _text(target["content_id"]):
                raise ValueError("Content ID must be a nonempty string")
            payload["contentId"] = target["content_id"]
        if "params" in target:
            if not isinstance(target["params"], dict):
                raise ValueError("App launch params must be an object")
            _json_object(target["params"])
            payload["params"] = target["params"]
        command = "system.launcher/launch"
    entity = config.get("webos_entity")
    if not entity:
        raise ValueError("Configure an LG webOS TV entity for this screen first")
    return "webostv", "command", {"entity_id": entity, "command": command, "payload": payload}


def _json_object(value):
    try:
        json.dumps(value, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise ValueError("Launch parameters must contain JSON values") from exc
