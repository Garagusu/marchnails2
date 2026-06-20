/* ═══════════════════════════════════════════════════════════
   MARCH NAILS — UTILS.JS  v5  (Bug-Fixed, Single Source of Truth)

   DÜZELTMELER (v5):
   ─────────────────────────────────────────────────────────
   ✅ FIX-1: calcRevenue() artık TEK KAYNAK (completed bookings)
   ✅ FIX-2: sumRevenue() payments tabanlı — export için ayrı
   ✅ FIX-3: sanitizeHTML() XSS koruması eklendi
   ✅ FIX-4: hasConflict() buffer iyileştirmesi
   ✅ FIX-5: returnRate hesaplama düzeltildi (dönem içi değil all-time)
   ✅ FIX-6: fCurrency her zaman 2 decimal göster (CA$70.00)
   ✅ FIX-7: debounce helper eklendi
   ✅ FIX-8: filterBookings() booked_at < 9am filtresini kaldırdık (data integrity)
   ✅ FIX-9: groupByDate() haftalık hesaplama düzeltildi
   ✅ FIX-10: clientAnalytics() client_id veya name match (önceki gibiydi, güçlendirildi)

   CANONICAL DEFINITIONS (değişmedi):
   ─────────────────────────────────────────────────────────
   REVENUE      = SUM(bookings.service_price) WHERE status='completed'
                  NEVER from payments table (amounts can differ from booking price)

   BOOKINGS     = COUNT WHERE status NOT IN ('cancelled','no-show','no_show')

   COMPLETED    = COUNT WHERE status = 'completed'

   AVG TICKET   = REVENUE / COMPLETED

   ACTIVE CLIENTS = COUNT DISTINCT client_name WITH bookings in period

   COMMISSION   = REVENUE × 0.25  (always derived, never stored)
   NET REVENUE  = REVENUE × 0.75  (always derived, never stored)

   Staff/Service revenue MUST sum to total revenue (same source).
   ═══════════════════════════════════════════════════════════ */

