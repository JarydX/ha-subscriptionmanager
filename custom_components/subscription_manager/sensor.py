"""Sensor platform for Subscription Manager (Hub-Model)."""
from __future__ import annotations

from datetime import date
import logging
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    PAYMENT_APPLE_PAY,
    PAYMENT_BANK_TRANSFER,
    PAYMENT_CREDIT_CARD,
    PAYMENT_GOOGLE_PAY,
    PAYMENT_INVOICE,
    PAYMENT_PAYPAL,
    PAYMENT_SEPA,
)
from .coordinator import SubscriptionHubCoordinator

_LOGGER = logging.getLogger(__name__)

PAYMENT_ICONS: dict[str, str] = {
    PAYMENT_PAYPAL: "mdi:credit-card-outline",
    PAYMENT_CREDIT_CARD: "mdi:credit-card",
    PAYMENT_SEPA: "mdi:bank",
    PAYMENT_APPLE_PAY: "mdi:apple",
    PAYMENT_GOOGLE_PAY: "mdi:google",
    PAYMENT_BANK_TRANSFER: "mdi:bank-transfer",
    PAYMENT_INVOICE: "mdi:receipt",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the sensor platform from a central hub config entry."""
    coordinator: SubscriptionHubCoordinator = hass.data[DOMAIN]["coordinator"]
    subs = coordinator.data.get("subscriptions", {})

    # Clean up any removed subscriptions from Entity Registry
    ent_reg = er.async_get(hass)
    existing_entries = er.async_entries_for_config_entry(ent_reg, entry.entry_id)
    active_sub_ids = set(subs.keys())

    for reg_entry in existing_entries:
        if reg_entry.domain != "sensor":
            continue
        uid = reg_entry.unique_id
        if uid.startswith(f"{entry.entry_id}_global_"):
            continue
        # Format: {entry_id}_{sub_id}_{key}
        prefix = f"{entry.entry_id}_"
        if uid.startswith(prefix):
            remainder = uid[len(prefix) :]
            found_active = any(remainder.startswith(f"{sid}_") for sid in active_sub_ids)
            if not found_active:
                _LOGGER.info("Removing stale subscription sensor: %s", reg_entry.entity_id)
                ent_reg.async_remove(reg_entry.entity_id)

    entities: list[SensorEntity] = []

    # Subscription-specific sensors
    for sub_id, metrics in subs.items():
        entities.extend(
            [
                SubscriptionNextPaymentSensor(coordinator, entry, sub_id),
                SubscriptionDaysUntilRenewalSensor(coordinator, entry, sub_id),
                SubscriptionCostSensor(coordinator, entry, sub_id),
                SubscriptionMonthlyCostSensor(coordinator, entry, sub_id),
                SubscriptionPaymentMethodSensor(coordinator, entry, sub_id),
            ]
        )
        if metrics.get("cancellation_deadline") is not None:
            entities.extend(
                [
                    SubscriptionCancellationDeadlineSensor(coordinator, entry, sub_id),
                    SubscriptionDaysUntilCancellationSensor(coordinator, entry, sub_id),
                ]
            )

    # Global summary sensors
    entities.extend(
        [
            SubscriptionsTotalMonthlyCostSensor(coordinator, entry),
            SubscriptionsTotalYearlyCostSensor(coordinator, entry),
            SubscriptionsActiveCountSensor(coordinator, entry),
            SubscriptionsSummarySensor(coordinator, entry),
        ]
    )

    async_add_entities(entities)


class SubscriptionBaseSensor(
    CoordinatorEntity[SubscriptionHubCoordinator], SensorEntity
):
    """Base class for sensors belonging to an individual subscription device."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SubscriptionHubCoordinator,
        entry: ConfigEntry,
        sub_id: str,
        key: str,
    ) -> None:
        """Initialize."""
        super().__init__(coordinator)
        self.entry = entry
        self.sub_id = sub_id
        self._key = key
        self._attr_unique_id = f"{entry.entry_id}_{sub_id}_{key}"

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


class SubscriptionNextPaymentSensor(SubscriptionBaseSensor):
    """Sensor for the next payment date."""

    _attr_translation_key = "next_payment"
    _attr_device_class = SensorDeviceClass.DATE

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "next_payment")

    @property
    def native_value(self) -> date | None:
        return self._sub_metrics.get("next_payment")


class SubscriptionDaysUntilRenewalSensor(SubscriptionBaseSensor):
    """Sensor for remaining days until renewal."""

    _attr_translation_key = "days_until_renewal"
    _attr_native_unit_of_measurement = "d"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:calendar-clock"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "days_until_renewal")

    @property
    def native_value(self) -> int | None:
        return self._sub_metrics.get("days_until_renewal")


class SubscriptionCostSensor(SubscriptionBaseSensor):
    """Sensor for cost per billing cycle."""

    _attr_translation_key = "cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "cost")

    @property
    def native_value(self) -> float | None:
        return self._sub_metrics.get("cost")

    @property
    def native_unit_of_measurement(self) -> str:
        return self._sub_metrics.get("currency", "EUR")


