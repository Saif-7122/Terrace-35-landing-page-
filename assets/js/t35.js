/* ==========================================================================
   Terrace 35 — behaviour
   Lead capture, attribution and GTM plumbing carried over unchanged from the
   previous build; motion is layered on top and degrades to plain HTML if the
   GSAP CDN is unreachable.
   ========================================================================== */
(function () {
'use strict';

/* --- CONFIG ------------------------------------------------------------- */
var CFG = window.APP_CONFIG || {};
// Sri Aditya Homes WhatsApp sales number.
var WHATSAPP_NUMBER = CFG.WHATSAPP_NUMBER || '919000050456';
// Google Apps Script web app that stores leads. See lead-webhook/Code.gs and config.js.
var LEAD_WEBHOOK_URL = CFG.LEAD_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzbnOzok7ug8gVotF-5XhZTVRg--Gs_PTG8KAQy-JjGVu80yHUxN-is_kk3ERsS94z9Xg/exec';
// Nominal rupee value per lead for Google Ads value-based bidding; 0 = off.
var LEAD_VALUE = 0;

window.dataLayer = window.dataLayer || [];
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* --- Attribution: keep click IDs and campaign tags with every lead ------- */
var ATTRIB_KEY = 't35_attrib';
var ATTRIB_FIELDS = ['gclid','gbraid','wbraid','fbclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
function captureAttribution() {
  var stored = {};
  try { stored = JSON.parse(sessionStorage.getItem(ATTRIB_KEY) || '{}'); } catch (e) {}
  var qs = new URLSearchParams(location.search), got = false;
  ATTRIB_FIELDS.forEach(function (k) { var v = qs.get(k); if (v) { stored[k] = v; got = true; } });
  if (got || !stored.first_seen) {
    if (!stored.first_seen) stored.first_seen = new Date().toISOString();
    if (!stored.landing_page) stored.landing_page = location.pathname + location.search;
    if (!stored.referrer) stored.referrer = document.referrer || '';
    try { sessionStorage.setItem(ATTRIB_KEY, JSON.stringify(stored)); } catch (e) {}
  }
  return stored;
}
var ATTRIB = captureAttribution();
function attribSource() {
  if (ATTRIB.gclid || ATTRIB.gbraid || ATTRIB.wbraid) return 'Google Ads';
  if (ATTRIB.fbclid) return 'Meta';
  if (ATTRIB.utm_source) return ATTRIB.utm_source;
  return document.referrer ? 'Referral' : 'Direct';
}
function attribRef() { return ATTRIB.gclid || ATTRIB.gbraid || ATTRIB.wbraid || ATTRIB.fbclid || ''; }
function attribSuffix() {
  var parts = [];
  if (ATTRIB.utm_campaign) parts.push('campaign: ' + ATTRIB.utm_campaign);
  var ref = attribRef();
  if (ref) parts.push('ref: ' + ref);
  return parts.length ? '\n\n(' + parts.join(' | ') + ')' : '';
}

/* --- WhatsApp CTAs: pre-fill a real message, not a blank chat ------------ */
var MSG = {
  base: 'Hi, I would like the Terrace 35 costing sheet and floor plans.',
  dup:  'Hi, I would like details and current availability for the Terrace 35 Sky Duplexes.',
  rsvp: 'Hi, I would like to schedule a private site visit to Terrace 35. Please share the details.'
};
function waHref(msg) {
  return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg + attribSuffix());
}
function wireWa(sel, msg, channel) {
  $$(sel).forEach(function (el) {
    el.setAttribute('href', waHref(msg));
    el.addEventListener('click', function () {
      var sec = el.closest('section');
      dataLayer.push({
        event: 'whatsapp_click',
        link_location: sec ? (sec.id || 'section') : 'chrome',
        lead_channel: channel || 'whatsapp',
        traffic_source: attribSource(),
        gclid: ATTRIB.gclid || '', utm_campaign: ATTRIB.utm_campaign || ''
      });
    });
  });
}
wireWa('.js-wa', MSG.base, 'whatsapp');
wireWa('.js-wa-dup', MSG.dup, 'whatsapp');
wireWa('.js-wa-rsvp', MSG.rsvp, 'whatsapp_rsvp');

$$('.js-call').forEach(function (el) {
  el.addEventListener('click', function () {
    dataLayer.push({ event: 'call_click', lead_channel: 'call', traffic_source: attribSource(), gclid: ATTRIB.gclid || '' });
  });
});
var mapBtn = $('#mapBtn');
if (mapBtn) mapBtn.addEventListener('click', function () { dataLayer.push({ event: 'map_click' }); });

/* --- Lead forms: store the lead, then hand off to WhatsApp pre-filled ---- */
function bindLeadForm(f, source, waMsgFn) {
  if (!f) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!f.reportValidity()) return;
    var fe = f.elements,
        gv = function (k) { var el = fe[k]; return el && typeof el.value === 'string' ? el.value : ''; },
        name = gv('name').trim(),
        rawPhone = gv('phone').replace(/[^0-9]/g, ''),
        code = gv('code') || '+91',
        phone = (code + ' ' + rawPhone).trim(),
        e164 = code + rawPhone,
        product = gv('product'), when = gv('timeline'), who = gv('buyer'),
        budget = gv('budget'), guests = gv('guests');

    var isRsvp = source === 'event_rsvp';

    // Enhanced-conversion-ready event. GTM hashes user data before it leaves the browser.
    dataLayer.push({
      event: isRsvp ? 'event_rsvp' : 'generate_lead',
      lead_source: source, lead_channel: 'form',
      lead_product: product, lead_timeline: when, lead_buyer_type: who,
      lead_budget: budget, rsvp_guests: guests,
      value: LEAD_VALUE, currency: 'INR',
      traffic_source: attribSource(),
      gclid: ATTRIB.gclid || '', gbraid: ATTRIB.gbraid || '', wbraid: ATTRIB.wbraid || '',
      utm_source: ATTRIB.utm_source || '', utm_medium: ATTRIB.utm_medium || '', utm_campaign: ATTRIB.utm_campaign || '',
      enhanced_conversion_data: { phone_number: e164, first_name: name }
    });
    // Kept so any existing form_submit trigger keeps working.
    dataLayer.push({ event: 'form_submit', lead_source: source, lead_product: product, lead_timeline: when, lead_buyer_type: who });

    if (LEAD_WEBHOOK_URL) {
      var payload = new URLSearchParams({
        name: name, phone: phone, product: product, timeline: when, buyer: who,
        budget: budget, guests: guests, consent: 'yes',
        source: source, page: location.href, submitted_at: new Date().toISOString(),
        traffic_source: attribSource(),
        gclid: ATTRIB.gclid || '', gbraid: ATTRIB.gbraid || '', wbraid: ATTRIB.wbraid || '', fbclid: ATTRIB.fbclid || '',
        utm_source: ATTRIB.utm_source || '', utm_medium: ATTRIB.utm_medium || '', utm_campaign: ATTRIB.utm_campaign || '',
        utm_term: ATTRIB.utm_term || '', utm_content: ATTRIB.utm_content || '', referrer: ATTRIB.referrer || ''
      });
      fetch(LEAD_WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body: payload }).catch(function () {});
    }

    var msg = waMsgFn ? waMsgFn(name, phone, { product: product, when: when, who: who, budget: budget, guests: guests })
                      : 'Hi, I am ' + name + '. Please send me the Terrace 35 costing sheet and floor plans.'
                        + (product ? ' Interested in: ' + product + '.' : '')
                        + (budget ? ' Budget: ' + budget + '.' : '')
                        + (when ? ' Timeline: ' + when + '.' : '')
                        + (who ? ' Buyer type: ' + who + '.' : '')
                        + ' My number: ' + phone + '.';

    var btn = f.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    // Open WhatsApp in new tab, then redirect this tab to the thank-you page
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg + attribSuffix()), '_blank');
    setTimeout(function () { window.location.href = 'thank-you.html'; }, 400);
  });
}
bindLeadForm($('#heroForm'), 'hero');
bindLeadForm($('#leadForm'), 'page');
if ($('#rsvpForm')) {
  bindLeadForm($('#rsvpForm'), 'event_rsvp', function (name, phone, d) {
    return 'Hi, I am ' + name + '. Please arrange my private site visit for Terrace 35.'
      + (d.guests ? ' Visitors: ' + d.guests + '.' : '')
      + (d.who ? ' I am a: ' + d.who + '.' : '')
      + ' My number: ' + phone + '.';
  });
}


