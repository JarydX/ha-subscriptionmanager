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
  }

  setConfig(config) {
    this._config = {
      title: config.title || 'Abonnements',
      entity: config.entity || 'sensor.subscriptions_overview_summary',
      show_summary: config.show_summary !== false,
      show_sorting: config.show_sorting !== false,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getSubscriptionsData() {
    if (!this._hass) return null;

    // First try the configured entity or auto-detect sensor.subscriptions_*summary
    let summaryEntity = this._hass.states[this._config.entity];
    if (!summaryEntity) {
      const candidateKey = Object.keys(this._hass.states).find(
        (key) => key.startsWith('sensor.subscriptions_') && key.endsWith('_summary')
      );
      if (candidateKey) {
        summaryEntity = this._hass.states[candidateKey];
      }
    }

    if (summaryEntity && summaryEntity.attributes && summaryEntity.attributes.subscriptions) {
      return {
        subscriptions: summaryEntity.attributes.subscriptions,
        totalMonthly: summaryEntity.attributes.total_monthly_cost || 0,
        totalYearly: summaryEntity.attributes.total_yearly_cost || 0,
        count: summaryEntity.attributes.count || summaryEntity.attributes.subscriptions.length,
      };
    }

    // Fallback: discover subscriptions directly from states
    const subs = [];
    let totalMonthly = 0;
    let totalYearly = 0;

    Object.keys(this._hass.states).forEach((key) => {
      if (key.startsWith('sensor.') && key.endsWith('_cost') && !key.includes('total_') && !key.includes('monthly_')) {
        const costState = this._hass.states[key];
        const baseName = key.replace('sensor.', '').replace('_cost', '');
        const nextPayState = this._hass.states[`sensor.${baseName}_next_payment`];
        const daysState = this._hass.states[`sensor.${baseName}_days_until_renewal`];
        const monthlyState = this._hass.states[`sensor.${baseName}_monthly_cost`];
        const methodState = this._hass.states[`sensor.${baseName}_payment_method`];
        const cancelState = this._hass.states[`sensor.${baseName}_cancellation_deadline`];
        const daysCancelState = this._hass.states[`sensor.${baseName}_days_until_cancellation`];
        const alertState = this._hass.states[`binary_sensor.${baseName}_renewal_due`];

        if (costState) {
          const cost = parseFloat(costState.state) || 0;
          const monthlyCost = monthlyState ? parseFloat(monthlyState.state) : cost;
          totalMonthly += monthlyCost;
          totalYearly += monthlyCost * 12;

          subs.push({
            name: (costState.attributes && costState.attributes.friendly_name) 
              ? costState.attributes.friendly_name.replace(' Kosten', '').replace(' Cost', '')
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
    });

    return {
      subscriptions: subs,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      totalYearly: Math.round(totalYearly * 100) / 100,
      count: subs.length,
    };
  }

  _sortAndFilterSubscriptions(subs) {
    let list = [...subs];

    // Filter
    if (this._filterCategory && this._filterCategory !== 'all') {
      list = list.filter((s) => s.category === this._filterCategory);
    }

    // Sort
    list.sort((a, b) => {
      let valA, valB;
      if (this._sortBy === 'cost') {
        valA = a.monthly_cost !== undefined ? a.monthly_cost : a.cost;
        valB = b.monthly_cost !== undefined ? b.monthly_cost : b.cost;
        return this._sortAsc ? valB - valA : valA - valB; // Default highest cost first
      } else if (this._sortBy === 'notice') {
        valA = a.days_until_cancellation !== null && a.days_until_cancellation !== undefined 
          ? a.days_until_cancellation : 99999;
        valB = b.days_until_cancellation !== null && b.days_until_cancellation !== undefined 
          ? b.days_until_cancellation : 99999;
      } else if (this._sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        return this._sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        // 'due'
        valA = a.days_until_renewal !== null && a.days_until_renewal !== undefined 
          ? a.days_until_renewal : 99999;
        valB = b.days_until_renewal !== null && b.days_until_renewal !== undefined 
          ? b.days_until_renewal : 99999;
      }

      if (valA < valB) return this._sortAsc ? -1 : 1;
      if (valA > valB) return this._sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }

  _formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  _formatCurrency(val, currency = '€') {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    return `${Number(val).toFixed(2).replace('.', ',')} ${symbol}`;
  }

  _getPaymentIcon(method) {
    switch (method) {
      case 'paypal': return 'mdi:credit-card-outline';
      case 'credit_card': return 'mdi:credit-card';
      case 'sepa': return 'mdi:bank';
      case 'apple_pay': return 'mdi:apple';
      case 'google_pay': return 'mdi:google';
      case 'bank_transfer': return 'mdi:bank-transfer';
      case 'invoice': return 'mdi:receipt';
      default: return 'mdi:cash';
    }
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

  _render() {
    const data = this._getSubscriptionsData();
    if (!data) return;

    const subscriptions = this._sortAndFilterSubscriptions(data.subscriptions);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,0.1));
          background: var(--ha-card-background, var(--card-background-color, white));
          color: var(--primary-text-color, #212121);
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .title {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .summary-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
          gap: 8px;
          margin-bottom: 16px;
        }
        .summary-box {
          background: var(--secondary-background-color, #f4f6f8);
          border-radius: 8px;
          padding: 10px 12px;
          text-align: center;
        }
        .summary-label {
          font-size: 0.75rem;
          color: var(--secondary-text-color, #757575);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--primary-color, #03a9f4);
        }
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
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
          font-size: 0.8rem;
          cursor: pointer;
          border: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, transparent);
          color: var(--primary-text-color);
          transition: all 0.2s ease;
          user-select: none;
        }
        .chip:hover {
          background: var(--secondary-background-color, #f0f0f0);
        }
        .chip.active {
          background: var(--primary-color, #03a9f4);
          color: #fff;
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
          padding: 12px;
          border-radius: 8px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color, #e0e0e0);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .sub-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(0,0,0,0.08);
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
          gap: 8px;
          font-size: 0.8rem;
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
          color: #2e7d32;
        }
        .badge-yellow {
          background: rgba(255, 152, 0, 0.15);
          color: #e65100;
        }
        .badge-red {
          background: rgba(244, 67, 54, 0.15);
          color: #c62828;
        }
        .badge-method {
          background: var(--secondary-background-color, #eee);
          color: var(--primary-text-color);
        }
        .sub-cost-box {
          text-align: right;
          min-width: 90px;
        }
        .sub-cost {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--primary-text-color);
        }
        .sub-interval {
          font-size: 0.75rem;
          color: var(--secondary-text-color);
        }
        .empty-state {
          text-align: center;
          padding: 24px;
          color: var(--secondary-text-color);
          font-size: 0.9rem;
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="title">${this._config.title}</div>
        </div>

        ${this._config.show_summary ? `
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
        ` : ''}

        ${this._config.show_sorting ? `
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
        ` : ''}

        <div class="sub-list">
          ${subscriptions.length === 0 ? `
            <div class="empty-state">
              Keine Abonnements vorhanden.<br>
              Füge neue Abos über <i>Einstellungen -> Geräte & Dienste -> Subscription Manager -> Konfigurieren</i> hinzu.
            </div>
          ` : subscriptions.map((sub) => {
            const daysRenewal = sub.days_until_renewal;
            const daysNotice = sub.days_until_cancellation;
            
            let renewalBadgeClass = 'badge-green';
            if (daysRenewal !== null) {
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
                      ${daysRenewal !== null ? `(${daysRenewal}d)` : ''}
                    </span>
                    ${daysNotice !== null && daysNotice !== undefined ? `
                      <span class="badge ${daysNotice <= 7 ? 'badge-red' : 'badge-yellow'}">
                        Kündigen bis: ${this._formatDate(sub.cancellation_deadline)} (${daysNotice}d)
                      </span>
                    ` : ''}
                  </div>
                </div>
                <div class="sub-cost-box">
                  <div class="sub-cost">${this._formatCurrency(sub.cost, sub.currency)}</div>
                  <div class="sub-interval">${sub.billing_interval || 'monatlich'}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </ha-card>
    `;

    // Attach event listeners for sort chips
    this.shadowRoot.querySelectorAll('.chip[data-sort]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const sortKey = e.currentTarget.getAttribute('data-sort');
        if (this._sortBy === sortKey) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortBy = sortKey;
          this._sortAsc = sortKey === 'cost' ? false : true;
        }
        this._render();
      });
    });

    // Attach click listener for items
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

customElements.define('subscription-manager-card', SubscriptionManagerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'subscription-manager-card',
  name: 'Subscription Manager Card',
  description: 'Übersichtskarte für alle Abonnements mit Sortierung nach Kündigungsfrist, Kosten und Fälligkeit.',
  preview: true,
});
