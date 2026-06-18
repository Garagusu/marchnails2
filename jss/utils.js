/* ═══════════════════════════════════════════════
   MARCH NAILS BI — UTILS.JS
   Date helpers, formatters, calculations
   ═══════════════════════════════════════════════ */

var Utils = (function() {
  'use strict';

  // ── Date ranges ──
  function getRange(period, customStart, customEnd) {
    var now = new Date();
    var start, end;
    end = new Date(now); end.setHours(23,59,59,999);

    switch (period) {
      case 'today':
        start = new Date(now); start.setHours(0,0,0,0);
        break;
      case 'yesterday':
        start = new Date(now); start.setDate(start.getDate()-1); start.setHours(0,0,0,0);
        end   = new Date(now); end.setDate(end.getDate()-1);     end.setHours(23,59,59,999);
        break;
      case '7d':
        start = new Date(now); start.setDate(start.getDate()-6); start.setHours(0,0,0,0);
        break;
      case '30d':
        start = new Date(now); start.setDate(start.getDate()-29); start.setHours(0,0,0,0);
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth()-1, 1);
        end   = new Date(now.getFullYear(), now.getMonth(), 0, 23,59,59,999);
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        end   = new Date(now.getFullYear(), 11, 31, 23,59,59,999);
        break;
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        end   = customEnd   ? new Date(customEnd)   : new Date();
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        break;
      default:
        start = new Date(now); start.setDate(start.getDate()-29); start.setHours(0,0,0,0);
    }
    return { start: start, end: end };
  }

  function getCompareRange(period, range) {
    var diff = range.end - range.start;
    return {
      start: new Date(range.start - diff - 1),
      end:   new Date(range.start - 1)
    };
  }

  function inRange(dateStr, range) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    return d >= range.start && d <= range.end;
  }

  // ── Format ──
  function fCurrency(n, decimals) {
    var d = decimals !== undefined ? decimals : 0;
    return 'CA$' + parseFloat(n || 0).toLocaleString('en-CA', {
      minimumFractionDigits: d, maximumFractionDigits: d
    });
  }

  function fPct(n, decimals) {
    var d = decimals !== undefined ? decimals : 1;
    return parseFloat(n || 0).toFixed(d) + '%';
  }

  function fNum(n) {
    return parseInt(n || 0).toLocaleString('en-CA');
  }

  function fDate(dateStr, opts) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-CA', opts || { month: 'short', day: 'numeric' });
  }

  function fDateTime(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
  }

  function fDelta(current, previous) {
    if (!previous || previous === 0) return { pct: 0, dir: 'flat' };
    var pct = ((current - previous) / previous) * 100;
    return {
      pct: Math.abs(pct).toFixed(1),
      dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
      sign: pct > 0 ? '+' : pct < 0 ? '-' : ''
    };
  }

  // ── Filter data ──
  function filterBookings(bookings, filters) {
    return bookings.filter(function(b) {
      // Date range
      if (filters.range && !inRange(b.booked_at, filters.range)) return false;
      // Staff
      if (filters.staff && filters.staff !== 'all' && b.staff_name !== filters.staff) return false;
      // Service
      if (filters.service && filters.service !== 'all' && b.service_name !== filters.service) return false;
      // Status
      if (filters.status && filters.status !== 'all' && b.status !== filters.status) return false;
      // Payment method
      if (filters.method && filters.method !== 'all' && b.payment_method !== filters.method) return false;
      return true;
    });
  }

  function filterClients(clients, filters) {
    return clients.filter(function(c) {
      if (filters.tier && filters.tier !== 'all' && c.tier !== filters.tier) return false;
      if (filters.search) {
        var q = filters.search.toLowerCase();
        var name = ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase();
        if (name.indexOf(q) === -1 && (c.email || '').toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // ── Aggregate ──
  function sumRevenue(payments) {
    return payments.reduce(function(s, p) { return s + parseFloat(p.amount || 0); }, 0);
  }

  function sumCommission(payments) {
    return payments.reduce(function(s, p) { return s + parseFloat(p.commission || 0); }, 0);
  }

  function avgTicket(payments) {
    if (!payments.length) return 0;
    return sumRevenue(payments) / payments.length;
  }

  function groupBy(arr, key) {
    return arr.reduce(function(acc, item) {
      var k = item[key] || 'Unknown';
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }

  function groupByDate(arr, dateKey, fmt) {
    return arr.reduce(function(acc, item) {
      var d = item[dateKey] ? new Date(item[dateKey]) : null;
      if (!d) return acc;
      var k;
      if (fmt === 'day')   k = d.toISOString().split('T')[0];
      else if (fmt === 'week') {
        var jan1 = new Date(d.getFullYear(), 0, 1);
        var wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
        k = d.getFullYear() + '-W' + String(wk).padStart(2,'0');
      }
      else if (fmt === 'month') k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      else if (fmt === 'year')  k = String(d.getFullYear());
      else k = d.toISOString().split('T')[0];
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }

  // ── KPI calculation ──
  function calcKPIs(bookings, payments, clients, range) {
    var rangeBookings = range ? bookings.filter(function(b) { return inRange(b.booked_at, range); }) : bookings;
    var rangePayments = range ? payments.filter(function(p) { return inRange(p.paid_at, range); }) : payments;

    var totalRevenue   = sumRevenue(rangePayments);
    var totalBookings  = rangeBookings.length;
    var completedBk    = rangeBookings.filter(function(b) { return b.status === 'completed'; });
    var cancelledBk    = rangeBookings.filter(function(b) { return b.status === 'cancelled'; });
    var noshowBk       = rangeBookings.filter(function(b) { return b.status === 'no-show'; });
    var paidPayments   = rangePayments.filter(function(p) { return p.amount > 0; });

    // Best staff
    var staffGroups = groupBy(rangePayments, 'staff_name');
    var bestStaff = '';
    var bestStaffRev = 0;
    Object.keys(staffGroups).forEach(function(s) {
      var rev = sumRevenue(staffGroups[s]);
      if (rev > bestStaffRev) { bestStaffRev = rev; bestStaff = s; }
    });

    // Most popular service
    var svcGroups = groupBy(rangeBookings, 'service_name');
    var topService = '';
    var topServiceCount = 0;
    Object.keys(svcGroups).forEach(function(s) {
      if (svcGroups[s].length > topServiceCount) { topServiceCount = svcGroups[s].length; topService = s; }
    });

    // Busiest day
    var dayGroups = groupByDate(rangeBookings, 'booked_at', 'day');
    var busiestDay = '';
    var busiestCount = 0;
    Object.keys(dayGroups).forEach(function(d) {
      if (dayGroups[d].length > busiestCount) { busiestCount = dayGroups[d].length; busiestDay = d; }
    });

    // Busiest hour
    var hourCounts = {};
    rangeBookings.forEach(function(b) {
      if (b.booked_at) {
        var h = new Date(b.booked_at).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
    });
    var busiestHour = Object.keys(hourCounts).sort(function(a,b) { return hourCounts[b]-hourCounts[a]; })[0];
    if (busiestHour !== undefined) busiestHour = busiestHour + ':00';

    // Return rate (clients with 2+ bookings)
    var clientBookings = groupBy(rangeBookings, 'client_name');
    var returning = Object.keys(clientBookings).filter(function(c) { return clientBookings[c].length > 1; });
    var returnRate = Object.keys(clientBookings).length > 0
      ? (returning.length / Object.keys(clientBookings).length) * 100 : 0;

    return {
      revenue:       totalRevenue,
      bookings:      totalBookings,
      clients:       clients.length,
      avgTicket:     paidPayments.length ? totalRevenue / paidPayments.length : 0,
      completionRate: totalBookings > 0 ? (completedBk.length / totalBookings) * 100 : 0,
      noshowRate:    totalBookings > 0 ? (noshowBk.length / totalBookings) * 100 : 0,
      cancellationRate: totalBookings > 0 ? (cancelledBk.length / totalBookings) * 100 : 0,
      bestStaff:     bestStaff,
      bestStaffRev:  bestStaffRev,
      topService:    topService,
      topServiceCount: topServiceCount,
      busiestDay:    busiestDay,
      busiestHour:   busiestHour,
      returnRate:    returnRate,
      commission:    sumCommission(rangePayments),
      netRevenue:    totalRevenue - sumCommission(rangePayments)
    };
  }

  // ── Toast ──
  function toast(msg, type, duration) {
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    var icons = {
      success: '<i class="fa-solid fa-circle-check" style="color:var(--green)"></i>',
      error:   '<i class="fa-solid fa-circle-xmark" style="color:var(--red)"></i>',
      info:    '<i class="fa-solid fa-circle-info" style="color:var(--blue)"></i>',
      warning: '<i class="fa-solid fa-triangle-exclamation" style="color:var(--amber)"></i>'
    };
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.innerHTML = (icons[type] || icons.info) + '<span>' + msg + '</span>';
    container.appendChild(el);
    setTimeout(function() {
      el.style.opacity = '0';
      el.style.transform = 'translateX(110%)';
      el.style.transition = 'all .25s';
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, duration || 3500);
  }

  // ── Clock ──
  function startClock(el1, el2) {
    function tick() {
      var n = new Date();
      var h = n.getHours();
      var gr = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      if (el1) el1.textContent = gr + ' \u2726';
      if (el2) el2.textContent =
        n.toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric' }) +
        '  ' + n.toLocaleTimeString('en-CA', { hour:'2-digit', minute:'2-digit' });
    }
    tick();
    return setInterval(tick, 60000);
  }

  // ── Table sort ──
  function makeSortable(table) {
    var headers = table.querySelectorAll('thead th');
    var currentSort = { col: -1, dir: 1 };
    headers.forEach(function(th, idx) {
      th.addEventListener('click', function() {
        var rows = Array.from(table.querySelectorAll('tbody tr'));
        var dir = (currentSort.col === idx) ? -currentSort.dir : 1;
        currentSort = { col: idx, dir: dir };
        headers.forEach(function(h) { h.classList.remove('sort-asc','sort-desc'); });
        th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');
        rows.sort(function(a, b) {
          var av = (a.cells[idx] ? a.cells[idx].textContent : '').trim();
          var bv = (b.cells[idx] ? b.cells[idx].textContent : '').trim();
          var an = parseFloat(av.replace(/[^0-9.-]/g,''));
          var bn = parseFloat(bv.replace(/[^0-9.-]/g,''));
          if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
          return av.localeCompare(bv) * dir;
        });
        var tbody = table.querySelector('tbody');
        rows.forEach(function(r) { tbody.appendChild(r); });
      });
    });
  }

  // ── Search filter ──
  function makeSearchable(inputEl, tableEl) {
    inputEl.addEventListener('input', function() {
      var q = this.value.toLowerCase();
      var rows = tableEl.querySelectorAll('tbody tr');
      var visible = 0;
      rows.forEach(function(row) {
        var match = row.textContent.toLowerCase().indexOf(q) !== -1;
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      var info = tableEl.closest('.card, .card-wrap');
      if (info) {
        var infoEl = info.querySelector('.table-info');
        if (infoEl) infoEl.textContent = visible + ' results';
      }
    });
  }

  return {
    getRange: getRange,
    getCompareRange: getCompareRange,
    inRange: inRange,
    fCurrency: fCurrency,
    fPct: fPct,
    fNum: fNum,
    fDate: fDate,
    fDateTime: fDateTime,
    fDelta: fDelta,
    filterBookings: filterBookings,
    filterClients: filterClients,
    sumRevenue: sumRevenue,
    sumCommission: sumCommission,
    avgTicket: avgTicket,
    groupBy: groupBy,
    groupByDate: groupByDate,
    calcKPIs: calcKPIs,
    toast: toast,
    startClock: startClock,
    makeSortable: makeSortable,
    makeSearchable: makeSearchable
  };
})();