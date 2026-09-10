"""Binary sensor platform for Subscription Manager."""
from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import SubscriptionCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the binary sensor platform."""
    coordinator: SubscriptionCoordinator = hass.data[DOMAIN]["coordinators"][entry.entry_id]
    async_add_entities([SubscriptionAlertBinarySensor(coordinator, entry)])


class SubscriptionAlertBinarySensor(CoordinatorEntity[SubscriptionCoordinator], BinarySensorEntity):
    """Binary sensor indicating if a renewal or cancellation deadline is approaching."""

    _attr_has_entity_name = True
    _attr_translation_key = "renewal_due"

    def __init__(
        self, coordinator: SubscriptionCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the binary sensor."""
        super().__init__(coordinator)
        self.entry = entry
        self._attr_unique_id = f"{entry.entry_id}_renewal_due"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info."""
        metrics = self.coordinator.data
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=metrics.get("name", self.entry.title),
            manufacturer="Subscription Manager",
            model=f"{metrics.get('billing_interval', '').capitalize()} Subscription",
            configuration_url=metrics.get("website") or None,
        )

    @property
    def is_on(self) -> bool:
        """Return True if an alert is active."""
        return bool(self.coordinator.data.get("alert_active", False))

    @property
    def icon(self) -> str:
        """Return icon depending on state."""
        return "mdi:alert-circle" if self.is_on else "mdi:check-circle-outline"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional details for automation triggers."""
        data = self.coordinator.data
        return {
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
