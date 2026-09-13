# 💳 Home Assistant Subscription Manager

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/default)
[![Validate](https://github.com/JarydX/ha-subscriptionmanager/actions/workflows/main.yml/badge.svg)](https://github.com/JarydX/ha-subscriptionmanager/actions/workflows/main.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Subscription Manager** is a modular custom integration for [Home Assistant](https://www.home-assistant.io/) that enables you to track, monitor, and budget all your recurring subscriptions, memberships, and contracts (streaming services, software, gym, insurance, utilities, etc.) directly in Home Assistant.

The integration comes with an interactive **Lovelace overview widget** with live sorting by cancellation deadlines, cost, or due date, plus an **automation blueprint** for automatic push notifications sent to your smartphone.

---

## ✨ Features

- 📱 **100% GUI-Driven (Config Flow)**: No YAML required! Subscriptions are easily added, edited (Options Flow), or deleted directly through the UI.
- 💰 **Cost Analysis**: Automatically calculates total monthly and yearly expenses across all active contracts.
- ⏳ **Terms & Cancellation Deadlines (optional)**: Along with billing intervals (weekly, monthly, quarterly, semi-annually, yearly), track notice periods and minimum contract end dates.
- 💳 **Payment Methods**: Keep track of how each service is billed (PayPal, Credit Card, SEPA Direct Debit, Apple Pay, Google Pay, Bank Transfer, Invoice, etc.).
- 🗂️ **Lovelace Dashboard Cards**: Bundled with dedicated interactive dashboard cards (`subscription-manager-card` and `subscription-report-card`) featuring live sorting by:
  - **Due Date** (Which subscription is billed next?)
  - **Cancellation Deadline** (Which cancellation period is expiring soon?)
  - **Cost** (Highest expense first)
  - **Name** (A–Z)
- 🔔 **Smart Notifications**: Includes a ready-to-use automation blueprint for smartphone push notifications before payments or notice deadlines.
- 🌐 **Multi-Language Support**: Translated into English, German (Deutsch), French (Français), and Spanish (Español).

---

## 📦 Installation

### Via HACS (Recommended)

1. Open **HACS** in your Home Assistant instance.
2. Click the three dots in the top-right corner -> **Custom repositories**.
3. Add this repository:
   - **Repository**: `https://github.com/JarydX/ha-subscriptionmanager`
   - **Type**: `Integration`
4. Search for **Subscription Manager** and click **Download**.
5. Restart Home Assistant.

### Manual Installation

1. Download the repository as a ZIP archive.
2. Copy the folder `custom_components/subscription_manager` into your Home Assistant directory under `/config/custom_components/`.
3. Restart Home Assistant.

---

## ⚙️ Setup in Home Assistant

1. In Home Assistant, navigate to **Settings -> Devices & Services**.
2. Click **Add Integration** and search for **Subscription Manager**.
3. Click **Submit** to initialize the integration as a central hub.
   - **Note**: The integration is neatly organized under **Integrations** (not under Helpers).
4. On the integration tile, click **Configure**:
   - ➕ **Add subscription**: Create a new subscription (name, cost, currency, billing interval, start date, payment method, optional notice period & end date).
   - ✏️ **Edit subscription**: Update existing subscription details.
   - 🗑️ **Delete subscription**: Remove a subscription (all related sensors and device entities will be cleanly removed).
5. Every configured subscription automatically receives its own virtual device with all associated sensors in Home Assistant.

---

## 📊 Dashboard Widgets (`subscription-manager-card` & `subscription-report-card`)

The dashboard cards are provided as a bundled **HACS Frontend Plugin**:

### 1. Install Cards via HACS (Recommended)

1. Open **HACS** in Home Assistant -> **Frontend** (or Dashboards).
2. Click the three dots in the top-right corner -> **Custom repositories**.
3. Enter:
   - **Repository**: `https://github.com/JarydX/ha-subscriptionmanager-card`
   - **Type**: `Lovelace` (or Dashboard)
4. Search for **Subscription Manager Card** and click **Download**.
5. HACS automatically registers the card under Dashboards -> Resources. The bundle includes both cards!

---

### 2. Overview Card: `custom:subscription-manager-card`

In your dashboard, click **+ Add Card**, search for **Subscription Manager Card** (or configure via YAML):

```yaml
type: custom:subscription-manager-card
title: My Subscriptions
# Optional: Filter by specific categories
categories:
  - streaming
  - software
# Optional: Monthly budget in your currency
budget: 150
show_summary: true
show_sorting: true
show_categories: true
show_cashflow: true
```

#### Configuration Options:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `title` | string | `'Subscriptions'` | Title of the Lovelace card |
| `categories` | list | `[]` | Filter by pre-selected categories (e.g. `['streaming', 'software']`) |
| `budget` | number | `null` | Monthly budget with visual utilization bar |
| `show_summary` | boolean | `true` | Shows monthly/yearly total and subscription count at the top |
| `show_sorting` | boolean | `true` | Shows sort toggle buttons (Due date, Notice deadline, Cost, Name) |
| `show_categories` | boolean | `true` | Shows interactive category filter chips |
| `show_cashflow` | boolean | `true` | Shows remaining upcoming payments for the current month |
| `entity` | string | `sensor.subscriptions_overview_summary` | Optional: Custom summary entity |

---

### 3. Donut Report Card: `custom:subscription-report-card`

Interactive SVG donut chart for analyzing expense distribution:

```yaml
type: custom:subscription-report-card
title: Expense Distribution
default_period: month # 'month' or 'year'
default_group_by: category # 'category' or 'payment_method'
show_period_toggle: true
show_group_toggle: true
show_legend: true
```

---

## 🔔 Setting Up Notifications (Blueprint)

A ready-to-use Home Assistant automation blueprint is included in `blueprints/automation/subscription_reminder.yaml`.

1. In Home Assistant, go to **Settings -> Automations & Scenes -> Blueprints**.
2. Click **Import Blueprint** and enter the path to the blueprint file or its GitHub URL.
3. Create an automation from the blueprint:
   - Select your smartphone as the **Notification Device**.
4. Done! You will now receive automatic notifications:
   - When a cancellation deadline is approaching.
   - Ahead of upcoming renewals/billings, including cost and payment method.

---

## 🧩 Generated Entities

Per subscription (device):
- `sensor.<name>_next_payment`: Next payment date (`date`)
- `sensor.<name>_days_until_renewal`: Days remaining until renewal (`measurement`, days)
- `sensor.<name>_cost`: Amount per billing interval (`monetary`)
- `sensor.<name>_monthly_cost`: Normalized monthly cost for budgeting (`monetary`)
- `sensor.<name>_payment_method`: Payment method (PayPal, Credit Card, etc.)
- `sensor.<name>_cancellation_deadline`: *(if configured)* Cancellation deadline date (`date`)
- `sensor.<name>_days_until_cancellation`: *(if configured)* Days remaining until cancellation deadline
- `binary_sensor.<name>_renewal_due`: `on` if renewal or cancellation deadline falls within the warning period

Global summary:
- `sensor.subscriptions_total_monthly_cost`: Total monthly cost across all contracts
- `sensor.subscriptions_total_yearly_cost`: Total yearly projected cost
- `sensor.subscriptions_active_count`: Count of active subscriptions
- `sensor.subscriptions_summary`: Full data payload for the Lovelace widgets

---

## 🧪 Tests

```bash
python3 -m unittest discover tests
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
