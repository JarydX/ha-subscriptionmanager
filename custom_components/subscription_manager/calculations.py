"""Calculation utilities for subscription renewals, costs, and deadlines."""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

from .const import (
    INTERVAL_HALF_YEARLY,
    INTERVAL_MONTHLY,
    INTERVAL_QUARTERLY,
    INTERVAL_WEEKLY,
    INTERVAL_YEARLY,
)


def calculate_next_payment_date(
    start_date: date, interval: str, today: date | None = None
) -> date:
    """Calculate the next payment date on or after `today`.
    
    Preserves the original day of month wherever possible (e.g. 31st Jan -> 28th Feb -> 31st Mar).
    """
    if today is None:
        today = date.today()

    if start_date >= today:
        return start_date

    if interval == INTERVAL_WEEKLY:
        days_diff = (today - start_date).days
        weeks_passed = days_diff // 7
        next_date = start_date + timedelta(days=weeks_passed * 7)
        while next_date < today:
            next_date += timedelta(days=7)
        return next_date

    interval_month_map = {
        INTERVAL_MONTHLY: 1,
        INTERVAL_QUARTERLY: 3,
        INTERVAL_HALF_YEARLY: 6,
        INTERVAL_YEARLY: 12,
    }
    months_step = interval_month_map.get(interval, 1)
    orig_day = start_date.day

    # Approximate month offset to avoid slow step-by-step loops for long-running subscriptions
    approx_months = max(0, (today.year - start_date.year) * 12 + (today.month - start_date.month) - 1)
    step_count = (approx_months // months_step) * months_step

    total_months = (start_date.year * 12 + start_date.month - 1) + step_count
    cur_year = total_months // 12
    cur_month = (total_months % 12) + 1
    max_d = calendar.monthrange(cur_year, cur_month)[1]
    candidate = date(cur_year, cur_month, min(orig_day, max_d))

    while candidate < today:
        total_months += months_step
        cur_year = total_months // 12
        cur_month = (total_months % 12) + 1
        max_d = calendar.monthrange(cur_year, cur_month)[1]
        candidate = date(cur_year, cur_month, min(orig_day, max_d))

    return candidate


def calculate_cancellation_deadline(
    next_payment: date,
    notice_period_days: int | None,
    contract_end_date: date | None = None,
    today: date | None = None,
) -> date | None:
    """Calculate the deadline to cancel before the next renewal or contract end.
    
    If contract_end_date is in the future, the notice period applies to that date.
    Otherwise, it applies to the next recurring payment/renewal.
    """
    if not notice_period_days or notice_period_days <= 0:
        return None

    if today is None:
        today = date.today()

    target_date = next_payment
    if contract_end_date is not None and contract_end_date >= today:
        target_date = contract_end_date

    deadline = target_date - timedelta(days=notice_period_days)
    return deadline


def calculate_monthly_cost(cost: float, interval: str) -> float:
    """Normalize subscription cost to equivalent monthly expenditure."""
    if interval == INTERVAL_WEEKLY:
        return round((cost * 52) / 12, 2)
    if interval == INTERVAL_MONTHLY:
        return round(cost, 2)
    if interval == INTERVAL_QUARTERLY:
        return round(cost / 3, 2)
    if interval == INTERVAL_HALF_YEARLY:
        return round(cost / 6, 2)
    if interval == INTERVAL_YEARLY:
        return round(cost / 12, 2)
    return round(cost, 2)


def calculate_yearly_cost(cost: float, interval: str) -> float:
    """Normalize subscription cost to equivalent annual expenditure."""
    if interval == INTERVAL_WEEKLY:
        return round(cost * 52, 2)
    if interval == INTERVAL_MONTHLY:
        return round(cost * 12, 2)
    if interval == INTERVAL_QUARTERLY:
        return round(cost * 4, 2)
    if interval == INTERVAL_HALF_YEARLY:
        return round(cost * 2, 2)
    if interval == INTERVAL_YEARLY:
        return round(cost, 2)
    return round(cost * 12, 2)


def get_subscription_metrics(
    config: dict[str, Any], today: date | None = None
) -> dict[str, Any]:
    """Calculate complete snapshot of metrics for a subscription configuration."""
    if today is None:
        today = date.today()

    # Parse start date
    start_date_val = config.get("start_date")
    if isinstance(start_date_val, str):
        start_date = date.fromisoformat(start_date_val)
    elif isinstance(start_date_val, date):
        start_date = start_date_val
    else:
        start_date = today

    interval = config.get("billing_interval", INTERVAL_MONTHLY)
    cost = float(config.get("cost", 0.0))
    currency = config.get("currency", "EUR")

    # Contract end date if any
    contract_end_val = config.get("contract_end_date")
    contract_end_date: date | None = None
    if isinstance(contract_end_val, str) and contract_end_val.strip():
        try:
            contract_end_date = date.fromisoformat(contract_end_val)
        except ValueError:
            contract_end_date = None
    elif isinstance(contract_end_val, date):
        contract_end_date = contract_end_val

    notice_period_days = int(config.get("notice_period_days") or 0)
    alert_days = int(config.get("alert_days") or 7)

    next_payment = calculate_next_payment_date(start_date, interval, today)
    days_until_renewal = (next_payment - today).days

    cancellation_deadline = calculate_cancellation_deadline(
        next_payment, notice_period_days, contract_end_date, today
    )
    days_until_cancellation = (
        (cancellation_deadline - today).days if cancellation_deadline else None
    )

    monthly_cost = calculate_monthly_cost(cost, interval)
    yearly_cost = calculate_yearly_cost(cost, interval)

    # Determine alert state
    is_renewal_due = days_until_renewal <= alert_days
    is_cancellation_due = (
        days_until_cancellation is not None and days_until_cancellation <= alert_days
    )
    alert_active = is_renewal_due or is_cancellation_due

    return {
        "next_payment": next_payment,
        "days_until_renewal": days_until_renewal,
        "cancellation_deadline": cancellation_deadline,
        "days_until_cancellation": days_until_cancellation,
        "monthly_cost": monthly_cost,
        "yearly_cost": yearly_cost,
        "alert_active": alert_active,
        "is_renewal_due": is_renewal_due,
        "is_cancellation_due": is_cancellation_due,
        "cost": cost,
        "currency": currency,
        "billing_interval": interval,
        "payment_method": config.get("payment_method", "paypal"),
        "category": config.get("category", "streaming"),
        "name": config.get("name", "Subscription"),
        "notes": config.get("notes", ""),
        "website": config.get("website", ""),
    }
