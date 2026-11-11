let reportFilters={type:'all',status:'confirmed',payment:'all',from:'',to:''};
function renderReportsAdmin(body){
 if(settings.backend!=='php'){body.innerHTML='<p class="notice">รายงาน CSV ใช้งานในระบบ PHP บนเว็บไซต์หลัก</p>';return;}
 body.innerHTML=`<section class="card ui-card"><h2>รายงาน / Export CSV</h2><p class="muted">วันที่กรองอ้างอิงวันที่บันทึกรายการตามเวลาไทย · เริ่มต้นเฉพาะยอดยืนยันแล้ว</p>
 <form id="report-filters" class="report-filters">
 <label>ประเภท<select name="type" class="ui-select ui-select-bordered"><option value="all">ทุกประเภท</option>${adminOrderCategories.map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select></label>
 <label>สถานะ<select name="status" class="ui-select ui-select-bordered"><option value="confirmed">ยืนยันแล้ว — สำหรับสั่งผลิต</option><option value="pending">รอตรวจสอบ</option><option value="active">ยืนยันแล้ว + รอตรวจสอบ</option><option value="rejected">ยกเลิก / ไม่ผ่าน</option><option value="all">ทุกสถานะ รวมรายการยกเลิก</option></select></label>
 <label>ช่องทาง<select name="payment" class="ui-select ui-select-bordered"><option value="all">เงินสดและเงินโอน</option><option value="cash">เงินสด</option><option value="transfer">เงินโอน</option></select></label>
 <label>ตั้งแต่วันที่<input class="ui-input ui-input-bordered" name="from" type="date"></label><label>ถึงวันที่<input class="ui-input ui-input-bordered" name="to" type="date"></label>
 <button class="ui-btn ui-btn-primary" type="submit">แสดงรายงาน</button></form><p id="report-status" class="muted" role="status"></p><div id="report-results"></div></section>`;
 const form=body.querySelector('#report-filters');for(const [k,v] of Object.entries(reportFilters))form.elements[k].value=v;
 let current=null,controller=null,version=0;
 const query=f=>new URLSearchParams(f).toString();
 async function load(){
  controller?.abort();controller=new AbortController();const revision=++version;
  const filters=Object.fromEntries(new FormData(form));reportFilters=filters;current=null;
  const result=body.querySelector('#report-results'),status=body.querySelector('#report-status');result.replaceChildren();status.textContent='กำลังคำนวณรายงาน…';
  try{
   const r=await fetch('/api/admin/reports?'+query(filters),{cache:'no-store',signal:controller.signal}),d=await r.json();
   if(!r.ok)throw new Error(d.error||'โหลดรายงานไม่สำเร็จ');if(revision!==version||!body.isConnected||!status.isConnected)return;
   current=filters;const names=Object.fromEntries(adminOrderCategories);
   status.textContent=`พบ ${money(d.order_count)} รายการ · ${new Date(d.generated_at).toLocaleString('th-TH')} · ${filters.status==='confirmed'?'เฉพาะรายการยืนยันแล้ว':'ตรวจสอบตัวกรองสถานะก่อนนำไปสั่งผลิต'}`;
   result.innerHTML=`${filters.status!=='confirmed'?'<p class="notice">รายงานนี้ไม่ได้เลือกเฉพาะรายการยืนยันแล้ว โปรดตรวจสอบสถานะก่อนสั่งผลิตหรือสรุปยอดรับจริง</p>':''}
   <div class="report-summary">${adminOrderCategories.map(([kind,label])=>{const row=d.by_type[kind];return `<article><span>${label}</span><strong>฿${money(row.amount_cents/100)}</strong><small>${money(row.count)} รายการ</small><small>สด ฿${money(row.cash_cents/100)} · โอน ฿${money(row.transfer_cents/100)}</small></article>`;}).join('')}</div>
   <p class="report-grand">รวม ${money(d.order_count)} รายการ <b>฿${money(d.total_cents/100)}</b></p>
   <div class="report-export-actions"><button type="button" class="ui-btn ui-btn-outline" data-report-csv="summary">↓ CSV สรุปยอดแยกประเภท</button><button type="button" class="ui-btn ui-btn-outline" data-report-csv="orders">↓ CSV รายการ ${names[filters.type]||'ทุกประเภท'}</button></div>
   ${['all','tables'].includes(filters.type)?`<p class="muted">โต๊ะจีน ${money(d.table_count)} โต๊ะ · ${money(d.guests)} ท่าน ตามตัวกรองที่เลือก</p>`:''}
   ${['all','shirts'].includes(filters.type)?`<section class="shirt-report"><h3>สรุปเสื้อเพื่อสั่งผลิต</h3><p>รวม <b>${money(d.shirt_qty)}</b> ตัว · หน่วยในตารางเป็นตัว</p><div class="admin-orders-scroll"><table class="ui-table"><thead><tr><th>ไซซ์</th><th>รับที่วิทยาลัย</th><th>ไปรษณีย์</th><th>รวม</th></tr></thead><tbody>${d.shirt_sizes.map(row=>`<tr><th>${esc(row.size)}</th><td>${money(row.pickup)}</td><td>${money(row.post)}</td><td><b>${money(row.qty)}</b></td></tr>`).join('')}</tbody><tfoot><tr><th>รวม</th><td>${money(d.shirt_sizes.reduce((s,r)=>s+r.pickup,0))}</td><td>${money(d.shirt_sizes.reduce((s,r)=>s+r.post,0))}</td><td>${money(d.shirt_qty)}</td></tr></tfoot></table></div>
   <div class="report-export-actions"><button type="button" class="ui-btn ui-btn-primary" data-report-csv="shirt-sizes">↓ สรุปรายไซซ์ — ส่งร้านเสื้อ</button><button type="button" class="ui-btn ui-btn-outline" data-report-csv="shirt-people">↓ รายผู้จอง / ทุกไซซ์</button><button type="button" class="ui-btn ui-btn-outline" data-report-csv="shirt-lines">↓ รายผู้จอง แยกแถวรายไซซ์</button></div><p class="muted">ไฟล์สั่งผลิตมีเฉพาะยอดไซซ์ · ไฟล์รายผู้จองใช้เลขอ้างอิงแยกแต่ละรายการ ไม่รวมผู้จองชื่อซ้ำเข้าด้วยกัน · ไม่ส่งออกเบอร์โทร ที่อยู่ สลิป หรือรหัสตั๋ว</p></section>`:''}`;
  }catch(error){if(revision===version&&status.isConnected&&error.name!=='AbortError')status.textContent=error.message;}
 }
 form.onsubmit=e=>{e.preventDefault();load();};
 body.addEventListener('click',async event=>{
  const button=event.target.closest('[data-report-csv]');if(!button||!current)return;
  if(query(Object.fromEntries(new FormData(form)))!==query(current)){body.querySelector('#report-status').textContent='ตัวกรองเปลี่ยนแล้ว กรุณากดแสดงรายงานก่อนส่งออก';return;}
  const dataset=button.dataset.reportCsv,exportFilters={...current};button.disabled=true;
  const status=body.querySelector('#report-status');status.textContent='กำลังเตรียมไฟล์ CSV…';
  try{
   const r=await fetch('/api/admin/report.csv?'+query({...exportFilters,dataset}),{cache:'no-store'});
   if(!r.ok){const d=await r.json();throw new Error(d.error||'ส่งออกไม่สำเร็จ');}
   if(!r.headers.get('Content-Type')?.includes('text/csv'))throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งไฟล์ CSV');
   const blob=await r.blob();if(!status.isConnected)return;
   if(query(Object.fromEntries(new FormData(form)))!==query(exportFilters)){status.textContent='ตัวกรองเปลี่ยนระหว่างส่งออก กรุณาแสดงรายงานแล้วส่งออกใหม่';return;}
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.headers.get('Content-Disposition')?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1]||'pnp-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent='เตรียมไฟล์ CSV แล้ว · ใช้ข้อมูลล่าสุดตามตัวกรองที่เลือก';
  }catch(error){if(status.isConnected)status.textContent=error.message;}
  finally{if(button.isConnected)button.disabled=false;}
 });
 load();
}
