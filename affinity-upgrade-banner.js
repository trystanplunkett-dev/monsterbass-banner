/* =============================================================================
 * Affinity 2.0 Custom Extension - Conditional Sidebar Upgrade Banner
 * MONSTERBASS (store 73246)
 * Registers a custom element <monsterbass-upgrade-banner> that Recharge mounts
 * wherever the extension block is placed (right sidebar).
 *
 * Rule 1: Gold monthly subscribers   -> upgrade to Platinum
 * Rule 2: Platinum MONTHLY subscribers -> switch to quarterly
 * ========================================================================== */

(function () {
  "use strict";

  var TAG = "monsterbass-upgrade-banner";
  if (customElements.get(TAG)) return; // already registered

  var DEBUG = true; // set false once confirmed working. Logs to browser console.

  var CONFIG = {
    GOLD_VARIANT_ID: "46071549821093",       // Gold (monthly) Shopify variant
    PLATINUM_VARIANT_ID: "46007609393317",   // Platinum monthly Shopify variant
    PLATINUM_MONTHLY_PLAN_ID: 20031521,      // Gold -> Platinum lands here
    PLATINUM_QUARTERLY_PLAN_ID: 20031523,    // Platinum monthly -> quarterly
  };

  function log() {
    if (DEBUG) console.log.apply(console, ["[upgrade-banner]"].concat([].slice.call(arguments)));
  }

  /* --------------------------- SDK ACCESS --------------------------------- */
  function getSDK() { return window.recharge || window.RechargeStorefront || null; }

  async function getSession(sdk) {
    if (sdk.session) return sdk.session;
    return await sdk.auth.loginCustomerPortal();
  }

  async function getActiveSubscriptions(sdk, session) {
    var customer = await sdk.customer.getCustomer(session);
    var res = await sdk.subscription.listSubscriptions(session, {
      customer_id: customer.id, status: "active", limit: 250,
    });
    return res.subscriptions || [];
  }

  /* --------------------------- MATCH LOGIC -------------------------------- */
  function variantId(sub) {
    return sub.external_variant_id && sub.external_variant_id.ecommerce
      ? String(sub.external_variant_id.ecommerce) : null;
  }
  function isMonthly(sub) {
    return sub.order_interval_unit === "month" && Number(sub.order_interval_frequency) === 1;
  }
  function findGold(subs) {
    return subs.find(function (s) { return variantId(s) === CONFIG.GOLD_VARIANT_ID; });
  }
  function findMonthlyPlatinum(subs) {
    return subs.find(function (s) { return variantId(s) === CONFIG.PLATINUM_VARIANT_ID && isMonthly(s); });
  }

  /* --------------------------- ACTIONS ------------------------------------ */
  async function upgradeToPlatinum(sdk, session, sub) {
    return sdk.subscription.updateSubscription(session, sub.id, {
      external_variant_id: { ecommerce: CONFIG.PLATINUM_VARIANT_ID },
      plan_id: CONFIG.PLATINUM_MONTHLY_PLAN_ID,
    });
  }
  async function switchToQuarterly(sdk, session, sub) {
    return sdk.subscription.updateSubscription(session, sub.id, {
      plan_id: CONFIG.PLATINUM_QUARTERLY_PLAN_ID,
    });
  }

  /* --------------------------- STYLES ------------------------------------- */
  function injectStyles() {
    if (document.getElementById("rc-upgrade-banner-styles")) return;
    var css =
      ".rc-upgrade-banner{max-width:400px;padding:20px;border-radius:var(--recharge-corners-radius,8px);" +
      "background:var(--recharge-color-brand-85,#f6f8fa);border:1px solid var(--recharge-color-brand-60,#bed1db);}" +
      ".rc-upgrade-banner__title{margin:0 0 6px;font-size:16px;color:var(--recharge-color-neutral,#0b1317);}" +
      ".rc-upgrade-banner__text{margin:0 0 14px;font-size:14px;line-height:1.4;color:var(--recharge-color-neutral-80,#3c4245);}" +
      ".rc-upgrade-banner__cta{cursor:pointer;padding:10px 16px;border:0;border-radius:var(--recharge-corners-radius,8px);" +
      "background:var(--recharge-color-brand,#467c99);color:#fff;font-size:14px;font-weight:600;width:100%;}" +
      ".rc-upgrade-banner__cta[disabled]{opacity:.6;cursor:default;}" +
      ".rc-upgrade-banner__status{margin:10px 0 0;font-size:13px;}";
    var el = document.createElement("style");
    el.id = "rc-upgrade-banner-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function bannerMarkup(heading, subtext, ctaLabel) {
    return (
      '<div class="rc-upgrade-banner">' +
        '<h4 class="rc-upgrade-banner__title">' + heading + "</h4>" +
        '<p class="rc-upgrade-banner__text">' + subtext + "</p>" +
        '<button type="button" class="rc-upgrade-banner__cta">' + ctaLabel + "</button>" +
        '<p class="rc-upgrade-banner__status" hidden></p>' +
      "</div>"
    );
  }

  /* --------------------------- CUSTOM ELEMENT ----------------------------- */
  class UpgradeBanner extends HTMLElement {
    connectedCallback() { this.renderBanner(); }

    async renderBanner() {
      var host = this;
      var sdk = getSDK();
      if (!sdk) {
        // SDK may load slightly after the element mounts; retry briefly.
        if ((this._tries = (this._tries || 0) + 1) < 40) {
          return void setTimeout(function () { host.renderBanner(); }, 250);
        }
        log("SDK not found on window. Is this running inside the Affinity portal?");
        return;
      }

      injectStyles();

      var session, subs;
      try {
        session = await getSession(sdk);
        subs = await getActiveSubscriptions(sdk, session);
      } catch (e) {
        log("could not load subscriptions", e);
        return;
      }

      // Debug: show exactly what this customer has, so you can confirm matching.
      log("active subs for this customer:", subs.map(function (s) {
        return { id: s.id, variant: variantId(s), unit: s.order_interval_unit, freq: s.order_interval_frequency, sku: s.sku };
      }));

      var gold = findGold(subs);
      var monthlyPlatinum = findMonthlyPlatinum(subs);

      var heading, subtext, ctaLabel, handler, targetSub;
      if (gold) {
        heading = "Level up to Platinum";
        subtext = "You're on Gold. Upgrade to Platinum for the full MONSTERBASS experience: more gear, more tackle, every month.";
        ctaLabel = "Upgrade to Platinum";
        targetSub = gold; handler = upgradeToPlatinum;
        log("matched GOLD ->", gold.id);
      } else if (monthlyPlatinum) {
        heading = "Switch to quarterly & simplify";
        subtext = "Love your Platinum box? Go quarterly for fewer, bigger deliveries and one less thing to think about.";
        ctaLabel = "Switch to quarterly";
        targetSub = monthlyPlatinum; handler = switchToQuarterly;
        log("matched MONTHLY PLATINUM ->", monthlyPlatinum.id);
      } else {
        log("no match for this customer; banner hidden.");
        host.innerHTML = "";
        return;
      }

      host.innerHTML = bannerMarkup(heading, subtext, ctaLabel);
      var btn = host.querySelector(".rc-upgrade-banner__cta");
      var status = host.querySelector(".rc-upgrade-banner__status");

      btn.addEventListener("click", async function () {
        btn.disabled = true;
        status.hidden = false;
        status.textContent = "Updating your subscription...";
        status.style.color = "var(--recharge-color-neutral-80,#3c4245)";
        try {
          await handler(sdk, session, targetSub);
          status.textContent = "Done! Your plan has been updated.";
          status.style.color = "var(--recharge-color-positive,#00a854)";
          setTimeout(function () { host.renderBanner(); }, 1200);
        } catch (e) {
          log("update failed", e);
          btn.disabled = false;
          status.textContent = "Sorry, that didn't work. Please try again or contact support.";
          status.style.color = "var(--recharge-color-caution120,#cc7a00)";
        }
      });
    }
  }

  customElements.define(TAG, UpgradeBanner);
  log("custom element registered:", TAG);
})();
