/**
 * Subscription Manager Cards for Home Assistant Lovelace
 * 1. SubscriptionManagerCard (custom:subscription-manager-card)
 *    - Interactive list, sorting, pre-filtering by category, category chips, budget bar, cashflow forecast
 * 2. SubscriptionReportCard (custom:subscription-report-card)
 *    - Interactive SVG Donut chart, category breakdown, payment method breakdown, month/year toggle
 */

const CATEGORY_META = {
  streaming: { label: 'Streaming', color: '#9c27b0', icon: 'mdi:filmstrip' },
  software: { label: 'Software', color: '#1976d2', icon: 'mdi:laptop' },
  fitness: { label: 'Fitness', color: '#388e3c', icon: 'mdi:dumbbell' },
  insurance: { label: 'Versicherung', color: '#f57c00', icon: 'mdi:shield-check' },
  household: { label: 'Haushalt', color: '#0097a7', icon: 'mdi:home' },
  gaming: { label: 'Gaming', color: '#e91e63', icon: 'mdi:gamepad-variant' },
  news: { label: 'Nachrichten', color: '#546e7a', icon: 'mdi:newspaper' },
  other: { label: 'Sonstige', color: '#795548', icon: 'mdi:tag' },
};

const PAYMENT_META = {
  paypal: { label: 'PayPal', color: '#003087', icon: 'mdi:credit-card-outline' },
  credit_card: { label: 'Kreditkarte', color: '#0288d1', icon: 'mdi:credit-card' },
  sepa: { label: 'SEPA-Lastschrift', color: '#2e7d32', icon: 'mdi:bank' },
  apple_pay: { label: 'Apple Pay', color: '#424242', icon: 'mdi:apple' },
  google_pay: { label: 'Google Pay', color: '#ea4335', icon: 'mdi:google' },
  bank_transfer: { label: 'Überweisung', color: '#00796b', icon: 'mdi:bank-transfer' },
  invoice: { label: 'Rechnung', color: '#5d4037', icon: 'mdi:receipt' },
  other: { label: 'Sonstige', color: '#616161', icon: 'mdi:cash' },
};

function formatCurrency(val, currency = 'EUR') {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  const num = parseFloat(val) || 0;
  return `${num.toFixed(2).replace('.', ',')} ${symbol}`;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'unknown' || dateStr === 'unavailable') return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getSubscriptionsFromHass(hass, configuredEntity) {
  if (!hass || !hass.states) {
    return { subscriptions: [], totalMonthly: 0, totalYearly: 0, count: 0 };
  }

  // 1. Explicit entity
  if (configuredEntity && hass.states[configuredEntity]) {
    const ent = hass.states[configuredEntity];
    if (ent.attributes && Array.isArray(ent.attributes.subscriptions)) {
      return {
        subscriptions: ent.attributes.subscriptions,
        totalMonthly: ent.attributes.total_monthly_cost || 0,
        totalYearly: ent.attributes.total_yearly_cost || 0,
        count: ent.attributes.count || ent.attributes.subscriptions.length,
      };
    }
  }

  // 2. Auto-discover state providing subscriptions attribute
  for (const key in hass.states) {
    const s = hass.states[key];
    if (s && s.attributes && Array.isArray(s.attributes.subscriptions)) {
      return {
        subscriptions: s.attributes.subscriptions,
        totalMonthly: s.attributes.total_monthly_cost || 0,
        totalYearly: s.attributes.total_yearly_cost || 0,
        count: s.attributes.count || s.attributes.subscriptions.length,
      };
    }
  }

  // 3. Fallback scan individual sensors
  const subs = [];
  let totalMonthly = 0;
  let totalYearly = 0;

  for (const key in hass.states) {
    if (
      key.startsWith('sensor.') &&
      (key.endsWith('_cost') || key.endsWith('_kosten')) &&
      !key.includes('total_') &&
      !key.includes('monthly_')
    ) {
      const costState = hass.states[key];
      const baseName = key.replace('sensor.', '').replace(/_(cost|kosten)$/, '');
      const nextPay = hass.states[`sensor.${baseName}_next_payment`] || hass.states[`sensor.${baseName}_nachste_abrechnung`];
      const days = hass.states[`sensor.${baseName}_days_until_renewal`] || hass.states[`sensor.${baseName}_tage_bis_abrechnung`];
      const monthly = hass.states[`sensor.${baseName}_monthly_cost`] || hass.states[`sensor.${baseName}_monatliche_kosten`];
      const method = hass.states[`sensor.${baseName}_payment_method`] || hass.states[`sensor.${baseName}_zahlungsmethode`];
      const cancel = hass.states[`sensor.${baseName}_cancellation_deadline`] || hass.states[`sensor.${baseName}_kundigungsfrist_stichtag`];
      const daysCancel = hass.states[`sensor.${baseName}_days_until_cancellation`] || hass.states[`sensor.${baseName}_tage_bis_kundigungsfrist`];
      const alert = hass.states[`binary_sensor.${baseName}_renewal_due`] || hass.states[`binary_sensor.${baseName}_ablauf_kundigung_anstehend`];

      if (costState) {
        const cost = parseFloat(costState.state) || 0;
        const monthlyCost = monthly ? parseFloat(monthly.state) : cost;
        totalMonthly += monthlyCost;
        totalYearly += monthlyCost * 12;

        subs.push({
          name: costState.attributes?.friendly_name ? costState.attributes.friendly_name.replace(/ (Kosten|Cost)$/, '') : baseName,
          cost,
          currency: costState.attributes?.unit_of_measurement || 'EUR',
          monthly_cost: monthlyCost,
          yearly_cost: monthlyCost * 12,
          next_payment: nextPay?.state || null,
          days_until_renewal: days ? parseInt(days.state, 10) : null,
          payment_method: method?.state || 'other',
          category: 'other',
          cancellation_deadline: cancel?.state || null,
          days_until_cancellation: daysCancel ? parseInt(daysCancel.state, 10) : null,
          alert_active: alert?.state === 'on',
          entity_id: key,
        });
      }
    }
  }

  return {
    subscriptions: subs,
    totalMonthly: Math.round(totalMonthly * 100) / 100,
    totalYearly: Math.round(totalYearly * 100) / 100,
    count: subs.length,
  };
}

