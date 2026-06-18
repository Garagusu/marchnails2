/* ═══════════════════════════════════════════════
   MARCH NAILS BI — CHARTS.JS
   Chart.js wrapper, drill-down, heatmaps
   ═══════════════════════════════════════════════ */

var Charts = (function() {
  'use strict';

  var instances = {};

  // Default chart options
  var DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(26,29,46,.95)',
        titleColor: '#EDE9F6',
        bodyColor: '#9CA3AF',
        borderColor: '#E2E4EC',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {}
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(0,0,0,.04)', drawBorder: false },
        ticks: { color: '#9298B5', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(0,0,0,.04)', drawBorder: false },
        ticks: { color: '#9298B5', font: { size: 10 } }
      }
    }
  };

  function deepMerge(target, source) {
    for (var key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  function getCtx(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
    return el.getContext('2d');
  }

  // ── Gradient helper ──
  function gradient(ctx, color1, color2, height) {
    var g = ctx.createLinearGradient(0, 0, 0, height || 200);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    return g;
  }

  // ── Revenue Bar ──
  function revenueBar(id, labels, data, compareData, onClick) {
    var ctx = getCtx(id);
    if (!ctx) return;
    var g1 = gradient(ctx, 'rgba(233,30,140,.85)', 'rgba(124,58,237,.25)');
    var datasets = [{
      label: 'Revenue', data: data,
      backgroundColor: g1, borderRadius: 6, borderSkipped: false
    }];
    if (compareData) {
      datasets.push({
        label: 'Previous period', data: compareData,
        backgroundColor: 'rgba(156,163,185,.4)', borderRadius: 6, borderSkipped: false
      });
    }
    var opts = deepMerge({}, DEFAULTS);
    opts.plugins.legend.display = !!compareData;
    opts.plugins.legend.labels = { color: '#9298B5', boxWidth: 10, padding: 10, font: { size: 10 } };
    opts.plugins.tooltip.callbacks.label = function(ctx) {
      return ' ' + Utils.fCurrency(ctx.raw);
    };
    if (onClick) {
      opts.onClick = function(e, elements) {
        if (elements.length) onClick(labels[elements[0].index], data[elements[0].index]);
      };
      opts.onHover = function(e, el) { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; };
    }
    instances[id] = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: datasets }, options: opts });
    return instances[id];
  }

  // ── Line Chart ──
  function lineChart(id, labels, datasets, onClick) {
    var ctx = getCtx(id);
    if (!ctx) return;
    var colors = ['#E91E8C','#7C3AED','#0891B2','#059669','#D97706'];
    var chartDatasets = datasets.map(function(ds, i) {
      var c = colors[i % colors.length];
      var g = gradient(ctx, hexToRgba(c, .18), hexToRgba(c, .01));
      return {
        label: ds.label, data: ds.data,
        borderColor: c, backgroundColor: g,
        fill: true, tension: .4,
        pointBackgroundColor: c, pointRadius: 3,
        pointHoverRadius: 5
      };
    });
    var opts = deepMerge({}, DEFAULTS);
    opts.plugins.legend.display = datasets.length > 1;
    opts.plugins.legend.labels = { color: '#9298B5', boxWidth: 10, padding: 10, font: { size: 10 } };
    opts.plugins.tooltip.callbacks.label = function(ctx) {
      return ' ' + ctx.dataset.label + ': ' + Utils.fCurrency(ctx.raw);
    };
    if (onClick) {
      opts.onClick = function(e, elements) {
        if (elements.length) onClick(labels[elements[0].index]);
      };
    }
    instances[id] = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: chartDatasets }, options: opts });
    return instances[id];
  }

  // ── Doughnut ──
  function doughnut(id, labels, data, colors) {
    var ctx = getCtx(id);
    if (!ctx) return;
    var clrs = colors || ['#E91E8C','#7C3AED','#0891B2','#059669','#D97706','#EF4444'];
    var opts = deepMerge({}, DEFAULTS);
    delete opts.scales;
    opts.plugins.legend = {
      display: true, position: 'right',
      labels: { color: '#6B7280', boxWidth: 10, padding: 8, font: { size: 10 } }
    };
    opts.plugins.tooltip.callbacks.label = function(ctx) {
      var total = ctx.dataset.data.reduce(function(a,b){return a+b;}, 0);
      var pct = total > 0 ? ((ctx.raw/total)*100).toFixed(1) : 0;
      return ' ' + ctx.label + ': ' + Utils.fCurrency(ctx.raw) + ' (' + pct + '%)';
    };
    opts.cutout = '68%';
    instances[id] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: clrs, borderWidth: 0 }] },
      options: opts
    });
    return instances[id];
  }

  // ── Horizontal Bar ──
  function hBar(id, labels, data, color) {
    var ctx = getCtx(id);
    if (!ctx) return;
    var c = color || '#E91E8C';
    var opts = deepMerge({}, DEFAULTS);
    opts.indexAxis = 'y';
    opts.plugins.tooltip.callbacks.label = function(ctx) {
      return ' ' + Utils.fCurrency(ctx.raw);
    };
    opts.scales.x.ticks.callback = function(v) { return Utils.fCurrency(v); };
    instances[id] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data, backgroundColor: c + 'CC',
          borderRadius: 5, borderSkipped: false,
          hoverBackgroundColor: c
        }]
      },
      options: opts
    });
    return instances[id];
  }

  // ── Staff comparison ──
  function staffComparison(id, staffNames, datasets) {
    var ctx = getCtx(id);
    if (!ctx) return;
    var colors = ['#E91E8C','#7C3AED','#0891B2','#D97706'];
    var chartDatasets = datasets.map(function(ds, i) {
      return {
        label: ds.label, data: ds.data,
        backgroundColor: colors[i % colors.length] + 'CC',
        borderRadius: 5, borderSkipped: false
      };
    });
    var opts = deepMerge({}, DEFAULTS);
    opts.plugins.legend = {
      display: true, position: 'top',
      labels: { color: '#9298B5', boxWidth: 10, padding: 10, font: { size: 10 } }
    };
    instances[id] = new Chart(ctx, {
      type: 'bar', data: { labels: staffNames, datasets: chartDatasets }, options: opts
    });
  }

  // ── Booking status doughnut ──
  function bookingStatus(id, confirmed, pending, completed, cancelled, noshow) {
    return doughnut(
      id,
      ['Confirmed','Pending','Completed','Cancelled','No-show'],
      [confirmed, pending, completed, cancelled, noshow],
      ['#3B82F6','#F59E0B','#10B981','#9CA3AF','#EF4444']
    );
  }

  // ── Heatmap: hours × days ──
  function heatmap(containerId, data) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var hours = ['9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm'];
    var max = 0;
    data.forEach(function(row) { row.forEach(function(v) { if (v > max) max = v; }); });

    var html = '<div style="display:grid;grid-template-columns:32px repeat(' + hours.length + ',1fr);gap:2px;margin-bottom:4px">' +
      '<div></div>' + hours.map(function(h) {
        return '<div style="font-size:.58rem;color:var(--text3);text-align:center">' + h + '</div>';
      }).join('') + '</div>';

    data.forEach(function(row, di) {
      html += '<div style="display:grid;grid-template-columns:32px repeat(' + hours.length + ',1fr);gap:2px;margin-bottom:2px">';
      html += '<div style="font-size:.62rem;color:var(--text3);display:flex;align-items:center">' + days[di] + '</div>';
      row.forEach(function(v, hi) {
        var level = max > 0 ? Math.ceil((v / max) * 5) : 0;
        html += '<div class="heatmap-cell heat-' + level + '" title="' + days[di] + ' ' + hours[hi] + ': ' + v + ' bookings" style="height:20px;border-radius:3px"></div>';
      });
      html += '</div>';
    });
    container.innerHTML = html;
  }

  // ── Sparkline ──
  function sparkline(id, data, color) {
    var ctx = getCtx(id);
    if (!ctx) return;
    var c = color || '#E91E8C';
    instances[id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(function(_, i) { return i; }),
        datasets: [{ data: data, borderColor: c, borderWidth: 2, fill: false, tension: .4, pointRadius: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 300 }
      }
    });
  }

  // ── Helpers ──
  function hexToRgba(hex, alpha) {
    var r = 0, g = 0, b = 0;
    if (hex.length === 7) {
      r = parseInt(hex.slice(1,3),16);
      g = parseInt(hex.slice(3,5),16);
      b = parseInt(hex.slice(5,7),16);
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function destroyAll() {
    Object.keys(instances).forEach(destroy);
  }

  return {
    revenueBar: revenueBar,
    lineChart: lineChart,
    doughnut: doughnut,
    hBar: hBar,
    staffComparison: staffComparison,
    bookingStatus: bookingStatus,
    heatmap: heatmap,
    sparkline: sparkline,
    destroy: destroy,
    destroyAll: destroyAll
  };
})();