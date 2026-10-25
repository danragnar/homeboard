"""Validation for browser transport, independent of Home Assistant imports."""
from urllib.parse import urlsplit

def browser_errors(data):
    errors = {}
    method = data.get("browser_launch_method", "androidtv_remote")
    if method not in {"androidtv_remote", "webostv"}:
        errors["browser_launch_method"] = "invalid_browser_launch_method"
    required = [("power_entity", "missing_power")]
    if method == "webostv":
        required.append(("webos_entity", "missing_webos_entity"))
        if not data.get("activity_entity") and not data.get("idle_guard"):
            errors["base"] = "missing_guard"
    else:
        required.extend((("remote_entity", "missing_remote"), ("activity_entity", "missing_activity")))
    for field, code in required:
        if not data.get(field):
            errors[field] = code
    try:
        parsed = urlsplit(data.get("browser_url", ""))
        valid = parsed.scheme in {"http","https"} and parsed.hostname and not parsed.username and not parsed.password
    except (ValueError, TypeError):
        valid = False
    if not valid:
        errors["browser_url"] = "invalid_browser_url"
    if (method != "webostv" or data.get("activity_entity")) and not str(data.get("browser_app", "com.phlox.tvwebbrowser") or "").strip():
        errors["browser_app"] = "missing_browser_app"
    return errors
