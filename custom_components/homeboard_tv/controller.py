"""Event-driven dashboard dispatch with stable-idle debounce and bounded Cast retry."""
import asyncio
import logging
from time import monotonic
from homeassistant.core import callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from .policy import OFFLINE, Snapshot, idle_reason, connection_retry_reason
from .launch import launch_call

_LOGGER = logging.getLogger(__name__)

class Controller:
    def __init__(self, hass, entry):
        self.hass, self.entry = hass, entry
        self.config = dict(entry.options or entry.data)
        self.enabled = True
        self.pending = None
        self.unsubscribe = None
        self.task = None
        self.last_attempt = float("-inf")
        self.suspended_until = 0
        self.home_until = 0
        self.listeners = set()
        self.last_error = None
        self.busy = False
        self.closed = False
        self.dispatch_lock = asyncio.Lock()
        self.awaiting_dashboard = False
        self.connection_retries = 0
        self.last_foreground_app = None
        self.returned_to_launcher = False

    def snapshots(self):
        return {key: Snapshot(state.state, state.attributes) for key in self.ids if (state := self.hass.states.get(key))}

    @property
    def reason(self):
        if self.enabled and monotonic() < self.home_until:
            return "dashboard exit pause"
        return idle_reason(self.config, self.snapshots(), self.enabled, monotonic() < self.suspended_until)

    @property
    def retry_reason(self):
        return connection_retry_reason(self.config, self.snapshots(), self.enabled, monotonic() < max(self.suspended_until, self.home_until))

    @property
    def ids(self):
        return {self.config[key] for key in ("playback_entity", "power_entity", "activity_entity", "idle_guard") if self.config.get(key)}

    @callback
    def start(self):
        self.unsubscribe = async_track_state_change_event(self.hass, self.ids, self.changed)
        self.evaluate()

    @callback
    def changed(self, event):
        self.evaluate()

    @callback
    def notify(self):
        for listener in tuple(self.listeners):
            listener()

    @callback
    def cancel_timer(self):
        if self.pending:
            self.pending()
            self.pending = None

    @callback
    def reconcile_browser_return(self):
        """Treat a verified app-to-launcher return as a fresh browser idle cycle."""
        if self.config.get("mode") != "browser":
            return
        states = self.snapshots()
        activity = states.get(self.config.get("activity_entity"))
        power = states.get(self.config.get("power_entity"))
        current = activity.attributes.get(self.config.get("activity_attribute", "current_activity")) if activity and activity.state not in OFFLINE else None
        if not self.enabled or not power or power.state in OFFLINE or not current:
            self.last_foreground_app = None
            self.returned_to_launcher = False
            return
        allowed = {app.strip() for app in self.config.get("idle_apps", "").split(",") if app.strip()}
        previous = self.last_foreground_app
        self.last_foreground_app = current
        if current not in allowed:
            self.returned_to_launcher = False
        elif previous and previous not in allowed:
            self.returned_to_launcher = True
        if self.returned_to_launcher and idle_reason(self.config, states, self.enabled) == "ready":
            # An observed app exit ends launch grace. Keep playback/power/guard
            # checks, and retain cooldown for failed launches on the same home
            # screen. Only an actual foreground transition opens a new cycle.
            self.returned_to_launcher = False
            self.suspended_until = 0
            self.last_attempt = float("-inf")
            self.cancel_timer()

    @callback
    def evaluate(self):
        if self.closed:
            return
        self.reconcile_browser_return()
        reason = self.reason
        self.notify()
        if self.awaiting_dashboard and not self.busy:
            retry_reason = self.retry_reason
            if retry_reason == "dashboard reported":
                self.awaiting_dashboard = False
                self.cancel_timer()
            elif retry_reason == "ready":
                if self.connection_retries < self.config.get("cast_retry_limit", 1):
                    if not self.pending:
                        delay = max(0, self.last_attempt + self.config.get("cast_retry_seconds", 45) - monotonic())
                        self.pending = async_call_later(self.hass, delay, self.wake_retry)
                elif not self.pending:
                    remaining = self.last_attempt + self.config.get("cast_retry_seconds", 45) - monotonic()
                    if remaining > 0:
                        self.pending = async_call_later(self.hass, remaining, self.wake)
                    else:
                        self.last_error = "Cast receiver opened but no dashboard title was reported after connection retries"
                        self.awaiting_dashboard = False
                        self.notify()
                return
            elif retry_reason != "receiver changed":
                self.awaiting_dashboard = False
        if reason != "ready" or self.busy:
            self.cancel_timer()
            # Wake once when app grace ends, even if no entity changes meanwhile.
            remaining = max(self.suspended_until, self.home_until) - monotonic()
            if reason in {"app grace period", "dashboard exit pause"} and remaining > 0:
                self.pending = async_call_later(self.hass, remaining, self.wake)
            return
        if self.pending:
            return  # Attribute-only updates must not reset the stable idle timer.
        delay = max(self.config.get("idle_seconds", 45), self.last_attempt + self.config.get("cooldown_seconds", 300) - monotonic())
        self.pending = async_call_later(self.hass, delay, self.wake_cast)

    @callback
    def wake(self, _):
        self.pending = None
        self.evaluate()

    @callback
    def wake_cast(self, _):
        self.pending = None
        self.task = self.hass.async_create_task(self.cast())

    @callback
    def wake_retry(self, _):
        self.pending = None
        self.task = self.hass.async_create_task(self.retry_connection())

    async def retry_connection(self):
        if self.closed or self.busy or not self.awaiting_dashboard or self.retry_reason != "ready":
            return
        self.busy = True
        self.connection_retries += 1
        self.last_attempt = monotonic()
        try:
            async with self.dispatch_lock:
                # Reconnect the existing receiver; do not quit or power-cycle it.
                if self.retry_reason == "ready":
                    await self.show_view()
        except Exception as exc:
            self.last_error = str(exc)
            _LOGGER.warning("Cast connection retry failed for %s: %s", self.entry.title, exc)
        finally:
            self.busy = False
            # Allow the final request time to report its title before giving up.
            if not self.closed and self.retry_reason == "ready":
                self.pending = async_call_later(self.hass, self.config.get("cast_retry_seconds", 45), self.wake)
            self.evaluate()

    async def show_view(self, context=None):
        await self.hass.services.async_call("cast", "show_lovelace_view", {
            "entity_id": self.config["playback_entity"],
            "dashboard_path": self.config.get("dashboard_path", "homeboard-home"),
            "view_path": self.config.get("view_path", "overview"),
        }, blocking=True, context=context)

    async def reset_stale_dashboard(self, context):
        """Quit only a stale HA receiver, then wait for its actual state change."""
        entity_id = self.config["playback_entity"]
        own_app = self.config.get("dashboard_app", "Home Assistant Lovelace")
        state = self.hass.states.get(entity_id)
        if not state or state.attributes.get("app_name") != own_app:
            return
        cleared = asyncio.Event()

        @callback
        def changed(_):
            current = self.hass.states.get(entity_id)
            if current and current.attributes.get("app_name") != own_app:
                cleared.set()

        unsubscribe = async_track_state_change_event(self.hass, [entity_id], changed)
        try:
            # Native Cast turn_off calls quit_app, not the LG/Android power entity.
            await self.hass.services.async_call("media_player", "turn_off", {
                "entity_id": entity_id,
            }, blocking=True, context=context)
            changed(None)
            try:
                await asyncio.wait_for(cleared.wait(), timeout=10)
            except TimeoutError as exc:
                from homeassistant.exceptions import HomeAssistantError
                raise HomeAssistantError("The stale Home Assistant Cast receiver did not close") from exc
        finally:
            unsubscribe()

    async def cast(self, context=None, raise_errors=False):
        # Always re-check at dispatch: media may have started during the delay.
        if self.closed or self.busy or self.reason != "ready":
            return
        self.cancel_timer()
        self.busy = True
        self.last_attempt = monotonic()
        self.last_error = None
        self.awaiting_dashboard = False
        try:
            async with self.dispatch_lock:
                if self.closed or self.reason != "ready":
                    return  # App/power may have changed while waiting for a launch.
                if self.config["mode"] == "cast":
                    await self.reset_stale_dashboard(context)
                    if self.closed or self.reason != "ready":
                        return  # Power/app may have changed while closing the receiver.
                    self.awaiting_dashboard = True
                    self.connection_retries = 0
                    await self.show_view(context)
                elif self.config["mode"] == "browser":
                    # Do not call launch(): its app grace is for leaving Homeboard.
                    if self.config.get("browser_launch_method", "androidtv_remote") == "webostv":
                        await self.hass.services.async_call("webostv", "command", {
                            "entity_id": self.config["webos_entity"],
                            "command": "system.launcher/open",
                            "payload": {"target": self.config["browser_url"]},
                        }, blocking=True, context=context)
                    else:
                        await self.hass.services.async_call("remote", "turn_on", {
                            "entity_id": self.config["remote_entity"],
                            "activity": self.config["browser_url"],
                        }, blocking=True, context=context)
                else:
                    await self.hass.services.async_call("script", "turn_on", {
                        "entity_id": self.config["dashboard_script"],
                    }, blocking=True, context=context)
        except Exception as exc:
            self.last_error = str(exc)
            _LOGGER.warning("Dashboard dispatch failed for %s: %s", self.entry.title, exc)
            if raise_errors:
                raise
        finally:
            self.busy = False
            self.evaluate()  # A still-idle receiver can retry after the cooldown.

    async def launch(self, activity=None, context=None, target=None):
        from homeassistant.exceptions import ServiceValidationError
        try:
            domain, service, data = launch_call(self.config, activity, target)
        except ValueError as exc:
            raise ServiceValidationError(str(exc)) from exc
        if domain == "webostv" or (domain, service) == ("media_player", "select_source"):
            state = self.hass.states.get(data["entity_id"])
            if not state or state.state in OFFLINE:
                raise ServiceValidationError("LG webOS TV unavailable; app command was not sent")
            if service == "select_source" and data["source"] not in (state.attributes.get("source_list") or []):
                raise ServiceValidationError("Unknown LG source name. Copy the exact app name from this TV's source_list attribute; enable the source in the LG integration if it is missing.")
        self.returned_to_launcher = False
        self.suspended_until = monotonic() + self.config.get("app_grace_seconds", 600)
        self.awaiting_dashboard = False
        self.cancel_timer()
        self.evaluate()
        self.last_error = None
        try:
            async with self.dispatch_lock:
                await self.hass.services.async_call(domain, service, data, blocking=True, context=context)
        except Exception as exc:
            self.last_error = str(exc)
            raise
        finally:
            self.evaluate()

    async def return_home(self, context=None):
        """Leave the dashboard without immediately triggering another idle launch."""
        from homeassistant.exceptions import ServiceValidationError
        webos = self.config.get("app_launch_method", "androidtv_remote") == "webostv"
        entity = self.config.get("webos_entity" if webos else "remote_entity")
        if not entity:
            raise ServiceValidationError("Configure an LG webOS TV entity for this screen first" if webos else "Configure an Android TV remote entity for this TV first")
        state = self.hass.states.get(entity)
        if not state or state.state in OFFLINE:
            raise ServiceValidationError("TV control unavailable; Home command was not sent")
        if webos:
            if self.config.get("home_app"):
                try:
                    domain, service, data = launch_call(self.config, target={"type": "app", "app_id": self.config["home_app"]})
                except ValueError as exc:
                    raise ServiceValidationError(str(exc)) from exc
            else:
                domain, service, data = "webostv", "button", {"entity_id": entity, "button": "HOME"}
        else:
            domain, service, data = "remote", "send_command", {"entity_id": entity, "command": "HOME"}
        # Keep a separate pause: a browser-to-launcher transition intentionally
        # clears app-launch grace, but must not undo the user's dashboard exit.
        self.home_until = monotonic() + self.config.get("app_grace_seconds", 600)
        self.returned_to_launcher = False
        self.awaiting_dashboard = False
        self.last_error = None
        self.cancel_timer()
        self.evaluate()
        try:
            async with self.dispatch_lock:
                await self.hass.services.async_call(domain, service, data, blocking=True, context=context)
        except Exception as exc:
            self.last_error = str(exc)
            raise
        finally:
            self.evaluate()

    async def stop(self):
        self.closed = True
        self.cancel_timer()
        if self.unsubscribe:
            self.unsubscribe()
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
