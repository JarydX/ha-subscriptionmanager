"""Constants for the Subscription Manager integration."""
from typing import Final

DOMAIN: Final = "subscription_manager"

# Platforms
PLATFORMS: Final = ["sensor", "binary_sensor"]

# Configuration keys
CONF_NAME: Final = "name"
CONF_COST: Final = "cost"
CONF_CURRENCY: Final = "currency"
CONF_BILLING_INTERVAL: Final = "billing_interval"
CONF_START_DATE: Final = "start_date"
CONF_PAYMENT_METHOD: Final = "payment_method"
CONF_CATEGORY: Final = "category"
CONF_AUTO_RENEW: Final = "auto_renew"
CONF_NOTICE_PERIOD_DAYS: Final = "notice_period_days"
CONF_CONTRACT_END_DATE: Final = "contract_end_date"
CONF_ALERT_DAYS: Final = "alert_days"
CONF_NOTES: Final = "notes"
CONF_WEBSITE: Final = "website"

# Defaults
DEFAULT_CURRENCY: Final = "EUR"
DEFAULT_BILLING_INTERVAL: Final = "monthly"
DEFAULT_PAYMENT_METHOD: Final = "paypal"
DEFAULT_CATEGORY: Final = "streaming"
DEFAULT_AUTO_RENEW: Final = True
DEFAULT_ALERT_DAYS: Final = 7
DEFAULT_NOTICE_PERIOD_DAYS: Final = 0

# Intervals
INTERVAL_WEEKLY: Final = "weekly"
INTERVAL_MONTHLY: Final = "monthly"
INTERVAL_QUARTERLY: Final = "quarterly"
INTERVAL_HALF_YEARLY: Final = "half_yearly"
INTERVAL_YEARLY: Final = "yearly"

INTERVALS: Final = [
    INTERVAL_WEEKLY,
    INTERVAL_MONTHLY,
    INTERVAL_QUARTERLY,
    INTERVAL_HALF_YEARLY,
    INTERVAL_YEARLY,
]

# Payment Methods
PAYMENT_PAYPAL: Final = "paypal"
PAYMENT_CREDIT_CARD: Final = "credit_card"
PAYMENT_SEPA: Final = "sepa"
PAYMENT_APPLE_PAY: Final = "apple_pay"
PAYMENT_GOOGLE_PAY: Final = "google_pay"
PAYMENT_BANK_TRANSFER: Final = "bank_transfer"
PAYMENT_INVOICE: Final = "invoice"
PAYMENT_OTHER: Final = "other"

PAYMENT_METHODS: Final = [
    PAYMENT_PAYPAL,
    PAYMENT_CREDIT_CARD,
    PAYMENT_SEPA,
    PAYMENT_APPLE_PAY,
    PAYMENT_GOOGLE_PAY,
    PAYMENT_BANK_TRANSFER,
    PAYMENT_INVOICE,
    PAYMENT_OTHER,
]

# Categories
CATEGORY_STREAMING: Final = "streaming"
CATEGORY_SOFTWARE: Final = "software"
CATEGORY_FITNESS: Final = "fitness"
CATEGORY_INSURANCE: Final = "insurance"
CATEGORY_HOUSEHOLD: Final = "household"
CATEGORY_GAMING: Final = "gaming"
CATEGORY_NEWS: Final = "news"
CATEGORY_OTHER: Final = "other"

CATEGORIES: Final = [
    CATEGORY_STREAMING,
    CATEGORY_SOFTWARE,
    CATEGORY_FITNESS,
    CATEGORY_INSURANCE,
    CATEGORY_HOUSEHOLD,
    CATEGORY_GAMING,
    CATEGORY_NEWS,
    CATEGORY_OTHER,
]

# Frontend Card
URL_BASE: Final = "/subscription_manager"
CARD_FILENAME: Final = "subscription-manager-card.js"

# Events
EVENT_SUBSCRIPTION_REMINDER: Final = "subscription_manager_reminder"
