"""Validate shortcut destinations and build HA calls without HA imports."""
import json
import re
from urllib.parse import urlsplit

METHODS = {"androidtv_remote", "webostv"}
APPS = {
    "netflix": ("Netflix", "netflix://"),
    "youtube": ("YouTube", "vnd.youtube://"),
    "svt_play": ("SVT Play", "https://www.svtplay.se"),
    "tv4_play": ("TV4 Play", "https://www.tv4play.se"),
}


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


def launch_call(config, activity=None, target=None, *, app=None, launch_id=None):
    """Return (domain, service, data); reject unsupported destinations explicitly."""
    method = config.get("app_launch_method", "androidtv_remote")
    if method not in METHODS:
        raise ValueError("Choose a supported app launch method in screen settings")
    generic = app is not None or launch_id is not None
    if sum((activity is not None, target is not None, generic)) != 1:
        raise ValueError("Provide app/launch_id, or one legacy activity or target")
    if generic:
        return _app_call(config, app, launch_id)
    if activity is not None:
        # Legacy callers remain Android activities; HTTP links also work on LG.
        if not _text(activity):
            raise ValueError("Activity must be a nonempty string")
        if method == "webostv":
            if not activity.startswith(("http://", "https://")):
                raise ValueError("This screen already uses LG webOS. Replace activity with target: {type: source, source: '<TV source name>'}, or use an app target with app_id for media deep links.")
            target = {"type": "url", "url": activity}
        else:
            target = {"type": "activity", "activity": activity}
    if not isinstance(target, dict):
        raise ValueError("Shortcut target must be an object")
    kind = target.get("type")
    fields = {
        "activity": {"type", "activity"},
        "app": {"type", "app_id", "content_id", "params"},
        "source": {"type", "source"},
        "url": {"type", "url"},
        "script": {"type", "entity_id", "variables"},
    }
    if not isinstance(kind, str) or kind not in fields or set(target) - fields[kind]:
        raise ValueError("Unknown shortcut type or fields")
    if kind == "source":
        if method != "webostv":
            raise ValueError("Source targets require LG webOS app launching")
        if not _text(target.get("source")):
            raise ValueError("Source target needs a TV source name from source_list")
        entity = config.get("webos_entity")
        if not entity:
            raise ValueError("Configure an LG webOS TV entity for this screen first")
        return "media_player", "select_source", {"entity_id": entity, "source": target["source"]}
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


def _app_call(config, app, launch_id):
    """One shortcut interface; the screen configuration owns platform routing."""
    if app is not None and not _text(app):
        raise ValueError("App must be a nonempty app name")
    key = re.sub(r"[^a-z0-9]", "", app.lower()) if app else None
    preset = next((value for name, value in APPS.items() if name.replace("_", "") == key), None)
    if launch_id is not None:
        if not _text(launch_id):
            raise ValueError("launch_id must be a nonempty URL or app ID")
        if config.get("app_launch_method", "androidtv_remote") == "androidtv_remote":
            return launch_call(config, target={"type": "activity", "activity": launch_id})
        if launch_id.lower().startswith(("http:", "https:")):
            return launch_call(config, target={"type": "url", "url": launch_id})
        if not re.fullmatch(r"[A-Za-z0-9._-]+", launch_id):
            raise ValueError("This webOS TV needs a webOS app ID or HTTP(S) URL in launch_id; Android URI schemes cannot be used on webOS")
        return launch_call(config, target={"type": "app", "app_id": launch_id})
    if not preset:
        raise ValueError("Unknown app. Choose netflix, youtube, svt_play or tv4_play, or supply launch_id for a custom shortcut")
    name, android = preset
    if config.get("app_launch_method", "androidtv_remote") == "webostv":
        return launch_call(config, target={"type": "source", "source": name})
    return launch_call(config, target={"type": "activity", "activity": android})


def match_app_source(name, sources):
    """Match built-in apps to the installed TV names without requiring UI IDs."""
    if name in sources:
        return name
    normalize = lambda value: re.sub(r"[^a-z0-9]", "", value.lower())
    matches = [value for value in sources if isinstance(value, str) and normalize(value) == normalize(name)]
    return matches[0] if len(matches) == 1 else None


def _json_object(value):
    try:
        json.dumps(value, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise ValueError("Launch parameters must contain JSON values") from exc
