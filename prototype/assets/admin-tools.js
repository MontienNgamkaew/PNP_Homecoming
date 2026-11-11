const adminOrderCategories=[['donate','ผ้าป่า'],['fund','กองทุนช่างกล'],['tables','จองโต๊ะจีน'],['shirts','จองเสื้อ']];
function adminOrderQuery(){return new URLSearchParams(tab==='orders'?{page:adminPage,q:adminSearch,type:adminCategory,status:adminPaymentStatus}:{page:1}).toString();}
function renderAdminPager() {
  const count=adminSummary?.filtered_count??0,pages=Math.max(1,Math.ceil(count/100));
  return `<form id="admin-search" class="admin-pagination"><input class="ui-input ui-input-bordered" name="query" aria-label="ค้นหาชื่อ เบอร์โทร หรือเลขอ้างอิง" placeholder="ค้นหาชื่อ เบอร์โทร หรือเลขอ้างอิง" maxlength="150" value="${esc(tab==='orders'?adminSearch:'')}"><button class="ui-btn ui-btn-sm" type="submit">ค้นหา</button><label>สถานะยอดเงิน<select id="admin-payment-status" class="ui-select ui-select-bordered">${[['','ทุกสถานะ'],['pending','รอยืนยันยอด'],['confirmed','ยืนยันยอดแล้ว'],['rejected','ยกเลิก / ไม่ผ่าน']].map(([v,t])=>`<option value="${v}" ${tab==='orders'&&adminPaymentStatus===v?'selected':''}>${t}</option>`).join('')}</select></label></form><div class="admin-pagination"><span>พบ ${money(count)} รายการ · หน้า ${tab==='orders'?adminPage:1} / ${pages}</span><button class="ui-btn ui-btn-sm" data-admin-page="${(tab==='orders'?adminPage:1)-1}" ${(tab!=='orders'||adminPage<=1)?'disabled':''}>ก่อนหน้า</button><button class="ui-btn ui-btn-sm" data-admin-page="${(tab==='orders'?adminPage:1)+1}" ${(tab==='orders'?adminPage:1)>=pages?'disabled':''}>ถัดไป</button></div>`;
}
const adminActionIcons={
 preview:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 edit:'<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/>',
 ticket:'<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4Z"/><path d="M15 5v3m0 3v2m0 3v3"/>',
 cash:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4m12-4v4"/>'
};
function adminActionButton(attribute,ref,label,icon,disabled=false){
 return `<button type="button" class="admin-icon-action action-${icon}" ${attribute}="${esc(ref)}" title="${esc(label)}" aria-label="${esc(label+' '+ref)}" ${disabled?'disabled':''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${adminActionIcons[icon]}</svg></button>`;
}
function renderAdminOrderList(body){
  const active=tab==='orders'?adminCategory:'',groupTitle=adminOrderCategories.find(([key])=>key===active)?.[1]||'รายการทั้งหมด';
  body.insertAdjacentHTML('beforeend',`<section class="admin-order-groups" aria-label="แยกรายการตามประเภท">${adminOrderCategories.map(([key,label])=>{const group=adminSummary?.by_type?.[key]||{};return `<button class="admin-order-group group-${key} ${active===key?'is-active':''}" data-order-category="${key}" aria-pressed="${active===key}"><b>${label}</b><strong>${money(group.total||0)} รายการ</strong><span>รอยืนยัน ${money(group.pending||0)} รายการ</span><small>ยืนยันยอดแล้ว ฿${money((group.confirmed_cents||0)/100)}</small></button>`;}).join('')}</section>
  <section class="card ui-card admin-order-list"><div class="admin-list-heading"><h2>${groupTitle}</h2><button class="ui-btn ui-btn-sm ui-btn-outline" data-order-category="">ดูทุกประเภท</button></div>${renderAdminPager()}<div class="admin-filter-totals"><span>ยอดแจ้งรับเงิน <b>฿${money((adminSummary?.filtered_cents||0)/100)}</b></span><span>ยืนยันยอดแล้ว <b>฿${money((adminSummary?.filtered_confirmed_cents||0)/100)}</b></span></div>
  ${adminOrders.length?`<div class="admin-orders-scroll"><table class="admin-table ui-table"><thead><tr><th>เลขอ้างอิง / ผู้แจ้ง</th><th>รายละเอียดรายการ</th><th>รายละเอียดรับเงิน</th><th>สถานะยืนยันยอดเงิน</th><th>จัดการ</th></tr></thead><tbody>${adminOrders.map(o=>{
    const title=adminOrderCategories.find(([key])=>key===o.type)?.[1]||o.type;
    let detail='';if(o.type==='tables')detail=`โต๊ะ ${esc(tableLabels((o.tables_list||'').split(',').filter(Boolean).map(Number)))}<br>${(o.tables_list||'').split(',').filter(Boolean).length*8} ท่าน`;
    else if(o.type==='shirts'){detail=(o.items||[]).map(it=>`${esc(it.size)} × ${Number(it.qty)} ตัว`).join(' · ')+`<br>รวม ${(o.items||[]).reduce((n,it)=>n+Number(it.qty),0)} ตัว · ${o.delivery_method==='post'?'จัดส่งไปรษณีย์':'รับที่วิทยาลัย'}`;if(o.delivery_method==='post')detail+=`<details><summary>รายละเอียดจัดส่ง</summary>${esc(o.recipient_name)}<br>${esc(o.shipping_address)} ${esc(o.postcode)}</details>`;}
    else detail=esc(o.category||title);
    const badge=o.status==='confirmed'?'ui-badge-success':o.status==='rejected'?'ui-badge-error':'ui-badge-warning';
    const actions=adminActionButton('data-slip-preview',o.ref,o.has_slip===false?'ไม่มีเอกสารแนบ':'ดูสลิป / เอกสาร','preview',o.has_slip===false)
      +(['tables','shirts'].includes(o.type)&&o.status!=='rejected'?adminActionButton('data-reissue-ticket',o.ref,'ออกลิงก์ตั๋วใหม่','ticket'):'')
      +(o.payment_method==='cash'?adminActionButton('data-cash-edit',o.ref,'แก้ไขข้อมูลรับเงินสด','cash'):'')
      +(settings.backend==='php'?adminActionButton('data-edit-order',o.ref,'แก้ไขข้อมูล','edit'):'');
    return `<tr><td><b>${esc(o.ref)}</b><br><strong>${esc(o.name)}</strong><br><span class="muted">${esc(o.phone)}</span></td><td><b>${esc(title)}</b><br><small>${detail}</small></td><td><b class="admin-transfer-amount">฿${money(o.amount_cents/100)}</b><br><small>${o.payment_method==='cash'?`เงินสด · รับวันที่ ${esc(o.cash_receipt.received_date)}<br>ผู้รับเงิน: ${esc(o.cash_receipt.collector)}<br>${esc(o.cash_receipt.note)}`:`เงินโอน · ${esc(o.transferred||'—')}`}</small></td><td class="admin-payment-cell"><span class="ui-badge ${badge}">${o.status==='confirmed'?'ยืนยันยอดแล้ว':o.status==='rejected'?'ยกเลิก / ไม่ผ่าน':'รอยืนยันยอด'}</span><select class="ui-select ui-select-bordered ui-select-sm" data-order-status="${esc(o.ref)}" aria-label="สถานะ ${esc(o.ref)}">${[['pending','รอยืนยันยอด'],['confirmed','ยืนยันยอดแล้ว'],['rejected','ยกเลิก / ไม่ผ่าน']].map(([v,t])=>`<option value="${v}" ${o.status===v?'selected':''}>${t}</option>`).join('')}</select></td><td><div class="admin-row-actions" role="group" aria-label="จัดการรายการ ${esc(o.ref)}">${actions}</div></td></tr>`;
  }).join('')}</tbody></table></div>`:'<div class="empty">ไม่มีรายการตรงกับประเภทหรือสถานะที่เลือก</div>'}</section>`);
  body.querySelectorAll('[data-order-status]').forEach(select=>select.onchange=()=>changeOrderStatus(select.dataset.orderStatus,select.value));
}
function openOrderEditor(ref) {
  const order=adminOrders.find(o=>o.ref===ref);if(!order)return;
  let snapshot={};try{snapshot=JSON.parse(order.pricing_snapshot||'{}');}catch(_){}
  const input=(label,name,value,type='text')=>`<label>${label}<input class="ui-input ui-input-bordered" name="${name}" type="${type}" value="${esc(value)}" required></label>`;
  modal(`<h2>แก้ไขรายการ ${esc(ref)}</h2><form id="order-editor">
    ${input('ชื่อ–นามสกุล','name',order.name)}${input('เบอร์โทร','phone',order.phone,'tel')}
    ${order.type==='tables'?input('รหัสโต๊ะ คั่นด้วยจุลภาค เช่น A1,A2','tables',tableLabels(order.tables_list.split(',').map(Number))):''}
    ${order.type==='shirts'?`<div class="order-size-grid">${sizes.map(size=>`<label>${size}<input class="ui-input ui-input-bordered" type="number" min="0" max="100" step="1" name="size_${size}" value="${(order.items||[]).filter(it=>it.size===size).reduce((sum,it)=>sum+it.qty,0)}"></label>`).join('')}</div><label>วิธีรับ<select class="ui-select ui-select-bordered" name="delivery"><option value="pickup" ${order.delivery_method==='pickup'?'selected':''}>รับที่วิทยาลัย</option><option value="post" ${order.delivery_method==='post'?'selected':''}>ไปรษณีย์</option></select></label><div id="edit-shipping">${input('ชื่อผู้รับ','recipient',order.recipient_name||'')}<label>ที่อยู่<textarea class="ui-textarea ui-textarea-bordered" name="address" maxlength="1000">${esc(order.shipping_address||'')}</textarea></label>${input('รหัสไปรษณีย์','postcode',order.postcode||'')}</div>`:''}
    ${['tables','shirts'].includes(order.type)?'<label><span>ใช้ราคาปัจจุบันคำนวณใหม่ (ไม่เลือกจะใช้ราคาขณะจอง)</span><input type="checkbox" name="reprice"></label>':''}
    ${input('ยอดเงิน (บาท)','amount',(order.amount_cents/100).toFixed(2),'number')}
    <label>เหตุผลที่แก้ไข<textarea class="ui-textarea ui-textarea-bordered" name="reason" required minlength="3" maxlength="500"></textarea></label>
    <p class="muted">ตรวจสอบยอดเงินจริงกับสลิปก่อนบันทึก ประวัติการแก้ไขจะถูกเก็บไว้</p>
    <button type="submit" class="ui-btn ui-btn-primary full">บันทึกข้อมูลที่แก้ไข</button>
    ${order.status==='confirmed'&&(order.type==='tables'||(order.type==='shirts'&&order.delivery_method==='pickup'))?'<button type="button" id="redeem-ticket" class="ui-btn ui-btn-outline full">บันทึกใช้ตั๋ว / รับเสื้อแล้ว</button>':''}
    <p id="edit-status" role="status"></p></form>`);
  const form=$('#order-editor');if(order.payment_method==='cash'&&['donate','fund'].includes(order.type))form.elements.phone.required=false;form.elements.amount.min='1';form.elements.amount.step='0.01';
  const payload=()=>({ref,name:form.elements.name.value,phone:form.elements.phone.value,amount:form.elements.amount.value,reason:form.elements.reason.value,reprice:!!form.elements.reprice?.checked,...(order.type==='tables'?{tables:form.elements.tables.value.split(',').map(tableNumber)}:{}),...(order.type==='shirts'?{lines:sizes.map(size=>({size,qty:Number(form.elements['size_'+size].value)})).filter(it=>it.qty>0),delivery:form.elements.delivery.value,recipient:form.elements.recipient.value,address:form.elements.address.value,postcode:form.elements.postcode.value}:{})});
  const update=()=>{
    const d=payload(),current=d.reprice;
    if(!current && ['tables','shirts'].includes(order.type) && snapshot[order.type==='tables'?'table_unit_cents':'shirt_unit_cents']===undefined){
      if(order.type==='shirts'){const post=d.delivery==='post';$('#edit-shipping').hidden=!post;for(const name of ['recipient','address','postcode'])form.elements[name].required=post;}
      form.elements.amount.value=(order.amount_cents/100).toFixed(2);return;
    }
    if(order.type==='tables')form.elements.amount.value=(new Set(d.tables).size*(current?settings.table:(snapshot.table_unit_cents??settings.table*100)/100)).toFixed(2);
    if(order.type==='shirts'){
      const post=d.delivery==='post';$('#edit-shipping').hidden=!post;
      for(const name of ['recipient','address','postcode'])form.elements[name].required=post;
      const unit=current?settings.shirt:(snapshot.shirt_unit_cents??settings.shirt*100)/100;
      const shipping=current||order.delivery_method!=='post'?settings.shipping:(snapshot.shipping_cents??settings.shipping*100)/100;
      form.elements.amount.value=(d.lines.reduce((sum,it)=>sum+it.qty,0)*unit+(post?shipping:0)).toFixed(2);
    }
  };
  form.addEventListener('input',e=>{if(['tables','delivery','reprice'].includes(e.target.name)||e.target.name.startsWith('size_'))update();});update();
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const r=await fetch('/api/admin/order-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())});const data=await r.json();if(!r.ok)throw new Error(data.error||'บันทึกไม่สำเร็จ');closeModal();await admin();}catch(error){$('#edit-status').textContent=error.message;}finally{button.disabled=false;}};
  const redeem=$('#redeem-ticket');if(redeem)redeem.onclick=async()=>{if(!confirm('ยืนยันตรวจสอบตั๋วนี้และให้เข้าร่วมงาน / รับเสื้อครบแล้ว?'))return;redeem.disabled=true;try{const r=await fetch('/api/admin/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref})});const data=await r.json();if(!r.ok)throw new Error(data.error);$('#edit-status').textContent='บันทึกใช้ตั๋วแล้ว ✓';}catch(error){$('#edit-status').textContent=error.message;redeem.disabled=false;}};
}

function openTicketReissue(ref){
  const order=adminOrders.find(o=>o.ref===ref);if(!order)return;
  modal(`<h2>ออกลิงก์ตั๋วใหม่</h2><p><b>เลขอ้างอิง ${esc(ref)}</b><br>${esc(order.name)} · ${esc(order.phone)}</p><p class="notice">รหัสและลิงก์เดิมจะใช้ไม่ได้หลังออกใหม่ ยอดเงิน โต๊ะ และสถานะยังคงเดิม</p><form id="ticket-reissue-form"><label>เหตุผล<textarea class="ui-textarea ui-textarea-bordered full" name="reason" required minlength="3" maxlength="500" placeholder="เช่น ผู้จองแจ้งว่าลิงก์ตั๋วสูญหาย"></textarea></label><label class="reissue-verify"><input type="checkbox" name="verified" required>ตรวจสอบชื่อและเบอร์โทรกับผู้จองแล้ว</label><button class="ui-btn ui-btn-primary full" type="submit">ยืนยันออกลิงก์ใหม่</button><p role="status" id="reissue-status"></p></form>`);
  const form=document.querySelector('#ticket-reissue-form');
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;document.querySelector('#reissue-status').textContent='กำลังออกลิงก์ใหม่…';
    try{
      const response=await fetch('/api/admin/ticket-reissue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref,reason:form.elements.reason.value,verified:form.elements.verified.checked})});const data=await response.json();
      if(!response.ok)throw new Error(data.error||'ออกลิงก์ไม่สำเร็จ');
      modal(`<h2>ออกลิงก์ตั๋วใหม่แล้ว ✓</h2><p>เลขอ้างอิง <b>${esc(data.ref)}</b><br>รหัสเดิมถูกยกเลิกแล้ว</p><label>รหัสส่วนตัวใหม่<input id="reissued-token" class="ui-input ui-input-bordered full" readonly autocomplete="off"></label><p class="muted">แสดงรหัสใหม่นี้ครั้งเดียว กรุณาคัดลอกส่งให้ผู้จองเป็นการส่วนตัว</p><button type="button" id="copy-reissued-link" class="ui-btn ui-btn-primary full">คัดลอกลิงก์ตั๋วใหม่</button><button type="button" id="copy-reissued-token" class="ui-btn ui-btn-outline full">คัดลอกรหัสส่วนตัวใหม่</button><p id="reissue-copy-status" role="status"></p>`);
      document.querySelector('#reissued-token').value=data.token;
      const copy=async(value,message)=>{const status=document.querySelector('#reissue-copy-status');try{await navigator.clipboard.writeText(value);status.textContent=message;}catch(_){const input=document.createElement('input');input.className='ui-input full';input.readOnly=true;input.value=value;input.setAttribute('aria-label','ข้อมูลสำหรับคัดลอก');status.replaceChildren(input);input.focus();input.select();}};
      document.querySelector('#copy-reissued-link').onclick=()=>copy(privateTicketUrl(data),'คัดลอกลิงก์ตั๋วใหม่แล้ว ✓');
      document.querySelector('#copy-reissued-token').onclick=()=>copy(data.token,'คัดลอกรหัสส่วนตัวใหม่แล้ว ✓');
    }catch(error){const status=document.querySelector('#reissue-status');if(status)status.textContent=error.message||'เชื่อมต่อไม่สำเร็จ หากไม่แน่ใจว่าบันทึกแล้วหรือไม่ ให้ตรวจสอบก่อนออกใหม่';}
    finally{if(button.isConnected)button.disabled=false;}
  };
}
