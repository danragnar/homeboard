"""UI configuration: add one entry per screen; edit using integration options."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector
from .const import DEFAULTS, DOMAIN
from .browser import browser_errors

def schema(values):
    def field(key, default=None, required=False):
        value = values.get(key, DEFAULTS.get(key, default))
        marker = vol.Required if required else vol.Optional
        return marker(key, **({"default": value} if value is not None else {}))
    entity = lambda domains: selector.EntitySelector(selector.EntitySelectorConfig(domain=domains))
    return vol.Schema({
        field("name", required=True): str,
        field("mode", required=True): selector.SelectSelector(selector.SelectSelectorConfig(options=[{"value":"cast","label":"Google Cast"},{"value":"browser","label":"TV browser"},{"value":"script","label":"Custom script"}])),
        field("playback_entity", required=True): entity("media_player"),
        field("power_entity"): entity("media_player"),
        field("activity_entity"): entity(["remote", "media_player"]),
        field("activity_attribute", "current_activity"): str,
        field("idle_apps"): str,
        field("idle_guard"): entity(["binary_sensor", "input_boolean"]),
        field("remote_entity"): entity("remote"),
        field("dashboard_path"): str,
        field("view_path"): str,
        field("dashboard_app"): str,
        field("dashboard_script"): entity("script"),
        field("browser_url"): str,
        field("browser_launch_method"): selector.SelectSelector(selector.SelectSelectorConfig(options=[{"value":"androidtv_remote","label":"Android TV Remote"},{"value":"webostv","label":"LG webOS command"}])),
        field("webos_entity"): entity("media_player"),
        field("browser_app"): str,
        field("idle_seconds"): vol.All(vol.Coerce(int), vol.Range(min=5, max=3600)),
        field("cooldown_seconds"): vol.All(vol.Coerce(int), vol.Range(min=30, max=86400)),
        field("app_grace_seconds"): vol.All(vol.Coerce(int), vol.Range(min=30, max=86400)),
        field("cast_retry_seconds"): vol.All(vol.Coerce(int), vol.Range(min=35, max=600)),
        field("cast_retry_limit"): vol.All(vol.Coerce(int), vol.Range(min=0, max=3)),
        field("cast_receiver_apps"): str,
    })

def errors(data):
    if data["mode"] == "browser":
        return browser_errors(data)
    if not data.get("activity_entity") and not data.get("idle_guard"):
        return {"base": "missing_guard"}
    if data["mode"] == "script" and not data.get("dashboard_script"):
        return {"dashboard_script": "missing_script"}
    if data["mode"] == "cast" and (not data.get("dashboard_path") or not data.get("view_path")):
        return {"base": "missing_path"}
    return {}

class HomeboardFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1
    async def async_step_user(self, user_input=None):
        error = errors(user_input) if user_input is not None else {}
        if user_input is not None and not error:
            return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(step_id="user", data_schema=schema(user_input or {}), errors=error)
    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return HomeboardOptions()

class HomeboardOptions(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        error = errors(user_input) if user_input is not None else {}
        if user_input is not None and not error:
            return self.async_create_entry(title="", data=user_input)
        values = dict(self.config_entry.options or self.config_entry.data)
        return self.async_show_form(step_id="init", data_schema=schema(user_input if user_input is not None else values), errors=error)
