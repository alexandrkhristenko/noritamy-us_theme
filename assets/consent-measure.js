/**
 * Cookie-banner accept-rate measurement (LIN-325). Same file on every Noritamy theme.
 *
 * Counts how often the Shopify cookie banner is shown and what visitors choose, so we can
 * size how much signal the banner costs Meta / Google per market (IL, US, UK).
 *
 * Why this is not a GTM tag: in UK/EEA the US theme loads GTM only after the visitor accepts,
 * so a tag can never see a banner view or a decline. This file is loaded by the theme itself,
 * independent of consent.
 *
 * What it sends, and nothing else:
 *   sendBeacon -> veridian /api/consent-beacon   { shop, outcome }   (counter increment only)
 *   dataLayer  -> consent_banner_shown / consent_decision            (GA4 via GTM, where GTM runs)
 *
 * It stores NOTHING on the device (no cookie, localStorage or sessionStorage): under UK PECR
 * device storage itself needs consent. So "shown" is counted on entry pages only (no referrer
 * or one from another site), which approximates one count per visit without remembering the
 * visitor; the banner then stays on later pages and is not recounted.
 *
 * outcome: 'shown' | 'accept_all' | 'decline_all' | 'custom'
 */
(function () {
  'use strict';
  if (window.__noriConsentMeasure) return;
  window.__noriConsentMeasure = true;

  var ENDPOINT = 'https://veridian-flow-portal.vercel.app/api/consent-beacon';
  var S = window.Shopify || {};
  var shop = S.shop || '';
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop) || S.designMode) return;
  // Only the live theme counts: previews of unpublished themes (QA, drafts) would inflate the numbers.
  if (S.theme && S.theme.role && S.theme.role !== 'main') return;

  function send(outcome) {
    var body = JSON.stringify({ shop: shop, outcome: outcome });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } });
    } catch (e) {}
  }

  function push(event, data) {
    window.dataLayer = window.dataLayer || [];
    data.event = event;
    window.dataLayer.push(data);
  }

  function isEntryPage() {
    if (!document.referrer) return true;
    try {
      return new URL(document.referrer).hostname !== location.hostname;
    } catch (e) {
      return true;
    }
  }

  var shownSent = false;
  function checkShown() {
    var cp = window.Shopify && window.Shopify.customerPrivacy;
    if (shownSent || !cp || !cp.shouldShowBanner || !cp.currentVisitorConsent) return;
    // shouldShowBanner() only says the visitor's REGION gets a banner: it stays true after a
    // choice. The banner is actually on screen only while no choice is recorded ('' = untouched).
    var c = cp.currentVisitorConsent() || {};
    var undecided = !c.analytics && !c.marketing && !c.preferences;
    if (!cp.shouldShowBanner() || !undecided || !isEntryPage()) return;
    shownSent = true;
    send('shown');
    push('consent_banner_shown', {});
  }

  var decided = false;
  // Dispatched by Shopify when a choice is recorded (the banner calls setTrackingConsent).
  document.addEventListener('visitorConsentCollected', function (ev) {
    if (decided) return;
    // Only count choices made in a region that gets the banner. Elsewhere (e.g. the US "Your privacy
    // choices" opt-out) the same event fires without a banner and would show up as 'custom'.
    var cp = window.Shopify && window.Shopify.customerPrivacy;
    if (cp && cp.shouldShowBanner && !cp.shouldShowBanner()) return;
    decided = true;
    var d = (ev && ev.detail) || {};
    var choices = [!!d.analyticsAllowed, !!d.marketingAllowed, !!d.preferencesAllowed];
    var outcome =
      choices[0] && choices[1] && choices[2]
        ? 'accept_all'
        : !choices[0] && !choices[1] && !choices[2]
          ? 'decline_all'
          : 'custom';
    send(outcome);
    push('consent_decision', {
      consent_outcome: outcome,
      consent_analytics: choices[0],
      consent_marketing: choices[1],
    });
  });

  if (window.Shopify && window.Shopify.customerPrivacy) {
    checkShown();
  } else if (window.Shopify && window.Shopify.loadFeatures) {
    window.Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], function (error) {
      if (!error) checkShown();
    });
  }
})();
