"""Homeboard TV — native Home Assistant casting orchestration."""
import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from .const import DOMAIN, migrate_idle_apps
from .controller import Controller
from .frontend import async_setup_frontend

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

async def async_setup(hass: HomeAssistant, config):
    hass.data.setdefault(DOMAIN, {})
    await async_setup_frontend(hass)
    async def handle(call: ServiceCall):
        controller = hass.data[DOMAIN].get(call.data["entry_id"])
        if controller is None:
            raise ServiceValidationError("Homeboard TV entry not loaded; check entry_id")
        if call.service == "launch_app":
            await controller.launch(call.data.get("activity"), call.context, target=call.data.get("target"))
        elif call.service == "return_home":
            await controller.return_home(call.context)
        else:
            # Explicit requests clear grace, but still respect playback/idle safety.
            controller.suspended_until = 0
            controller.home_until = 0
            if controller.busy:
                raise ServiceValidationError("A dashboard dispatch is already in progress")
            if controller.reason != "ready":
                raise ServiceValidationError(f"Cannot show dashboard: {controller.reason}")
            await controller.cast(call.context, raise_errors=True)
    base = {vol.Required("entry_id"): cv.string}
    hass.services.async_register(DOMAIN, "show_dashboard", handle, schema=vol.Schema(base))
    hass.services.async_register(DOMAIN, "return_home", handle, schema=vol.Schema(base))
    hass.services.async_register(DOMAIN, "launch_app", handle, schema=vol.Any(
        vol.Schema({**base, vol.Required("activity"): vol.All(cv.string, vol.Length(min=1))}),
        vol.Schema({**base, vol.Required("target"): dict}),
    ))
    return True

async def async_setup_entry(hass, entry):
    # Do this before attaching the reload listener so upgrades load just once.
    values = entry.options or entry.data
    migrated = migrate_idle_apps(values)
    if migrated != values:
        field = "options" if entry.options else "data"
        hass.config_entries.async_update_entry(entry, **{field: migrated})
    controller = Controller(hass, entry)
    hass.data[DOMAIN][entry.entry_id] = controller
    await hass.config_entries.async_forward_entry_setups(entry, ["switch"])
    entry.async_on_unload(entry.add_update_listener(reload_entry))
    controller.start()
    return True

async def reload_entry(hass, entry):
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass, entry):
    controller = hass.data[DOMAIN][entry.entry_id]
    await controller.stop()
    unloaded = await hass.config_entries.async_unload_platforms(entry, ["switch"])
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded
