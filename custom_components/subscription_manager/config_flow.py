"""Config flow and Options flow for Subscription Manager integration (Hub-Model)."""
from __future__ import annotations

import re
from typing import Any
import uuid
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
    CONF_SUB_ID,
    CONF_SUBSCRIPTIONS,
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


def _build_subscription_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    """Build schema for creating or editing an individual subscription."""
    defaults = defaults or {}

    fields: dict[Any, Any] = {
        vol.Required(CONF_NAME, default=defaults.get(CONF_NAME, "")): (
            selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            )
        ),
        vol.Required(CONF_COST, default=defaults.get(CONF_COST, 9.99)): (
            selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=0.0, step=0.01, mode=selector.NumberSelectorMode.BOX
                )
            )
        ),
        vol.Required(
            CONF_CURRENCY, default=defaults.get(CONF_CURRENCY, DEFAULT_CURRENCY)
        ): selector.TextSelector(
            selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
        ),
        vol.Required(
            CONF_BILLING_INTERVAL,
            default=defaults.get(CONF_BILLING_INTERVAL, DEFAULT_BILLING_INTERVAL),
        ): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=INTERVALS,
                translation_key="billing_interval",
                mode=selector.SelectSelectorMode.DROPDOWN,
            )
        ),
        vol.Required(
            CONF_START_DATE, default=defaults.get(CONF_START_DATE)
        ): selector.DateSelector(selector.DateSelectorConfig()),
        vol.Required(
            CONF_PAYMENT_METHOD,
            default=defaults.get(CONF_PAYMENT_METHOD, DEFAULT_PAYMENT_METHOD),
        ): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=PAYMENT_METHODS,
                translation_key="payment_method",
                mode=selector.SelectSelectorMode.DROPDOWN,
            )
        ),
        vol.Required(
            CONF_CATEGORY,
            default=defaults.get(CONF_CATEGORY, DEFAULT_CATEGORY),
        ): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=CATEGORIES,
                translation_key="category",
                mode=selector.SelectSelectorMode.DROPDOWN,
            )
        ),
        vol.Optional(
            CONF_ALERT_DAYS,
            default=defaults.get(CONF_ALERT_DAYS, DEFAULT_ALERT_DAYS),
        ): selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=1, max=90, step=1, mode=selector.NumberSelectorMode.BOX
            )
        ),
        vol.Optional(
            CONF_NOTICE_PERIOD_DAYS,
            default=defaults.get(
                CONF_NOTICE_PERIOD_DAYS, DEFAULT_NOTICE_PERIOD_DAYS
            ),
        ): selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=0, max=365, step=1, mode=selector.NumberSelectorMode.BOX
            )
        ),
    }

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
    """Handle a config flow for Subscription Manager as a single Hub integration."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial user setup (single hub instance)."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title="Subscription Manager",
                data={},
                options={CONF_SUBSCRIPTIONS: {}},
            )

        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Get the options flow handler."""
        return SubscriptionOptionsFlowHandler(config_entry)


class SubscriptionOptionsFlowHandler(config_entries.OptionsFlow):
    """Manage all subscriptions within the central integration options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry
        self._selected_sub_id: str | None = None

    def _get_subscriptions(self) -> dict[str, dict[str, Any]]:
        """Retrieve existing subscriptions dict."""
        return dict(self._config_entry.options.get(CONF_SUBSCRIPTIONS, {}))

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Present options menu to add, edit or delete subscriptions."""
        subs = self._get_subscriptions()
        menu_options = ["add"]
        if subs:
            menu_options.extend(["edit_select", "delete"])

        return self.async_show_menu(
            step_id="init",
            menu_options=menu_options,
        )

    async def async_step_add(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle adding a new subscription."""
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input.get(CONF_NAME, "").strip()
            if not name:
                errors[CONF_NAME] = "empty_name"
            else:
                # Generate unique slugified ID
                slug = re.sub(r"[^a-zA-Z0-9_]", "_", name.lower()).strip("_")
                sub_id = f"{slug}_{uuid.uuid4().hex[:6]}"

                subs = self._get_subscriptions()
                subs[sub_id] = user_input
                new_options = {**self._config_entry.options, CONF_SUBSCRIPTIONS: subs}
                return self.async_create_entry(title="", data=new_options)

        return self.async_show_form(
            step_id="add",
            data_schema=_build_subscription_schema(),
            errors=errors,
        )

    async def async_step_edit_select(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Select which subscription to edit."""
        subs = self._get_subscriptions()
        if not subs:
            return await self.async_step_init()

        if user_input is not None:
            self._selected_sub_id = user_input[CONF_SUB_ID]
            return await self.async_step_edit()

        options = {
            sub_id: f"{data.get(CONF_NAME, sub_id)} ({data.get(CONF_COST, 0)} {data.get(CONF_CURRENCY, 'EUR')})"
            for sub_id, data in subs.items()
        }

        schema = vol.Schema(
            {
                vol.Required(CONF_SUB_ID): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": k, "label": v} for k, v in options.items()
                        ],
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                )
            }
        )

        return self.async_show_form(
            step_id="edit_select",
            data_schema=schema,
        )

    async def async_step_edit(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Edit the selected subscription."""
        subs = self._get_subscriptions()
        if not self._selected_sub_id or self._selected_sub_id not in subs:
            return await self.async_step_init()

        errors: dict[str, str] = {}
        if user_input is not None:
            subs[self._selected_sub_id] = user_input
            new_options = {**self._config_entry.options, CONF_SUBSCRIPTIONS: subs}
            return self.async_create_entry(title="", data=new_options)

        current_sub = subs[self._selected_sub_id]
        return self.async_show_form(
            step_id="edit",
            data_schema=_build_subscription_schema(defaults=current_sub),
            errors=errors,
        )

    async def async_step_delete(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Select and delete a subscription."""
        subs = self._get_subscriptions()
        if not subs:
            return await self.async_step_init()

        if user_input is not None:
            sub_id_to_delete = user_input[CONF_SUB_ID]
            subs.pop(sub_id_to_delete, None)
            new_options = {**self._config_entry.options, CONF_SUBSCRIPTIONS: subs}
            return self.async_create_entry(title="", data=new_options)

        options = {
            sub_id: f"{data.get(CONF_NAME, sub_id)} ({data.get(CONF_COST, 0)} {data.get(CONF_CURRENCY, 'EUR')})"
            for sub_id, data in subs.items()
        }

        schema = vol.Schema(
            {
                vol.Required(CONF_SUB_ID): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": k, "label": v} for k, v in options.items()
                        ],
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                )
            }
        )

        return self.async_show_form(
            step_id="delete",
            data_schema=schema,
        )
