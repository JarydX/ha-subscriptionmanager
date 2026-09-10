"""The Subscription Manager integration (Hub-Model)."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import CARD_FILENAME, DOMAIN, PLATFORMS, URL_BASE
from .coordinator import SubscriptionHubCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Subscription Manager component."""
    hass.data.setdefault(DOMAIN, {})
    await _async_register_frontend_resources(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Subscription Manager from a single config entry."""
    hass.data.setdefault(DOMAIN, {})
    await _async_register_frontend_resources(hass)

    coordinator = SubscriptionHubCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN]["coordinator"] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok and DOMAIN in hass.data:
        hass.data.pop(DOMAIN, None)

    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry when subscriptions are added/edited/removed."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_register_frontend_resources(hass: HomeAssistant) -> None:
    """Register the Lovelace card static path and inject into frontend."""
    if hass.data.get(DOMAIN, {}).get("static_registered"):
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

        # Auto-inject Lovelace card script so users don't need manual resource configuration
        card_url = f"{URL_BASE}/{CARD_FILENAME}"
        add_extra_js_url(hass, card_url)

        hass.data.setdefault(DOMAIN, {})["static_registered"] = True
        _LOGGER.info(
            "Registered Subscription Manager frontend card at %s",
            card_url,
        )
    except Exception as err:
        _LOGGER.warning("Could not register static path for Lovelace card: %s", err)
