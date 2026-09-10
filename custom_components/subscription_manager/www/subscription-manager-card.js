/**
 * Subscription Manager Card for Home Assistant Lovelace
 * Displays all active subscriptions with interactive sorting (due date, notice period, cost)
 * and summary metrics.
 */

class SubscriptionManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sortBy = 'due'; // 'due', 'notice', 'cost', 'name'
    this._sortAsc = true;
    this._filterCategory = 'all';
    this._config = {
      title: 'Abonnements',
      show_summary: true,
      show_sorting: true,
    };
    this._lastSerialized = '';
  }

  static async getConfigElement() {
    return document.createElement('subscription-manager-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'Abonnements',
      entities: [],
      show_summary: true,
      show_sorting: true,
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
      show_summary: config.show_summary !== false,
      show_sorting: config.show_sorting !== false,
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

    const data = this._getSubscriptionsData();
    const serialized = JSON.stringify({
      subs: data.subscriptions,
      m: data.totalMonthly,
      y: data.totalYearly,
      c: data.count,
      sort: this._sortBy,
      asc: this._sortAsc,
      title: this._config.title,
      summary: this._config.show_summary,
      sorting: this._config.show_sorting,
    });

    if (this._lastSerialized === serialized) {
      return;
    }
    this._lastSerialized = serialized;
    this._render(data);
  }

  _getSubscriptionsData() {
    if (!this._hass || !this._hass.states) {
      return { subscriptions: [], totalMonthly: 0, totalYearly: 0, count: 0 };
    }

    // 1. Try explicit entity from config
    if (this._config.entity && this._hass.states[this._config.entity]) {
      const ent = this._hass.states[this._config.entity];
      if (ent.attributes && Array.isArray(ent.attributes.subscriptions)) {
        return {
          subscriptions: ent.attributes.subscriptions,
          totalMonthly: ent.attributes.total_monthly_cost || 0,
          totalYearly: ent.attributes.total_yearly_cost || 0,
          count: ent.attributes.count || ent.attributes.subscriptions.length,
        };
      }
    }

    // 2. Auto-discover any sensor providing subscriptions array attribute
    for (const key in this._hass.states) {
      const stateObj = this._hass.states[key];
      if (
        stateObj &&
        stateObj.attributes &&
        Array.isArray(stateObj.attributes.subscriptions)
      ) {
        return {
          subscriptions: stateObj.attributes.subscriptions,
          totalMonthly: stateObj.attributes.total_monthly_cost || 0,
          totalYearly: stateObj.attributes.total_yearly_cost || 0,
          count: stateObj.attributes.count || stateObj.attributes.subscriptions.length,
        };
      }
    }

    // 3. Fallback: discover individual sensors created by the integration
    const subs = [];
    let totalMonthly = 0;
    let totalYearly = 0;

    for (const key in this._hass.states) {
      if (
        key.startsWith('sensor.') &&
        (key.endsWith('_cost') || key.endsWith('_kosten')) &&
        !key.includes('total_') &&
        !key.includes('monthly_')
      ) {
        const costState = this._hass.states[key];
        const baseName = key.replace('sensor.', '').replace(/_(cost|kosten)$/, '');
        const nextPayState =
          this._hass.states[`sensor.${baseName}_next_payment`] ||
          this._hass.states[`sensor.${baseName}_nachste_abrechnung`];
        const daysState =
          this._hass.states[`sensor.${baseName}_days_until_renewal`] ||
          this._hass.states[`sensor.${baseName}_tage_bis_abrechnung`];
        const monthlyState =
          this._hass.states[`sensor.${baseName}_monthly_cost`] ||
          this._hass.states[`sensor.${baseName}_monatliche_kosten`];
        const methodState =
          this._hass.states[`sensor.${baseName}_payment_method`] ||
          this._hass.states[`sensor.${baseName}_zahlungsmethode`];
        const cancelState =
          this._hass.states[`sensor.${baseName}_cancellation_deadline`] ||
          this._hass.states[`sensor.${baseName}_kundigungsfrist_stichtag`];
        const daysCancelState =
          this._hass.states[`sensor.${baseName}_days_until_cancellation`] ||
          this._hass.states[`sensor.${baseName}_tage_bis_kundigungsfrist`];
        const alertState =
          this._hass.states[`binary_sensor.${baseName}_renewal_due`] ||
          this._hass.states[`binary_sensor.${baseName}_ablauf_kundigung_anstehend`];

        if (costState) {
          const cost = parseFloat(costState.state) || 0;
          const monthlyCost = monthlyState ? parseFloat(monthlyState.state) : cost;
          totalMonthly += monthlyCost;
          totalYearly += monthlyCost * 12;

          subs.push({
            name:
              costState.attributes && costState.attributes.friendly_name
                ? costState.attributes.friendly_name.replace(/ (Kosten|Cost)$/, '')
                : baseName,
            cost: cost,
            currency: costState.attributes.unit_of_measurement || 'EUR',
            monthly_cost: monthlyCost,
            next_payment: nextPayState ? nextPayState.state : null,
            days_until_renewal: daysState ? parseInt(daysState.state, 10) : null,
            payment_method: methodState ? methodState.state : 'other',
            cancellation_deadline: cancelState ? cancelState.state : null,
            days_until_cancellation: daysCancelState ? parseInt(daysCancelState.state, 10) : null,
            alert_active: alertState ? alertState.state === 'on' : false,
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

  _sortSubscriptions(subs) {
    const list = [...subs];

    list.sort((a, b) => {
      let valA, valB;
      if (this._sortBy === 'cost') {
        valA = a.monthly_cost !== undefined ? a.monthly_cost : a.cost;
        valB = b.monthly_cost !== undefined ? b.monthly_cost : b.cost;
        return this._sortAsc ? valB - valA : valA - valB;
      }
      if (this._sortBy === 'notice') {
        valA =
          a.days_until_cancellation !== null && a.days_until_cancellation !== undefined
            ? a.days_until_cancellation
            : 99999;
        valB =
          b.days_until_cancellation !== null && b.days_until_cancellation !== undefined
            ? b.days_until_cancellation
            : 99999;
      } else if (this._sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        return this._sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        // 'due'
        valA =
          a.days_until_renewal !== null && a.days_until_renewal !== undefined
            ? a.days_until_renewal
            : 99999;
        valB =
          b.days_until_renewal !== null && b.days_until_renewal !== undefined
            ? b.days_until_renewal
            : 99999;
      }

      if (valA < valB) return this._sortAsc ? -1 : 1;
      if (valA > valB) return this._sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }

  _formatDate(dateStr) {
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

  _formatCurrency(val, currency = 'EUR') {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    const num = parseFloat(val) || 0;
    return `${num.toFixed(2).replace('.', ',')} ${symbol}`;
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
    const subscriptions = this._sortSubscriptions(data.subscriptions || []);

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
          margin-bottom: 14px;
        }
        .summary-box {
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.08));
          border-radius: 8px;
          padding: 10px 8px;
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
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--primary-color, #03a9f4);
          white-space: nowrap;
        }
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--divider-color, rgba(125, 125, 125, 0.2));
        }
        .control-label {
          font-size: 0.8rem;
          color: var(--secondary-text-color, #757575);
          margin-right: 4px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 0.78rem;
          cursor: pointer;
          border: 1px solid var(--divider-color, rgba(125, 125, 125, 0.3));
          background: transparent;
          color: var(--primary-text-color);
          transition: all 0.2s ease;
          user-select: none;
        }
        .chip:hover {
          background: var(--secondary-background-color, rgba(125, 125, 125, 0.1));
        }
        .chip.active {
          background: var(--primary-color, #03a9f4);
          color: #ffffff;
          border-color: var(--primary-color, #03a9f4);
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
        .badge-method {
          background: var(--card-background-color, rgba(125, 125, 125, 0.1));
          color: var(--secondary-text-color, #555);
          border: 1px solid var(--divider-color, rgba(125, 125, 125, 0.2));
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
        .sub-interval {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
        }
        .empty-state {
          text-align: center;
          padding: 20px 16px;
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
              <div class="summary-value">${this._formatCurrency(data.totalMonthly)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">Jährlich</div>
              <div class="summary-value">${this._formatCurrency(data.totalYearly)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">Aktive Abos</div>
              <div class="summary-value">${data.count}</div>
            </div>
          </div>
        `
            : ''
        }

        ${
          this._config.show_sorting && subscriptions.length > 1
            ? `
          <div class="controls">
            <span class="control-label">Sortieren:</span>
            <div class="chip ${this._sortBy === 'due' ? 'active' : ''}" data-sort="due">
              Fälligkeit
            </div>
            <div class="chip ${this._sortBy === 'notice' ? 'active' : ''}" data-sort="notice">
              Kündigungsfrist
            </div>
            <div class="chip ${this._sortBy === 'cost' ? 'active' : ''}" data-sort="cost">
              Kosten
            </div>
            <div class="chip ${this._sortBy === 'name' ? 'active' : ''}" data-sort="name">
              Name
            </div>
          </div>
        `
            : ''
        }

        <div class="sub-list">
          ${
            subscriptions.length === 0
              ? `
            <div class="empty-state">
              Noch keine Abonnements erfasst.<br><br>
              Öffne <i>Einstellungen -> Geräte & Dienste -> Subscription Manager</i> und klicke auf <b>Konfigurieren</b>, um Abos hinzuzufügen.
            </div>
          `
              : subscriptions
                  .map((sub) => {
                    const daysRenewal = sub.days_until_renewal;
                    const daysNotice = sub.days_until_cancellation;

                    let renewalBadgeClass = 'badge-green';
                    if (daysRenewal !== null && daysRenewal !== undefined) {
                      if (daysRenewal <= 3) renewalBadgeClass = 'badge-red';
                      else if (daysRenewal <= 7) renewalBadgeClass = 'badge-yellow';
                    }

                    return `
              <div class="sub-item ${sub.alert_active ? 'alert-active' : ''}" data-entity="${sub.entity_id || ''}">
                <div class="sub-main">
                  <div class="sub-name">
                    <span>${sub.name}</span>
                    <span class="badge badge-method">${sub.payment_method || 'Zahlung'}</span>
                  </div>
                  <div class="sub-info">
                    <span class="badge ${renewalBadgeClass}">
                      Zahltag: ${this._formatDate(sub.next_payment)} 
                      ${daysRenewal !== null && daysRenewal !== undefined ? `(${daysRenewal}d)` : ''}
                    </span>
                    ${
                      daysNotice !== null && daysNotice !== undefined
                        ? `
                      <span class="badge ${daysNotice <= 7 ? 'badge-red' : 'badge-yellow'}">
                        Kündigen bis: ${this._formatDate(sub.cancellation_deadline)} (${daysNotice}d)
                      </span>
                    `
                        : ''
                    }
                  </div>
                </div>
                <div class="sub-cost-box">
                  <div class="sub-cost">${this._formatCurrency(sub.cost, sub.currency)}</div>
                  <div class="sub-interval">${sub.billing_interval || 'monatlich'}</div>
                </div>
              </div>
            `;
                  })
                  .join('')
          }
        </div>
      </ha-card>
    `;

    // Event listeners for sorting
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

    // Event listeners for opening more-info modal
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
    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          display: flex;
          flex-direction: column;
          gap: 14px;
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
        <div class="config-row">
          <span class="config-label">Kosten-Zusammenfassung oben anzeigen</span>
          <ha-switch
            .checked="${this._config.show_summary !== false}"
            config-value="show_summary"
          ></ha-switch>
        </div>
        <div class="config-row">
          <span class="config-label">Sortier-Leiste anzeigen</span>
          <ha-switch
            .checked="${this._config.show_sorting !== false}"
            config-value="show_sorting"
          ></ha-switch>
        </div>
      </div>
    `;

    const titleField = this.shadowRoot.querySelector('ha-textfield');
    if (titleField) {
      titleField.addEventListener('input', (e) => {
        this._valueChanged('title', e.target.value);
      });
    }

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

// Safe element registrations
if (!customElements.get('subscription-manager-card-editor')) {
  customElements.define('subscription-manager-card-editor', SubscriptionManagerCardEditor);
}

if (!customElements.get('subscription-manager-card')) {
  customElements.define('subscription-manager-card', SubscriptionManagerCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'subscription-manager-card')) {
  window.customCards.push({
    type: 'subscription-manager-card',
    name: 'Subscription Manager Card',
    description: 'Übersichtskarte für alle Abonnements mit Sortierung nach Kündigungsfrist, Kosten und Fälligkeit.',
    preview: true,
  });
}

