"""DataUpdateCoordinator for Subscription Manager (Hub-Model)."""
from __future__ import annotations

from datetime import date, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .calculations import get_subscription_metrics
from .const import CONF_SUBSCRIPTIONS, DOMAIN, EVENT_SUBSCRIPTION_REMINDER

_LOGGER = logging.getLogger(__name__)


class SubscriptionHubCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator managing all subscriptions under the central integration hub."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the hub coordinator."""
        self.entry = entry
        self._alerted_today: set[str] = set()
        self._last_alert_date: date | None = None
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_hub",
            update_interval=timedelta(hours=1),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        """Calculate metrics for all configured subscriptions."""
        try:
            today = date.today()
            if self._last_alert_date != today:
                self._alerted_today.clear()
                self._last_alert_date = today

            raw_subscriptions: dict[str, dict[str, Any]] = self.entry.options.get(
                CONF_SUBSCRIPTIONS, {}
            )

            metrics_by_id: dict[str, dict[str, Any]] = {}
            total_monthly = 0.0
            total_yearly = 0.0
            currency = "EUR"

            for sub_id, config in raw_subscriptions.items():
                metrics = get_subscription_metrics(config, today=today)
                metrics["sub_id"] = sub_id
                metrics_by_id[sub_id] = metrics

                total_monthly += metrics["monthly_cost"]
                total_yearly += metrics["yearly_cost"]
                currency = metrics["currency"]

                # Trigger alert event once per day per subscription
                if metrics.get("alert_active") and sub_id not in self._alerted_today:
                    self._alerted_today.add(sub_id)
                    self.hass.bus.async_fire(
                        EVENT_SUBSCRIPTION_REMINDER,
                        {
                            "entry_id": self.entry.entry_id,
                            "sub_id": sub_id,
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

            return {
                "subscriptions": metrics_by_id,
                "total_monthly_cost": round(total_monthly, 2),
                "total_yearly_cost": round(total_yearly, 2),
                "active_count": len(metrics_by_id),
                "currency": currency,
            }
        except Exception as err:
            _LOGGER.exception("Error calculating subscription metrics: %s", err)
            raise UpdateFailed(f"Failed to calculate subscription data: {err}") from err
