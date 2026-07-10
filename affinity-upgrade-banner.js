/* =============================================================================
 * Affinity 2.0 (Home Page Builder) - Conditional Sidebar Upgrade Banner
 * MONSTERBASS (store 73246)
 * -----------------------------------------------------------------------------
 * Rule 1: Subscribers on the Gold monthly product  -> prompt upgrade to Platinum
 * Rule 2: Subscribers on Platinum billed MONTHLY    -> prompt switch to QUARTERLY
 *
 * Ships as the JS bundle for a Custom Extension block placed in the right rail
 * (sidebar) of the Affinity Home Page Builder. Uses the Recharge Storefront
 * JS SDK (@rechargeapps/storefront-client), already loaded inside the portal.
 *
 * Matching keys off Shopify VARIANT IDs + billing cadence (reliable) rather than
 * SKU strings. Actions use plan_id since Gold and Platinum are separate products.
 * ========================================================================== */

(function () {
  "use strict";

  var CONFIG = {
    // ---- Source (current) subscription identifiers, used for MATCHING ----
    GOLD_VARIANT_ID: "46071549821093",       // Gold (monthly) Shopify variant
    PLATINUM_VARIANT_ID: "46007609393317",   // Platinum monthly Shopify variant

    // ---- Target identifiers, used for the UPGRADE actions ----
    PLATINUM_MONTHLY_PLAN_ID: 20031521,      // Gold -> Platinum lands here
    PLATINUM_QUARTERLY_PLAN_ID: 20031523,    // Platinum monthly -> quarterly

    // SKUs kept for reference only (not used for matching):
    // GOLD_SKU = "gold-paid-monthly-1", PLATINUM_SKU = "platinum-paid-monthly"
  };

  /* --------------------------- SDK ACCESS --------------------------------- */
  function getSDK() {
    return window.recharge || window.RechargeStorefront || null;
  }

  async function getSession(sdk) {
    // Inside Affinity the customer is already authenticated. If your Page Builder
    // extension context hands you a session, use that here instead.
    if (sdk.session) return sdk.session;
    return await sdk.auth.loginCustomerPortal();
  }

  async function getActiveSubscriptions(sdk, session) {
    var customer = await sdk.customer.getCustomer(session);
    var res = await sdk.subscription.listSubscriptions(session, {
      customer_id: customer.id,
      status: "active",
      limit: 250,
    });
    return res.subscriptions || [];
  }

  /* --------------------------- MATCH LOGIC ---------------------------------
   * external_variant_id is an object: { ecommerce: "<shopify variant id>" }.
   */
  function variantId(sub) {
    return sub.external_variant_id && sub.external_variant_id.ecommerce
      ? String(sub.external_variant_id.ecommerce)
      : null;
  }
  function isMonthly(sub) {
    return sub.order_interval_unit === "month" && Number(sub.order_interval_frequency) === 1;
  }
  function findGold(subs) {
    return subs.find(function (s) { return variantId(s) === CONFIG.GOLD_VARIANT_ID; });
  }
  function findMonthlyPlatinum(subs) {
    return subs.find(function (s) {
      return variantId(s) === CONFIG.PLATINUM_VARIANT_ID && isMonthly(s);
    });
  }

  /* --------------------------- ACTIONS -------------------------------------
   * Passing plan_id means the interval fields are handled by the plan, so we
   * don't need to set order/charge_interval_* manually.
   */
  async function upgradeToPlatinum(sdk, session, sub) {
    return sdk.subscription.updateSubscription(session, sub.id, {
      external_variant_id: { ecommerce: CONFIG.PLATINUM_VARIANT_ID },
      plan_id: CONFIG.PLATINUM_MONTHLY_PLAN_ID,
    });
  }
  async function switchToQuarterly(sdk, session, sub) {
    // Switching cadence recalculates the next charge date and clears
    // skipped / manually-edited charges on this subscription.
    return sdk.subscription.updateSubscription(session, sub.id, {
      plan_id: CONFIG.PLATINUM_QUARTERLY_PLAN_ID,
    });
  }

  /* --------------------------- UI ------------------------------------------
   * Styled with the portal's own --recharge- CSS variables. ~400px sidebar.
   */
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

  /* --------------------------- RENDER -------------------------------------- */
  async function render(container) {
    var sdk = getSDK();
    if (!sdk) return;
    injectStyles();

    var session, subs;
    try {
      session = await getSession(sdk);
      subs = await getActiveSubscriptions(sdk, session);
    } catch (e) {
      console.error("[upgrade-banner] could not load subscriptions", e);
      return;
    }

    var gold = findGold(subs);
    var monthlyPlatinum = findMonthlyPlatinum(subs);

    var heading, subtext, ctaLabel, handler, targetSub;
    if (gold) {
      heading = "Level up to Platinum";
      subtext = "You're on Gold. Upgrade to Platinum for the full MONSTERBASS experience: more gear, more tackle, every month.";
      ctaLabel = "Upgrade to Platinum";
      targetSub = gold;
      handler = upgradeToPlatinum;
    } else if (monthlyPlatinum) {
      heading = "Switch to quarterly & simplify";
      subtext = "Love your Platinum box? Go quarterly for fewer, bigger deliveries and one less thing to think about.";
      ctaLabel = "Switch to quarterly";
      targetSub = monthlyPlatinum;
      handler = switchToQuarterly;
    } else {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = bannerMarkup(heading, subtext, ctaLabel);
    var btn = container.querySelector(".rc-upgrade-banner__cta");
    var status = container.querySelector(".rc-upgrade-banner__status");

    btn.addEventListener("click", async function () {
      btn.disabled = true;
      status.hidden = false;
      status.textContent = "Updating your subscription...";
      status.style.color = "var(--recharge-color-neutral-80,#3c4245)";
      try {
        await handler(sdk, session, targetSub);
        status.textContent = "Done! Your plan has been updated.";
        status.style.color = "var(--recharge-color-positive,#00a854)";
        setTimeout(function () { render(container); }, 1200);
      } catch (e) {
        console.error("[upgrade-banner] update failed", e);
        btn.disabled = false;
        status.textContent = "Sorry, that didn't work. Please try again or contact support.";
        status.style.color = "var(--recharge-color-caution120,#cc7a00)";
      }
    });
  }

  /* --------------------------- BOOTSTRAP ----------------------------------- */
  function boot() {
    var container =
      (document.currentScript && document.currentScript.parentElement) ||
      document.getElementById("rc-upgrade-banner-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "rc-upgrade-banner-root";
      document.body.appendChild(container);
    }

    var tries = 0;
    var timer = setInterval(function () {
      if (getSDK() || tries++ > 40) {
        clearInterval(timer);
        render(container);
      }
    }, 250);

    document.addEventListener("Recharge::action::orderChanged", function () { render(container); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
