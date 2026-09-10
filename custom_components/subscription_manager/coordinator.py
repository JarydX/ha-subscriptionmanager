"""DataUpdateCoordinator for Subscription Manager."""
from __future__ import annotations

from datetime import date, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .calculations import get_subscription_metrics
from .const import CONF_ALERT_DAYS, DOMAIN, EVENT_SUBSCRIPTION_REMINDER

_LOGGER = logging.getLogger(__name__)


class SubscriptionCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to manage individual subscription state and metrics."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the coordinator."""
        self.entry = entry
        self._last_alert_date: date | None = None
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=timedelta(hours=1),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch updated subscription metrics."""
        try:
            today = date.today()
            # Combine entry.data and entry.options (options override data when re-configured)
            config = {**self.entry.data, **self.entry.options}
            metrics = get_subscription_metrics(config, today=today)

            # Check if alert event should be fired once per day
            if metrics.get("alert_active") and self._last_alert_date != today:
                self._last_alert_date = today
                self.hass.bus.async_fire(
                    EVENT_SUBSCRIPTION_REMINDER,
                    {
                        "entry_id": self.entry.entry_id,
                        "name": metrics["name"],
                        "cost": metrics["cost"],
                        "currency": metrics["currency"],
                        "billing_interval": metrics["billing_interval"],
                        "next_payment": metrics["next_payment"].isoformat(),
                        "days_until_renewal": metrics["days_until_renewal"],
                        "is_renewal_due": metrics["is_renewal_due"],
                        "is_cancellation_due": metrics["is_cancellation_due"],
                        "cancellation_deadline": (
                            metrics["cancellation_deadline"].isoformat()
                            if metrics["cancellation_deadline"]
                            else None
                        ),
                        "days_until_cancellation": metrics["days_until_cancellation"],
                        "payment_method": metrics["payment_method"],
                    },
                )

            return metrics
        except Exception as err:
            _LOGGER.exception("Error calculating subscription metrics: %s", err)
            raise UpdateFailed(f"Failed to update subscription data: {err}") from err
