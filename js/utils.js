/* ═══════════════════════════════════════════════
   MARCH NAILS — UTILS.JS v3
   ═══════════════════════════════════════════════ */
var Utils = (function() {
  'use strict';

  /* ── WORKING HOURS ─────────────────────────── */
  function getWorkHours(date) {
    var d = date instanceof Date ? date : new Date(date);
    var dow = d.getDay(); // 0=Sun
    return dow === 0 ? [10,18] : [9,20];
  }

  /* ── LOCAL DATE STRING (no UTC shift) ──────── */
  function localDateStr(date) {
    var d = date instanceof Date ? date : new Date(date);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  /* ── IS SAME LOCAL DAY ──────────────────────── */
  function isSameLocalDay(dateStr, targetStr) {
    if (!dateStr) return false;
    return localDateStr(new Date(dateStr)) === targetStr;
  }

  /* ── DATE RANGES ────────────────────────────── */
  function getRange(period, customStart, customEnd) {
    var now = new Date(), start, end;
    end = new Date(now); end.setHours(23,59,59,999);
    switch (period) {
      case 'today':
        start = new Date(now); start.setHours(0,0,0,0); break;
      case 'yesterday':
        start = new Date(now); start.setDate(start.getDate()-1); start.setHours(0,0,0,0);
        end   = new Date(now); end.setDate(end.getDate()-1);     end.setHours(23,59,59,999); break;
      case '7d':
        start = new Date(now); start.setDate(start.getDate()-6); start.setHours(0,0,0,0); break;
      case '30d':
        start = new Date(now); start.setDate(start.getDate()-29); start.setHours(0,0,0,0); break;
      case 'this_month':
        start = new Date(now.getFullYear(),now.getMonth(),1);
        end   = new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999); break;
      case 'last_month':
        start = new Date(now.getFullYear(),now.getMonth()-1,1);
        end   = new Date(now.getFullYear(),now.getMonth(),0,23,59,59,999); break;
      case 'this_year':
        start = new Date(now.getFullYear(),0,1);
        end   = new Date(now.getFullYear(),11,31,23,59,59,999); break;
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(),now.getMonth(),1);
        end   = customEnd   ? new Date(customEnd)   : new Date();
        start.setHours(0,0,0,0); end.setHours(23,59,59,999); break;
      default:
        start = new Date(now.getFullYear(),now.getMonth(),1);
        end   = new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999);
    }
    return { start:start, end:end };
  }

  function getCompareRange(period, range) {
    var diff = range.end - range.start;
    return { start:new Date(range.start.getTime()-diff-1), end:new Date(range.start.getTime()-1) };
  }

  function inRange(dateStr, range) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    return d >= range.start && d <= range.end;
  }

  /* ── CONFLICT DETECTION ─────────────────────── */
  function hasConflict(bookings, staffName, startDt, durationMin, excludeId) {
    var s = new Date(startDt).getTime();
    var e = s + (durationMin||60)*60000;
    return bookings.some(function(b) {
      if (b.id === excludeId) return false;
      if (b.staff_name !== staffName) return false;
      if (b.status==='cancelled'||b.status==='no-show'||b.status==='no_show') return false;
      if (!b.booked_at) return false;
      var bs = new Date(b.booked_at).getTime();
      var be = bs + (parseInt(b.duration_minutes)||60)*60000;
      return s < be && e > bs;
    });
  }

  /* ── WORKING HOURS VALIDATION ───────────────── */
  function isWithinWorkHours(dateStr) {
    if (!dateStr) return false;
    var d  = new Date(dateStr);
    var wh = getWorkHours(d);
    var min = d.getHours()*60 + d.getMinutes();
    return min >= wh[0]*60 && min < wh[1]*60;
  }

  /* ── UNIFIED FILTERS ────────────────────────── */
  function filterBookings(bookings, f) {
    return bookings.filter(function(b) {
      if (!b.booked_at) return false;
      if (new Date(b.booked_at).getHours() < 9) return false;
      if (f.range   && !inRange(b.booked_at, f.range)) return false;
      if (f.day     && !isSameLocalDay(b.booked_at, f.day)) return false;
      if (f.staff   && f.staff!=='all'   && b.staff_name!==f.staff)     return false;
      if (f.service && f.service!=='all' && b.service_name!==f.service) return false;
      if (f.status  && f.status!=='all'  && b.status!==f.status)        return false;
      if (f.client  && b.client_name && b.client_name.toLowerCase().indexOf(f.client.toLowerCase())===-1) return false;
      return true;
    });
  }

  function filterPayments(payments, f) {
    return payments.filter(function(p) {
      if (!p.paid_at) return false;
      if (f.range   && !inRange(p.paid_at, f.range)) return false;
      if (f.day     && !isSameLocalDay(p.paid_at, f.day)) return false;
      if (f.staff   && f.staff!=='all'   && p.staff_name!==f.staff)     return false;
      if (f.service && f.service!=='all' && p.service_name!==f.service) return false;
      if (f.method  && f.method!=='all'  && p.method!==f.method)        return false;
      return true;
    });
  }

  /* ── AGGREGATIONS ───────────────────────────── */
  function sumRevenue(arr) { return arr.reduce(function(s,p){return s+parseFloat(p.amount||0);},0); }
  function sumCommission(arr) { return arr.reduce(function(s,p){return s+parseFloat(p.commission||parseFloat(p.amount||0)*.25);},0); }
  function groupBy(arr,key) {
    return arr.reduce(function(acc,item){var k=item[key]||'Unknown';if(!acc[k])acc[k]=[];acc[k].push(item);return acc;},{});
  }
  function groupByDate(arr,dateKey,fmt) {
    return arr.reduce(function(acc,item){
      var d=item[dateKey]?new Date(item[dateKey]):null; if(!d) return acc;
      var k;
      if(fmt==='day')   k=localDateStr(d);
      else if(fmt==='week'){var j=new Date(d.getFullYear(),0,1);var w=Math.ceil(((d-j)/86400000+j.getDay()+1)/7);k=d.getFullYear()+'-W'+String(w).padStart(2,'0');}
      else if(fmt==='month') k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      else if(fmt==='year')  k=String(d.getFullYear());
      else k=localDateStr(d);
      if(!acc[k])acc[k]=[];acc[k].push(item);return acc;
    },{});
  }

  /* ── KPIs ───────────────────────────────────── */
  function calcKPIs(bookings, payments, clients, range) {
    var rBk  = range ? bookings.filter(function(b){return inRange(b.booked_at,range);}) : bookings;
    var rPay = range ? payments.filter(function(p){return inRange(p.paid_at,range);})   : payments;
    var comp = rBk.filter(function(b){return b.status==='completed';});
    var canc = rBk.filter(function(b){return b.status==='cancelled';});
    var ns   = rBk.filter(function(b){return b.status==='no-show'||b.status==='no_show';});
    var revP = sumRevenue(rPay);
    var revB = comp.reduce(function(s,b){return s+parseFloat(b.service_price||0);},0);
    var rev  = Math.max(revP,revB);
    var comm = rev*.25;
    var stgP = groupBy(rPay,'staff_name');
    var bsRev=0, bestStaff='';
    Object.keys(stgP).forEach(function(s){var r=sumRevenue(stgP[s]);if(r>bsRev){bsRev=r;bestStaff=s;}});
    if(!bestStaff){var stgB=groupBy(comp,'staff_name');Object.keys(stgB).forEach(function(s){var r=stgB[s].reduce(function(x,b){return x+parseFloat(b.service_price||0);},0);if(r>bsRev){bsRev=r;bestStaff=s;}});}
    var svcG=groupBy(rBk,'service_name'),topSvc='',topSvcN=0;
    Object.keys(svcG).forEach(function(s){if(svcG[s].length>topSvcN){topSvcN=svcG[s].length;topSvc=s;}});
    var bkByC=groupBy(rBk,'client_name'),ret=Object.keys(bkByC).filter(function(c){return bkByC[c].length>1;}).length;
    var busiestHour='',busiestDay='',hCnt={},dCnt={};
    rBk.forEach(function(b){if(!b.booked_at)return;var d=new Date(b.booked_at);var h=d.getHours();var day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];hCnt[h]=(hCnt[h]||0)+1;dCnt[day]=(dCnt[day]||0)+1;});
    Object.keys(hCnt).forEach(function(h){if(!busiestHour||hCnt[h]>hCnt[busiestHour])busiestHour=h;});
    Object.keys(dCnt).forEach(function(d){if(!busiestDay||dCnt[d]>dCnt[busiestDay])busiestDay=d;});
    if(busiestHour) busiestHour=(parseInt(busiestHour)<12?busiestHour+'am':(parseInt(busiestHour)-12||12)+'pm');
    var avgTk = rPay.length>0 ? rev/rPay.length : (comp.length>0?rev/comp.length:0);
    return {
      revenue:rev, commission:comm, netRevenue:rev-comm,
      bookings:rBk.length, completed:comp.length, cancelled:canc.length, noshow:ns.length,
      pending:rBk.filter(function(b){return b.status==='pending';}).length,
      clients:(clients||[]).length, avgTicket:avgTk,
      completionRate:rBk.length>0?(comp.length/rBk.length)*100:0,
      cancellationRate:rBk.length>0?(canc.length/rBk.length)*100:0,
      noshowRate:rBk.length>0?(ns.length/rBk.length)*100:0,
      returnRate:Object.keys(bkByC).length>0?(ret/Object.keys(bkByC).length)*100:0,
      bestStaff:bestStaff, topService:topSvc,
      busiestHour:busiestHour, busiestDay:busiestDay,
    };
  }

  /* ── STAFF ANALYTICS ────────────────────────── */
  function staffAnalytics(staffName, bookings, payments) {
    function calc(bks,pays) {
      var comp=bks.filter(function(b){return b.status==='completed';});
      var rev=Math.max(sumRevenue(pays),comp.reduce(function(s,b){return s+parseFloat(b.service_price||0);},0));
      return {bookings:bks.length,completed:comp.length,revenue:rev,commission:rev*.25,netRevenue:rev*.75,
        avgTicket:comp.length>0?rev/comp.length:0,
        noshow:bks.filter(function(b){return b.status==='no-show'||b.status==='no_show';}).length,
        cancelled:bks.filter(function(b){return b.status==='cancelled';}).length};
    }
    var periods={
      today:getRange('today'),yesterday:getRange('yesterday'),
      this_week:getRange('7d'),this_month:getRange('this_month'),
      last_month:getRange('last_month'),this_year:getRange('this_year')
    };
    var result={};
    Object.keys(periods).forEach(function(k){
      var rng=periods[k];
      result[k]=calc(filterBookings(bookings,{range:rng,staff:staffName}),filterPayments(payments,{range:rng,staff:staffName}));
    });
    var allBks=filterBookings(bookings,{staff:staffName});
    var allPays=filterPayments(payments,{staff:staffName});
    result.all=calc(allBks,allPays);
    var svcG=groupBy(allBks,'service_name');
    result.topServices=Object.keys(svcG).sort(function(a,b){return svcG[b].length-svcG[a].length;}).slice(0,5).map(function(s){return {name:s,count:svcG[s].length};});
    var uCli={};allBks.forEach(function(b){if(b.client_name)uCli[b.client_name]=true;});
    result.totalClients=Object.keys(uCli).length;
    // Monthly revenue for chart (last 6 months)
    var monthly=groupByDate(allPays,'paid_at','month');
    var monthlyBk=groupByDate(allBks.filter(function(b){return b.status==='completed';}),'booked_at','month');
    result.monthlyRevenue=monthly;
    result.monthlyBookings=monthlyBk;
    return result;
  }

  /* ── CLIENT ANALYTICS ───────────────────────── */
  function clientAnalytics(clientId, clientName, bookings, payments) {
    var bks=bookings.filter(function(b){return b.client_id===clientId||b.client_name===clientName;})
      .sort(function(a,b){return new Date(a.booked_at)-new Date(b.booked_at);});
    var pays=payments.filter(function(p){return p.client_id===clientId||p.client_name===clientName;});
    var comp=bks.filter(function(b){return b.status==='completed';});
    var ltv=Math.max(sumRevenue(pays),comp.reduce(function(s,b){return s+parseFloat(b.service_price||0);},0));
    var svcG=groupBy(bks,'service_name'),stfG=groupBy(bks,'staff_name');
    var topSvc=Object.keys(svcG).sort(function(a,b){return svcG[b].length-svcG[a].length;})[0]||'—';
    var topStaff=Object.keys(stfG).sort(function(a,b){return stfG[b].length-stfG[a].length;})[0]||'—';
    var first=bks[0]?new Date(bks[0].booked_at):null;
    var last=bks.length>0?new Date(bks[bks.length-1].booked_at):null;
    var freq=0;
    if(bks.length>1){var gaps=[];for(var i=1;i<bks.length;i++)gaps.push((new Date(bks[i].booked_at)-new Date(bks[i-1].booked_at))/(86400000));freq=Math.round(gaps.reduce(function(s,g){return s+g;},0)/gaps.length);}
    return {
      ltv:ltv,totalVisits:bks.length,completed:comp.length,avgTicket:comp.length>0?ltv/comp.length:0,
      noshow:bks.filter(function(b){return b.status==='no-show'||b.status==='no_show';}).length,
      firstVisit:first,lastVisit:last,topService:topSvc,topStaff:topStaff,
      avgFrequencyDays:freq,
      topServices:Object.keys(svcG).sort(function(a,b){return svcG[b].length-svcG[a].length;}).slice(0,3).map(function(s){return {name:s,count:svcG[s].length};}),
      recentBookings:bks.slice(-5).reverse(),
    };
  }

  /* ── FORMAT HELPERS ─────────────────────────── */
  function fCurrency(n){return 'CA$'+parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:0,maximumFractionDigits:0});}
  function fPct(n,d){return parseFloat(n||0).toFixed(d===undefined?1:d)+'%';}
  function fDate(s,opts){if(!s)return '—';return new Date(s).toLocaleDateString('en-CA',opts||{month:'short',day:'numeric'});}
  function fDateTime(s){if(!s)return '—';var d=new Date(s);return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'});}
  function fDelta(cur,prev){if(!prev||prev===0)return{pct:'0.0',dir:'flat'};var p=((cur-prev)/Math.abs(prev))*100;return{pct:Math.abs(p).toFixed(1),dir:p>0.5?'up':p<-0.5?'down':'flat'};}

  /* ── TOAST ──────────────────────────────────── */
  function toast(msg,type,dur) {
    var c=document.getElementById('toast-container');
    if(!c){c=document.createElement('div');c.id='toast-container';c.style.cssText='position:fixed;bottom:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:.4rem;pointer-events:none';document.body.appendChild(c);}
    var icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    type=type||'info';
    var colors={success:'#ECFDF5;border-color:#6EE7B7',error:'#FEF2F2;border-color:#FECACA',warning:'#FFFBEB;border-color:#FCD34D',info:'#EFF6FF;border-color:#BFDBFE'};
    var el=document.createElement('div');
    el.style.cssText='background:'+colors[type]+';border:1.5px solid;border-radius:10px;padding:.65rem .9rem;font-size:.79rem;display:flex;align-items:center;gap:.5rem;box-shadow:0 4px 16px rgba(0,0,0,.1);max-width:300px;pointer-events:auto;color:#111827;font-family:Inter,sans-serif';
    el.innerHTML='<span>'+icons[type]+'</span><span>'+msg+'</span>';
    c.appendChild(el);
    setTimeout(function(){el.style.transition='.2s';el.style.opacity='0';el.style.transform='translateX(110%)';setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},200);},dur||3200);
  }

  /* ── TABLE HELPERS ──────────────────────────── */
  function makeSortable(table) {
    if(!table) return;
    var headers=table.querySelectorAll('thead th'),cur={col:-1,dir:1};
    headers.forEach(function(th,idx){
      th.style.cursor='pointer';
      th.addEventListener('click',function(){
        var dir=cur.col===idx?-cur.dir:1; cur={col:idx,dir:dir};
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
  function startClock(greetEl,dateEl){
    function tick(){
      var n=new Date(),h=n.getHours();
      var gr=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
      if(greetEl)greetEl.textContent=gr+' ✦';
      if(dateEl)dateEl.textContent=n.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'})+' · '+n.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'});
    }
    tick(); return setInterval(tick,30000);
  }

  return {
    getWorkHours:getWorkHours, localDateStr:localDateStr, isSameLocalDay:isSameLocalDay,
    getRange:getRange, getCompareRange:getCompareRange, inRange:inRange,
    hasConflict:hasConflict, isWithinWorkHours:isWithinWorkHours,
    filterBookings:filterBookings, filterPayments:filterPayments,
    sumRevenue:sumRevenue, sumCommission:sumCommission, groupBy:groupBy, groupByDate:groupByDate,
    calcKPIs:calcKPIs, staffAnalytics:staffAnalytics, clientAnalytics:clientAnalytics,
    fCurrency:fCurrency, fPct:fPct, fDate:fDate, fDateTime:fDateTime, fDelta:fDelta,
    toast:toast, makeSortable:makeSortable, makeSearchable:makeSearchable, startClock:startClock,
  };
})();
