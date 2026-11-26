/* ==========================================================================
   JooLife & Life-Calculator E2E Attribution Tracker v2.1
   Privacy-First · Zero PII · Zero Quiz Answer Payloads · bfcache-Safe
   ==========================================================================
   Guarantees:
   - NEVER transmits quiz answer values (only integer quiz_step_idx 1..20).
   - Preserves case-sensitive Click IDs (gclid/fbclid/ttclid/karrot_cid, <=255).
   - Preserves Korean/UTF-8 UTM parameters & separates n_keyword cleanly.
   - Dynamically decorates rel="sponsored"/[data-cta] links on click & DOM mutations.
   - SubID parameter mapping matches live HTTP 302 redirect probes:
       appu.kr -> subid (302 preserved), iryan.kr -> sub_id (302 preserved),
       albarich.com -> subid (200), sens.kr -> subid (200).
       bitl.kr / deg.kr drop query params on 302 -> tracked via timestamp cohort.
   - 100% backward compatible with v1 (window.__lcTrack, __lcCtaTarget, #out).
   ========================================================================== */
(function (root) {
  'use strict';

  var SUPABASE_ENDPOINT = 'https://oeoboplyxfnuiireeoiy.supabase.co/functions/v1/lc-track';
  var NETLIFY_PROXY_ENDPOINT = '/api/track';
  var ALLOWED_HOSTS = /(^|\.)biojuho\.github\.io$|(^|\.)joolife\.io\.kr$/;
  var BOT_RE = /bot|crawler|spider|headlesschrome|phantomjs|slurp|mediapartners|facebookexternalhit|lighthouse|pagespeed|curl|wget|python-requests/i;
  var CLICK_ID_RE = /^[A-Za-z0-9_.:=-]{1,255}$/;
  var ID_RE = /^[A-Za-z0-9_.:-]{1,60}$/;

  // Verified against live HTTP 302 redirect chains (deliverables/outbound_redirect_probe.json)
  var SUBID_PARAM_BY_HOST = {
    'appu.kr': 'subid',
    'www.appu.kr': 'subid',
    'adlix.co.kr': 'subid',
    'www.adlix.co.kr': 'subid',
    'iryan.kr': 'sub_id',
    'tenping.kr': 'sub_id',
    'sens.kr': 'subid',
    'albarich.com': 'subid',
    'www.albarich.com': 'subid',
    'linkprice.com': 'u_id',
    'click.linkprice.com': 'u_id',
    'everflow.io': 'sub1',
    'impact.com': 'subId1',
  };
  // Shorteners empirically proven to strip query params on 302 (do not mutate URL)
  var SHORTENER_DROPS_SUBID = {
    'bitl.kr': true,
    'deg.kr': true,
  };

  function cleanClickId(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (!s || !CLICK_ID_RE.test(s)) return null;
    return s.slice(0, 255);
  }

  function cleanUtm(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (!s) return null;
    try { s = decodeURIComponent(s); } catch (e) {}
    // Allow Korean, Latin, digits, common UTM punctuation; strip control/HTML chars
    s = s.replace(/[<>"'`;\\]/g, '').replace(/\s+/g, ' ').trim();
    return s ? s.slice(0, 150) : null;
  }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function lookupSubIdParam(hostname) {
    var h = String(hostname || '').toLowerCase();
    if (SHORTENER_DROPS_SUBID[h]) return null;
    if (SUBID_PARAM_BY_HOST[h]) return SUBID_PARAM_BY_HOST[h];
    var keys = Object.keys(SUBID_PARAM_BY_HOST);
    for (var i = 0; i < keys.length; i++) {
      if (h.length > keys[i].length && h.slice(-(keys[i].length + 1)) === '.' + keys[i]) {
        return SUBID_PARAM_BY_HOST[keys[i]];
      }
    }
    return null;
  }

  function decorateUrlWithSubId(href, cid) {
    if (!href || !cid) return href;
    try {
      var u = new URL(href, 'https://biojuho.github.io/joolife-go/');
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return href;
      var param = lookupSubIdParam(u.hostname);
      if (!param) return href;
      if (!u.searchParams.get(param)) {
        u.searchParams.set(param, cid);
      }
      return u.toString();
    } catch (e) {
      return href;
    }
  }

  function parseQueryAttribution(searchStr) {
    var q;
    try { q = new URLSearchParams(searchStr || ''); } catch (e) { q = { get: function () { return null; } }; }
    var clickOrder = ['gclid', 'fbclid', 'ttclid', 'karrot_cid', 'n_media', 'dclid'];
    var cidType = null, cidVal = null;
    for (var i = 0; i < clickOrder.length; i++) {
      var raw = q.get(clickOrder[i]);
      var cleaned = cleanClickId(raw);
      if (cleaned) {
        cidType = clickOrder[i];
        cidVal = cleaned;
        break;
      }
    }
    return {
      utm_source: cleanUtm(q.get('utm_source')),
      utm_medium: cleanUtm(q.get('utm_medium')),
      utm_campaign: cleanUtm(q.get('utm_campaign')),
      utm_content: cleanUtm(q.get('utm_content')),
      utm_term: cleanUtm(q.get('utm_term')),
      click_id_type: cidType,
      click_id_val: cidVal,
      n_keyword: cleanUtm(q.get('n_keyword')),
    };
  }

  function assignAbDeterministic(uid, expName, variants) {
    var list = (variants && variants.length) ? variants : ['A', 'B'];
    var idx = fnv1a(String(uid || 'anon') + ':' + String(expName || 'exp')) % list.length;
    return list[idx];
  }

  // Export pure testable helpers for Node/Jest/Vitest environments
  var PureAPI = {
    cleanClickId: cleanClickId,
    cleanUtm: cleanUtm,
    fnv1a: fnv1a,
    lookupSubIdParam: lookupSubIdParam,
    decorateUrlWithSubId: decorateUrlWithSubId,
    parseQueryAttribution: parseQueryAttribution,
    assignAbDeterministic: assignAbDeterministic,
    SUBID_PARAM_BY_HOST: SUBID_PARAM_BY_HOST,
    SHORTENER_DROPS_SUBID: SHORTENER_DROPS_SUBID,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PureAPI;
  }

  // Browser runtime initialization
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var w = window, d = document, n = navigator;
  w.__lcTrackV2Helpers = PureAPI;

  try {
    if (w.__lcTrackV2Loaded) return;
    var dnt = n.doNotTrack == '1' || w.doNotTrack == '1' || n.msDoNotTrack == '1' || n.globalPrivacyControl === true;
    if (dnt) return;
    if (BOT_RE.test(n.userAgent || '')) return;
  } catch (e) { return; }

  w.__lcTrackV2Loaded = true;
  var host = (location && location.hostname) ? location.hostname : '';
  var IS_PROD = ALLOWED_HOSTS.test(host);
  var ENDPOINT = /(^|\.)joolife\.io\.kr$/.test(host) ? NETLIFY_PROXY_ENDPOINT : SUPABASE_ENDPOINT;

  function randomHex(bytes) {
    try {
      var a = new Uint8Array(bytes);
      (w.crypto || w.msCrypto).getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function getOrCreateStorage(store, key, prefix, bytes) {
    try {
      var v = store.getItem(key);
      if (!v) {
        v = prefix + randomHex(bytes);
        store.setItem(key, v);
      }
      return v;
    } catch (e) {
      return prefix + randomHex(bytes);
    }
  }

  var sessionId = getOrCreateStorage(w.sessionStorage, 'lc_sid', 's_', 9);
  var abUid = getOrCreateStorage(w.localStorage, 'lc_ab_uid', 'u_', 8);
  var lcCid = getOrCreateStorage(w.sessionStorage, 'lc_cid', 'lc_' + Date.now().toString(36) + '_', 5);

  function deviceType() {
    var ua = n.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
    if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function refHost() {
    try {
      if (!d.referrer) return null;
      var h = new URL(d.referrer).hostname;
      return h === host ? null : h;
    } catch (e) { return null; }
  }

  var attr = parseQueryAttribution(location.search);
  var activeAb = { exp: null, var: null };
  var sentCount = 0;
  var lastShare = 0;
  var quizStarted = false;

  // Optional Danggeun Pixel Loader (strictly disabled on sensitive verticals with data-pixel="off")
  var pixelAllowed = !(d.body && d.body.getAttribute('data-pixel') === 'off');
  function loadKarrotPixelIfConfigured() {
    if (!IS_PROD || !pixelAllowed) return;
    var meta = d.querySelector('meta[name="karrot-pixel-id"]');
    var pid = (w.__LC_KARROT_PIXEL_ID || (meta && meta.getAttribute('content')) || '').trim();
    if (!pid || pid === 'UNSET' || w.karrotPixel) return;
    try {
      var s = d.createElement('script');
      s.async = true;
      s.src = 'https://karrot-pixel.business.daangn.com/0.4/karrot-pixel.umd.js';
      s.onload = function () {
        try {
          if (w.karrotPixel && w.karrotPixel.init) {
            w.karrotPixel.init(pid);
            w.karrotPixel.track('ViewPage');
          }
        } catch (e) {}
      };
      d.head.appendChild(s);
    } catch (e) {}
  }

  function fireKarrotSafe(evName) {
    // Client fires ONLY upper-funnel ViewContent / InitiateCheckout.
    // Approved Lead conversions fire ONLY server-side via lc-postback/index.ts.
    if (!IS_PROD || !pixelAllowed) return;
    if (evName !== 'ViewContent' && evName !== 'InitiateCheckout') return;
    try {
      if (w.karrotPixel && typeof w.karrotPixel.track === 'function') {
        w.karrotPixel.track(evName);
      }
    } catch (e) {}
  }

  function send(event, target, extra) {
    try {
      // Bypass 60-event cap for page_exit so final dwell time is never dropped
      if (event !== 'page_exit' && sentCount++ >= 60) return;
      if (event === 'share') {
        var now = Date.now();
        if (now - lastShare < 1500) return;
        lastShare = now;
      }

      var payload = {
        event: event,
        lc_cid: lcCid,
        session_id: sessionId,
        host: host || 'joolife.io.kr',
        path: location.pathname,
        ref_host: refHost(),
        device: deviceType(),
        utm_source: attr.utm_source,
        utm_medium: attr.utm_medium,
        utm_campaign: attr.utm_campaign,
        utm_content: attr.utm_content,
        utm_term: attr.utm_term,
        click_id_type: attr.click_id_type,
        click_id_val: attr.click_id_val,
        n_keyword: attr.n_keyword,
        ab_exp: activeAb.exp,
        ab_var: activeAb.var,
      };

      if (target) payload.target = String(target).slice(0, 200);
      if (extra && typeof extra === 'object') {
        // Whitelisted telemetry fields ONLY — NEVER allow quiz answer payloads
        if (typeof extra.cta_slot === 'string') payload.cta_slot = extra.cta_slot.slice(0, 64);
        if (typeof extra.campaign_id === 'string') payload.campaign_id = extra.campaign_id.slice(0, 120);
        if (typeof extra.scroll_pct === 'number') payload.scroll_pct = extra.scroll_pct;
        if (typeof extra.quiz_step_idx === 'number') payload.quiz_step_idx = Math.trunc(extra.quiz_step_idx);
        if (typeof extra.dwell_ms === 'number') payload.dwell_ms = Math.max(0, Math.trunc(extra.dwell_ms));
      }

      if (!IS_PROD) {
        if (w.__lcDebugLog) w.__lcDebugLog.push(payload);
        return;
      }

      var body = JSON.stringify(payload);
      if (n.sendBeacon && n.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      if (w.fetch) {
        w.fetch(ENDPOINT, {
          method: 'POST',
          body: body,
          keepalive: true,
          mode: 'cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain' },
        }).catch(function () {});
      }
    } catch (e) {}
  }

  // Deterministic Zero-Flicker A/B Experiment Assignment (A / B matches SQL SRM view)
  function assignAb(expName, variants) {
    var v = assignAbDeterministic(abUid, expName, variants || ['A', 'B']);
    activeAb.exp = String(expName).slice(0, 64);
    activeAb.var = v;
    return v;
  }

  // Backward-compatible v1 ctaTarget helper
  function ctaTarget(el, u) {
    var base = u.hostname + u.pathname;
    var holder = el && el.closest ? el.closest('[data-campaign]') : null;
    var cid = holder ? String(holder.getAttribute('data-campaign') || '').trim() : '';
    if (cid && ID_RE.test(cid)) return cid + '@' + base;
    var keep = [];
    ['i', 'sid', 'cid'].forEach(function (k) {
      var val = u.searchParams.get(k);
      if (val && ID_RE.test(val)) keep.push(k + '=' + val);
    });
    return keep.length ? base + '?' + keep.join('&') : base;
  }

  function decorateElementLink(el) {
    if (!el || el.tagName !== 'A') return;
    var href = el.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    // Cap failover support: if data-cap-exhausted="true" and data-fallback-url exists, swap safely
    if (el.getAttribute('data-cap-exhausted') === 'true' && el.getAttribute('data-fallback-url')) {
      href = el.getAttribute('data-fallback-url');
    }
    var decorated = decorateUrlWithSubId(href, lcCid);
    if (decorated !== href) {
      el.setAttribute('href', decorated);
    }
  }

  function decorateAllCtas(scope) {
    try {
      var nodes = (scope || d).querySelectorAll('a[rel*="sponsored"], a[data-cta]');
      for (var i = 0; i < nodes.length; i++) decorateElementLink(nodes[i]);
    } catch (e) {}
  }

  // Public APIs (v1 + v2)
  w.__lcTrack = function (ev, target, extra) { send(ev, target, extra); };
  w.__lcCtaTarget = ctaTarget;
  w.__lcCid = lcCid;
  w.__lcAssignAb = assignAb;
  w.__lcTrackQuizStep = function (stepIndex) {
    var idx = parseInt(stepIndex, 10);
    if (!idx || idx < 1 || idx > 20) return;
    if (!quizStarted) {
      quizStarted = true;
      send('quiz_start', 'quiz');
    }
    // PRIVACY RULE: transmit ONLY step number, NEVER answer values
    send('quiz_step', 'step_' + idx, { quiz_step_idx: idx });
  };
  w.__lcTrackQuizComplete = function () {
    send('quiz_complete', 'done');
    fireKarrotSafe('ViewContent');
  };

  // Scroll depth tracking (25 / 50 / 75 / 90)
  var scrollSent = {};
  var scrollTimer = null;
  function checkScroll() {
    var docEl = d.documentElement;
    var scrollTop = w.pageYOffset || docEl.scrollTop || 0;
    var maxScroll = Math.max(1, (docEl.scrollHeight || 0) - (w.innerHeight || 0));
    var pct = Math.min(100, Math.round((scrollTop / maxScroll) * 100));
    [25, 50, 75, 90].forEach(function (mark) {
      if (pct >= mark && !scrollSent[mark]) {
        scrollSent[mark] = true;
        send('scroll_depth', String(mark), { scroll_pct: mark });
      }
    });
  }
  w.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () { scrollTimer = null; checkScroll(); }, 250);
  }, { passive: true });

  // Active Dwell Time (bfcache-safe, accurately accumulates across tab switches)
  var visibleStart = Date.now();
  var accumulatedMs = 0;
  function flushDwell() {
    if (visibleStart !== null) {
      accumulatedMs += Math.max(0, Date.now() - visibleStart);
      visibleStart = null;
    }
    if (accumulatedMs > 0) {
      send('page_exit', 'dwell', { dwell_ms: accumulatedMs });
      accumulatedMs = 0;
    }
  }
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') {
      flushDwell();
    } else if (d.visibilityState === 'visible') {
      visibleStart = Date.now();
    }
  });
  w.addEventListener('pagehide', flushDwell);
  w.addEventListener('pageshow', function (ev) {
    visibleStart = Date.now();
    if (ev && ev.persisted) {
      send('pageview', 'bfcache_restore');
    }
  });

  // Calculator #out MutationObserver (v1 compatibility) + Dynamic CTA SubID Decoration
  var RESULT_SEL = '#out,[data-lc-result]';
  var lastCalc = 0, lastUser = 0;
  function markUser(e) { if (e && e.isTrusted !== false) lastUser = Date.now(); }
  ['submit', 'input', 'change', 'click'].forEach(function (t) { d.addEventListener(t, markUser, true); });
  function isVisible(el) {
    for (var x = el; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; }
    return !!(el.textContent && el.textContent.trim());
  }
  try {
    if (w.MutationObserver && d.body) {
      new MutationObserver(function (list) {
        var seen = [];
        for (var i = 0; i < list.length; i++) {
          var t = list[i].target;
          var el = t && (t.nodeType === 1 ? t : t.parentElement);
          if (el && el.querySelectorAll) decorateAllCtas(el);
          var res = el && el.closest ? el.closest(RESULT_SEL) : null;
          if (res && seen.indexOf(res) < 0) {
            seen.push(res);
            var now = Date.now();
            if (isVisible(res) && now - lastUser <= 5000 && now - lastCalc >= 2000) {
              lastCalc = now;
              send('calc_done', res.getAttribute('data-lc-result') || res.id || 'out');
            }
          }
        }
      }).observe(d.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'href', 'rel', 'data-cta'] });
    }
  } catch (e) {}

  // FAQ open tracking
  d.addEventListener('toggle', function (e) {
    var t = e.target;
    if (t && t.tagName === 'DETAILS' && t.open) {
      var sum = t.querySelector('summary');
      send('faq_open', sum ? sum.textContent.trim().slice(0, 80) : 'faq');
    }
  }, true);

  // Unified Click Handler (Capture Phase ensures SubID is attached BEFORE navigation)
  d.addEventListener('click', function (e) {
    try {
      var el = e.target && e.target.closest ? e.target.closest('a,button,[data-share],[data-cta]') : null;
      if (!el) return;

      if (el.matches('[data-share],.share,[aria-label*="공유"]')) {
        send('share', el.getAttribute('data-share') || el.textContent.trim().slice(0, 40));
        return;
      }

      var rel = (el.getAttribute('rel') || '').toLowerCase();
      var isSponsored = /sponsored/.test(rel) || el.hasAttribute('data-cta');
      if (isSponsored) decorateElementLink(el);

      var href = el.getAttribute('href') || el.getAttribute('data-cta');
      if (!href && !el.hasAttribute('data-cta')) return;
      var u;
      try { u = new URL(href || '', location.href); } catch (x) { return; }

      if (isSponsored) {
        var holder = el.closest ? el.closest('[data-campaign]') : null;
        var campId = holder ? holder.getAttribute('data-campaign') : null;
        var slot = el.getAttribute('data-cta-slot') || el.id || 'cta';
        send('cta_click', ctaTarget(el, u), { cta_slot: slot, campaign_id: campId || undefined });
        fireKarrotSafe('InitiateCheckout');
      } else if (/^https?:$/.test(u.protocol) && u.hostname !== host) {
        send('outbound', u.hostname);
      }
    } catch (x) {}
  }, true);

  // Declarative zero-race A/B initialization BEFORE initial pageview:
  // Reads <body data-ab-exp="exp_name" data-ab-b-h1="Variant B headline"> synchronously
  // so pageview ALWAYS carries ab_exp & ab_var ('A'/'B') for SQL v_ab_srm_check.
  function initDeclarativeAb() {
    try {
      var bodyEl = d.body;
      if (!bodyEl) return;
      var expName = (bodyEl.getAttribute('data-ab-exp') || '').trim();
      if (!expName) return;
      var assigned = assignAb(expName, ['A', 'B']);
      bodyEl.setAttribute('data-ab-assigned', assigned);
      var q = new URLSearchParams(location.search);
      var hasHook = !!q.get('hook');
      var bH1 = bodyEl.getAttribute('data-ab-b-h1');
      if (assigned === 'B' && !hasHook && bH1) {
        var h1El = d.getElementById('heroH1');
        if (h1El) h1El.textContent = bH1;
      }
    } catch (e) {}
  }

  function bootstrapPage() {
    initDeclarativeAb();
    decorateAllCtas(d);
    loadKarrotPixelIfConfigured();
    send('pageview');
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', bootstrapPage);
  } else {
    bootstrapPage();
  }
})(typeof window !== 'undefined' ? window : globalThis);
