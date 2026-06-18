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


/* ═══════════════════════════════════════════════
   DEMO DATA — loads when Supabase unavailable
   ═══════════════════════════════════════════════ */
(function() {
  var now = new Date();
  function daysAgo(n, h, m) {
    var d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(h||10, m||0, 0, 0);
    return d.toISOString();
  }
  function today(h, m) { return daysAgo(0, h, m); }

  SB.DEMO = {
    clients: [
      {id:'c1', first_name:'Olivia',   last_name:'Chen',      email:'olivia@email.com',   phone:'(613)555-1001', birthday:'1991-07-22', allergy_notes:'Acrylic fume sensitivity · No latex', preferences:'Pink tones · Long nails · Always with Flower', tier:'gold',     loyalty_points:1240, no_show_count:0, vip:true},
      {id:'c2', first_name:'Emma',     last_name:'Johnson',   email:'emma@email.com',     phone:'(613)555-1002', birthday:'1995-09-14', allergy_notes:null,                                  preferences:'French tips · Short nails',                   tier:'silver',   loyalty_points:680,  no_show_count:1, vip:false},
      {id:'c3', first_name:'Sophie',   last_name:'Tremblay',  email:'sophie@email.com',   phone:'(613)555-1003', birthday:'1998-03-03', allergy_notes:null,                                  preferences:'Nude tones · Oval shape',                      tier:'standard', loyalty_points:190,  no_show_count:0, vip:false},
      {id:'c4', first_name:'Sarah',    last_name:'Mitchell',  email:'sarah@email.com',    phone:'(613)555-1004', birthday:'1993-11-08', allergy_notes:null,                                  preferences:null,                                           tier:'standard', loyalty_points:145,  no_show_count:0, vip:false},
      {id:'c5', first_name:'Lily',     last_name:'Park',      email:'lily@email.com',     phone:'(613)555-1005', birthday:'1997-06-15', allergy_notes:null,                                  preferences:null,                                           tier:'standard', loyalty_points:72,   no_show_count:2, vip:false},
      {id:'c6', first_name:'Grace',    last_name:'Davis',     email:'grace@email.com',    phone:'(613)555-1006', birthday:'1994-02-28', allergy_notes:null,                                  preferences:'Weekend appointments preferred',               tier:'silver',   loyalty_points:420,  no_show_count:0, vip:false},
      {id:'c7', first_name:'Rose',     last_name:'Williams',  email:'rose@email.com',     phone:'(613)555-1007', birthday:'1990-06-14', allergy_notes:null,                                  preferences:null,                                           tier:'standard', loyalty_points:210,  no_show_count:0, vip:false},
      {id:'c8', first_name:'Natalie',  last_name:'Anderson',  email:'natalie@email.com',  phone:'(613)555-1008', birthday:'1996-08-20', allergy_notes:null,                                  preferences:'Flower only',                                  tier:'silver',   loyalty_points:540,  no_show_count:0, vip:false},
      {id:'c9', first_name:'Victoria', last_name:'Taylor',    email:'victoria@email.com', phone:'(613)555-1009', birthday:'1988-12-05', allergy_notes:null,                                  preferences:null,                                           tier:'standard', loyalty_points:95,   no_show_count:1, vip:false},
      {id:'c10',first_name:'Zoe',      last_name:'Wilson',    email:'zoe@email.com',      phone:'(613)555-1010', birthday:'2000-04-18', allergy_notes:null,                                  preferences:'Bright colors · Nail art',                     tier:'standard', loyalty_points:30,   no_show_count:0, vip:false}
    ],

    bookings: [
      // Today
      {id:'b1',  client_id:'c2', client_name:'Emma Johnson',    client_email:'emma@email.com',    staff_name:'Happy',  service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:today(10,0),  notes:''},
      {id:'b2',  client_id:'c1', client_name:'Olivia Chen',     client_email:'olivia@email.com',  staff_name:'Flower', service_name:'Gel-X Extensions',  service_price:80,  status:'confirmed', payment_status:'unpaid', payment_method:'pending',     booked_at:today(11,30), notes:'No latex!'},
      {id:'b3',  client_id:'c3', client_name:'Sophie Tremblay', client_email:'sophie@email.com',  staff_name:'Daisy',  service_name:'Pedicure Shellac',  service_price:55,  status:'confirmed', payment_status:'unpaid', payment_method:'pending',     booked_at:today(13,0),  notes:''},
      {id:'b4',  client_id:'c4', client_name:'Sarah Mitchell',  client_email:'sarah@email.com',   staff_name:'Happy',  service_name:'Acrylic Refill',    service_price:60,  status:'pending',   payment_status:'unpaid', payment_method:'pending',     booked_at:today(14,30), notes:''},
      {id:'b5',  client_id:'c5', client_name:'Lily Park',       client_email:'lily@email.com',    staff_name:'Hannah', service_name:'Manicure Shellac',  service_price:35,  status:'no-show',   payment_status:'unpaid', payment_method:'pending',     booked_at:today(16,0),  notes:''},
      {id:'b6',  client_id:'c8', client_name:'Natalie Anderson',client_email:'natalie@email.com', staff_name:'Flower', service_name:'Pedicure Shellac',  service_price:55,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:today(15,0),  notes:''},
      // Yesterday
      {id:'b7',  client_id:'c9', client_name:'Victoria Taylor', client_email:'victoria@email.com',staff_name:'Happy',  service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'debit',       booked_at:daysAgo(1,10,0),  notes:''},
      {id:'b8',  client_id:'c6', client_name:'Grace Davis',     client_email:'grace@email.com',   staff_name:'Flower', service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(1,11,0),  notes:''},
      {id:'b9',  client_id:'c1', client_name:'Olivia Chen',     client_email:'olivia@email.com',  staff_name:'Flower', service_name:'Acrylic Refill',    service_price:60,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(1,14,0),  notes:''},
      {id:'b10', client_id:'c2', client_name:'Emma Johnson',    client_email:'emma@email.com',    staff_name:'Daisy',  service_name:'Pedicure Shellac',  service_price:55,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(1,15,30), notes:''},
      // 2 days ago
      {id:'b11', client_id:'c7', client_name:'Rose Williams',   client_email:'rose@email.com',    staff_name:'Happy',  service_name:'Manicure Shellac',  service_price:35,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(2,10,0),  notes:''},
      {id:'b12', client_id:'c3', client_name:'Sophie Tremblay', client_email:'sophie@email.com',  staff_name:'Hannah', service_name:'Acrylic Refill',    service_price:60,  status:'completed', payment_status:'paid',   payment_method:'debit',       booked_at:daysAgo(2,11,30), notes:''},
      {id:'b13', client_id:'c10',client_name:'Zoe Wilson',      client_email:'zoe@email.com',     staff_name:'Flower', service_name:'Gel-X Extensions',  service_price:80,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(2,13,0),  notes:'Nail art request'},
      // This week - various days
      {id:'b14', client_id:'c4', client_name:'Sarah Mitchell',  client_email:'sarah@email.com',   staff_name:'Happy',  service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(3,10,0),  notes:''},
      {id:'b15', client_id:'c8', client_name:'Natalie Anderson',client_email:'natalie@email.com', staff_name:'Flower', service_name:'Gel-X Extensions',  service_price:80,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(3,14,0),  notes:''},
      {id:'b16', client_id:'c6', client_name:'Grace Davis',     client_email:'grace@email.com',   staff_name:'Daisy',  service_name:'Pedicure Shellac',  service_price:55,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(4,11,0),  notes:''},
      {id:'b17', client_id:'c1', client_name:'Olivia Chen',     client_email:'olivia@email.com',  staff_name:'Flower', service_name:'Pedicure Shellac',  service_price:55,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(4,15,0),  notes:''},
      {id:'b18', client_id:'c9', client_name:'Victoria Taylor', client_email:'victoria@email.com',staff_name:'Hannah', service_name:'Manicure Shellac',  service_price:35,  status:'completed', payment_status:'paid',   payment_method:'debit',       booked_at:daysAgo(5,10,0),  notes:''},
      {id:'b19', client_id:'c2', client_name:'Emma Johnson',    client_email:'emma@email.com',    staff_name:'Happy',  service_name:'Acrylic Refill',    service_price:60,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(5,13,30), notes:''},
      {id:'b20', client_id:'c7', client_name:'Rose Williams',   client_email:'rose@email.com',    staff_name:'Flower', service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(6,14,0),  notes:''},
      // Older - fill out month
      {id:'b21', client_id:'c3', client_name:'Sophie Tremblay', client_email:'sophie@email.com',  staff_name:'Daisy',  service_name:'Manicure Shellac',  service_price:35,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(7,10,0),  notes:''},
      {id:'b22', client_id:'c5', client_name:'Lily Park',       client_email:'lily@email.com',    staff_name:'Hannah', service_name:'Pedicure Shellac',  service_price:55,  status:'completed', payment_status:'paid',   payment_method:'debit',       booked_at:daysAgo(7,14,0),  notes:''},
      {id:'b23', client_id:'c10',client_name:'Zoe Wilson',      client_email:'zoe@email.com',     staff_name:'Happy',  service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(8,11,0),  notes:''},
      {id:'b24', client_id:'c1', client_name:'Olivia Chen',     client_email:'olivia@email.com',  staff_name:'Flower', service_name:'Gel-X Extensions',  service_price:80,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(9,10,0),  notes:''},
      {id:'b25', client_id:'c6', client_name:'Grace Davis',     client_email:'grace@email.com',   staff_name:'Happy',  service_name:'Acrylic Refill',    service_price:60,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(10,13,0), notes:''},
      {id:'b26', client_id:'c4', client_name:'Sarah Mitchell',  client_email:'sarah@email.com',   staff_name:'Flower', service_name:'Pedicure Shellac',  service_price:55,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(11,15,0), notes:''},
      {id:'b27', client_id:'c2', client_name:'Emma Johnson',    client_email:'emma@email.com',    staff_name:'Daisy',  service_name:'Gel-X Extensions',  service_price:80,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(12,10,0), notes:''},
      {id:'b28', client_id:'c8', client_name:'Natalie Anderson',client_email:'natalie@email.com', staff_name:'Flower', service_name:'Acrylic Refill',    service_price:60,  status:'completed', payment_status:'paid',   payment_method:'cash',        booked_at:daysAgo(13,14,0), notes:''},
      {id:'b29', client_id:'c7', client_name:'Rose Williams',   client_email:'rose@email.com',    staff_name:'Hannah', service_name:'Acrylic Full Set',  service_price:75,  status:'completed', payment_status:'paid',   payment_method:'debit',       booked_at:daysAgo(14,11,0), notes:''},
      {id:'b30', client_id:'c9', client_name:'Victoria Taylor', client_email:'victoria@email.com',staff_name:'Happy',  service_name:'Manicure Shellac',  service_price:35,  status:'completed', payment_status:'paid',   payment_method:'credit_card', booked_at:daysAgo(15,13,0), notes:''},
      // Future
      {id:'b31', client_id:'c6', client_name:'Grace Davis',     client_email:'grace@email.com',   staff_name:'Happy',  service_name:'Acrylic Full Set',  service_price:75,  status:'confirmed', payment_status:'unpaid', payment_method:'pending',     booked_at:daysAgo(-1,10,0), notes:''},
      {id:'b32', client_id:'c10',client_name:'Zoe Wilson',      client_email:'zoe@email.com',     staff_name:'Flower', service_name:'Gel-X Extensions',  service_price:80,  status:'pending',   payment_status:'unpaid', payment_method:'pending',     booked_at:daysAgo(-2,11,0), notes:'Nail art please'},
    ],

    payments: [
      // Today
      {id:'p1',  booking_id:'b1',  client_id:'c2',  client_name:'Emma Johnson',    staff_name:'Happy',  service_name:'Acrylic Full Set',  amount:75,  method:'credit_card', commission:18.75, net_revenue:56.25, paid_at:today(10,45)},
      {id:'p2',  booking_id:'b6',  client_id:'c8',  client_name:'Natalie Anderson',staff_name:'Flower', service_name:'Pedicure Shellac',  amount:55,  method:'cash',        commission:13.75, net_revenue:41.25, paid_at:today(15,45)},
      // Yesterday
      {id:'p3',  booking_id:'b7',  client_id:'c9',  client_name:'Victoria Taylor', staff_name:'Happy',  service_name:'Acrylic Full Set',  amount:75,  method:'debit',       commission:18.75, net_revenue:56.25, paid_at:daysAgo(1,10,45)},
      {id:'p4',  booking_id:'b8',  client_id:'c6',  client_name:'Grace Davis',     staff_name:'Flower', service_name:'Acrylic Full Set',  amount:75,  method:'credit_card', commission:18.75, net_revenue:56.25, paid_at:daysAgo(1,11,45)},
      {id:'p5',  booking_id:'b9',  client_id:'c1',  client_name:'Olivia Chen',     staff_name:'Flower', service_name:'Acrylic Refill',    amount:60,  method:'credit_card', commission:15,    net_revenue:45,    paid_at:daysAgo(1,14,45)},
      {id:'p6',  booking_id:'b10', client_id:'c2',  client_name:'Emma Johnson',    staff_name:'Daisy',  service_name:'Pedicure Shellac',  amount:55,  method:'cash',        commission:13.75, net_revenue:41.25, paid_at:daysAgo(1,16,0)},
      // 2 days ago
      {id:'p7',  booking_id:'b11', client_id:'c7',  client_name:'Rose Williams',   staff_name:'Happy',  service_name:'Manicure Shellac',  amount:35,  method:'cash',        commission:8.75,  net_revenue:26.25, paid_at:daysAgo(2,10,45)},
      {id:'p8',  booking_id:'b12', client_id:'c3',  client_name:'Sophie Tremblay', staff_name:'Hannah', service_name:'Acrylic Refill',    amount:60,  method:'debit',       commission:15,    net_revenue:45,    paid_at:daysAgo(2,12,0)},
      {id:'p9',  booking_id:'b13', client_id:'c10', client_name:'Zoe Wilson',      staff_name:'Flower', service_name:'Gel-X Extensions',  amount:80,  method:'credit_card', commission:20,    net_revenue:60,    paid_at:daysAgo(2,13,45)},
      // This week
      {id:'p10', booking_id:'b14', client_id:'c4',  client_name:'Sarah Mitchell',  staff_name:'Happy',  service_name:'Acrylic Full Set',  amount:75,  method:'credit_card', commission:18.75, net_revenue:56.25, paid_at:daysAgo(3,10,45)},
      {id:'p11', booking_id:'b15', client_id:'c8',  client_name:'Natalie Anderson',staff_name:'Flower', service_name:'Gel-X Extensions',  amount:80,  method:'credit_card', commission:20,    net_revenue:60,    paid_at:daysAgo(3,14,45)},
      {id:'p12', booking_id:'b16', client_id:'c6',  client_name:'Grace Davis',     staff_name:'Daisy',  service_name:'Pedicure Shellac',  amount:55,  method:'cash',        commission:13.75, net_revenue:41.25, paid_at:daysAgo(4,11,45)},
      {id:'p13', booking_id:'b17', client_id:'c1',  client_name:'Olivia Chen',     staff_name:'Flower', service_name:'Pedicure Shellac',  amount:55,  method:'credit_card', commission:13.75, net_revenue:41.25, paid_at:daysAgo(4,15,45)},
      {id:'p14', booking_id:'b18', client_id:'c9',  client_name:'Victoria Taylor', staff_name:'Hannah', service_name:'Manicure Shellac',  amount:35,  method:'debit',       commission:8.75,  net_revenue:26.25, paid_at:daysAgo(5,10,45)},
      {id:'p15', booking_id:'b19', client_id:'c2',  client_name:'Emma Johnson',    staff_name:'Happy',  service_name:'Acrylic Refill',    amount:60,  method:'credit_card', commission:15,    net_revenue:45,    paid_at:daysAgo(5,14,0)},
      {id:'p16', booking_id:'b20', client_id:'c7',  client_name:'Rose Williams',   staff_name:'Flower', service_name:'Acrylic Full Set',  amount:75,  method:'cash',        commission:18.75, net_revenue:56.25, paid_at:daysAgo(6,14,45)},
      // Older
      {id:'p17', booking_id:'b21', client_id:'c3',  client_name:'Sophie Tremblay', staff_name:'Daisy',  service_name:'Manicure Shellac',  amount:35,  method:'cash',        commission:8.75,  net_revenue:26.25, paid_at:daysAgo(7,10,45)},
      {id:'p18', booking_id:'b22', client_id:'c5',  client_name:'Lily Park',       staff_name:'Hannah', service_name:'Pedicure Shellac',  amount:55,  method:'debit',       commission:13.75, net_revenue:41.25, paid_at:daysAgo(7,14,45)},
      {id:'p19', booking_id:'b23', client_id:'c10', client_name:'Zoe Wilson',      staff_name:'Happy',  service_name:'Acrylic Full Set',  amount:75,  method:'credit_card', commission:18.75, net_revenue:56.25, paid_at:daysAgo(8,11,45)},
      {id:'p20', booking_id:'b24', client_id:'c1',  client_name:'Olivia Chen',     staff_name:'Flower', service_name:'Gel-X Extensions',  amount:80,  method:'credit_card', commission:20,    net_revenue:60,    paid_at:daysAgo(9,10,45)},
      {id:'p21', booking_id:'b25', client_id:'c6',  client_name:'Grace Davis',     staff_name:'Happy',  service_name:'Acrylic Refill',    amount:60,  method:'cash',        commission:15,    net_revenue:45,    paid_at:daysAgo(10,13,45)},
      {id:'p22', booking_id:'b26', client_id:'c4',  client_name:'Sarah Mitchell',  staff_name:'Flower', service_name:'Pedicure Shellac',  amount:55,  method:'credit_card', commission:13.75, net_revenue:41.25, paid_at:daysAgo(11,15,45)},
      {id:'p23', booking_id:'b27', client_id:'c2',  client_name:'Emma Johnson',    staff_name:'Daisy',  service_name:'Gel-X Extensions',  amount:80,  method:'credit_card', commission:20,    net_revenue:60,    paid_at:daysAgo(12,10,45)},
      {id:'p24', booking_id:'b28', client_id:'c8',  client_name:'Natalie Anderson',staff_name:'Flower', service_name:'Acrylic Refill',    amount:60,  method:'cash',        commission:15,    net_revenue:45,    paid_at:daysAgo(13,14,45)},
      {id:'p25', booking_id:'b29', client_id:'c7',  client_name:'Rose Williams',   staff_name:'Hannah', service_name:'Acrylic Full Set',  amount:75,  method:'debit',       commission:18.75, net_revenue:56.25, paid_at:daysAgo(14,11,45)},
      {id:'p26', booking_id:'b30', client_id:'c9',  client_name:'Victoria Taylor', staff_name:'Happy',  service_name:'Manicure Shellac',  amount:35,  method:'credit_card', commission:8.75,  net_revenue:26.25, paid_at:daysAgo(15,13,45)}
    ],

    email_log: [
      {id:'e1', client_id:'c2', client_name:'Emma Johnson',    client_email:'emma@email.com',    type:'receipt',      subject:'Your Acrylic Full Set Receipt — CA$75',    status:'opened',  sent_at:today(10,46)},
      {id:'e2', client_id:'c1', client_name:'Olivia Chen',     client_email:'olivia@email.com',  type:'confirmation', subject:'Appointment Confirmed — Today at 11:30',    status:'opened',  sent_at:today(8,0)},
      {id:'e3', client_id:'c3', client_name:'Sophie Tremblay', client_email:'sophie@email.com',  type:'reminder',     subject:'Reminder: Your appointment is tomorrow',    status:'opened',  sent_at:daysAgo(1,9,0)},
      {id:'e4', client_id:'c8', client_name:'Natalie Anderson',client_email:'natalie@email.com', type:'receipt',      subject:'Your Pedicure Shellac Receipt — CA$55',     status:'opened',  sent_at:today(15,46)},
      {id:'e5', client_id:'c9', client_name:'Victoria Taylor', client_email:'victoria@email.com',type:'winback',      subject:'We miss you! It's been a while…',          status:'clicked', sent_at:daysAgo(5,9,0)},
      {id:'e6', client_id:'c7', client_name:'Rose Williams',   client_email:'rose@email.com',    type:'birthday',     subject:'Happy Birthday! 10% off your next visit 🎂', status:'opened',  sent_at:daysAgo(14,9,0)},
      {id:'e7', client_id:'c6', client_name:'Grace Davis',     client_email:'grace@email.com',   type:'receipt',      subject:'Your Acrylic Full Set Receipt — CA$60',     status:'sent',    sent_at:daysAgo(10,13,46)},
      {id:'e8', client_id:'c2', client_name:'Emma Johnson',    client_email:'emma@email.com',    type:'review',       subject:'How was your visit? Leave a review!',       status:'clicked', sent_at:daysAgo(1,12,0)}
    ]
  };

  // Auto-load demo data if Supabase not connected
  SB.loadAll = (function(original) {
    return function() {
      return original().catch(function() {
        SB.CACHE.clients   = SB.DEMO.clients;
        SB.CACHE.payments  = SB.DEMO.payments;
        SB.CACHE.bookings  = SB.DEMO.bookings;
        SB.CACHE.email_log = SB.DEMO.email_log;
        SB.CACHE.loaded.bookings = true;
        SB.CACHE.loaded.clients  = true;
        SB.CACHE.loaded.payments = true;
        return Promise.resolve();
      });
    };
  }(SB.loadAll));

  // Also override insert/update/delete to work locally in demo mode
  SB.insert = (function(original) {
    return function(table, data) {
      var localData = Object.assign({}, data, {
        id: 'demo_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        created_at: new Date().toISOString()
      });
      return original(table, data).catch(function() {
        if (SB.CACHE[table]) SB.CACHE[table].unshift(localData);
        return Promise.resolve([localData]);
      });
    };
  }(SB.insert));

  SB.update = (function(original) {
    return function(table, id, data) {
      return original(table, id, data).catch(function() {
        if (SB.CACHE[table]) {
          var item = SB.CACHE[table].find(function(r){ return r.id === id; });
          if (item) Object.assign(item, data);
        }
        return Promise.resolve([]);
      });
    };
  }(SB.update));

}());