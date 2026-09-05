from pathlib import Path
import re

root=Path('/mnt/data/t7phase2')
for folder in [root, root/'MEDICAL POS']:
    html=folder/'index.html'; js=folder/'script.js'
    if not html.exists() or not js.exists(): continue
    h=html.read_text(errors='ignore')
    # Expense payment mode
    marker='''                                <div class="form-group">\n                                    <label>Date *</label>\n                                    <input type="date" id="exp-date" class="form-control" required>\n                                </div>'''
    repl='''                                <div class="form-group">\n                                    <label>Date *</label>\n                                    <input type="date" id="exp-date" class="form-control" required>\n                                </div>\n                                <div class="form-group">\n                                    <label>Payment Mode *</label>\n                                    <select id="exp-payment-mode" class="form-control">\n                                        <option value="Cash">Cash</option>\n                                        <option value="UPI">UPI</option>\n                                        <option value="Card">Card</option>\n                                        <option value="Bank">Bank</option>\n                                    </select>\n                                </div>'''
    if 'id="exp-payment-mode"' not in h and marker in h:
        h=h.replace(marker,repl)
    # Balance UI additions
    old='''                        <button class="btn btn-primary" onclick="saveBalanceDay()" style="margin-right:.5rem;">Save Day Balance</button>\n                        <button class="btn btn-outline" onclick="loadBalanceDate()">Recalculate</button>\n                        <div id="bal-day-summary" style="margin-top:1rem;padding:1rem;background:var(--bg-color);border-radius:10px;"></div>'''
    new='''                        <button class="btn btn-primary" onclick="saveBalanceDay()" style="margin-right:.5rem;">Save Day Balance</button>\n                        <button class="btn btn-success" onclick="closeBalanceDay()" style="margin-right:.5rem;">Close Day</button>\n                        <button class="btn btn-outline" onclick="reopenBalanceDay()">Reopen</button>\n                        <div id="bal-close-status" style="margin-top:.75rem;font-weight:600;"></div>\n                        <div id="bal-day-summary" style="margin-top:1rem;padding:1rem;background:var(--bg-color);border-radius:10px;"></div>'''
    if 'onclick="closeBalanceDay()"' not in h and old in h: h=h.replace(old,new)
    old2='''                        <div id="bal-transactions" style="margin-top:1rem;max-height:250px;overflow:auto;"></div>'''
    new2='''                        <div id="bal-transactions" style="margin-top:1rem;max-height:300px;overflow:auto;"></div>'''
    h=h.replace(old2,new2)
    old3='''                    <div id="bal-breakdown"></div>'''
    new3='''                    <div id="bal-breakdown"></div>\n                    <div id="bal-history" style="margin-top:1.5rem;"></div>'''
    h=h.replace(old3,new3,1)
    html.write_text(h)

    s=js.read_text(errors='ignore')
    # Patch expense creation to include payment mode.
    old="""        amount: parseFloat(document.getElementById('exp-amount').value) || 0,\n        date: document.getElementById('exp-date').value || new Date().toISOString().split('T')[0]\n    };"""
    new="""        amount: parseFloat(document.getElementById('exp-amount').value) || 0,\n        date: document.getElementById('exp-date').value || new Date().toISOString().split('T')[0],\n        paymentMode: document.getElementById('exp-payment-mode')?.value || 'Cash'\n    };"""
    if old in s: s=s.replace(old,new,1)
    # Append Phase 2 overrides.
    s += r'''

// ==================== PHASE 2 - PROFESSIONAL BALANCE & DAILY CASH CLOSING ====================
(function(){
    const BALANCE_VERSION = 2;
    const oldDate = window.t7LocalDate;
    function localDate(d){
        const x=d instanceof Date?d:new Date(d||Date.now());
        const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
    }
    function num(v){ return Number(v)||0; }
    function cur(v){ return `${(settings&&settings.currency)||'₹'}${num(v).toFixed(2)}`; }
    function closedRecord(date){
        const r=(cashOpenings&&cashOpenings[date]);
        return r && typeof r==='object' ? r : {};
    }
    function currentUserLabel(){
        try { return sessionStorage.getItem('mediflow_current_user') || sessionStorage.getItem('mediflow_username') || 'System User'; } catch(e){ return 'System User'; }
    }
    function prevDate(date){ const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()-1); return localDate(d); }
    function getOpeningForDate(date){
        const r=closedRecord(date);
        if(r.opening !== undefined && r.opening !== null && r.opening !== '') return num(r.opening);
        const prev=closedRecord(prevDate(date));
        if(prev.counted !== undefined && prev.counted !== null && prev.counted !== '') return num(prev.counted);
        return 0;
    }
    function isClosed(date){ return !!closedRecord(date).closed; }
    function paymentIsCash(mode){ const m=String(mode||'Cash').trim().toLowerCase(); return m==='cash'||m==='cash payment'||m.includes('cash'); }
    function day(date, arr, fn){ return (arr||[]).filter(x=>String(fn(x)||x.date||'').slice(0,10)===date); }

    function calc(date){
        const ds=day(date,sales,x=>x.date).filter(s=>!s.isCancelled && s.status!=='Pending' && s.paymentMode!=='Pending' && paymentIsCash(s.paymentMode));
        const cashSales=ds.reduce((a,s)=>a+num(s.grandTotal),0);
        const cpay=day(date,customerPayments,x=>x.date).filter(p=>paymentIsCash(p.method)).reduce((a,p)=>a+num(p.amount),0);
        const pur=day(date,purchases,x=>x.date).filter(p=>paymentIsCash(p.paymentMode)).reduce((a,p)=>a+num(p.grandTotal??p.total),0);
        const spay=day(date,supplierPayments,x=>x.date).filter(p=>paymentIsCash(p.date)).reduce((a,p)=>a+num(p.amount),0);
        const exp=day(date,expenses,x=>x.date).filter(e=>paymentIsCash(e.paymentMode||'Cash')).reduce((a,e)=>a+num(e.amount),0);
        const adv=day(date,staffAdvances,x=>x.date).filter(a=>paymentIsCash(a.paymentMode)&&String(a.type||'').toLowerCase()!=='returned').reduce((a,x)=>a+num(x.amount),0);
        const advReturned=day(date,staffAdvances,x=>x.date).filter(a=>paymentIsCash(a.paymentMode)&&String(a.type||'').toLowerCase()==='returned').reduce((a,x)=>a+num(x.amount),0);
        const sal=day(date,salaryPayments,x=>x.paymentDate||x.paidAt).filter(p=>paymentIsCash(p.paymentMode)).reduce((a,p)=>a+num(p.amountPaid),0);
        const manualIn=(cashTransactions||[]).filter(t=>String(t.date).slice(0,10)===date&&t.type==='in').reduce((a,t)=>a+num(t.amount),0);
        const manualOut=(cashTransactions||[]).filter(t=>String(t.date).slice(0,10)===date&&t.type==='out').reduce((a,t)=>a+num(t.amount),0);
        const opening=getOpeningForDate(date);
        const cashIn=cashSales+cpay+manualIn+advReturned;
        const cashOut=pur+spay+exp+adv+sal+manualOut;
        const expected=opening+cashIn-cashOut;
        const r=closedRecord(date), counted=(r.counted===undefined||r.counted==='')?null:num(r.counted);
        return {date,opening,cashSales,customerCashIn:cpay,cashPurchases:pur,supplierCashOut:spay,expenseCashOut:exp,staffCashOut:adv,staffAdvanceReturned:advReturned,salaryCashOut:sal,manualIn,manualOut,cashIn,cashOut,expected,counted,variance:counted===null?null:counted-expected,closed:!!r.closed,closedAt:r.closedAt||null,closedBy:r.closedBy||null,note:r.note||'',version:BALANCE_VERSION};
    }

    function persistBalance(){
        localStorage.setItem('mediflow_cash_openings',JSON.stringify(cashOpenings));
        if(typeof syncToCloud==='function') syncToCloud('cash_openings',cashOpenings);
    }
    function persistCashTx(){
        localStorage.setItem('mediflow_cash_transactions',JSON.stringify(cashTransactions));
        if(typeof syncToCloud==='function') syncToCloud('cash_transactions',cashTransactions);
    }

    window.loadBalanceDate=function(){
        const date=document.getElementById('bal-date')?.value||localDate();
        const r=closedRecord(date), open=getOpeningForDate(date);
        const o=document.getElementById('bal-opening'), c=document.getElementById('bal-counted'), n=document.getElementById('bal-closing-note');
        if(o)o.value=open;
        if(c)c.value=r.counted??'';
        if(n)n.value=r.note||'';
        renderV2(date); renderTxV2(date); renderHistoryV2();
    };
    window.saveBalanceDay=function(){
        const date=document.getElementById('bal-date')?.value||localDate();
        const r=closedRecord(date);
        if(r.closed){ alert('This day is already closed. Reopen it before editing.'); return; }
        const opening=Math.max(0,num(document.getElementById('bal-opening')?.value));
        const raw=document.getElementById('bal-counted')?.value||'';
        const counted=raw===''?null:Math.max(0,num(raw));
        const note=(document.getElementById('bal-closing-note')?.value||'').trim();
        cashOpenings[date]={...r,opening,counted,note,version:BALANCE_VERSION,updatedAt:new Date().toISOString(),updatedBy:currentUserLabel()};
        persistBalance(); renderV2(date); renderHistoryV2();
        alert('Balance saved.');
    };
    window.closeBalanceDay=function(){
        const date=document.getElementById('bal-date')?.value||localDate(), b=calc(date);
        if(b.closed){ alert('This day is already closed.'); return; }
        if(b.counted===null){ alert('Enter Cash Counted at Closing before closing the day.'); return; }
        const r=closedRecord(date);
        if(!confirm(`Close ${date}? Expected ${cur(b.expected)}, counted ${cur(b.counted)}, difference ${cur(b.variance)}.`)) return;
        cashOpenings[date]={...r,opening:b.opening,counted:b.counted,note:(document.getElementById('bal-closing-note')?.value||'').trim(),closed:true,closedAt:new Date().toISOString(),closedBy:currentUserLabel(),version:BALANCE_VERSION};
        persistBalance(); renderV2(date); renderHistoryV2();
        alert('Day closed successfully.');
    };
    window.reopenBalanceDay=function(){
        const date=document.getElementById('bal-date')?.value||localDate(), r=closedRecord(date);
        if(!r.closed){ alert('This day is not closed.'); return; }
        const isAdmin=String(sessionStorage.getItem('mediflow_user_role')||'').toLowerCase().includes('super') || String(sessionStorage.getItem('mediflow_username')||'').toUpperCase()==='VIKI';
        if(!isAdmin){ alert('Only Super Admin can reopen a closed day.'); return; }
        if(!confirm(`Reopen ${date}? This allows balance edits again.`)) return;
        cashOpenings[date]={...r,closed:false,reopenedAt:new Date().toISOString(),reopenedBy:currentUserLabel()};
        persistBalance(); renderV2(date); renderHistoryV2();
    };
    window.addBalanceTransaction=function(){
        const date=document.getElementById('bal-date')?.value||localDate();
        if(isClosed(date)){ alert('This day is closed. Reopen it before adding cash entries.'); return; }
        const type=document.getElementById('bal-tx-type')?.value==='out'?'out':'in';
        const amount=Math.max(0,num(document.getElementById('bal-tx-amount')?.value));
        const note=(document.getElementById('bal-tx-note')?.value||'').trim();
        if(amount<=0||!note){ alert('Enter amount and reason.'); return; }
        cashTransactions.push({id:'CB'+Date.now(),branchId:currentBranchId,type,amount,note,date,createdAt:new Date().toISOString(),createdBy:currentUserLabel(),version:BALANCE_VERSION});
        persistCashTx();
        document.getElementById('bal-tx-amount').value=''; document.getElementById('bal-tx-note').value='';
        renderV2(date); renderTxV2(date); renderHistoryV2();
    };
    window.deleteBalanceTransaction=function(id){
        const date=document.getElementById('bal-date')?.value||localDate(); if(isClosed(date)){alert('Reopen the day first.');return;}
        if(!confirm('Delete this cash entry?'))return;
        cashTransactions=cashTransactions.filter(x=>x.id!==id); persistCashTx(); renderV2(date); renderTxV2(date);
    };
    function renderV2(date){
        const b=calc(date), el=document.getElementById('bal-day-summary'); if(!el)return;
        const status=b.closed?`<span style="color:var(--danger-color);">🔒 CLOSED ${b.closedAt?new Date(b.closedAt).toLocaleString():''}</span>`:'<span style="color:var(--success-color);">● OPEN</span>';
        const diff=b.variance===null?'Not counted':`${cur(b.variance)} ${b.variance===0?'✓':'⚠'}`;
        el.innerHTML=`<div style="margin-bottom:.5rem"><strong>Status:</strong> ${status}</div><div><strong>Opening:</strong> ${cur(b.opening)} &nbsp; <strong>Cash In:</strong> ${cur(b.cashIn)} &nbsp; <strong>Cash Out:</strong> ${cur(b.cashOut)}</div><div style="font-size:1.25rem;margin-top:.5rem"><strong>Expected Closing: ${cur(b.expected)}</strong></div><div style="margin-top:.4rem"><strong>Counted:</strong> ${b.counted===null?'Not entered':cur(b.counted)} &nbsp; <strong>Difference:</strong> ${diff}</div>`;
        const cards={'bal-expected-cash':b.expected};
        Object.entries(cards).forEach(([id,v])=>{const x=document.getElementById(id);if(x)x.textContent=cur(v);});
        const pos=typeof getBalancePosition==='function'?getBalancePosition():{receivable:0,payable:0,staffOutstanding:0};
        [['bal-receivable',pos.receivable],['bal-payable',pos.payable],['bal-staff-advance',pos.staffOutstanding],['bal-net-position',b.expected+pos.receivable-pos.payable-pos.staffOutstanding]].forEach(([id,v])=>{const x=document.getElementById(id);if(x)x.textContent=cur(v);});
        const st=document.getElementById('bal-close-status'); if(st)st.innerHTML=b.closed?'🔒 Day is closed — entries are locked.':'🟢 Day is open — entries can be added.';
        const oe=document.getElementById('bal-opening'); if(oe && !oe.value)oe.value=b.opening;
    }
    function renderTxV2(date){
        const el=document.getElementById('bal-transactions');if(!el)return;
        const rows=(cashTransactions||[]).filter(t=>String(t.date).slice(0,10)===date).slice().reverse();
        el.innerHTML=rows.length?`<table style="width:100%;font-size:.9rem"><thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>Amount</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.createdAt?new Date(t.createdAt).toLocaleTimeString():''}</td><td>${t.type==='in'?'Cash In':'Cash Out'}</td><td>${escapeHtml(t.note||'')}</td><td>${cur(t.amount)}</td><td><button class="btn btn-sm btn-outline" onclick="deleteBalanceTransaction('${t.id}')">Delete</button></td></tr>`).join('')}</tbody></table>`:'<div style="color:var(--text-muted)">No manual cash entries for this date.</div>';
    }
    function renderHistoryV2(){
        const el=document.getElementById('bal-history');if(!el)return;
        const entries=Object.entries(cashOpenings||{}).filter(([d,r])=>r&&typeof r==='object'&&r.version===BALANCE_VERSION).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,31);
        el.innerHTML=`<h3 style="margin-bottom:.75rem">Daily Closing History</h3>`+(entries.length?`<div class="table-responsive"><table><thead><tr><th>Date</th><th>Opening</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Status</th></tr></thead><tbody>${entries.map(([d,r])=>{const b=calc(d);return `<tr><td>${d}</td><td>${cur(b.opening)}</td><td>${cur(b.expected)}</td><td>${b.counted===null?'—':cur(b.counted)}</td><td>${b.variance===null?'—':cur(b.variance)}</td><td>${b.closed?'Closed':'Open'}</td></tr>`}).join('')}</tbody></table></div>`:'<div style="color:var(--text-muted)">No daily closing records yet.</div>`;
    }
    window.printBalanceReport=function(){
        const date=document.getElementById('bal-date')?.value||localDate(),b=calc(date),w=window.open('','_blank','width=900,height=700');if(!w)return;
        w.document.write(`<html><head><title>Daily Cash Closing - ${date}</title><style>body{font-family:Arial;padding:30px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.total{font-weight:bold}</style></head><body><h2>${escapeHtml(settings.shopName||'T7 BillPro')} - Daily Cash Closing</h2><div>Branch: ${escapeHtml(currentBranchId)} | Date: ${date}</div><table><tr><th>Component</th><th>Amount</th></tr><tr><td>Opening Cash</td><td>${cur(b.opening)}</td></tr><tr><td>Cash Sales</td><td>${cur(b.cashSales)}</td></tr><tr><td>Customer Cash Collections</td><td>${cur(b.customerCashIn)}</td></tr><tr><td>Manual Cash In</td><td>${cur(b.manualIn)}</td></tr><tr><td>Cash Purchases</td><td>${cur(b.cashPurchases)}</td></tr><tr><td>Supplier Payments</td><td>${cur(b.supplierCashOut)}</td></tr><tr><td>Expenses</td><td>${cur(b.expenseCashOut)}</td></tr><tr><td>Staff Advances</td><td>${cur(b.staffCashOut)}</td></tr><tr><td>Salary Paid</td><td>${cur(b.salaryCashOut)}</td></tr><tr><td>Manual Cash Out</td><td>${cur(b.manualOut)}</td></tr><tr class="total"><td>Expected Closing</td><td>${cur(b.expected)}</td></tr><tr><td>Counted Cash</td><td>${b.counted===null?'Not entered':cur(b.counted)}</td></tr><tr class="total"><td>Difference</td><td>${b.variance===null?'Not available':cur(b.variance)}</td></tr></table><p>Status: ${b.closed?'CLOSED':'OPEN'}</p><script>window.print()</script></body></html>`);w.document.close();
    };
    window.initBalancePage=function(){
        const d=localDate(), dateEl=document.getElementById('bal-date');if(dateEl&&!dateEl.value)dateEl.value=d;window.loadBalanceDate();
    };
    // Initialize today's date with local time and carry forward previous closing.
    setTimeout(()=>{const d=document.getElementById('bal-date');if(d&&!d.value)d.value=localDate();},0);
})();
// ==================== END PHASE 2 ====================
'''
    js.write_text(s)
