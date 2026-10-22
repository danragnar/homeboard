"""Serve bundled card assets and maintain a single Lovelace module resource."""
import logging
from pathlib import Path
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA
from .const import VERSION

_LOGGER = logging.getLogger(__name__)
BASE_URL = "/homeboard_tv"
RESOURCE_URL = f"{BASE_URL}/{VERSION}/homeboard-tv-card.js"
LEGACY_PATH = "/local/homeboard-tv/homeboard-tv-card.js"


def managed_resource(url):
    """Recognize only Homeboard's own resource paths, never another card."""
    path = str(url).split("?", 1)[0]
    return path == LEGACY_PATH or (path.startswith(f"{BASE_URL}/") and path.endswith("/homeboard-tv-card.js"))


async def async_setup_frontend(hass):
    """HACS installs these assets alongside Python; no copy into www is needed."""
    await hass.http.async_register_static_paths([
        StaticPathConfig(f"{BASE_URL}/{VERSION}", str(Path(__file__).parent / "frontend"), False),
    ])
    lovelace = hass.data.get(LOVELACE_DATA)
    resources = getattr(lovelace, "resources", None)
    if resources is None or not hasattr(resources, "async_create_item"):
        _LOGGER.warning("Add Homeboard's JavaScript module resource in Lovelace YAML: %s", RESOURCE_URL)
        return
    try:
        # Public info call ensures lazy resource storage has loaded first.
        await resources.async_get_info()
        owned = [item for item in resources.async_items() if managed_resource(item.get("url", ""))]
        if not owned:
            await resources.async_create_item({"res_type": "module", "url": RESOURCE_URL})
            return
        first, *duplicates = owned
        if first.get("url") != RESOURCE_URL or first.get("type") != "module":
            await resources.async_update_item(first["id"], {"res_type": "module", "url": RESOURCE_URL})
        # Prevent duplicate custom-element registrations after manual-to-HACS migration.
        for item in duplicates:
            await resources.async_delete_item(item["id"])
    except Exception:
        # Resource-storage trouble must not disable the TV policy/services.
        _LOGGER.exception("Unable to register the Homeboard card; add module resource manually: %s", RESOURCE_URL)
