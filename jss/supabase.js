/* ═══════════════════════════════════════════════
   MARCH NAILS BI — SUPABASE.JS
   DB connection, CRUD helpers, real-time cache
   ═══════════════════════════════════════════════ */

var SB = (function() {
  'use strict';

  var URL = 'https://homsihklvbxtkldkmhqq.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbXNpaGtsdmJ4dGtsZGttaHFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg5NDIsImV4cCI6MjA5NzI3NDk0Mn0.OgIB2hWsoL2f4JGoKBjwk8ODxq-zzJh70lI53fF7r-0';

  // In-memory cache
  var CACHE = {
    bookings: [],
    clients:  [],
    payments: [],
    email_log: [],
    loaded: { bookings: false, clients: false, payments: false }
  };

  // ── Core fetch ──
  function request(path, opts) {
    if (window.location.protocol === 'file:') {
      return Promise.reject(new Error('FILE_PROTOCOL: Open from GitHub Pages, not local file'));
    }
    var url = URL + '/rest/v1/' + path;
    var method = (opts && opts.method) || 'GET';
    var headers = {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };
    if (method === 'POST' || method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }
    var config = { method: method, headers: headers };
    if (opts && opts.body) config.body = opts.body;

    return fetch(url, config).then(function(res) {
      if (res.status === 204) return [];
      return res.json().then(function(data) {
        if (!res.ok) {
          var msg = (data && data.message) ? data.message : 'HTTP ' + res.status;
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  // ── CRUD ──
  function get(table, query) {
    return request(table + '?' + (query || 'order=created_at.desc&limit=500'));
  }

  function insert(table, data) {
    return request(table, { method: 'POST', body: JSON.stringify(data) });
  }

  function update(table, id, data) {
    return request(table + '?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(data) });
  }

  function remove(table, id) {
    return request(table + '?id=eq.' + id, { method: 'DELETE' });
  }

  function rpc(fn, params) {
    return request('rpc/' + fn, { method: 'POST', body: JSON.stringify(params || {}) });
  }

  // ── Load all data into cache ──
  function loadAll() {
    return Promise.all([
      get('bookings', 'order=booked_at.desc&limit=500').then(function(d) {
        if (Array.isArray(d)) { CACHE.bookings = d; CACHE.loaded.bookings = true; }
      }),
      get('clients', 'order=created_at.desc&limit=500').then(function(d) {
        if (Array.isArray(d)) { CACHE.clients = d; CACHE.loaded.clients = true; }
      }),
      get('payments', 'order=paid_at.desc&limit=500').then(function(d) {
        if (Array.isArray(d)) { CACHE.payments = d; CACHE.loaded.payments = true; }
      }),
      get('email_log', 'order=sent_at.desc&limit=200').then(function(d) {
        if (Array.isArray(d)) { CACHE.email_log = d; }
      })
    ]).catch(function(e) {
      if (String(e.message).indexOf('FILE_PROTOCOL') === -1) {
        console.warn('Supabase load error:', e.message);
      }
      throw e;
    });
  }

  // ── Test connection ──
  function testConnection() {
    if (window.location.protocol === 'file:') {
      showBanner('warning',
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        '<span><strong>Local file detected.</strong> Upload to GitHub Pages for Supabase to work. ' +
        '<a href="https://github.com/Garagusu/marchnails" target="_blank" style="text-decoration:underline">Open GitHub &rarr;</a></span>'
      );
      return Promise.resolve(false);
    }
    return get('clients', 'limit=1').then(function() {
      showBanner('success', '<i class="fa-solid fa-circle-check"></i><span>Connected to Supabase &checkmark;</span>');
      setTimeout(function() { hideBanner(); }, 3000);
      return true;
    }).catch(function(e) {
      var hint = '';
      var msg = String(e.message);
      if (msg.indexOf('403') !== -1 || msg.indexOf('401') !== -1) hint = 'API key error. Check Supabase settings.';
      else if (msg.indexOf('Failed to fetch') !== -1) hint = 'Network error. Check internet connection.';
      else hint = msg.slice(0, 100);
      showBanner('error', '<i class="fa-solid fa-circle-xmark"></i><span><strong>Supabase connection failed:</strong> ' + hint + '</span>');
      return false;
    });
  }

  function showBanner(type, html) {
    hideBanner();
    var b = document.createElement('div');
    b.id = 'conn-banner';
    b.className = type;
    b.innerHTML = html + '<span class="banner-close" onclick="document.getElementById(\'conn-banner\').remove()">&times;</span>';
    document.body.prepend(b);
  }

  function hideBanner() {
    var b = document.getElementById('conn-banner');
    if (b) b.remove();
  }

  return {
    URL: URL, KEY: KEY,
    CACHE: CACHE,
    get: get, insert: insert, update: update, remove: remove, rpc: rpc,
    loadAll: loadAll, testConnection: testConnection,
    showBanner: showBanner, hideBanner: hideBanner
  };
})();