/* =============================================================================
 * Affinity 2.0 Custom Extension - Conditional Sidebar Upgrade Banner
 * MONSTERBASS dev store (73246)
 *
 * Matches by PRODUCT id (each product has many variants, so variant-level
 * matching misses subscribers on other variants of the same product).
 *
 * Rule 1: Gold subscribers            -> upgrade to Platinum (monthly)
 * Rule 2: Platinum MONTHLY subscribers -> switch to Platinum quarterly (PREPAID)
 * ========================================================================== */

const SDK_URL = 'https://static.rechargecdn.com/assets/storefront/recharge-client-1.81.0.min.js';
const TAG = 'monsterbass-upgrade-banner';
const DEBUG = true; // logs to browser console; set false once confirmed working

const CONFIG = {
  // Match on product id (verified against the store's plans)
  GOLD_PRODUCT_ID: '9267789758629',        // "Monthly Shipment" (Gold) product
  PLATINUM_PRODUCT_ID: '9244371845285',    // Platinum product (monthly + quarterly live here)

  // Gold -> Platinum monthly target
  PLATINUM_MONTHLY_PLAN_ID: 20031521,
  PLATINUM_MONTHLY_VARIANT_ID: '46007609393317',

  // Platinum monthly -> Platinum quarterly target (NOTE: this plan is PREPAID)
  PLATINUM_QUARTERLY_PLAN_ID: 20031523,
  PLATINUM_QUARTERLY_VARIANT_ID: '45999698575525',
};

const BANNER_CSS = `
.rc-upg{max-width:400px;padding:20px;border-radius:var(--recharge-corners-radius,8px);
  background:var(--recharge-color-brand-85,#f6f8fa);border:1px solid var(--recharge-color-brand-60,#bed1db);}
.rc-upg__title{margin:0 0 6px;font-size:16px;color:var(--recharge-color-neutral,#0b1317);}
.rc-upg__text{margin:0 0 14px;font-size:14px;line-height:1.4;color:var(--recharge-color-neutral-80,#3c4245);}
.rc-upg__cta{cursor:pointer;padding:10px 16px;border:0;border-radius:var(--recharge-corners-radius,8px);
  background:var(--recharge-color-brand,#467c99);color:#fff;font-size:14px;font-weight:600;width:100%;}
.rc-upg__cta[disabled]{opacity:.6;cursor:default;}
.rc-upg__status{margin:10px 0 0;font-size:13px;}
`;

function log(...args) { if (DEBUG) console.log('[upgrade-banner]', ...args); }

function idOf(external) { return external && external.ecommerce ? String(external.ecommerce) : null; }
function productId(sub) { return idOf(sub.external_product_id); }
function isMonthly(sub) {
  return sub.order_interval_unit === 'month' && Number(sub.order_interval_frequency) === 1;
}

class MonsterbassUpgradeBanner extends HTMLElement {
  #session = null;
  #offer = null;
  #busy = false;
  #sdk = null;

  connectedCallback() {
    if (!document.querySelector('#rc-upg-css')) {
      const s = document.createElement('style');
      s.id = 'rc-upg-css';
      s.textContent = BANNER_CSS;
      document.head.appendChild(s);
    }
    this._render();
    this._init();
  }

  refresh() {
    this.#offer = null;
    this.#busy = false;
    this._render();
    this._init();
  }