// ============================================================================
// 1. SubscriptionManagerCard
// ============================================================================

class SubscriptionManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sortBy = 'due';
    this._sortAsc = true;
    this._selectedCategory = 'all';
    this._config = {
      title: 'Abonnements',
      show_summary: true,
      show_sorting: true,
      show_categories: true,
      show_cashflow: true,
      entities: [],
    };
    this._lastSerialized = '';
  }

  static async getConfigElement() {
    return document.createElement('subscription-manager-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'Abonnements',
      show_summary: true,
      show_sorting: true,
      show_categories: true,
      show_cashflow: true,
      entities: [],
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Ungültige Konfiguration');
    }
    this._config = {
      title: config.title !== undefined ? config.title : 'Abonnements',
      entity: config.entity,
      entities: config.entities || [],
      categories: Array.isArray(config.categories) ? config.categories : (config.category ? [config.category] : null),
      show_summary: config.show_summary !== false,
      show_sorting: config.show_sorting !== false,
      show_categories: config.show_categories !== false,
      show_cashflow: config.show_cashflow !== false,
      budget: config.budget !== undefined && config.budget !== '' ? parseFloat(config.budget) : null,
      ...config,
    };
    this._lastSerialized = '';
    if (this._hass) {
      this._updateView();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._updateView();
  }

  _updateView() {
    if (!this._hass) return;

    const data = getSubscriptionsFromHass(this._hass, this._config.entity);
    const serialized = JSON.stringify({
      subs: data.subscriptions,
      sort: this._sortBy,
      asc: this._sortAsc,
      cat: this._selectedCategory,
      cfgCat: this._config.categories,
      title: this._config.title,
      summary: this._config.show_summary,
      sorting: this._config.show_sorting,
      showCats: this._config.show_categories,
      cashflow: this._config.show_cashflow,
      budget: this._config.budget,
    });

    if (this._lastSerialized === serialized) {
      return;
    }
    this._lastSerialized = serialized;
    this._render(data);
  }

  _filterAndSort(rawSubs) {
    let list = [...rawSubs];

    // 1. Configured pre-filter categories
    if (this._config.categories && this._config.categories.length > 0) {
      const allowed = this._config.categories.map((c) => c.toLowerCase());
      list = list.filter((s) => allowed.includes((s.category || 'other').toLowerCase()));
    }

    // 2. Interactive user-selected category chip
    if (this._selectedCategory && this._selectedCategory !== 'all') {
      list = list.filter((s) => (s.category || 'other').toLowerCase() === this._selectedCategory.toLowerCase());
    }

    // 3. Sorting
    list.sort((a, b) => {
      let valA, valB;
      if (this._sortBy === 'cost') {
        valA = a.monthly_cost !== undefined ? a.monthly_cost : a.cost;
        valB = b.monthly_cost !== undefined ? b.monthly_cost : b.cost;
        return this._sortAsc ? valB - valA : valA - valB;
      }
      if (this._sortBy === 'notice') {
        valA = a.days_until_cancellation !== null && a.days_until_cancellation !== undefined ? a.days_until_cancellation : 99999;
        valB = b.days_until_cancellation !== null && b.days_until_cancellation !== undefined ? b.days_until_cancellation : 99999;
      } else if (this._sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        return this._sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        valA = a.days_until_renewal !== null && a.days_until_renewal !== undefined ? a.days_until_renewal : 99999;
        valB = b.days_until_renewal !== null && b.days_until_renewal !== undefined ? b.days_until_renewal : 99999;
      }

      if (valA < valB) return this._sortAsc ? -1 : 1;
      if (valA > valB) return this._sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }

  _openMoreInfo(entityId) {
    if (!entityId || !this._hass) return;
    const event = new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  _render(data) {
    const allSubs = data.subscriptions || [];
    const filteredSubs = this._filterAndSort(allSubs);

    // Dynamic metrics for the filtered view
    let activeMonthly = 0;
    let activeYearly = 0;
    let activeCount = 0;

    // Cashflow this month
    const now = new Date();
    const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    let cashflowRemaining = 0;
    let cashflowCount = 0;

    filteredSubs.forEach((sub) => {
      if (!sub.is_expired) {
        activeMonthly += sub.monthly_cost || 0;
        activeYearly += sub.yearly_cost || (sub.monthly_cost ? sub.monthly_cost * 12 : 0);
        activeCount += 1;

        if (sub.days_until_renewal !== null && sub.days_until_renewal >= 0 && sub.days_until_renewal <= daysLeftInMonth) {
          cashflowRemaining += sub.cost || 0;
          cashflowCount += 1;
        }
      }
    });

    activeMonthly = Math.round(activeMonthly * 100) / 100;
    activeYearly = Math.round(activeYearly * 100) / 100;

    // Unique categories available across currently configured/allowed subscriptions
    const availableCategories = Array.from(
      new Set(
        allSubs
          .filter((s) => {
            if (!this._config.categories || this._config.categories.length === 0) return true;
            return this._config.categories.includes((s.category || 'other').toLowerCase());
          })
          .map((s) => (s.category || 'other').toLowerCase())
      )
    );

    // Budget progress
    let budgetHtml = '';
    if (this._config.budget && this._config.budget > 0) {
      const pct = Math.min(Math.round((activeMonthly / this._config.budget) * 100), 100);
      let colorClass = 'bar-green';
      if (pct >= 100) colorClass = 'bar-red';
      else if (pct >= 80) colorClass = 'bar-yellow';

      budgetHtml = `
        <div class="budget-container">
          <div class="budget-header">
            <span>Budget: ${formatCurrency(activeMonthly)} von ${formatCurrency(this._config.budget)}</span>
            <span>${pct}%</span>
          </div>
          <div class="budget-bar">
            <div class="budget-fill ${colorClass}" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }

    // Cashflow subtitle
    let cashflowHtml = '';
    if (this._config.show_cashflow && cashflowCount > 0) {
      cashflowHtml = `
        <div class="cashflow-hint">
          <ha-icon icon="mdi:calendar-arrow-right" class="cashflow-icon"></ha-icon>
          Im restlichen Monat noch fällig: <b>${formatCurrency(cashflowRemaining)}</b> (${cashflowCount} ${cashflowCount === 1 ? 'Zahlung' : 'Zahlungen'})
        </div>
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          display: block;
          padding: 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,0.1));
          background: var(--ha-card-background, var(--card-background-color, #ffffff));
          color: var(--primary-text-color, #212121);
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          box-sizing: border-box;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .summary-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .summary-box {
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.08));
          border-radius: 8px;
          padding: 10px 6px;
          text-align: center;
        }
        .summary-label {
          font-size: 0.72rem;
          color: var(--secondary-text-color, #757575);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--primary-color, #03a9f4);
          white-space: nowrap;
        }
        .budget-container {
          margin-bottom: 12px;
        }
        .budget-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: var(--secondary-text-color, #757575);
          margin-bottom: 4px;
        }
        .budget-bar {
          height: 6px;
          background: var(--divider-color, rgba(125, 125, 125, 0.2));
          border-radius: 3px;
          overflow: hidden;
        }
        .budget-fill {
          height: 100%;
          transition: width 0.4s ease;
        }
        .bar-green { background: #4caf50; }
        .bar-yellow { background: #ff9800; }
        .bar-red { background: #f44336; }
        .cashflow-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--secondary-text-color, #666);
          margin-bottom: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          background: rgba(3, 169, 244, 0.08);
        }
        .cashflow-icon {
          --mdc-icon-size: 16px;
          color: var(--primary-color, #03a9f4);
        }
        .controls-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 10px;
        }
        .control-label {
          font-size: 0.78rem;
          color: var(--secondary-text-color, #757575);
          margin-right: 2px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 14px;
          font-size: 0.75rem;
          cursor: pointer;
          border: 1px solid var(--divider-color, rgba(125, 125, 125, 0.25));
          background: transparent;
          color: var(--primary-text-color);
          transition: all 0.15s ease;
          user-select: none;
        }
        .chip:hover {
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.1));
        }
        .chip.active {
          background: var(--primary-color, #03a9f4);
          color: #ffffff;
          border-color: var(--primary-color, #03a9f4);
          font-weight: 500;
        }
        .divider {
          height: 1px;
          background: var(--divider-color, rgba(125, 125, 125, 0.15));
          margin: 8px 0 12px 0;
        }
        .sub-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sub-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 8px;
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.05));
          border: 1px solid var(--divider-color, rgba(125, 125, 125, 0.15));
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .sub-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 5px rgba(0,0,0,0.08);
        }
        .sub-item.alert-active {
          border-left: 4px solid var(--error-color, #f44336);
        }
        .sub-item.sub-cancelled {
          opacity: 0.92;
          border-left: 3px solid #ff9800;
        }
        .sub-item.sub-expired {
          opacity: 0.65;
          border-left: 3px solid #9e9e9e;
        }
        .sub-main {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .sub-name {
          font-weight: 600;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sub-info {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          color: var(--secondary-text-color, #666);
        }
        .badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.72rem;
          font-weight: 500;
        }
        .badge-green {
          background: rgba(76, 175, 80, 0.15);
          color: var(--success-color, #2e7d32);
        }
        .badge-yellow {
          background: rgba(255, 152, 0, 0.18);
          color: var(--warning-color, #e65100);
        }
        .badge-red {
          background: rgba(244, 67, 54, 0.18);
          color: var(--error-color, #c62828);
        }
        .badge-cancelled {
          background: rgba(244, 67, 54, 0.12);
          color: #d32f2f;
          font-weight: 600;
          border: 1px solid rgba(244, 67, 54, 0.3);
        }
        .badge-cancelled-date {
          background: rgba(255, 152, 0, 0.15);
          color: #e65100;
        }
        .badge-expired {
          background: rgba(158, 158, 158, 0.2);
          color: #757575;
        }
        .badge-method {
          background: var(--card-background-color, rgba(125, 125, 125, 0.1));
          color: var(--secondary-text-color, #555);
          border: 1px solid var(--divider-color, rgba(125, 125, 125, 0.2));
        }
        .badge-category {
          background: rgba(156, 39, 176, 0.1);
          color: #9c27b0;
        }
        .sub-cost-box {
          text-align: right;
          min-width: 85px;
        }
        .sub-cost {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--primary-text-color);
        }
        .cost-cancelled {
          color: var(--secondary-text-color, #757575);
        }
        .sub-interval {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
        }
        .empty-state {
          text-align: center;
          padding: 24px 16px;
          color: var(--secondary-text-color);
          font-size: 0.88rem;
          line-height: 1.4;
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="title">${this._config.title}</div>
        </div>

        ${
          this._config.show_summary
            ? `
          <div class="summary-bar">
            <div class="summary-box">
              <div class="summary-label">Monatlich</div>
              <div class="summary-value">${formatCurrency(activeMonthly)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">Jährlich</div>
              <div class="summary-value">${formatCurrency(activeYearly)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">Aktiv</div>
              <div class="summary-value">${activeCount}</div>
            </div>
          </div>
        `
            : ''
        }

        ${budgetHtml}
        ${cashflowHtml}

        ${
          this._config.show_categories && availableCategories.length > 1
            ? `
          <div class="controls-row">
            <span class="control-label">Kategorie:</span>
            <div class="chip ${this._selectedCategory === 'all' ? 'active' : ''}" data-cat="all">
              Alle
            </div>
            ${availableCategories
              .map((c) => {
                const meta = CATEGORY_META[c] || { label: c };
                return `
                <div class="chip ${this._selectedCategory === c ? 'active' : ''}" data-cat="${c}">
                  ${meta.label}
                </div>
              `;
              })
              .join('')}
          </div>
        `
            : ''
        }

        ${
          this._config.show_sorting && filteredSubs.length > 1
            ? `
          <div class="controls-row">
            <span class="control-label">Sortieren:</span>
            <div class="chip ${this._sortBy === 'due' ? 'active' : ''}" data-sort="due">Fälligkeit</div>
            <div class="chip ${this._sortBy === 'notice' ? 'active' : ''}" data-sort="notice">Kündigungsfrist</div>
            <div class="chip ${this._sortBy === 'cost' ? 'active' : ''}" data-sort="cost">Kosten</div>
            <div class="chip ${this._sortBy === 'name' ? 'active' : ''}" data-sort="name">Name</div>
          </div>
        `
            : ''
        }

        ${
          (this._config.show_categories && availableCategories.length > 1) ||
          (this._config.show_sorting && filteredSubs.length > 1)
            ? '<div class="divider"></div>'
            : ''
        }

        <div class="sub-list">
          ${
            filteredSubs.length === 0
              ? `
            <div class="empty-state">
              Keine passenden Abonnements gefunden.<br>
              ${this._selectedCategory !== 'all' ? 'Versuche die Filter-Auswahl zurückzusetzen.' : 'Füge Abos über <i>Einstellungen -> Geräte & Dienste -> Subscription Manager</i> hinzu.'}
            </div>
          `
              : filteredSubs
                  .map((sub) => {
                    const isCancelled = sub.is_cancelled || sub.auto_renew === false;
                    const isExpired = sub.is_expired;
                    const daysRenewal = sub.days_until_renewal;
                    const daysNotice = sub.days_until_cancellation;
                    const daysEnd = sub.days_until_end;
                    const endDate = sub.end_date || sub.contract_end_date;

                    let statusBadge = '';
                    let timingInfo = '';
                    let intervalText = sub.billing_interval || 'monatlich';

                    const catMeta = CATEGORY_META[(sub.category || '').toLowerCase()];
                    const catBadge = catMeta ? `<span class="badge badge-category">${catMeta.label}</span>` : '';

                    if (isExpired) {
                      statusBadge = '<span class="badge badge-expired">Beendet</span>';
                      timingInfo = `<span class="badge badge-expired">Abgelaufen am: ${formatDate(endDate)}</span>`;
                      intervalText = 'abgelaufen';
                    } else if (isCancelled) {
                      statusBadge = '<span class="badge badge-cancelled">Gekündigt</span>';
                      const endStr = endDate ? formatDate(endDate) : 'unbekannt';
                      const daysStr = daysEnd !== null && daysEnd !== undefined ? `(${daysEnd}d)` : '';
                      timingInfo = `
                        <span class="badge badge-cancelled-date">
                          Endet am: ${endStr} ${daysStr}
                        </span>
                      `;
                      if (sub.next_payment && endDate && sub.next_payment < endDate) {
                        timingInfo += `
                          <span class="badge badge-method">
                            Letzter Zahltag: ${formatDate(sub.next_payment)}
                          </span>
                        `;
                      }
                      intervalText = 'bis Vertragsende';
                    } else {
                      let renewalBadgeClass = 'badge-green';
                      if (daysRenewal !== null && daysRenewal !== undefined) {
                        if (daysRenewal <= 3) renewalBadgeClass = 'badge-red';
                        else if (daysRenewal <= 7) renewalBadgeClass = 'badge-yellow';
                      }

                      timingInfo = `
                        <span class="badge ${renewalBadgeClass}">
                          Zahltag: ${formatDate(sub.next_payment)} 
                          ${daysRenewal !== null && daysRenewal !== undefined ? `(${daysRenewal}d)` : ''}
                        </span>
                        ${
                          daysNotice !== null && daysNotice !== undefined
                            ? `
                          <span class="badge ${daysNotice <= 7 ? 'badge-red' : 'badge-yellow'}">
                            Kündigen bis: ${formatDate(sub.cancellation_deadline)} (${daysNotice}d)
                          </span>
                        `
                            : ''
                        }
                      `;
                    }

                    return `
              <div class="sub-item ${sub.alert_active ? 'alert-active' : ''} ${isExpired ? 'sub-expired' : (isCancelled ? 'sub-cancelled' : '')}" data-entity="${sub.entity_id || ''}">
                <div class="sub-main">
                  <div class="sub-name">
                    <span>${sub.name}</span>
                    ${statusBadge}
                    ${catBadge}
                    <span class="badge badge-method">${sub.payment_method || 'Zahlung'}</span>
                  </div>
                  <div class="sub-info">
                    ${timingInfo}
                  </div>
                </div>
                <div class="sub-cost-box">
                  <div class="sub-cost ${isCancelled || isExpired ? 'cost-cancelled' : ''}">${formatCurrency(sub.cost, sub.currency)}</div>
                  <div class="sub-interval">${intervalText}</div>
                </div>
              </div>
            `;
                  })
                  .join('')
          }
        </div>
      </ha-card>
    `;

    // Event listeners: category chips
    this.shadowRoot.querySelectorAll('.chip[data-cat]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-cat');
        this._selectedCategory = cat;
        this._lastSerialized = '';
        this._updateView();
      });
    });

    // Event listeners: sort chips
    this.shadowRoot.querySelectorAll('.chip[data-sort]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const sortKey = e.currentTarget.getAttribute('data-sort');
        if (this._sortBy === sortKey) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortBy = sortKey;
          this._sortAsc = sortKey === 'cost' ? false : true;
        }
        this._lastSerialized = '';
        this._updateView();
      });
    });

    // Event listeners: more-info modal
    this.shadowRoot.querySelectorAll('.sub-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const entityId = e.currentTarget.getAttribute('data-entity');
        if (entityId) {
          this._openMoreInfo(entityId);
        }
      });
    });
  }

  getCardSize() {
    return 4;
  }
}

// ============================================================================
// 1b. SubscriptionManagerCardEditor
// ============================================================================

class SubscriptionManagerCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    const catStr = Array.isArray(this._config.categories)
      ? this._config.categories.join(', ')
      : (this._config.category || '');

    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 8px 0;
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
        }
        .config-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 0;
        }
        .config-label {
          font-size: 0.95rem;
          color: var(--primary-text-color);
        }
        ha-textfield {
          width: 100%;
        }
      </style>
      <div class="card-config">
        <ha-textfield
          label="Kartentitel"
          .value="${this._config.title || 'Abonnements'}"
          config-value="title"
        ></ha-textfield>
        <ha-textfield
          label="Kategorien-Vorabfilter (z. B. streaming, software)"
          .value="${catStr}"
          config-value="categories"
          helper="Kommagetrennt angeben, um nur bestimmte Kategorien anzuzeigen. Leer lassen für alle."
        ></ha-textfield>
        <ha-textfield
          label="Monatliches Budget-Limit (optional, z. B. 150)"
          type="number"
          .value="${this._config.budget || ''}"
          config-value="budget"
          helper="Zeigt einen Fortschrittsbalken gegen deine monatlichen Gesamtkosten."
        ></ha-textfield>
        <div class="config-row">
          <span class="config-label">Kosten-Zusammenfassung oben anzeigen</span>
          <ha-switch
            .checked="${this._config.show_summary !== false}"
            config-value="show_summary"
          ></ha-switch>
        </div>
        <div class="config-row">
          <span class="config-label">Kategorie-Filterleiste anzeigen</span>
          <ha-switch
            .checked="${this._config.show_categories !== false}"
            config-value="show_categories"
          ></ha-switch>
        </div>
        <div class="config-row">
          <span class="config-label">Sortier-Leiste anzeigen</span>
          <ha-switch
            .checked="${this._config.show_sorting !== false}"
            config-value="show_sorting"
          ></ha-switch>
        </div>
        <div class="config-row">
          <span class="config-label">Monats-Restfälligkeiten (Cashflow) anzeigen</span>
          <ha-switch
            .checked="${this._config.show_cashflow !== false}"
            config-value="show_cashflow"
          ></ha-switch>
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('ha-textfield').forEach((tf) => {
      tf.addEventListener('input', (e) => {
        const key = e.target.getAttribute('config-value');
        let val = e.target.value;
        if (key === 'categories') {
          val = val ? val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
        } else if (key === 'budget') {
          val = val ? parseFloat(val) : null;
        }
        this._valueChanged(key, val);
      });
    });

    this.shadowRoot.querySelectorAll('ha-switch').forEach((sw) => {
      sw.addEventListener('change', (e) => {
        const key = e.target.getAttribute('config-value');
        this._valueChanged(key, e.target.checked);
      });
    });
  }

  _valueChanged(key, value) {
    if (!this._config) return;
    this._config = {
      ...this._config,
      [key]: value,
    };
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// ============================================================================
// 2. SubscriptionReportCard (Donut Chart Widget)
// ============================================================================

class SubscriptionReportCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._period = 'monthly'; // 'monthly' | 'yearly'
    this._groupBy = 'category'; // 'category' | 'payment_method'
    this._hoveredKey = null;
    this._config = {
      title: 'Ausgaben-Report',
      default_period: 'monthly',
      default_group_by: 'category',
      show_period_toggle: true,
      show_group_toggle: true,
      show_legend: true,
      entities: [],
    };
    this._lastSerialized = '';
  }

  static async getConfigElement() {
    return document.createElement('subscription-report-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'Ausgaben-Report',
      default_period: 'monthly',
      default_group_by: 'category',
      show_period_toggle: true,
      show_group_toggle: true,
      show_legend: true,
      entities: [],
    };
  }

  setConfig(config) {
    if (!config) throw new Error('Ungültige Konfiguration');
    this._config = {
      title: config.title !== undefined ? config.title : 'Ausgaben-Report',
      entity: config.entity,
      entities: config.entities || [],
      default_period: config.default_period || 'monthly',
      default_group_by: config.default_group_by || 'category',
      show_period_toggle: config.show_period_toggle !== false,
      show_group_toggle: config.show_group_toggle !== false,
      show_legend: config.show_legend !== false,
      categories: Array.isArray(config.categories) ? config.categories : (config.category ? [config.category] : null),
      ...config,
    };
    this._period = this._config.default_period;
    this._groupBy = this._config.default_group_by;
    this._lastSerialized = '';
    if (this._hass) this._updateView();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateView();
  }

  _updateView() {
    if (!this._hass) return;
    const data = getSubscriptionsFromHass(this._hass, this._config.entity);
    const serialized = JSON.stringify({
      subs: data.subscriptions,
      period: this._period,
      groupBy: this._groupBy,
      hovered: this._hoveredKey,
      title: this._config.title,
      periodToggle: this._config.show_period_toggle,
      groupToggle: this._config.show_group_toggle,
      legend: this._config.show_legend,
      categories: this._config.categories,
    });
    if (this._lastSerialized === serialized) return;
    this._lastSerialized = serialized;
    this._render(data);
  }

  _render(data) {
    let subs = (data.subscriptions || []).filter((s) => !s.is_expired);

    if (this._config.categories && this._config.categories.length > 0) {
      const allowed = this._config.categories.map((c) => c.toLowerCase());
      subs = subs.filter((s) => allowed.includes((s.category || 'other').toLowerCase()));
    }

    // Grouping
    const groups = {};
    let totalSpend = 0;

    subs.forEach((s) => {
      const cost = this._period === 'yearly'
        ? (s.yearly_cost || (s.monthly_cost ? s.monthly_cost * 12 : 0))
        : (s.monthly_cost || 0);

      const groupKey = this._groupBy === 'payment_method'
        ? (s.payment_method || 'other').toLowerCase()
        : (s.category || 'other').toLowerCase();

      if (!groups[groupKey]) {
        const meta = this._groupBy === 'payment_method'
          ? (PAYMENT_META[groupKey] || { label: groupKey, color: '#607d8b', icon: 'mdi:cash' })
          : (CATEGORY_META[groupKey] || { label: groupKey, color: '#607d8b', icon: 'mdi:tag' });

        groups[groupKey] = {
          key: groupKey,
          label: meta.label,
          color: meta.color,
          icon: meta.icon,
          cost: 0,
          count: 0,
        };
      }

      groups[groupKey].cost += cost;
      groups[groupKey].count += 1;
      totalSpend += cost;
    });

    totalSpend = Math.round(totalSpend * 100) / 100;
    const sortedGroups = Object.values(groups).sort((a, b) => b.cost - a.cost);

    // SVG Donut calculations
    const radius = 68;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius; // ~427.26
    let accumulatedOffset = 0;

    const slices = sortedGroups.map((g) => {
      const pct = totalSpend > 0 ? (g.cost / totalSpend) * 100 : 0;
      const strokeDash = (pct / 100) * circumference;
      const strokeGap = circumference - strokeDash;
      const offset = -accumulatedOffset;
      accumulatedOffset += strokeDash;

      const isHovered = this._hoveredKey === g.key;

      return {
        ...g,
        pct: Math.round(pct * 10) / 10,
        strokeDash,
        strokeGap,
        offset,
        isHovered,
      };
    });

    // Center display
    let centerValue = formatCurrency(totalSpend);
    let centerLabel = this._period === 'yearly' ? 'Gesamt / Jahr' : 'Gesamt / Monat';
    if (this._hoveredKey) {
      const hg = sortedGroups.find((g) => g.key === this._hoveredKey);
      if (hg) {
        centerValue = formatCurrency(hg.cost);
        centerLabel = `${hg.label} (${hg.count} Abos)`;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          display: block;
          padding: 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,0.1));
          background: var(--ha-card-background, var(--card-background-color, #ffffff));
          color: var(--primary-text-color, #212121);
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          box-sizing: border-box;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .title {
          font-size: 1.25rem;
          font-weight: 600;
        }
        .toggle-group {
          display: inline-flex;
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.1));
          border-radius: 8px;
          padding: 2px;
        }
        .toggle-btn {
          padding: 3px 9px;
          font-size: 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          color: var(--secondary-text-color);
          transition: all 0.15s ease;
          user-select: none;
        }
        .toggle-btn.active {
          background: var(--card-background-color, #ffffff);
          color: var(--primary-text-color);
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .chart-container {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 10px 0;
        }
        svg {
          width: 100%;
          max-width: 220px;
          height: auto;
          transform: rotate(-90deg);
        }
        .donut-slice {
          cursor: pointer;
          transition: stroke-width 0.2s ease, opacity 0.2s ease;
        }
        .donut-slice:hover, .donut-slice.hovered {
          stroke-width: 28px !important;
          opacity: 1 !important;
        }
        .center-text {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          pointer-events: none;
        }
        .center-val {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--primary-text-color);
          white-space: nowrap;
        }
        .center-lbl {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
        .legend-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 14px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s ease;
          border: 1px solid transparent;
        }
        .legend-item:hover, .legend-item.hovered {
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.08));
          border-color: var(--divider-color, rgba(125, 125, 125, 0.2));
        }
        .legend-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .legend-name {
          font-size: 0.88rem;
          font-weight: 500;
        }
        .legend-count {
          font-size: 0.75rem;
          color: var(--secondary-text-color);
        }
        .legend-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .legend-cost {
          font-size: 0.95rem;
          font-weight: 700;
        }
        .legend-pct {
          font-size: 0.75rem;
          padding: 2px 6px;
          border-radius: 10px;
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.1));
          color: var(--secondary-text-color);
          min-width: 38px;
          text-align: center;
        }
        .empty-chart {
          text-align: center;
          padding: 24px;
          color: var(--secondary-text-color);
          font-size: 0.9rem;
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="title">${this._config.title}</div>
          <div style="display: flex; gap: 6px;">
            ${
              this._config.show_group_toggle
                ? `
              <div class="toggle-group">
                <div class="toggle-btn ${this._groupBy === 'category' ? 'active' : ''}" data-group="category">Kategorien</div>
                <div class="toggle-btn ${this._groupBy === 'payment_method' ? 'active' : ''}" data-group="payment_method">Zahlung</div>
              </div>
            `
                : ''
            }
            ${
              this._config.show_period_toggle
                ? `
              <div class="toggle-group">
                <div class="toggle-btn ${this._period === 'monthly' ? 'active' : ''}" data-period="monthly">Monat</div>
                <div class="toggle-btn ${this._period === 'yearly' ? 'active' : ''}" data-period="yearly">Jahr</div>
              </div>
            `
                : ''
            }
          </div>
        </div>

        ${
          sortedGroups.length === 0
            ? `
          <div class="empty-chart">
            Keine Daten zur Auswertung vorhanden.<br>
            Erfasse Abonnements unter <i>Einstellungen -> Geräte & Dienste -> Subscription Manager</i>.
          </div>
        `
            : `
          <div class="chart-container">
            <svg viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="${radius}"
                fill="none"
                stroke="var(--divider-color, rgba(125, 125, 125, 0.15))"
                stroke-width="${strokeWidth}"
              />
              ${slices
                .map(
                  (s) => `
                <circle
                  cx="100"
                  cy="100"
                  r="${radius}"
                  fill="none"
                  stroke="${s.color}"
                  stroke-width="${strokeWidth}"
                  stroke-dasharray="${s.strokeDash} ${s.strokeGap}"
                  stroke-dashoffset="${s.offset}"
                  class="donut-slice ${s.isHovered ? 'hovered' : ''}"
                  data-key="${s.key}"
                  style="opacity: ${this._hoveredKey && !s.isHovered ? 0.4 : 1};"
                />
              `
                )
                .join('')}
            </svg>
            <div class="center-text">
              <span class="center-val">${centerValue}</span>
              <span class="center-lbl">${centerLabel}</span>
            </div>
          </div>

          ${
            this._config.show_legend
              ? `
            <div class="legend-list">
              ${slices
                .map(
                  (s) => `
                <div class="legend-item ${s.isHovered ? 'hovered' : ''}" data-key="${s.key}">
                  <div class="legend-left">
                    <span class="dot" style="background: ${s.color};"></span>
                    <div>
                      <span class="legend-name">${s.label}</span>
                      <span class="legend-count">(${s.count} ${s.count === 1 ? 'Abo' : 'Abos'})</span>
                    </div>
                  </div>
                  <div class="legend-right">
                    <span class="legend-cost">${formatCurrency(s.cost)}</span>
                    <span class="legend-pct">${s.pct}%</span>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }
        `
        }
      </ha-card>
    `;

    // Toggle Period: Month / Year
    this.shadowRoot.querySelectorAll('.toggle-btn[data-period]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this._period = e.currentTarget.getAttribute('data-period');
        this._hoveredKey = null;
        this._lastSerialized = '';
        this._updateView();
      });
    });

    // Toggle Group: Category / Payment Method
    this.shadowRoot.querySelectorAll('.toggle-btn[data-group]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this._groupBy = e.currentTarget.getAttribute('data-group');
        this._hoveredKey = null;
        this._lastSerialized = '';
        this._updateView();
      });
    });

    // Hover / Click on Donut slices
    this.shadowRoot.querySelectorAll('.donut-slice').forEach((slice) => {
      slice.addEventListener('mouseenter', (e) => {
        this._hoveredKey = e.currentTarget.getAttribute('data-key');
        this._lastSerialized = '';
        this._updateView();
      });
      slice.addEventListener('mouseleave', () => {
        this._hoveredKey = null;
        this._lastSerialized = '';
        this._updateView();
      });
    });

    // Hover / Click on Legend items
    this.shadowRoot.querySelectorAll('.legend-item').forEach((item) => {
      item.addEventListener('mouseenter', (e) => {
        this._hoveredKey = e.currentTarget.getAttribute('data-key');
        this._lastSerialized = '';
        this._updateView();
      });
      item.addEventListener('mouseleave', () => {
        this._hoveredKey = null;
        this._lastSerialized = '';
        this._updateView();
      });
    });
  }

  getCardSize() {
    return 5;
  }
}

// ============================================================================
// 2b. SubscriptionReportCardEditor
// ============================================================================

class SubscriptionReportCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const catStr = Array.isArray(this._config.categories)
      ? this._config.categories.join(', ')
      : (this._config.category || '');

    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 8px 0;
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
        }
        .config-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 0;
        }
        .config-label {
          font-size: 0.95rem;
          color: var(--primary-text-color);
        }
        ha-textfield {
          width: 100%;
        }
      </style>
      <div class="card-config">
        <ha-textfield
          label="Kartentitel"
          .value="${this._config.title || 'Ausgaben-Report'}"
          config-value="title"
        ></ha-textfield>
        <ha-textfield
          label="Kategorien filtern (optional, z. B. streaming, software)"
          .value="${catStr}"
          config-value="categories"
          helper="Nur bestimmte Kategorien in das Diagramm einbeziehen."
        ></ha-textfield>
        <div class="config-row">
          <span class="config-label">Monat/Jahr-Umschalter anzeigen</span>
          <ha-switch
            .checked="${this._config.show_period_toggle !== false}"
            config-value="show_period_toggle"
          ></ha-switch>
        </div>
        <div class="config-row">
          <span class="config-label">Kategorie/Zahlung-Umschalter anzeigen</span>
          <ha-switch
            .checked="${this._config.show_group_toggle !== false}"
            config-value="show_group_toggle"
          ></ha-switch>
        </div>
        <div class="config-row">
          <span class="config-label">Legende unter dem Donut anzeigen</span>
          <ha-switch
            .checked="${this._config.show_legend !== false}"
            config-value="show_legend"
          ></ha-switch>
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('ha-textfield').forEach((tf) => {
      tf.addEventListener('input', (e) => {
        const key = e.target.getAttribute('config-value');
        let val = e.target.value;
        if (key === 'categories') {
          val = val ? val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
        }
        this._valueChanged(key, val);
      });
    });

    this.shadowRoot.querySelectorAll('ha-switch').forEach((sw) => {
      sw.addEventListener('change', (e) => {
        const key = e.target.getAttribute('config-value');
        this._valueChanged(key, e.target.checked);
      });
    });
  }

  _valueChanged(key, value) {
    if (!this._config) return;
    this._config = {
      ...this._config,
      [key]: value,
    };
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// ============================================================================
// Safe Element Registrations & Custom Card Pickers
// ============================================================================

// 1. Subscription Manager Card
if (!customElements.get('subscription-manager-card-editor')) {
  customElements.define('subscription-manager-card-editor', SubscriptionManagerCardEditor);
}
if (!customElements.get('subscription-manager-card')) {
  customElements.define('subscription-manager-card', SubscriptionManagerCard);
}

// 2. Subscription Report Card (Donut Chart)
if (!customElements.get('subscription-report-card-editor')) {
  customElements.define('subscription-report-card-editor', SubscriptionReportCardEditor);
}
if (!customElements.get('subscription-report-card')) {
  customElements.define('subscription-report-card', SubscriptionReportCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some((c) => c.type === 'subscription-manager-card')) {
  window.customCards.push({
    type: 'subscription-manager-card',
    name: 'Subscription Manager Card',
    description: 'Übersichtskarte für Abonnements mit Sortierung nach Kündigungsfrist, Kosten, Fälligkeit und Kategorie-Filter.',
    preview: true,
  });
}

if (!window.customCards.some((c) => c.type === 'subscription-report-card')) {
  window.customCards.push({
    type: 'subscription-report-card',
    name: 'Subscription Report Card',
    description: 'Interaktiver Ausgaben-Report mit Donut-Diagramm nach Kategorien und Zahlungsmethoden.',
    preview: true,
  });
}
