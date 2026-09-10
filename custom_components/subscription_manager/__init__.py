"""The Subscription Manager integration."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import CARD_FILENAME, DOMAIN, PLATFORMS, URL_BASE
from .coordinator import SubscriptionCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Subscription Manager component."""
    hass.data.setdefault(DOMAIN, {"coordinators": {}, "static_registered": False})
    await _async_register_frontend_resources(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Subscription Manager from a config entry."""
    hass.data.setdefault(DOMAIN, {"coordinators": {}, "static_registered": False})
    await _async_register_frontend_resources(hass)

    coordinator = SubscriptionCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN]["coordinators"][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok and DOMAIN in hass.data:
        hass.data[DOMAIN]["coordinators"].pop(entry.entry_id, None)

    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry when options changed."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_register_frontend_resources(hass: HomeAssistant) -> None:
    """Register the Lovelace card static path."""
    if hass.data[DOMAIN].get("static_registered"):
        return

    www_path = Path(__file__).parent / "www"
    if not www_path.exists():
        return

    try:
        if hasattr(hass.http, "async_register_static_paths"):
            await hass.http.async_register_static_paths(
                [StaticPathConfig(URL_BASE, str(www_path), cache_headers=False)]
            )
        elif hasattr(hass.http, "register_static_path"):
            hass.http.register_static_path(URL_BASE, str(www_path), cache_headers=False)
        hass.data[DOMAIN]["static_registered"] = True
        _LOGGER.info("Registered Subscription Manager frontend card at %s/%s", URL_BASE, CARD_FILENAME)
    except Exception as err:
        _LOGGER.warning("Could not register static path for Lovelace card: %s", err)
