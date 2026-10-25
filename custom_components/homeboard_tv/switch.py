"""Per-screen automatic casting switch, restored across restarts."""
from math import ceil
from time import monotonic
from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.restore_state import RestoreEntity
from .const import DOMAIN

async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([AutoCastSwitch(hass.data[DOMAIN][entry.entry_id])])

class AutoCastSwitch(SwitchEntity, RestoreEntity):
    _attr_icon = "mdi:cast-connected"
    _attr_should_poll = False
    def __init__(self, controller):
        self.controller = controller
        self._attr_unique_id = f"{controller.entry.entry_id}_autocast"
        self._attr_name = f"{controller.config['name']} auto dashboard"
    @property
    def is_on(self):
        return self.controller.enabled
    @property
    def extra_state_attributes(self):
        states = self.controller.snapshots()
        activity = states.get(self.controller.config.get("activity_entity"))
        playback = states.get(self.controller.config.get("playback_entity"))
        now = monotonic()
        return {"entry_id": self.controller.entry.entry_id, "status": self.controller.reason,
                "last_error": self.controller.last_error, "dispatching": self.controller.busy,
                "awaiting_dashboard": self.controller.awaiting_dashboard,
                "connection_retries": self.controller.connection_retries,
                "foreground_app": activity.attributes.get(self.controller.config.get("activity_attribute", "current_activity")) if activity else None,
                "playback_state": playback.state if playback else None,
                "exit_remaining_seconds": max(0, ceil(self.controller.home_until - now)),
                "grace_remaining_seconds": max(0, ceil(self.controller.suspended_until - now)),
                "cooldown_remaining_seconds": max(0, ceil(self.controller.last_attempt + self.controller.config.get("cooldown_seconds", 300) - now)) if self.controller.last_attempt != float("-inf") else 0,
                "browser_launch_method": self.controller.config.get("browser_launch_method", "androidtv_remote"),
                **{key: self.controller.config.get(key) for key in ("mode", "playback_entity", "power_entity", "activity_entity", "browser_app", "webos_entity")}}
    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        if last := await self.async_get_last_state():
            self.controller.enabled = last.state == "on"
        self.controller.listeners.add(self.async_write_ha_state)
        self.async_on_remove(lambda: self.controller.listeners.discard(self.async_write_ha_state))
        self.controller.evaluate()
    async def async_turn_on(self, **kwargs):
        self.controller.enabled = True
        self.controller.evaluate()
    async def async_turn_off(self, **kwargs):
        self.controller.enabled = False
        self.controller.evaluate()
