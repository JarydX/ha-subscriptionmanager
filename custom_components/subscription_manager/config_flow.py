"""Config flow and Options flow for Subscription Manager integration."""
from __future__ import annotations

from typing import Any
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import (
    CATEGORIES,
    CONF_ALERT_DAYS,
    CONF_AUTO_RENEW,
    CONF_BILLING_INTERVAL,
    CONF_CATEGORY,
    CONF_CONTRACT_END_DATE,
    CONF_COST,
    CONF_CURRENCY,
    CONF_NAME,
    CONF_NOTES,
    CONF_NOTICE_PERIOD_DAYS,
    CONF_PAYMENT_METHOD,
    CONF_START_DATE,
    CONF_WEBSITE,
    DEFAULT_ALERT_DAYS,
    DEFAULT_AUTO_RENEW,
    DEFAULT_BILLING_INTERVAL,
    DEFAULT_CATEGORY,
    DEFAULT_CURRENCY,
    DEFAULT_NOTICE_PERIOD_DAYS,
    DEFAULT_PAYMENT_METHOD,
    DOMAIN,
    INTERVALS,
    PAYMENT_METHODS,
)


def _build_schema(
    defaults: dict[str, Any] | None = None, is_options: bool = False
) -> vol.Schema:
    """Build voluptuous schema for config and options flows."""
    defaults = defaults or {}

    fields: dict[Any, Any] = {}

    if not is_options:
        fields[vol.Required(CONF_NAME, default=defaults.get(CONF_NAME, ""))] = (
            selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            )
        )

    fields[vol.Required(CONF_COST, default=defaults.get(CONF_COST, 9.99))] = (
        selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=0.0, step=0.01, mode=selector.NumberSelectorMode.BOX
            )
        )
    )

    fields[
        vol.Required(CONF_CURRENCY, default=defaults.get(CONF_CURRENCY, DEFAULT_CURRENCY))
    ] = selector.TextSelector(
        selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
    )

    fields[
        vol.Required(
            CONF_BILLING_INTERVAL,
            default=defaults.get(CONF_BILLING_INTERVAL, DEFAULT_BILLING_INTERVAL),
        )
    ] = selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=INTERVALS,
            translation_key="billing_interval",
            mode=selector.SelectSelectorMode.DROPDOWN,
        )
    )

    fields[
        vol.Required(CONF_START_DATE, default=defaults.get(CONF_START_DATE))
    ] = selector.DateSelector(selector.DateSelectorConfig())

    fields[
        vol.Required(
            CONF_PAYMENT_METHOD,
            default=defaults.get(CONF_PAYMENT_METHOD, DEFAULT_PAYMENT_METHOD),
        )
    ] = selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=PAYMENT_METHODS,
            translation_key="payment_method",
            mode=selector.SelectSelectorMode.DROPDOWN,
        )
    )

    fields[
        vol.Required(
            CONF_CATEGORY,
            default=defaults.get(CONF_CATEGORY, DEFAULT_CATEGORY),
        )
    ] = selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=CATEGORIES,
            translation_key="category",
            mode=selector.SelectSelectorMode.DROPDOWN,
        )
    )

    fields[
        vol.Optional(
            CONF_ALERT_DAYS,
            default=defaults.get(CONF_ALERT_DAYS, DEFAULT_ALERT_DAYS),
        )
    ] = selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=1, max=90, step=1, mode=selector.NumberSelectorMode.BOX
        )
    )

    fields[
        vol.Optional(
            CONF_NOTICE_PERIOD_DAYS,
            default=defaults.get(CONF_NOTICE_PERIOD_DAYS, DEFAULT_NOTICE_PERIOD_DAYS),
        )
    ] = selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=0, max=365, step=1, mode=selector.NumberSelectorMode.BOX
        )
    )

    if defaults.get(CONF_CONTRACT_END_DATE):
        fields[
            vol.Optional(
                CONF_CONTRACT_END_DATE,
                default=defaults.get(CONF_CONTRACT_END_DATE),
            )
        ] = selector.DateSelector(selector.DateSelectorConfig())
    else:
        fields[vol.Optional(CONF_CONTRACT_END_DATE)] = selector.DateSelector(
            selector.DateSelectorConfig()
        )

    fields[
        vol.Optional(
            CONF_AUTO_RENEW,
            default=defaults.get(CONF_AUTO_RENEW, DEFAULT_AUTO_RENEW),
        )
    ] = selector.BooleanSelector()

    if defaults.get(CONF_NOTES):
        fields[vol.Optional(CONF_NOTES, default=defaults.get(CONF_NOTES))] = (
            selector.TextSelector(selector.TextSelectorConfig(multiline=True))
        )
    else:
        fields[vol.Optional(CONF_NOTES)] = selector.TextSelector(
            selector.TextSelectorConfig(multiline=True)
        )

    if defaults.get(CONF_WEBSITE):
        fields[vol.Optional(CONF_WEBSITE, default=defaults.get(CONF_WEBSITE))] = (
            selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.URL)
            )
        )
    else:
        fields[vol.Optional(CONF_WEBSITE)] = selector.TextSelector(
            selector.TextSelectorConfig(type=selector.TextSelectorType.URL)
        )

    return vol.Schema(fields)


class SubscriptionConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Subscription Manager."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial user step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            title = user_input.get(CONF_NAME, "Subscription").strip()
            if not title:
                errors[CONF_NAME] = "empty_name"
            else:
                return self.async_create_entry(title=title, data=user_input)

        schema = _build_schema()
        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Get the options flow handler."""
        return SubscriptionOptionsFlowHandler(config_entry)


class SubscriptionOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for an existing subscription entry."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage subscription settings."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        # Merge data and existing options to pre-populate form
        current_config = {**self._config_entry.data, **self._config_entry.options}
        schema = _build_schema(defaults=current_config, is_options=True)

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
        )
