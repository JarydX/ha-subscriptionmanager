import sys
import unittest
from unittest.mock import MagicMock

# Shim homeassistant modules if not installed in the current environment
for mod in [
    "homeassistant",
    "homeassistant.components",
    "homeassistant.components.http",
    "homeassistant.components.sensor",
    "homeassistant.components.binary_sensor",
    "homeassistant.config_entries",
    "homeassistant.core",
    "homeassistant.data_entry_flow",
    "homeassistant.helpers",
    "homeassistant.helpers.device_registry",
    "homeassistant.helpers.entity_platform",
    "homeassistant.helpers.entity_registry",
    "homeassistant.helpers.selector",
    "homeassistant.helpers.typing",
    "homeassistant.helpers.update_coordinator",
    "voluptuous",
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

from datetime import date

from custom_components.subscription_manager.calculations import (
    calculate_cancellation_deadline,
    calculate_monthly_cost,
    calculate_next_payment_date,
    calculate_yearly_cost,
    get_subscription_metrics,
)
from custom_components.subscription_manager.const import (
    INTERVAL_HALF_YEARLY,
    INTERVAL_MONTHLY,
    INTERVAL_QUARTERLY,
    INTERVAL_WEEKLY,
    INTERVAL_YEARLY,
)


class TestSubscriptionCalculations(unittest.TestCase):
    def test_future_start_date_returned_as_is(self):
        today = date(2026, 1, 15)
        start = date(2026, 2, 1)
        next_pay = calculate_next_payment_date(start, INTERVAL_MONTHLY, today)
        self.assertEqual(next_pay, date(2026, 2, 1))

    def test_same_day_start_date(self):
        today = date(2026, 1, 15)
        start = date(2026, 1, 15)
        next_pay = calculate_next_payment_date(start, INTERVAL_MONTHLY, today)
        self.assertEqual(next_pay, date(2026, 1, 15))

    def test_monthly_rollover_preserves_31st(self):
        today = date(2026, 3, 1)
        start = date(2026, 1, 31)
        # In March 2026, it should be 2026-03-31
        next_pay = calculate_next_payment_date(start, INTERVAL_MONTHLY, today)
        self.assertEqual(next_pay, date(2026, 3, 31))

    def test_monthly_rollover_february(self):
        today = date(2026, 2, 1)
        start = date(2026, 1, 31)
        # In Feb 2026 (non leap year), it should be 2026-02-28
        next_pay = calculate_next_payment_date(start, INTERVAL_MONTHLY, today)
        self.assertEqual(next_pay, date(2026, 2, 28))

    def test_quarterly_rollover(self):
        today = date(2026, 5, 1)
        start = date(2025, 1, 10)
        # Jan 10 -> Apr 10 -> Jul 10
        next_pay = calculate_next_payment_date(start, INTERVAL_QUARTERLY, today)
        self.assertEqual(next_pay, date(2026, 7, 10))

    def test_half_yearly_rollover(self):
        today = date(2026, 5, 1)
        start = date(2025, 3, 15)
        # Mar 15 -> Sep 15 -> Mar 15 (2026) -> Sep 15 (2026)
        next_pay = calculate_next_payment_date(start, INTERVAL_HALF_YEARLY, today)
        self.assertEqual(next_pay, date(2026, 9, 15))

    def test_yearly_rollover(self):
        today = date(2026, 5, 1)
        start = date(2024, 4, 1)
        # Apr 1 2024 -> Apr 1 2025 -> Apr 1 2026 -> Apr 1 2027
        next_pay = calculate_next_payment_date(start, INTERVAL_YEARLY, today)
        self.assertEqual(next_pay, date(2027, 4, 1))

    def test_weekly_rollover(self):
        today = date(2026, 1, 10)  # Saturday
        start = date(2026, 1, 1)   # Thursday
        # Jan 1 -> Jan 8 -> Jan 15
        next_pay = calculate_next_payment_date(start, INTERVAL_WEEKLY, today)
        self.assertEqual(next_pay, date(2026, 1, 15))

    def test_cost_conversions(self):
        self.assertEqual(calculate_monthly_cost(120.0, INTERVAL_YEARLY), 10.0)
        self.assertEqual(calculate_monthly_cost(30.0, INTERVAL_QUARTERLY), 10.0)
        self.assertEqual(calculate_monthly_cost(60.0, INTERVAL_HALF_YEARLY), 10.0)
        self.assertEqual(calculate_monthly_cost(15.0, INTERVAL_MONTHLY), 15.0)

        self.assertEqual(calculate_yearly_cost(10.0, INTERVAL_MONTHLY), 120.0)
        self.assertEqual(calculate_yearly_cost(30.0, INTERVAL_QUARTERLY), 120.0)
        self.assertEqual(calculate_yearly_cost(60.0, INTERVAL_HALF_YEARLY), 120.0)
        self.assertEqual(calculate_yearly_cost(120.0, INTERVAL_YEARLY), 120.0)

    def test_cancellation_deadline(self):
        today = date(2026, 1, 1)
        next_payment = date(2026, 2, 1)
        # 14 days notice
        deadline = calculate_cancellation_deadline(
            next_payment, notice_period_days=14, contract_end_date=None, today=today
        )
        self.assertEqual(deadline, date(2026, 1, 18))

    def test_metrics_alerts(self):
        today = date(2026, 1, 10)
        config = {
            "name": "Netflix",
            "cost": 17.99,
            "currency": "EUR",
            "billing_interval": "monthly",
            "start_date": "2026-01-14",
            "payment_method": "paypal",
            "alert_days": 7,
            "notice_period_days": 0,
        }
        metrics = get_subscription_metrics(config, today=today)
        self.assertEqual(metrics["days_until_renewal"], 4)
        self.assertTrue(metrics["is_renewal_due"])
        self.assertTrue(metrics["alert_active"])


if __name__ == "__main__":
    unittest.main()
