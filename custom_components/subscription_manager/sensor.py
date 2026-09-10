"""Sensor platform for Subscription Manager."""
from __future__ import annotations

from datetime import date
import logging
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
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
from .coordinator import SubscriptionCoordinator

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
    """Set up the sensor platform."""
    coordinator: SubscriptionCoordinator = hass.data[DOMAIN]["coordinators"][entry.entry_id]

    entities: list[SensorEntity] = [
        SubscriptionNextPaymentSensor(coordinator, entry),
        SubscriptionDaysUntilRenewalSensor(coordinator, entry),
        SubscriptionCostSensor(coordinator, entry),
        SubscriptionMonthlyCostSensor(coordinator, entry),
        SubscriptionPaymentMethodSensor(coordinator, entry),
    ]

    # Add cancellation sensors if configured
    if coordinator.data.get("cancellation_deadline") is not None:
        entities.extend(
            [
                SubscriptionCancellationDeadlineSensor(coordinator, entry),
                SubscriptionDaysUntilCancellationSensor(coordinator, entry),
            ]
        )

    # Initialize global summary sensors once
    if not hass.data[DOMAIN].get("summary_entities_registered"):
        hass.data[DOMAIN]["summary_entities_registered"] = True
        summary_sensors = [
            SubscriptionsTotalMonthlyCostSensor(hass),
            SubscriptionsTotalYearlyCostSensor(hass),
            SubscriptionsActiveCountSensor(hass),
            SubscriptionsSummarySensor(hass),
        ]
        hass.data[DOMAIN]["summary_entities"] = summary_sensors
        async_add_entities(summary_sensors)

    async_add_entities(entities)

    # Update summary sensors whenever coordinator finishes refreshing
    def _refresh_summary() -> None:
        for s in hass.data[DOMAIN].get("summary_entities", []):
            if s.hass is not None:
                s.async_write_ha_state()

    coordinator.async_add_listener(_refresh_summary)


class SubscriptionBaseSensor(CoordinatorEntity[SubscriptionCoordinator], SensorEntity):
    """Base class for subscription sensors."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SubscriptionCoordinator,
        entry: ConfigEntry,
        key: str,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self.entry = entry
        self._key = key
        self._attr_unique_id = f"{entry.entry_id}_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info for the subscription."""
        metrics = self.coordinator.data
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=metrics.get("name", self.entry.title),
            manufacturer="Subscription Manager",
            model=f"{metrics.get('billing_interval', '').capitalize()} Subscription",
            configuration_url=metrics.get("website") or None,
        )


class SubscriptionNextPaymentSensor(SubscriptionBaseSensor):
    """Sensor for the next payment date."""

    _attr_translation_key = "next_payment"
    _attr_device_class = SensorDeviceClass.DATE

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "next_payment")

    @property
    def native_value(self) -> date | None:
        """Return the next payment date."""
        return self.coordinator.data.get("next_payment")


class SubscriptionDaysUntilRenewalSensor(SubscriptionBaseSensor):
    """Sensor for days remaining until renewal."""

    _attr_translation_key = "days_until_renewal"
    _attr_native_unit_of_measurement = "d"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:calendar-clock"

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "days_until_renewal")

    @property
    def native_value(self) -> int | None:
        """Return the remaining days."""
        return self.coordinator.data.get("days_until_renewal")


class SubscriptionCostSensor(SubscriptionBaseSensor):
    """Sensor for subscription cost per billing interval."""

    _attr_translation_key = "cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "cost")

    @property
    def native_value(self) -> float | None:
        """Return cost amount."""
        return self.coordinator.data.get("cost")

    @property
    def native_unit_of_measurement(self) -> str:
        """Return currency unit."""
        return self.coordinator.data.get("currency", "EUR")


class SubscriptionMonthlyCostSensor(SubscriptionBaseSensor):
    """Sensor for normalized monthly cost."""

    _attr_translation_key = "monthly_cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:cash-multiple"

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "monthly_cost")

    @property
    def native_value(self) -> float | None:
        """Return normalized monthly cost."""
        return self.coordinator.data.get("monthly_cost")

    @property
    def native_unit_of_measurement(self) -> str:
        """Return currency unit."""
        return self.coordinator.data.get("currency", "EUR")


class SubscriptionPaymentMethodSensor(SubscriptionBaseSensor):
    """Sensor for payment method."""

    _attr_translation_key = "payment_method"

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "payment_method")

    @property
    def native_value(self) -> str | None:
        """Return payment method."""
        return self.coordinator.data.get("payment_method")

    @property
    def icon(self) -> str:
        """Return icon depending on payment method."""
        method = str(self.native_value or "")
        return PAYMENT_ICONS.get(method, "mdi:credit-card")


