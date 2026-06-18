/* ═══════════════════════════════════════════════
   MARCH NAILS BI — EXPORT.JS
   Excel (CSV), PDF, CSV exports
   ═══════════════════════════════════════════════ */

var Export = (function() {
  'use strict';

  // ── CSV ──
  function toCSV(rows, headers) {
    var lines = [];
    if (headers) lines.push(headers.map(csvCell).join(','));
    rows.forEach(function(row) {
      if (Array.isArray(row)) {
        lines.push(row.map(csvCell).join(','));
      } else {
        lines.push(Object.values(row).map(csvCell).join(','));
      }
    });
    return lines.join('\n');
  }

  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadCSV(content, filename) {
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename + '.csv');
    Utils.toast('CSV downloaded: ' + filename, 'success');
  }

  // ── Excel (CSV with BOM for Excel compatibility) ──
  function downloadExcel(rows, headers, filename) {
    var csv = '\uFEFF' + toCSV(rows, headers); // BOM for Excel
    var blob = new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    downloadBlob(blob, filename + '.xlsx');
    Utils.toast('Excel downloaded: ' + filename, 'success');
  }

  // ── PDF (browser print) ──
  function downloadPDF(title, content) {
    var w = window.open('', '_blank');
    if (!w) { Utils.toast('Allow popups to export PDF', 'warning'); return; }

    w.document.write('<!DOCTYPE html><html><head>' +
      '<meta charset="UTF-8">' +
      '<title>' + title + '</title>' +
      '<style>' +
      'body{font-family:Inter,Arial,sans-serif;font-size:12px;color:#1A1D2E;padding:24px;max-width:1000px;margin:0 auto}' +
      'h1{font-size:18px;font-weight:700;margin-bottom:4px;color:#E91E8C}' +
      '.subtitle{font-size:11px;color:#9298B5;margin-bottom:20px}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:20px}' +
      'thead th{background:#F5F6FA;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9298B5;border-bottom:2px solid #E1E4EE}' +
      'tbody td{padding:8px 10px;border-bottom:1px solid #F0F1F6;font-size:11px}' +
      'tbody tr:hover td{background:#FDF2F8}' +
      '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}' +
      '.kpi-box{background:#F5F6FA;border-radius:8px;padding:12px;border-left:3px solid #E91E8C}' +
      '.kpi-val{font-size:20px;font-weight:700;color:#1A1D2E;margin-bottom:2px}' +
      '.kpi-lbl{font-size:10px;color:#9298B5}' +
      '.pos{color:#059669;font-weight:600}.neg{color:#DC2626;font-weight:600}' +
      '.footer{margin-top:32px;padding-top:12px;border-top:1px solid #E1E4EE;font-size:10px;color:#9298B5;display:flex;justify-content:space-between}' +
      '@media print{body{padding:0}@page{margin:20mm}}' +
      '</style></head><body>' +
      content +
      '<div class="footer"><span>March Nails Ottawa &mdash; Confidential</span><span>Generated: ' + new Date().toLocaleString('en-CA') + '</span></div>' +
      '<script>window.onload=function(){window.print();}<\/script>' +
      '</body></html>');
    w.document.close();
    Utils.toast('PDF export opened in new tab', 'success');
  }

  // ── Specific exports ──

  function exportBookings(bookings, period) {
    var headers = ['ID','Client','Service','Staff','Date','Price','Payment Method','Status'];
    var rows = bookings.map(function(b) {
      return [
        (b.id || '').slice(0,8),
        b.client_name || '',
        b.service_name || '',
        b.staff_name || '',
        Utils.fDateTime(b.booked_at),
        Utils.fCurrency(b.service_price),
        b.payment_method || '',
        b.status || ''
      ];
    });
    downloadExcel(rows, headers, 'appointments-' + (period || 'all'));
  }

  function exportPayments(payments, period) {
    var headers = ['Date','Client','Staff','Service','Amount','Method','Commission','Net Revenue'];
    var rows = payments.map(function(p) {
      return [
        Utils.fDateTime(p.paid_at),
        p.client_name || '',
        p.staff_name || '',
        p.service_name || '',
        Utils.fCurrency(p.amount),
        p.method || '',
        Utils.fCurrency(p.commission),
        Utils.fCurrency(p.net_revenue)
      ];
    });
    downloadExcel(rows, headers, 'payments-' + (period || 'all'));
  }

  function exportClients(clients) {
    var headers = ['First Name','Last Name','Email','Phone','Birthday','Tier','Loyalty Points','No-shows','Joined'];
    var rows = clients.map(function(c) {
      return [
        c.first_name || '', c.last_name || '',
        c.email || '', c.phone || '',
        c.birthday || '',
        c.tier || 'standard',
        c.loyalty_points || 0,
        c.no_show_count || 0,
        Utils.fDate(c.created_at)
      ];
    });
    downloadExcel(rows, headers, 'clients-' + Utils.fDate(new Date().toISOString()));
  }

  function exportRevenueReport(kpis, bookings, payments, period) {
    var kpiHtml = '<h1>Revenue Report &mdash; March Nails Ottawa</h1>' +
      '<div class="subtitle">Period: ' + period + ' &nbsp;&bull;&nbsp; Generated: ' + new Date().toLocaleDateString('en-CA', {month:'long',day:'numeric',year:'numeric'}) + '</div>' +
      '<div class="kpi-grid">' +
      '<div class="kpi-box"><div class="kpi-val">' + Utils.fCurrency(kpis.revenue) + '</div><div class="kpi-lbl">Total Revenue</div></div>' +
      '<div class="kpi-box"><div class="kpi-val">' + kpis.bookings + '</div><div class="kpi-lbl">Total Bookings</div></div>' +
      '<div class="kpi-box"><div class="kpi-val">' + Utils.fCurrency(kpis.avgTicket) + '</div><div class="kpi-lbl">Avg Ticket</div></div>' +
      '<div class="kpi-box"><div class="kpi-val">' + Utils.fCurrency(kpis.commission) + '</div><div class="kpi-lbl">Total Commission</div></div>' +
      '</div>';

    var staffGroups = Utils.groupBy(payments, 'staff_name');
    var staffRows = Object.keys(staffGroups).map(function(s) {
      var p = staffGroups[s];
      var rev = Utils.sumRevenue(p);
      var comm = Utils.sumCommission(p);
      return '<tr><td>' + s + '</td><td>' + p.length + '</td>' +
        '<td class="pos">' + Utils.fCurrency(rev) + '</td>' +
        '<td class="pos">' + Utils.fCurrency(comm) + '</td>' +
        '<td class="pos">' + Utils.fCurrency(rev - comm) + '</td></tr>';
    });

    var payRows = payments.slice(0, 100).map(function(p) {
      return '<tr><td>' + Utils.fDateTime(p.paid_at) + '</td><td>' + (p.client_name||'') + '</td>' +
        '<td>' + (p.staff_name||'') + '</td><td>' + (p.service_name||'') + '</td>' +
        '<td class="pos">' + Utils.fCurrency(p.amount) + '</td>' +
        '<td>' + (p.method||'') + '</td>' +
        '<td class="neg">' + Utils.fCurrency(p.commission) + '</td>' +
        '<td class="pos">' + Utils.fCurrency(p.net_revenue) + '</td></tr>';
    });

    var html = kpiHtml +
      '<h2 style="font-size:14px;font-weight:700;margin:16px 0 8px">Staff Revenue Breakdown</h2>' +
      '<table><thead><tr><th>Staff</th><th>Bookings</th><th>Revenue</th><th>Commission</th><th>Net</th></tr></thead><tbody>' + staffRows.join('') + '</tbody></table>' +
      '<h2 style="font-size:14px;font-weight:700;margin:16px 0 8px">Payment Details</h2>' +
      '<table><thead><tr><th>Date</th><th>Client</th><th>Staff</th><th>Service</th><th>Amount</th><th>Method</th><th>Commission</th><th>Net Revenue</th></tr></thead><tbody>' + payRows.join('') + '</tbody></table>';

    downloadPDF('Revenue Report — March Nails', html);
  }

  // ── Blob download ──
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  return {
    exportBookings: exportBookings,
    exportPayments: exportPayments,
    exportClients: exportClients,
    exportRevenueReport: exportRevenueReport,
    downloadCSV: downloadCSV,
    downloadExcel: downloadExcel,
    downloadPDF: downloadPDF,
    toCSV: toCSV
  };
})();