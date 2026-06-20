/* ═══════════════════════════════════════════════════════════
   MARCH NAILS — UTILS.JS  v4  (Single Source of Truth)
   
   CANONICAL DEFINITIONS:
   ─────────────────────────────────────────────────────────
   REVENUE      = SUM(payments.amount) WHERE paid
                  fallback → SUM(bookings.service_price) WHERE status='completed'
                  ONE source per query, never mix.

   BOOKINGS     = COUNT WHERE status NOT IN ('cancelled','no-show','no_show')
                  i.e. active bookings: pending+confirmed+arrived+in_progress+completed

   COMPLETED    = COUNT WHERE status = 'completed'

   AVG TICKET   = REVENUE / COMPLETED  (never divide by payment count)

   ACTIVE CLIENTS = COUNT DISTINCT client_name WITH bookings in period
                    (NOT SB.CACHE.clients.length)

   COMMISSION   = REVENUE × 0.25  (always derived)
   NET REVENUE  = REVENUE × 0.75  (always derived)

   Staff/Service revenue MUST sum to total revenue (same source).
   ═══════════════════════════════════════════════════════════ */

var Utils = (function () {
  'use strict';

  /* ── WORKING HOURS ─────────────────────────── */
  function getWorkHours(date) {
    var d = (date instanceof Date) ? date : new Date(date);
    return d.getDay() === 0 ? [10, 18] : [9, 20]; // Sun 10-18, else 9-20
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
    var s = new Date(startDt).getTime();
    var e = s + (durationMin || 60) * 60000;
    return bookings.some(function (b) {
      if (b.id === excludeId) return false;
      if (b.staff_name !== staffName) return false;
      if (b.status === 'cancelled' || b.status === 'no-show' || b.status === 'no_show') return false;
      if (!b.booked_at) return false;
      var bs = new Date(b.booked_at).getTime();
      var be = bs + (parseInt(b.duration_minutes) || 60) * 60000;
      return s < be && e > bs;
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
     These are the ONLY filter functions used everywhere.
     All pages must use filterBookings / filterPayments.
     Never filter SB.CACHE directly in page code.
  ─────────────────────────────────────────────── */
  function filterBookings(bookings, f) {
    f = f || {};
    return bookings.filter(function (b) {
      if (!b.booked_at) return false;
      // Always exclude before 9am
      if (new Date(b.booked_at).getHours() < 9) return false;
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

  /* ── REVENUE HELPER ─────────────────────────
     Single function to get revenue from a set of
     bookings + payments. Prefers payments; falls
     back to completed bookings. Never mixes.
  ─────────────────────────────────────────────── */
  // Revenue = SUM of service_price for completed bookings
  // Simple, single source, no ambiguity.
  function calcRevenue(completedBookings, payments) {
    return completedBookings.reduce(function (s, b) {
      return s + parseFloat(b.service_price || 0);
    }, 0);
  }

  /* ── CANONICAL KPIs ─────────────────────────
     Single function used by ALL pages.
     Pass already-filtered bookings and payments.
     Do NOT pass range (filtering is caller's job).
  ─────────────────────────────────────────────── */
  function calcKPIs(bookings, payments) {
    // Status buckets
    var active    = bookings.filter(function(b){return b.status!=='cancelled'&&b.status!=='no-show'&&b.status!=='no_show';});
    var completed = bookings.filter(function(b){return b.status==='completed';});
    var cancelled = bookings.filter(function(b){return b.status==='cancelled';});
    var noshow    = bookings.filter(function(b){return b.status==='no-show'||b.status==='no_show';});
    var pending   = bookings.filter(function(b){return b.status==='pending';});

    // Revenue — single source
    var revenue    = calcRevenue(completed, payments);
    var commission = revenue * 0.25;
    var netRevenue = revenue * 0.75;

    // Avg ticket = revenue / completed (not payment count)
    var avgTicket  = completed.length > 0 ? revenue / completed.length : 0;

    // Active clients in this period (distinct names)
    var clientSet = {};
    bookings.forEach(function(b){ if(b.client_name) clientSet[b.client_name] = true; });
    var activeClients = Object.keys(clientSet).length;

    // Return rate: clients with >1 booking in period
    var clientCounts = {};
    bookings.forEach(function(b){ if(b.client_name) clientCounts[b.client_name] = (clientCounts[b.client_name]||0)+1; });
    var returning  = Object.keys(clientCounts).filter(function(c){return clientCounts[c]>1;}).length;
    var returnRate = activeClients > 0 ? (returning / activeClients) * 100 : 0;

    // Best staff — from same revenue source
    var staffRev = {};
    payments.forEach(function(p){ staffRev[p.staff_name] = (staffRev[p.staff_name]||0) + parseFloat(p.amount||0); });
    if (!Object.keys(staffRev).length) {
      completed.forEach(function(b){ staffRev[b.staff_name] = (staffRev[b.staff_name]||0) + parseFloat(b.service_price||0); });
    }
    var bestStaff = Object.keys(staffRev).sort(function(a,b){return staffRev[b]-staffRev[a];})[0] || '';

    // Top service
    var svcCnt = {};
    bookings.forEach(function(b){ if(b.service_name) svcCnt[b.service_name] = (svcCnt[b.service_name]||0)+1; });
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
    if(busyH) busyH = parseInt(busyH)<12 ? busyH+'am' : (parseInt(busyH)-12||12)+'pm';

    return {
      // Revenue (all from same source)
      revenue:      revenue,
      commission:   commission,
      netRevenue:   netRevenue,
      // Counts
      bookings:     active.length,        // active only (not cancelled/noshow)
      completed:    completed.length,
      cancelled:    cancelled.length,
      noshow:       noshow.length,
      pending:      pending.length,
      // Clients
      clients:      activeClients,        // distinct in period
      // Averages
      avgTicket:    avgTicket,            // revenue / completed
      returnRate:   returnRate,
      completionRate: active.length > 0 ? (completed.length/active.length)*100 : 0,
      cancellationRate: bookings.length > 0 ? (cancelled.length/bookings.length)*100 : 0,
      noshowRate:   bookings.length > 0 ? (noshow.length/bookings.length)*100 : 0,
      // Bests
      bestStaff:    bestStaff,
      topService:   topService,
      busiestHour:  busyH || '—',
      busiestDay:   busyD || '—',
    };
  }

  /* ── STAFF ANALYTICS ────────────────────────
     Uses calcRevenue for consistency.
  ─────────────────────────────────────────────── */
  function staffAnalytics(staffName, bookings, payments) {
    function calcPeriod(bks, pays) {
      var comp = bks.filter(function(b){return b.status==='completed';});
      var rev  = calcRevenue(comp, pays);
      return {
        bookings:  bks.filter(function(b){return b.status!=='cancelled'&&b.status!=='no-show'&&b.status!=='no_show';}).length,
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

    // Top services by booking count
    var svcGrp = groupBy(allBks, 'service_name');
    result.topServices = Object.keys(svcGrp)
      .sort(function(a,b){return svcGrp[b].length - svcGrp[a].length;})
      .slice(0,5)
      .map(function(s){return {name:s, count:svcGrp[s].length};});

    var uCli = {};
    allBks.forEach(function(b){if(b.client_name)uCli[b.client_name]=true;});
    result.totalClients  = Object.keys(uCli).length;
    result.totalBookings = allBks.length;

    return result;
  }

  /* ── CLIENT ANALYTICS ───────────────────────── */
  function clientAnalytics(clientId, clientName, bookings, payments) {
    var bks = bookings.filter(function(b){
      return b.client_id === clientId || b.client_name === clientName;
    }).sort(function(a,b){return new Date(a.booked_at)-new Date(b.booked_at);});

    var pays = payments.filter(function(p){
      return p.client_id === clientId || p.client_name === clientName;
    });

    var comp = bks.filter(function(b){return b.status==='completed';});
    var ltv  = calcRevenue(comp, pays);
    var svcG = groupBy(bks, 'service_name');
    var stfG = groupBy(bks, 'staff_name');

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
      ltv:             ltv,
      totalVisits:     bks.length,
      completed:       comp.length,
      avgTicket:       comp.length > 0 ? ltv / comp.length : 0,
      noshow:          bks.filter(function(b){return b.status==='no-show'||b.status==='no_show';}).length,
      firstVisit:      first,
      lastVisit:       last,
      topService:      topSvc,
      topStaff:        topStaff,
      avgFrequencyDays:freq,
      topServices:     Object.keys(svcG).sort(function(a,b){return svcG[b].length-svcG[a].length;}).slice(0,3).map(function(s){return{name:s,count:svcG[s].length};}),
    };
  }

  /* ── UTILITIES ──────────────────────────────── */
  function sumRevenue(arr) {
    return arr.reduce(function(s,p){return s+parseFloat(p.amount||0);},0);
  }
  function sumCommission(arr) {
    return arr.reduce(function(s,p){return s+parseFloat(p.commission||parseFloat(p.amount||0)*.25);},0);
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
      if(!d) return acc;
      var k;
      if(fmt==='day')   k=localDateStr(d);
      else if(fmt==='week'){var j=new Date(d.getFullYear(),0,1);var w=Math.ceil(((d-j)/86400000+j.getDay()+1)/7);k=d.getFullYear()+'-W'+String(w).padStart(2,'0');}
      else if(fmt==='month') k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      else if(fmt==='year')  k=String(d.getFullYear());
      else k=localDateStr(d);
      if(!acc[k])acc[k]=[];
      acc[k].push(item);
      return acc;
    },{});
  }

  /* ── FORMATTERS ─────────────────────────────── */
  function fCurrency(n){return 'CA$'+parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:0,maximumFractionDigits:0});}
  function fPct(n,d){return parseFloat(n||0).toFixed(d===undefined?1:d)+'%';}
  function fDate(s,opts){if(!s)return'—';return new Date(s).toLocaleDateString('en-CA',opts||{month:'short',day:'numeric'});}
  function fDateTime(s){if(!s)return'—';var d=new Date(s);return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'});}
  function fDelta(cur,prev){if(!prev||prev===0)return{pct:'0.0',dir:'flat'};var p=((cur-prev)/Math.abs(prev))*100;return{pct:Math.abs(p).toFixed(1),dir:p>0.5?'up':p<-0.5?'down':'flat'};}

  /* ── TOAST ──────────────────────────────────── */
  function toast(msg,type,dur){
    var c=document.getElementById('toast-container');
    if(!c){c=document.createElement('div');c.id='toast-container';c.style.cssText='position:fixed;bottom:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:.4rem;pointer-events:none';document.body.appendChild(c);}
    var clr={success:'#ECFDF5;border-color:#6EE7B7',error:'#FEF2F2;border-color:#FECACA',warning:'#FFFBEB;border-color:#FCD34D',info:'#EFF6FF;border-color:#BFDBFE'};
    var ico={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    type=type||'info';
    var el=document.createElement('div');
    el.style.cssText='background:'+clr[type]+';border:1.5px solid;border-radius:10px;padding:.65rem .9rem;font-size:.79rem;display:flex;align-items:center;gap:.5rem;box-shadow:0 4px 16px rgba(0,0,0,.1);max-width:300px;pointer-events:auto;color:#111827;font-family:Inter,sans-serif';
    el.innerHTML='<span>'+ico[type]+'</span><span>'+msg+'</span>';
    c.appendChild(el);
    setTimeout(function(){el.style.transition='.2s';el.style.opacity='0';el.style.transform='translateX(110%)';setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},200);},dur||3200);
  }

  /* ── TABLE HELPERS ──────────────────────────── */
  function makeSortable(table){
    if(!table)return;
    var headers=table.querySelectorAll('thead th'),cur={col:-1,dir:1};
    headers.forEach(function(th,idx){
      th.style.cursor='pointer';
      th.addEventListener('click',function(){
        var dir=cur.col===idx?-cur.dir:1;cur={col:idx,dir:dir};
        headers.forEach(function(h){h.style.color='';});
        th.style.color='var(--pink)';
        var rows=Array.from(table.querySelectorAll('tbody tr'));
        rows.sort(function(a,b){
          var av=(a.cells[idx]?a.cells[idx].textContent:'').trim();
          var bv=(b.cells[idx]?b.cells[idx].textContent:'').trim();
          var an=parseFloat(av.replace(/[^0-9.-]/g,'')),bn=parseFloat(bv.replace(/[^0-9.-]/g,''));
          if(!isNaN(an)&&!isNaN(bn))return(an-bn)*dir;
          return av.localeCompare(bv)*dir;
        });
        var tb=table.querySelector('tbody');
        rows.forEach(function(r){tb.appendChild(r);});
      });
    });
  }

  function makeSearchable(inp,table){
    if(!inp||!table)return;
    inp.addEventListener('input',function(){
      var q=this.value.toLowerCase();
      table.querySelectorAll('tbody tr').forEach(function(r){
        r.style.display=!q||r.textContent.toLowerCase().indexOf(q)!==-1?'':'none';
      });
    });
  }

  function startClock(greetEl, dateEl){
    function tick(){
      var n=new Date(),h=n.getHours();
      var gr=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
      if(greetEl)greetEl.textContent=gr+' ✦';
      if(dateEl)dateEl.textContent=n.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'})+' · '+n.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'});
    }
    tick();
    return setInterval(tick,30000);
  }

  /* ── PUBLIC API ─────────────────────────────── */
  return {
    // Date
    getWorkHours:getWorkHours, localDateStr:localDateStr, isSameLocalDay:isSameLocalDay,
    getRange:getRange, getCompareRange:getCompareRange, inRange:inRange,
    // Validation
    hasConflict:hasConflict, isWithinWorkHours:isWithinWorkHours,
    // Canonical filters
    filterBookings:filterBookings, filterPayments:filterPayments,
    // Canonical revenue helper
    calcRevenue:calcRevenue,
    // Canonical KPIs (single source of truth)
    calcKPIs:calcKPIs, staffAnalytics:staffAnalytics, clientAnalytics:clientAnalytics,
    // Aggregations
    sumRevenue:sumRevenue, sumCommission:sumCommission, groupBy:groupBy, groupByDate:groupByDate,
    // Formatters
    fCurrency:fCurrency, fPct:fPct, fDate:fDate, fDateTime:fDateTime, fDelta:fDelta,
    // UI
    toast:toast, makeSortable:makeSortable, makeSearchable:makeSearchable, startClock:startClock,
  };
})();