class SubscriptionCancellationDeadlineSensor(SubscriptionBaseSensor):
    """Sensor for cancellation deadline date."""

    _attr_translation_key = "cancellation_deadline"
    _attr_device_class = SensorDeviceClass.DATE
    _attr_icon = "mdi:calendar-alert"

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "cancellation_deadline")

    @property
    def native_value(self) -> date | None:
        """Return cancellation deadline."""
        return self.coordinator.data.get("cancellation_deadline")


class SubscriptionDaysUntilCancellationSensor(SubscriptionBaseSensor):
    """Sensor for days remaining until cancellation deadline."""

    _attr_translation_key = "days_until_cancellation"
    _attr_native_unit_of_measurement = "d"
    _attr_icon = "mdi:timer-alert-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: SubscriptionCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "days_until_cancellation")

    @property
    def native_value(self) -> int | None:
        """Return remaining days."""
        return self.coordinator.data.get("days_until_cancellation")


# =========================================================================
# Summary / Aggregated Sensors
# =========================================================================

class SubscriptionsSummaryBaseSensor(SensorEntity):
    """Base class for summary sensors."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, key: str) -> None:
        """Initialize."""
        self._hass = hass
        self._key = key
        self._attr_unique_id = f"{DOMAIN}_global_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info for global summary."""
        return DeviceInfo(
            identifiers={(DOMAIN, "global_summary")},
            name="Subscriptions Overview",
            manufacturer="Subscription Manager",
            entry_type=None,
        )

    def _get_all_metrics(self) -> list[dict[str, Any]]:
        """Collect metrics from all active coordinators."""
        coordinators: dict[str, SubscriptionCoordinator] = (
            self._hass.data.get(DOMAIN, {}).get("coordinators", {})
        )
        return [
            coord.data
            for coord in coordinators.values()
            if coord.data is not None
        ]


class SubscriptionsTotalMonthlyCostSensor(SubscriptionsSummaryBaseSensor):
    """Sensor for total monthly spend across all active subscriptions."""

    _attr_translation_key = "total_monthly_cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:chart-line"

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "total_monthly_cost")

    @property
    def native_value(self) -> float:
        """Calculate total monthly cost."""
        metrics_list = self._get_all_metrics()
        total = sum(float(m.get("monthly_cost", 0.0)) for m in metrics_list)
        return round(total, 2)

    @property
    def native_unit_of_measurement(self) -> str:
        """Return currency unit (EUR default)."""
        metrics_list = self._get_all_metrics()
        if metrics_list:
            return metrics_list[0].get("currency", "EUR")
        return "EUR"


class SubscriptionsTotalYearlyCostSensor(SubscriptionsSummaryBaseSensor):
    """Sensor for total yearly spend across all active subscriptions."""

    _attr_translation_key = "total_yearly_cost"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:chart-areaspline"

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "total_yearly_cost")

    @property
    def native_value(self) -> float:
        """Calculate total yearly cost."""
        metrics_list = self._get_all_metrics()
        total = sum(float(m.get("yearly_cost", 0.0)) for m in metrics_list)
        return round(total, 2)

    @property
    def native_unit_of_measurement(self) -> str:
        """Return currency unit (EUR default)."""
        metrics_list = self._get_all_metrics()
        if metrics_list:
            return metrics_list[0].get("currency", "EUR")
        return "EUR"


class SubscriptionsActiveCountSensor(SubscriptionsSummaryBaseSensor):
    """Sensor for count of active subscriptions."""

    _attr_translation_key = "active_count"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:counter"

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "active_count")

    @property
    def native_value(self) -> int:
        """Return number of subscriptions."""
        return len(self._get_all_metrics())


class SubscriptionsSummarySensor(SubscriptionsSummaryBaseSensor):
    """Sensor containing full JSON payload of all subscriptions for the frontend widget."""

    _attr_translation_key = "summary"
    _attr_icon = "mdi:view-dashboard-outline"

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "summary")

    @property
    def native_value(self) -> int:
        """Return count of subscriptions."""
        return len(self._get_all_metrics())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return detailed subscription list for widget rendering."""
        coordinators: dict[str, SubscriptionCoordinator] = (
            self._hass.data.get(DOMAIN, {}).get("coordinators", {})
        )
        items = []
        for entry_id, coord in coordinators.items():
            if coord.data is None:
                continue
            data = dict(coord.data)
            data["entry_id"] = entry_id
            if isinstance(data.get("next_payment"), date):
                data["next_payment"] = data["next_payment"].isoformat()
            if isinstance(data.get("cancellation_deadline"), date):
                data["cancellation_deadline"] = data["cancellation_deadline"].isoformat()
            items.append(data)

        total_monthly = round(sum(float(i.get("monthly_cost", 0.0)) for i in items), 2)
        total_yearly = round(sum(float(i.get("yearly_cost", 0.0)) for i in items), 2)

        return {
            "subscriptions": items,
            "total_monthly_cost": total_monthly,
            "total_yearly_cost": total_yearly,
            "count": len(items),
        }
