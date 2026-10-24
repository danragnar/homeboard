"""Validation for browser transport, independent of Home Assistant imports."""
from urllib.parse import urlsplit

def browser_errors(data):
    errors = {}
    for field, code in (("remote_entity","missing_remote"),("activity_entity","missing_activity"),("power_entity","missing_power")):
        if not data.get(field):
            errors[field] = code
    try:
        parsed = urlsplit(data.get("browser_url", ""))
        valid = parsed.scheme in {"http","https"} and parsed.hostname and not parsed.username and not parsed.password
    except (ValueError, TypeError):
        valid = False
    if not valid:
        errors["browser_url"] = "invalid_browser_url"
    if not str(data.get("browser_app", "com.phlox.tvwebbrowser")).strip():
        errors["browser_app"] = "missing_browser_app"
    return errors