class SubscriptionMonthlyCostSensor(SubscriptionBaseSensor):
    """Sensor for normalized monthly cost."""

    _attr_translation_key = "monthly_cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:cash-multiple"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "monthly_cost")

    @property
    def native_value(self) -> float | None:
        return self._sub_metrics.get("monthly_cost")

    @property
    def native_unit_of_measurement(self) -> str:
        return self._sub_metrics.get("currency", "EUR")


class SubscriptionPaymentMethodSensor(SubscriptionBaseSensor):
    """Sensor for payment method."""

    _attr_translation_key = "payment_method"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "payment_method")

    @property
    def native_value(self) -> str | None:
        return self._sub_metrics.get("payment_method")

    @property
    def icon(self) -> str:
        method = str(self.native_value or "")
        return PAYMENT_ICONS.get(method, "mdi:credit-card")


class SubscriptionCancellationDeadlineSensor(SubscriptionBaseSensor):
    """Sensor for cancellation deadline date."""

    _attr_translation_key = "cancellation_deadline"
    _attr_device_class = SensorDeviceClass.DATE
    _attr_icon = "mdi:calendar-alert"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "cancellation_deadline")

    @property
    def native_value(self) -> date | None:
        return self._sub_metrics.get("cancellation_deadline")


class SubscriptionDaysUntilCancellationSensor(SubscriptionBaseSensor):
    """Sensor for days until cancellation deadline."""

    _attr_translation_key = "days_until_cancellation"
    _attr_native_unit_of_measurement = "d"
    _attr_icon = "mdi:timer-alert-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry, sub_id: str
    ) -> None:
        super().__init__(coordinator, entry, sub_id, "days_until_cancellation")

    @property
    def native_value(self) -> int | None:
        return self._sub_metrics.get("days_until_cancellation")


# =========================================================================
# Summary / Aggregated Sensors
# =========================================================================

class SubscriptionsSummaryBaseSensor(
    CoordinatorEntity[SubscriptionHubCoordinator], SensorEntity
):
    """Base class for summary sensors."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SubscriptionHubCoordinator,
        entry: ConfigEntry,
        key: str,
    ) -> None:
        """Initialize."""
        super().__init__(coordinator)
        self.entry = entry
        self._key = key
        self._attr_unique_id = f"{entry.entry_id}_global_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        """Return central hub device info."""
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name="Subscriptions Overview",
            manufacturer="Subscription Manager",
            model="Hub",
        )


class SubscriptionsTotalMonthlyCostSensor(SubscriptionsSummaryBaseSensor):
    """Sensor for total monthly spend across all active subscriptions."""

    _attr_translation_key = "total_monthly_cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:chart-line"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator, entry, "total_monthly_cost")

    @property
    def native_value(self) -> float:
        return self.coordinator.data.get("total_monthly_cost", 0.0)

    @property
    def native_unit_of_measurement(self) -> str:
        return self.coordinator.data.get("currency", "EUR")


class SubscriptionsTotalYearlyCostSensor(SubscriptionsSummaryBaseSensor):
    """Sensor for total yearly spend across all active subscriptions."""

    _attr_translation_key = "total_yearly_cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:chart-areaspline"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator, entry, "total_yearly_cost")

    @property
    def native_value(self) -> float:
        return self.coordinator.data.get("total_yearly_cost", 0.0)

    @property
    def native_unit_of_measurement(self) -> str:
        return self.coordinator.data.get("currency", "EUR")


class SubscriptionsActiveCountSensor(SubscriptionsSummaryBaseSensor):
    """Sensor for count of active subscriptions."""

    _attr_translation_key = "active_count"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:counter"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator, entry, "active_count")

    @property
    def native_value(self) -> int:
        return self.coordinator.data.get("active_count", 0)


class SubscriptionsSummarySensor(SubscriptionsSummaryBaseSensor):
    """Sensor containing full JSON payload of all subscriptions for the frontend widget."""

    _attr_translation_key = "summary"
    _attr_suggested_object_id = "subscriptions_summary"
    _attr_icon = "mdi:view-dashboard-outline"

    def __init__(
        self, coordinator: SubscriptionHubCoordinator, entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator, entry, "summary")

    @property
    def native_value(self) -> int:
        return self.coordinator.data.get("active_count", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return detailed subscription list for widget rendering."""
        subs = self.coordinator.data.get("subscriptions", {})
        items = []
        for sub_id, metrics in subs.items():
            data = dict(metrics)
            data["sub_id"] = sub_id
            if isinstance(data.get("next_payment"), date):
                data["next_payment"] = data["next_payment"].isoformat()
            if isinstance(data.get("cancellation_deadline"), date):
                data["cancellation_deadline"] = data["cancellation_deadline"].isoformat()
            items.append(data)

        return {
            "subscriptions": items,
            "total_monthly_cost": self.coordinator.data.get("total_monthly_cost", 0.0),
            "total_yearly_cost": self.coordinator.data.get("total_yearly_cost", 0.0),
            "count": len(items),
        }