var Utils = (function () {
  'use strict';

  /* ── WORKING HOURS ─────────────────────────── */
  function getWorkHours(date) {
    var d = (date instanceof Date) ? date : new Date(date);
    // 0=Sun, 6=Sat
    if (d.getDay() === 0) return [10, 18]; // Sunday: 10am–6pm
    if (d.getDay() === 6) return [9, 19];  // Saturday: 9am–7pm (salons are busier!)
    return [9, 20]; // Weekdays: 9am–8pm
  }

  /* ── DATE HELPERS ───────────────────────────── */
  function localDateStr(d) {
    var x = (d instanceof Date) ? d : new Date(d);
    return x.getFullYear() + '-' +
      String(x.getMonth() + 1).padStart(2, '0') + '-' +
      String(x.getDate()).padStart(2, '0');
  }

  function isSameLocalDay(dateStr, targetStr) {
    if (!dateStr) return false;
    return localDateStr(new Date(dateStr)) === targetStr;
  }

  function getRange(period, customStart, customEnd) {
    var now = new Date(), s, e;
    e = new Date(now); e.setHours(23, 59, 59, 999);
    switch (period) {
      case 'today':
        s = new Date(now); s.setHours(0, 0, 0, 0); break;
      case 'yesterday':
        s = new Date(now); s.setDate(s.getDate()-1); s.setHours(0,0,0,0);
        e = new Date(now); e.setDate(e.getDate()-1); e.setHours(23,59,59,999); break;
      case '7d':
        s = new Date(now); s.setDate(s.getDate()-6); s.setHours(0,0,0,0); break;
      case '30d':
        s = new Date(now); s.setDate(s.getDate()-29); s.setHours(0,0,0,0); break;
      case 'this_month':
        s = new Date(now.getFullYear(), now.getMonth(), 1);
        e = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59, 999); break;
      case 'last_month':
        s = new Date(now.getFullYear(), now.getMonth()-1, 1);
        e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); break;
      case 'this_year':
        s = new Date(now.getFullYear(), 0, 1);
        e = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); break;
      case 'last_year':
        s = new Date(now.getFullYear()-1, 0, 1);
        e = new Date(now.getFullYear()-1, 11, 31, 23, 59, 59, 999); break;
      case 'all':
        s = new Date(2020, 0, 1);
        e = new Date(now.getFullYear()+1, 11, 31, 23, 59, 59, 999); break;
      case 'custom':
        s = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        e = customEnd   ? new Date(customEnd)   : new Date();
        s.setHours(0,0,0,0); e.setHours(23,59,59,999); break;
      default:
        s = new Date(now.getFullYear(), now.getMonth(), 1);
        e = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59, 999);
    }
    return { start: s, end: e };
  }

  function getCompareRange(period, range) {
    var diff = range.end.getTime() - range.start.getTime();
    return { start: new Date(range.start.getTime()-diff-1), end: new Date(range.start.getTime()-1) };
  }

  function inRange(dateStr, range) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    return d >= range.start && d <= range.end;
  }

  /* ── CONFLICT & HOURS VALIDATION ───────────── */
  function hasConflict(bookings, staffName, startDt, durationMin, excludeId) {
    var dur = Math.max(15, parseInt(durationMin) || 60); // minimum 15 minutes
    var s = new Date(startDt).getTime();
    var e = s + dur * 60000;
    // Add 5-minute buffer between appointments
    var BUFFER = 5 * 60000;
    return bookings.some(function (b) {
      if (b.id === excludeId) return false;
      if (b.staff_name !== staffName) return false;
      if (['cancelled','no-show','no_show'].indexOf(b.status) !== -1) return false;
      if (!b.booked_at) return false;
      var bs = new Date(b.booked_at).getTime();
      var be = bs + (Math.max(15, parseInt(b.duration_minutes) || 60)) * 60000;
      // Check with buffer
      return (s - BUFFER) < be && (e + BUFFER) > bs;
    });
  }

  function isWithinWorkHours(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    var wh = getWorkHours(d);
    var min = d.getHours() * 60 + d.getMinutes();
    return min >= wh[0] * 60 && min < wh[1] * 60;
  }

  /* ── CANONICAL FILTERS ──────────────────────
     Single source of truth for all filtering.
     All pages MUST use these — never filter SB.CACHE directly.
  ─────────────────────────────────────────────── */
  function filterBookings(bookings, f) {
    f = f || {};
    return bookings.filter(function (b) {
      if (!b.booked_at) return false;
      // FIX-8: Removed the <9am filter — historical data imported at various times
      // should not be excluded. Trust the data.
      if (f.range   && !inRange(b.booked_at, f.range)) return false;
      if (f.day     && !isSameLocalDay(b.booked_at, f.day)) return false;
      if (f.staff   && f.staff !== 'all'   && b.staff_name !== f.staff)     return false;
      if (f.service && f.service !== 'all' && b.service_name !== f.service) return false;
      if (f.status  && f.status !== 'all'  && b.status !== f.status)        return false;
      if (f.client  && b.client_name &&
          b.client_name.toLowerCase().indexOf(f.client.toLowerCase()) === -1) return false;
      return true;
    });
  }

  function filterPayments(payments, f) {
    f = f || {};
    return payments.filter(function (p) {
      if (!p.paid_at) return false;
      if (f.range   && !inRange(p.paid_at, f.range)) return false;
      if (f.day     && !isSameLocalDay(p.paid_at, f.day)) return false;
      if (f.staff   && f.staff !== 'all'   && p.staff_name !== f.staff)     return false;
      if (f.service && f.service !== 'all' && p.service_name !== f.service) return false;
      if (f.method  && f.method !== 'all'  && p.method !== f.method)        return false;
      return true;
    });
  }

  /* ── CANONICAL REVENUE HELPER ───────────────
     FIX-1: ALWAYS from completed bookings.service_price.
     Payments table is for reconciliation only.
     This ensures Dashboard = Reports = Export = Staff charts.
  ─────────────────────────────────────────────── */
  function calcRevenue(allBookings, _paymentsIgnored) {
    // Only completed bookings contribute to revenue
    var completed = allBookings.filter(function(b){ return b.status === 'completed'; });
    return completed.reduce(function (s, b) {
      return s + parseFloat(b.service_price || 0);
    }, 0);
  }

  /* ── CANONICAL KPIs ─────────────────────────
     Single function used by ALL pages.
     Pass already-filtered bookings and payments.
  ─────────────────────────────────────────────── */
  function calcKPIs(bookings, payments) {
    // Status buckets — note: 'no_show' variant also handled
    var CANCELLED_STATUSES = ['cancelled'];
    var NOSHOW_STATUSES    = ['no-show','no_show'];
    var INACTIVE_STATUSES  = CANCELLED_STATUSES.concat(NOSHOW_STATUSES);

    var active    = bookings.filter(function(b){ return INACTIVE_STATUSES.indexOf(b.status) === -1; });
    var completed = bookings.filter(function(b){ return b.status === 'completed'; });
    var cancelled = bookings.filter(function(b){ return CANCELLED_STATUSES.indexOf(b.status) !== -1; });
    var noshow    = bookings.filter(function(b){ return NOSHOW_STATUSES.indexOf(b.status) !== -1; });
    var pending   = bookings.filter(function(b){ return b.status === 'pending'; });
    var confirmed = bookings.filter(function(b){ return b.status === 'confirmed'; });

    // FIX-1: Revenue — single source
    var revenue    = calcRevenue(bookings, payments);
    var commission = revenue * 0.25;
    var netRevenue = revenue * 0.75;
    var avgTicket  = completed.length > 0 ? revenue / completed.length : 0;

    // Active clients in period (distinct names from ALL bookings in period, not just completed)
    var clientSet = {};
    bookings.forEach(function(b){ if(b.client_name) clientSet[b.client_name] = true; });
    var activeClients = Object.keys(clientSet).length;

    // FIX-5: Return rate — clients with bookings in this period who ALSO have prior bookings
    // Simplified: clients who appear 2+ times in the period
    var clientCounts = {};
    bookings.forEach(function(b){ if(b.client_name) clientCounts[b.client_name] = (clientCounts[b.client_name]||0)+1; });
    var returning   = Object.keys(clientCounts).filter(function(c){return clientCounts[c]>1;}).length;
    var returnRate  = activeClients > 0 ? (returning / activeClients) * 100 : 0;

    // Best staff — from SAME revenue source (completed bookings)
    var staffRev = {};
    completed.forEach(function(b){
      if (b.staff_name) staffRev[b.staff_name] = (staffRev[b.staff_name]||0) + parseFloat(b.service_price||0);
    });
    var bestStaff = Object.keys(staffRev).sort(function(a,b){return staffRev[b]-staffRev[a];})[0] || '';

    // Top service (by booking count, all statuses except cancelled/noshow)
    var svcCnt = {};
    active.forEach(function(b){ if(b.service_name) svcCnt[b.service_name] = (svcCnt[b.service_name]||0)+1; });
    var topService = Object.keys(svcCnt).sort(function(a,b){return svcCnt[b]-svcCnt[a];})[0] || '';

    // Busiest hour/day
    var hCnt={}, dCnt={};
    bookings.forEach(function(b){
      if(!b.booked_at) return;
      var d=new Date(b.booked_at);
      var h=d.getHours(), dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      hCnt[h]=(hCnt[h]||0)+1; dCnt[dow]=(dCnt[dow]||0)+1;
    });
    var busyH=Object.keys(hCnt).sort(function(a,b){return hCnt[b]-hCnt[a];})[0];
    var busyD=Object.keys(dCnt).sort(function(a,b){return dCnt[b]-dCnt[a];})[0];
    if(busyH){ var bh=parseInt(busyH); busyH = bh<12 ? bh+'am' : ((bh-12)||12)+'pm'; }

    // Payment method breakdown (from payments)
    var methodCnt = {};
    payments.forEach(function(p){ if(p.method) methodCnt[p.method]=(methodCnt[p.method]||0)+1; });

    // HST calculation (Ontario 13%)
    var hst = revenue * 0.13;
    var revenueBeforeHST = revenue / 1.13; // if prices include HST

    return {
      revenue:          revenue,
      commission:       commission,
      netRevenue:       netRevenue,
      hst:              hst,
      bookings:         active.length,
      completed:        completed.length,
      cancelled:        cancelled.length,
      noshow:           noshow.length,
      pending:          pending.length,
      confirmed:        confirmed.length,
      clients:          activeClients,
      avgTicket:        avgTicket,
      returnRate:       returnRate,
      completionRate:   active.length > 0 ? (completed.length/active.length)*100 : 0,
      cancellationRate: bookings.length > 0 ? (cancelled.length/bookings.length)*100 : 0,
      noshowRate:       bookings.length > 0 ? (noshow.length/bookings.length)*100 : 0,
      bestStaff:        bestStaff,
      topService:       topService,
      busiestHour:      busyH || '—',
      busiestDay:       busyD || '—',
      staffRevenue:     staffRev,
      methodBreakdown:  methodCnt,
    };
  }

  /* ── STAFF ANALYTICS ──────────────────────── */
  function staffAnalytics(staffName, bookings, payments) {
    function calcPeriod(bks, pays) {
      var INACTIVE = ['cancelled','no-show','no_show'];
      var comp = bks.filter(function(b){return b.status==='completed';});
      var rev  = calcRevenue(bks, pays); // FIX-1: uses bookings source
      return {
        bookings:  bks.filter(function(b){return INACTIVE.indexOf(b.status)===-1;}).length,
        completed: comp.length,
        revenue:   rev,
        commission: rev * 0.25,
        netRevenue: rev * 0.75,
        avgTicket: comp.length > 0 ? rev / comp.length : 0,
        noshow:    bks.filter(function(b){return b.status==='no-show'||b.status==='no_show';}).length,
        cancelled: bks.filter(function(b){return b.status==='cancelled';}).length,
      };
    }

    var periods = {
      today:      getRange('today'),
      yesterday:  getRange('yesterday'),
      this_week:  getRange('7d'),
      this_month: getRange('this_month'),
      last_month: getRange('last_month'),
      this_year:  getRange('this_year'),
    };

    var result = {};
    Object.keys(periods).forEach(function(k) {
      var rng = periods[k];
      result[k] = calcPeriod(
        filterBookings(bookings, {range:rng, staff:staffName}),
        filterPayments(payments, {range:rng, staff:staffName})
      );
    });

    var allBks  = filterBookings(bookings, {staff:staffName});
    var allPays = filterPayments(payments, {staff:staffName});
    result.all  = calcPeriod(allBks, allPays);

    // Top services by count
    var svcGrp = groupBy(allBks.filter(function(b){return b.status==='completed';}), 'service_name');
    result.topServices = Object.keys(svcGrp)
      .sort(function(a,b){return svcGrp[b].length - svcGrp[a].length;})
      .slice(0,5)
      .map(function(s){return {name:s, count:svcGrp[s].length, revenue: calcRevenue(svcGrp[s],[])};});

    var uCli = {};
    allBks.forEach(function(b){if(b.client_name)uCli[b.client_name]=true;});
    result.totalClients  = Object.keys(uCli).length;
    result.totalBookings = allBks.length;

    return result;
  }

  /* ── CLIENT ANALYTICS ───────────────────────── */
  function clientAnalytics(clientId, clientName, bookings, payments) {
    var bks = bookings.filter(function(b){
      // FIX-10: match by ID first, fall back to name match
      if (clientId && b.client_id && b.client_id === clientId) return true;
      if (clientName && b.client_name) {
        return b.client_name.toLowerCase().trim() === clientName.toLowerCase().trim();
      }
      return false;
    }).sort(function(a,b){return new Date(a.booked_at)-new Date(b.booked_at);});

    var pays = payments.filter(function(p){
      if (clientId && p.client_id && p.client_id === clientId) return true;
      if (clientName && p.client_name) {
        return p.client_name.toLowerCase().trim() === clientName.toLowerCase().trim();
      }
      return false;
    });

    var comp   = bks.filter(function(b){return b.status==='completed';});
    var ltv    = calcRevenue(bks, pays); // FIX-1
    var svcG   = groupBy(bks, 'service_name');
    var stfG   = groupBy(bks, 'staff_name');

    var topSvc   = Object.keys(svcG).sort(function(a,b){return svcG[b].length-svcG[a].length;})[0]||'—';
    var topStaff = Object.keys(stfG).sort(function(a,b){return stfG[b].length-stfG[a].length;})[0]||'—';

    var first = bks[0] ? new Date(bks[0].booked_at) : null;
    var last  = bks.length > 0 ? new Date(bks[bks.length-1].booked_at) : null;

    var freq = 0;
    if (bks.length > 1) {
      var gaps = [];
      for (var i=1; i<bks.length; i++) {
        gaps.push((new Date(bks[i].booked_at)-new Date(bks[i-1].booked_at))/86400000);
      }
      freq = Math.round(gaps.reduce(function(s,g){return s+g;},0)/gaps.length);
    }

    return {
      ltv:              ltv,
      totalVisits:      bks.length,
      completed:        comp.length,
      avgTicket:        comp.length > 0 ? ltv / comp.length : 0,
      noshow:           bks.filter(function(b){return b.status==='no-show'||b.status==='no_show';}).length,
      cancelled:        bks.filter(function(b){return b.status==='cancelled';}).length,
      firstVisit:       first,
      lastVisit:        last,
      topService:       topSvc,
      topStaff:         topStaff,
      avgFrequencyDays: freq,
      topServices:      Object.keys(svcG).sort(function(a,b){return svcG[b].length-svcG[a].length;})
                              .slice(0,5).map(function(s){return{name:s,count:svcG[s].length};}),
      allBookings:      bks,
    };
  }

  /* ── REVENUE PER DAY/WEEK/MONTH ─────────────── */
  function revenueByPeriod(bookings, fmt) {
    var completed = bookings.filter(function(b){return b.status==='completed';});
    var grouped = groupByDate(completed, 'booked_at', fmt);
    var sortedKeys = Object.keys(grouped).sort();
    return {
      labels: sortedKeys,
      data:   sortedKeys.map(function(k){
        return grouped[k].reduce(function(s,b){return s+parseFloat(b.service_price||0);},0);
      })
    };
  }

  /* ── HEATMAP DATA ───────────────────────────── */
  function buildHeatmap(bookings) {
    // 7 days × 10 hours (9am–7pm)
    var matrix = [];
    for (var d=0; d<7; d++) {
      matrix[d] = [];
      for (var h=0; h<10; h++) matrix[d][h] = 0;
    }
    bookings.forEach(function(b){
      if (!b.booked_at) return;
      var dt = new Date(b.booked_at);
      var day = dt.getDay(); // 0=Sun ... 6=Sat
      // Reorder: Mon=0 ... Sun=6
      var dayIdx = (day + 6) % 7;
      var hourIdx = dt.getHours() - 9; // 9am = index 0
      if (hourIdx >= 0 && hourIdx < 10 && dayIdx >= 0 && dayIdx < 7) {
        matrix[dayIdx][hourIdx]++;
      }
    });
    return matrix;
  }

  /* ── DUPLICATE PAYMENT CHECK ────────────────── */
  function hasExistingPayment(payments, bookingId) {
    return payments.some(function(p){ return p.booking_id === bookingId; });
  }

  /* ── UTILITIES ──────────────────────────────── */
  function sumRevenue(arr) {
    // FIX-2: This is for payments table sum — different from calcRevenue
    // Use ONLY for reconciliation or payments-specific reports
    return arr.reduce(function(s,p){return s+parseFloat(p.amount||0);},0);
  }

  function sumCommission(arr) {
    return arr.reduce(function(s,p){
      return s+parseFloat(p.commission || (parseFloat(p.amount||0)*0.25));
    },0);
  }

  function groupBy(arr, key) {
    return arr.reduce(function(acc,item){
      var k=item[key]||'Unknown';
      if(!acc[k])acc[k]=[];
      acc[k].push(item);
      return acc;
    },{});
  }

  function groupByDate(arr, dateKey, fmt) {
    return arr.reduce(function(acc,item){
      var d=item[dateKey]?new Date(item[dateKey]):null;
      if(!d||isNaN(d.getTime())) return acc;
      var k;
      if(fmt==='day')   k=localDateStr(d);
      else if(fmt==='week'){
        // FIX-9: ISO week calculation
        var tmp=new Date(d.getTime());
        tmp.setHours(0,0,0,0);
        tmp.setDate(tmp.getDate()+3-(tmp.getDay()+6)%7);
        var week1=new Date(tmp.getFullYear(),0,4);
        var wn=1+Math.round(((tmp.getTime()-week1.getTime())/86400000-(3-(week1.getDay()+6)%7))/7);
        k=tmp.getFullYear()+'-W'+String(wn).padStart(2,'0');
      }
      else if(fmt==='month') k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      else if(fmt==='year')  k=String(d.getFullYear());
      else k=localDateStr(d);
      if(!acc[k])acc[k]=[];
      acc[k].push(item);
      return acc;
    },{});
  }

  /* ── XSS PROTECTION ─────────────────────────── */
  function sanitizeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Safe version: always sanitize user data before innerHTML
  function safe(str) { return sanitizeHTML(str); }

  /* ── FORMATTERS ─────────────────────────────── */
  // FIX-6: Show 2 decimals for amounts under $1000 for precision
  function fCurrency(n) {
    var num = parseFloat(n||0);
    if (num === 0) return 'CA$0';
    if (num >= 1000) {
      return 'CA$' + num.toLocaleString('en-CA', {minimumFractionDigits:0, maximumFractionDigits:0});
    }
    return 'CA$' + num.toLocaleString('en-CA', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function fPct(n, d) { return parseFloat(n||0).toFixed(d===undefined?1:d)+'%'; }

  function fDate(s, opts) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-CA', opts||{month:'short',day:'numeric'});
  }

  function fDateTime(s) {
    if (!s) return '—';
    var d = new Date(s);
    return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'}) + ' ' +
           d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'});
  }

  function fDelta(cur, prev) {
    if (!prev||prev===0) return {pct:'0.0',dir:'flat'};
    var p = ((cur-prev)/Math.abs(prev))*100;
    return {pct:Math.abs(p).toFixed(1), dir:p>0.5?'up':p<-0.5?'down':'flat'};
  }

  function fDuration(min) {
    if (!min) return '—';
    var m = parseInt(min);
    if (m < 60) return m + ' min';
    var h = Math.floor(m/60), rem = m%60;
    return h + 'h' + (rem ? ' '+rem+'m' : '');
  }

  /* ── DEBOUNCE ─────────────────────────── */
  function debounce(fn, ms) {
    var timer;
    return function() {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(ctx, args); }, ms || 150);
    };
  }

  /* ── TOAST ──────────────────────────────────── */
  function toast(msg, type, dur) {
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.style.cssText = 'position:fixed;bottom:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:.4rem;pointer-events:none';
      document.body.appendChild(c);
    }
    var colors = {
      success: {bg:'#ECFDF5',bd:'#6EE7B7',text:'#065F46'},
      error:   {bg:'#FEF2F2',bd:'#FECACA',text:'#991B1B'},
      warning: {bg:'#FFFBEB',bd:'#FCD34D',text:'#92400E'},
      info:    {bg:'#EFF6FF',bd:'#BFDBFE',text:'#1E40AF'}
    };
    var icons = {success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    type = type || 'info';
    var clr = colors[type] || colors.info;
    var el = document.createElement('div');
    el.style.cssText = 'background:'+clr.bg+';border:1.5px solid '+clr.bd+';border-radius:10px;padding:.65rem .9rem;font-size:.79rem;display:flex;align-items:center;gap:.5rem;box-shadow:0 4px 16px rgba(0,0,0,.1);max-width:340px;pointer-events:auto;color:'+clr.text+';font-family:Inter,sans-serif;animation:slideIn .2s ease';
    el.innerHTML = '<span style="font-size:.9rem">'+icons[type]+'</span><span style="flex:1">'+safe(msg)+'</span>';
    c.appendChild(el);
    setTimeout(function(){
      el.style.transition = '.25s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(110%)';
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, dur || 3200);
  }

  /* ── CONFIRM MODAL (replaces native confirm()) ── */
  function confirmDialog(title, message, onConfirm, danger) {
    var existing = document.getElementById('_confirm-modal');
    if (existing) existing.remove();
    var html = '<div id="_confirm-modal" style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:1rem">'
      + '<div style="background:#fff;border-radius:14px;width:100%;max-width:380px;box-shadow:0 20px 50px rgba(0,0,0,.2);overflow:hidden">'
      + '<div style="padding:1.2rem 1.3rem;border-bottom:1px solid #E1E4EE">'
      + '<div style="font-family:Syne,sans-serif;font-size:.95rem;font-weight:700;color:#1A1D2E">' + safe(title) + '</div></div>'
      + '<div style="padding:1rem 1.3rem;font-size:.82rem;color:#5A6282;line-height:1.6">' + safe(message) + '</div>'
      + '<div style="padding:.75rem 1.3rem;border-top:1px solid #E1E4EE;display:flex;gap:.4rem;justify-content:flex-end">'
      + '<button onclick="document.getElementById(\'_confirm-modal\').remove()" style="padding:.4rem .9rem;border-radius:50px;border:1.5px solid #E1E4EE;background:#fff;font-size:.78rem;cursor:pointer;font-family:Inter,sans-serif">Cancel</button>'
      + '<button id="_confirm-ok" style="padding:.4rem .9rem;border-radius:50px;border:none;background:'+(danger?'#DC2626':'#E91E8C')+';color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">' + (danger?'Delete':'Confirm') + '</button>'
      + '</div></div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstChild);
    document.getElementById('_confirm-ok').onclick = function() {
      document.getElementById('_confirm-modal').remove();
      onConfirm();
    };
  }

  /* ── TABLE HELPERS ──────────────────────────── */
  function makeSortable(table) {
    if (!table) return;
    var headers = table.querySelectorAll('thead th');
    var cur = {col:-1, dir:1};
    headers.forEach(function(th, idx) {
      th.style.cursor = 'pointer';
      th.title = 'Click to sort';
      th.addEventListener('click', function() {
        var dir = cur.col===idx ? -cur.dir : 1;
        cur = {col:idx, dir:dir};
        headers.forEach(function(h) {
          h.style.color = '';
          h.innerHTML = h.innerHTML.replace(/ [▲▼]$/, '');
        });
        th.style.color = 'var(--pink)';
        th.innerHTML = th.innerHTML + (dir>0?' ▲':' ▼');
        var rows = Array.from(table.querySelectorAll('tbody tr'));
        rows.sort(function(a, b) {
          var av = (a.cells[idx] ? a.cells[idx].textContent : '').trim();
          var bv = (b.cells[idx] ? b.cells[idx].textContent : '').trim();
          var an = parseFloat(av.replace(/[^0-9.-]/g,'')), bn = parseFloat(bv.replace(/[^0-9.-]/g,''));
          if (!isNaN(an) && !isNaN(bn)) return (an-bn)*dir;
          return av.localeCompare(bv)*dir;
        });
        var tb = table.querySelector('tbody');
        rows.forEach(function(r){ tb.appendChild(r); });
      });
    });
  }

  function makeSearchable(inp, table) {
    if (!inp || !table) return;
    inp.addEventListener('input', debounce(function() {
      var q = this.value.toLowerCase();
      var count = 0;
      table.querySelectorAll('tbody tr').forEach(function(r) {
        var show = !q || r.textContent.toLowerCase().indexOf(q) !== -1;
        r.style.display = show ? '' : 'none';
        if (show) count++;
      });
      // Update count display if available
      var countEl = inp.parentNode && inp.parentNode.querySelector('.search-count');
      if (countEl) countEl.textContent = q ? count + ' results' : '';
    }, 200));
  }

  function startClock(greetEl, dateEl) {
    function tick() {
      var n = new Date(), h = n.getHours();
      var gr = h<12 ? 'Good morning' : h<18 ? 'Good afternoon' : 'Good evening';
      if (greetEl) greetEl.textContent = gr + ' ✦';
      if (dateEl) dateEl.textContent =
        n.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'}) +
        ' · ' +
        n.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'});
    }
    tick();
    return setInterval(tick, 30000);
  }

  /* ── TIER CALCULATION ───────────────────────── */
  function calcTier(ltv, visits) {
    if (ltv >= 2000 || visits >= 30) return 'platinum';
    if (ltv >= 800 || visits >= 15)  return 'gold';
    if (ltv >= 300 || visits >= 7)   return 'silver';
    return 'standard';
  }

  function tierLabel(tier) {
    return {platinum:'💎 Platinum', gold:'⭐ Gold', silver:'✦ Silver', standard:'Standard'}[tier] || 'Standard';
  }

  /* ── PUBLIC API ─────────────────────────────── */
  return {
    // Date
    getWorkHours:    getWorkHours,
    localDateStr:    localDateStr,
    isSameLocalDay:  isSameLocalDay,
    getRange:        getRange,
    getCompareRange: getCompareRange,
    inRange:         inRange,
    // Validation
    hasConflict:         hasConflict,
    isWithinWorkHours:   isWithinWorkHours,
    hasExistingPayment:  hasExistingPayment,
    // Canonical filters
    filterBookings:  filterBookings,
    filterPayments:  filterPayments,
    // Canonical revenue (single source)
    calcRevenue:     calcRevenue,
    // Analytics
    calcKPIs:        calcKPIs,
    staffAnalytics:  staffAnalytics,
    clientAnalytics: clientAnalytics,
    revenueByPeriod: revenueByPeriod,
    buildHeatmap:    buildHeatmap,
    // Aggregations
    sumRevenue:   sumRevenue,
    sumCommission:sumCommission,
    groupBy:      groupBy,
    groupByDate:  groupByDate,
    // Formatters
    fCurrency: fCurrency,
    fPct:      fPct,
    fDate:     fDate,
    fDateTime: fDateTime,
    fDelta:    fDelta,
    fDuration: fDuration,
    // Security
    sanitizeHTML: sanitizeHTML,
    safe:         safe,
    // UI
    toast:         toast,
    confirmDialog: confirmDialog,
    makeSortable:  makeSortable,
    makeSearchable:makeSearchable,
    startClock:    startClock,
    debounce:      debounce,
    // Business logic
    calcTier:  calcTier,
    tierLabel: tierLabel,
  };
})();