  async _loadSdk() {
    if (!window.recharge) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load Recharge SDK'));
        document.head.appendChild(s);
      });
      window.recharge.init({ appName: TAG });
    }
    const rc = window.recharge;
    return {
      loginCustomerPortal: () => rc.auth.loginCustomerPortal(),
      getCustomer: (session) => rc.customer.getCustomer(session),
      listSubscriptions: (session, params) => rc.subscription.listSubscriptions(session, params),
      updateSubscription: (session, id, params, opts) => rc.subscription.updateSubscription(session, id, params, opts),
    };
  }

  async _init() {
    try {
      this.#sdk = await this._loadSdk();
      this.#session = await this.#sdk.loginCustomerPortal();

      const customer = await this.#sdk.getCustomer(this.#session);
      const res = await this.#sdk.listSubscriptions(this.#session, {
        customer_id: customer.id, status: 'active', limit: 250,
      });
      const subs = res.subscriptions || [];

      log('active subs:', subs.map(s => ({
        id: s.id, product: productId(s), variant: idOf(s.external_variant_id),
        unit: s.order_interval_unit, freq: s.order_interval_frequency,
      })));

      const gold = subs.find(s => productId(s) === CONFIG.GOLD_PRODUCT_ID);
      const monthlyPlatinum = subs.find(s => productId(s) === CONFIG.PLATINUM_PRODUCT_ID && isMonthly(s));

      if (gold) {
        this.#offer = {
          heading: 'Level up to Platinum',
          subtext: "You're on Gold. Upgrade to Platinum for the full MONSTERBASS experience: more gear, more tackle, every month.",
          ctaLabel: 'Upgrade to Platinum',
          sub: gold,
          action: (sdk, session, sub) => sdk.updateSubscription(session, sub.id, {
            external_variant_id: { ecommerce: CONFIG.PLATINUM_MONTHLY_VARIANT_ID },
            plan_id: CONFIG.PLATINUM_MONTHLY_PLAN_ID,
          }, { commit: true }),
        };
        log('matched GOLD ->', gold.id);
      } else if (monthlyPlatinum) {
        this.#offer = {
          heading: 'Switch to quarterly & save a step',
          subtext: 'Prefer fewer, bigger deliveries? Move your Platinum plan to our 3-month prepaid option.',
          ctaLabel: 'Switch to quarterly',
          sub: monthlyPlatinum,
          // NOTE: quarterly is a PREPAID plan. Test this conversion carefully; if
          // updateSubscription rejects a monthly->prepaid switch, this action may
          // need a different flow (e.g. cancel + create). See message from analyst.
          action: (sdk, session, sub) => sdk.updateSubscription(session, sub.id, {
            external_variant_id: { ecommerce: CONFIG.PLATINUM_QUARTERLY_VARIANT_ID },
            plan_id: CONFIG.PLATINUM_QUARTERLY_PLAN_ID,
          }, { commit: true }),
        };
        log('matched MONTHLY PLATINUM ->', monthlyPlatinum.id);
      } else {
        this.#offer = null;
        log('no match; banner hidden.');
      }

      this._render();
    } catch (err) {
      log('init failed', err);
      this.#offer = null;
      this._render();
    }
  }

  _render() {
    if (!this.#offer) { this.innerHTML = ''; return; }
    const o = this.#offer;
    this.innerHTML = `
      <div class="rc-upg">
        <h4 class="rc-upg__title">${o.heading}</h4>
        <p class="rc-upg__text">${o.subtext}</p>
        <button type="button" class="rc-upg__cta" ${this.#busy ? 'disabled' : ''}>${o.ctaLabel}</button>
        <p class="rc-upg__status" ${this.#busy ? '' : 'hidden'}>Updating your subscription...</p>
      </div>`;
    this.querySelector('.rc-upg__cta')?.addEventListener('click', () => this._handleAction());
  }

  async _handleAction() {
    if (this.#busy || !this.#offer) return;
    this.#busy = true;
    this._render();
    const status = this.querySelector('.rc-upg__status');
    try {
      await this.#offer.action(this.#sdk, this.#session, this.#offer.sub);
      if (status) {
        status.textContent = 'Done! Your plan has been updated.';
        status.style.color = 'var(--recharge-color-positive,#00a854)';
      }
      document.dispatchEvent(new CustomEvent('Affinity:refresh'));
      setTimeout(() => this.refresh(), 1200);
    } catch (err) {
      log('update failed', err);
      this.#busy = false;
      this._render();
      const s2 = this.querySelector('.rc-upg__status');
      if (s2) {
        s2.hidden = false;
        s2.textContent = "Sorry, that didn't work. Please try again or contact support.";
        s2.style.color = 'var(--recharge-color-caution120,#cc7a00)';
      }
    }
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, MonsterbassUpgradeBanner);
  log('custom element registered:', TAG);
}

export default MonsterbassUpgradeBanner;