/* --- Header ------------------------------------------------------------- */
var hdr = $('#hdr'), burger = $('#burger');
window.addEventListener('scroll', function () {
  if (hdr) hdr.classList.toggle('solid', window.scrollY > 40);
}, { passive: true });

if (burger) {
  burger.addEventListener('click', function () {
    var open = hdr.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  $$('#nav a').forEach(function (a) {
    a.addEventListener('click', function () {
      hdr.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}

/* --- Amenity tabs ------------------------------------------------------- */
$$('.tab').forEach(function (t) {
  t.addEventListener('click', function () {
    $$('.tab').forEach(function (o) {
      var on = o === t;
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      var panel = document.getElementById(o.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
  });
});

/* --- Residence rail: drag to scroll ------------------------------------- */
var rail = $('#rail');
if (rail) {
  var down = false, startX = 0, startL = 0, moved = 0;
  rail.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;   // let native touch scrolling do its job
    down = true; moved = 0; startX = e.clientX; startL = rail.scrollLeft;
    rail.classList.add('drag');
  });
  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    rail.scrollLeft = startL - dx;
  });
  window.addEventListener('pointerup', function () {
    if (!down) return;
    down = false; rail.classList.remove('drag');
  });
  // Suppress the click that ends a real drag, so cards do not fire mid-swipe.
  rail.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
}

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (hdr && hdr.classList.contains('open')) {
    hdr.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
});

/* --- Motion ------------------------------------------------------------- */
var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function counters(root) {
  $$('[data-count]', root || document).forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var started = false;
    var fmt = function (v) { return Math.round(v).toLocaleString('en-IN') + suffix; };
    var run = function () {
      if (started) return; started = true;
      var t0 = null, dur = 1500;
      var step = function (ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (REDUCED) return;
    new IntersectionObserver(function (en, ob) {
      if (en[0].isIntersecting) { run(); ob.disconnect(); }
    }, { threshold: .4 }).observe(el);
  });
}

var SPLITS = [];

function clearBail() {
  if (window.__t35Bail) { clearTimeout(window.__t35Bail); window.__t35Bail = null; }
}

// Undo every start-state the motion layer may have written, including the
// inline transforms SplitText leaves on each line. Dropping the .gsap class
// alone is not enough once SplitText has run: the line wrappers keep their
// translate and the headline stays invisible.
function fallbackReveal() {
  clearBail();
  document.documentElement.classList.remove('gsap');
  SPLITS.forEach(function (s) { try { s.revert(); } catch (e) {} });
  SPLITS.length = 0;
  $$('.anim').forEach(function (el) { el.style.opacity = ''; el.style.transform = ''; });
  $$('.anim-img').forEach(function (el) {
    el.style.clipPath = '';
    var i = el.querySelector('img'); if (i) i.style.transform = '';
  });
  $$('[data-split]').forEach(function (el) { el.style.visibility = 'visible'; });
  counters();
}

function initGsap() {
  var g = window.gsap;
  if (!g || !window.ScrollTrigger) { fallbackReveal(); return; }
  g.registerPlugin(window.ScrollTrigger);

  if (REDUCED) { fallbackReveal(); return; }

  // Only stand the failsafe down once frames are genuinely advancing. Loading
  // the library is not proof that it can animate — if requestAnimationFrame is
  // starved the tweens never run, and trusting the load event alone would leave
  // every revealed element stuck at its start state. Swap the crude pre-paint
  // timer for one that undoes the motion layer properly if frames never come.
  clearBail();
  var motionWatch = setTimeout(fallbackReveal, 4000);
  var frames = 0;
  var proveMotion = function () {
    if (++frames < 3) return;
    g.ticker.remove(proveMotion);
    clearTimeout(motionWatch);
  };
  g.ticker.add(proveMotion);

  // Headline: split into lines and stagger them up.
  $$('[data-split]').forEach(function (el) {
    var tw;
    el.style.visibility = 'visible';
    if (window.SplitText) {
      var split = new window.SplitText(el, { type: 'lines', linesClass: 't35-line' });
      SPLITS.push(split);
      split.lines.forEach(function (l) { l.style.overflow = 'hidden'; });
      var inner = split.lines.map(function (l) {
        var s = document.createElement('span');
        s.style.display = 'block';
        while (l.firstChild) s.appendChild(l.firstChild);
        l.appendChild(s);
        return s;
      });
      tw = g.from(inner, { yPercent: 115, duration: 1.15, ease: 'power4.out', stagger: .09, delay: .15 });
    } else {
      tw = g.from(el, { opacity: 0, y: 28, duration: 1, ease: 'power3.out', delay: .15 });
    }
    return tw;
  });

  // Generic fade-up on everything marked .anim
  $$('.anim').forEach(function (el) {
    g.fromTo(el, { opacity: 0, y: 26 }, {
      opacity: 1, y: 0, duration: .95, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  });

  // Image wipes
  $$('.anim-img').forEach(function (el) {
    g.fromTo(el, { clipPath: 'inset(0 0 100% 0)' }, {
      clipPath: 'inset(0 0 0% 0)', duration: 1.3, ease: 'power3.inOut',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true }
    });
    var img = el.querySelector('img');
    if (img) {
      g.fromTo(img, { scale: 1.16 }, {
        scale: 1, duration: 1.6, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    }
  });

  // Hero parallax
  var heroImg = $('.hero-bg img');
  if (heroImg) {
    g.to(heroImg, {
      yPercent: 13, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  counters();
  window.ScrollTrigger.refresh();
}

// Load GSAP, but never let a CDN failure hide content.
(function loadMotion() {
  if (REDUCED) { fallbackReveal(); return; }
  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/';
  var files = ['gsap.min.js', 'ScrollTrigger.min.js', 'SplitText.min.js'];
  var settled = false;
  var bail = setTimeout(function () { if (!settled) { settled = true; fallbackReveal(); } }, 4000);

  var loadSeq = function (i) {
    if (i >= files.length) {
      if (settled) return;
      settled = true; clearTimeout(bail); initGsap(); return;
    }
    var s = document.createElement('script');
    s.src = CDN + files[i];
    s.onload = function () { loadSeq(i + 1); };
    s.onerror = function () {
      // SplitText is optional; the first two are not.
      if (files[i] === 'SplitText.min.js') { loadSeq(i + 1); return; }
      if (!settled) { settled = true; clearTimeout(bail); fallbackReveal(); }
    };
    document.head.appendChild(s);
  };
  loadSeq(0);
})();

})();
