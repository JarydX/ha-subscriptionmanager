"""Binary sensor platform for Subscription Manager (Hub-Model)."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import SubscriptionHubCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up binary sensors from the central hub config entry."""
    coordinator: SubscriptionHubCoordinator = hass.data[DOMAIN]["coordinator"]
    subs = coordinator.data.get("subscriptions", {})

    # Clean up removed binary sensors from Entity Registry
    ent_reg = er.async_get(hass)
    existing_entries = er.async_entries_for_config_entry(ent_reg, entry.entry_id)
    active_sub_ids = set(subs.keys())

    for reg_entry in existing_entries:
        if reg_entry.domain != "binary_sensor":
            continue
        uid = reg_entry.unique_id
        prefix = f"{entry.entry_id}_"
        if uid.startswith(prefix):
            remainder = uid[len(prefix) :]
            found_active = any(remainder.startswith(f"{sid}_") for sid in active_sub_ids)
            if not found_active:
                _LOGGER.info("Removing stale binary sensor: %s", reg_entry.entity_id)
                ent_reg.async_remove(reg_entry.entity_id)

    entities = [
        SubscriptionAlertBinarySensor(coordinator, entry, sub_id)
        for sub_id in subs
    ]
    async_add_entities(entities)


class SubscriptionAlertBinarySensor(
    CoordinatorEntity[SubscriptionHubCoordinator], BinarySensorEntity
):
    """Binary sensor indicating if a renewal or cancellation deadline is approaching."""

    _attr_has_entity_name = True
    _attr_translation_key = "renewal_due"

    def __init__(
        self,
        coordinator: SubscriptionHubCoordinator,
        entry: ConfigEntry,
        sub_id: str,
    ) -> None:
        """Initialize."""
        super().__init__(coordinator)
        self.entry = entry
        self.sub_id = sub_id
        self._attr_unique_id = f"{entry.entry_id}_{sub_id}_renewal_due"

    @property
    def _sub_metrics(self) -> dict[str, Any]:
        """Return metrics for this subscription."""
        return self.coordinator.data.get("subscriptions", {}).get(self.sub_id, {})

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info for the subscription device."""
        metrics = self._sub_metrics
        return DeviceInfo(
            identifiers={(DOMAIN, f"{self.entry.entry_id}_{self.sub_id}")},
            name=metrics.get("name", "Subscription"),
            manufacturer="Subscription Manager",
            model=f"{metrics.get('billing_interval', '').capitalize()} Subscription",
            configuration_url=metrics.get("website") or None,
            via_device=(DOMAIN, self.entry.entry_id),
        )

    @property
    def is_on(self) -> bool:
        """Return True if renewal or cancellation alert is active."""
        return bool(self._sub_metrics.get("alert_active", False))

    @property
    def icon(self) -> str:
        """Return alert icon."""
        return "mdi:alert-circle" if self.is_on else "mdi:check-circle-outline"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return extra attributes for automations."""
        data = self._sub_metrics
        return {
            "sub_id": self.sub_id,
            "is_renewal_due": data.get("is_renewal_due"),
            "is_cancellation_due": data.get("is_cancellation_due"),
            "days_until_renewal": data.get("days_until_renewal"),
            "days_until_cancellation": data.get("days_until_cancellation"),
            "next_payment": (
                data["next_payment"].isoformat()
                if data.get("next_payment")
                else None
            ),
            "cancellation_deadline": (
                data["cancellation_deadline"].isoformat()
                if data.get("cancellation_deadline")
                else None
            ),
            "cost": data.get("cost"),
            "currency": data.get("currency"),
            "billing_interval": data.get("billing_interval"),
            "payment_method": data.get("payment_method"),
        }
