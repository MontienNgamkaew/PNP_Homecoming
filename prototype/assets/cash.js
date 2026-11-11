let cashAdminCategory = 'donate';
function renderCashAdmin(body, preset=null) {
  if(settings.backend!=='php'){body.innerHTML='<p class="notice">บันทึกรับเงินสดได้ในระบบ PHP บนเว็บไซต์หลัก</p>';return;}
  const editing=!!preset, initialKind=preset?.type||cashAdminCategory;
  const labels={donate:'ผ้าป่า',fund:'กองทุนช่างกล',tables:'จองโต๊ะ',shirts:'จองเสื้อ'};
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
  body.innerHTML=`<section class="card ui-card"><h2>${editing?'แก้ไขข้อมูลรับเงินสด':'บันทึกรับเงินสด'}</h2><p class="muted">บันทึกแล้วรอตรวจสอบก่อนรวมยอด · หากมีรายการจองแล้วให้ใช้เลขอ้างอิงเดิม</p>
  ${editing?'':`<div class="cash-subtabs" role="tablist" aria-label="ประเภทรายการรับเงินสด">${Object.entries(labels).map(([key,label])=>`<button type="button" role="tab" id="cash-tab-${key}" aria-controls="cash-panel" aria-selected="${key===initialKind}" tabindex="${key===initialKind?0:-1}" data-cash-kind="${key}">${label}</button>`).join('')}</div>`}
  <div id="cash-panel" ${editing?'':`role="tabpanel" aria-labelledby="cash-tab-${initialKind}"`}>
  <h3 id="cash-kind-title">${labels[initialKind]}</h3>
  <form id="cash-form">
    ${editing?'':`<label>รายการ<select name="mode" class="ui-select ui-select-bordered"><option value="new">สร้างรายการใหม่</option><option value="existing">ใช้เลขอ้างอิงเดิม</option></select></label>`}
    <div id="cash-existing" ${editing?'':'hidden'}><label>เลขอ้างอิง<input name="ref" class="ui-input ui-input-bordered" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" value="${esc(preset?.ref||'')}"></label>${editing?'':'<button type="button" id="cash-lookup" class="ui-btn ui-btn-outline">ค้นหารายการ</button>'}<p id="cash-existing-detail" role="status"></p></div>
    <div id="cash-new" ${editing?'hidden':''}>
      <input name="kind" type="hidden" value="${initialKind}">
      <label>ชื่อผู้บริจาค / ผู้จอง<input name="name" class="ui-input ui-input-bordered" maxlength="150" minlength="2" placeholder="ระบุชื่อ หรือ ไม่ประสงค์ออกนาม"></label>
      <label>เบอร์โทร <small id="cash-phone-help">ไม่บังคับสำหรับผ้าป่าและกองทุน</small><input name="phone" class="ui-input ui-input-bordered" type="tel" pattern="[0-9+ ()-]{9,20}" maxlength="20"></label>
      <label id="cash-tables" hidden>รหัสโต๊ะ เช่น A1,A2<input name="tables" class="ui-input ui-input-bordered" placeholder="A1,A2"></label>
      <div id="cash-shirts" hidden><p>จำนวนเสื้อแยกไซซ์</p><div class="order-size-grid">${sizes.map(s=>`<label>${s}<input class="ui-input ui-input-bordered" name="size_${s}" type="number" min="0" max="100" step="1" value="0"></label>`).join('')}</div>
      <label>วิธีรับเสื้อ<select name="delivery" class="ui-select ui-select-bordered"><option value="pickup">รับที่วิทยาลัย</option><option value="post">ไปรษณีย์</option></select></label>
      <div id="cash-shipping" hidden><label>ชื่อผู้รับ<input name="recipient" class="ui-input ui-input-bordered" maxlength="150"></label><label>ที่อยู่<textarea name="address" class="ui-textarea ui-textarea-bordered" maxlength="1000"></textarea></label><label>รหัสไปรษณีย์<input name="postcode" class="ui-input ui-input-bordered" pattern="[0-9]{5}" maxlength="5"></label></div></div>
    </div>
    ${!editing?taxRequestFields():''}
    <label>จำนวนเงิน (บาท)<input name="amount" class="ui-input ui-input-bordered" type="number" min="1" step="0.01" required ${editing?'readonly':''} value="${editing?preset.amount_cents/100:''}"></label>
    <label>วันที่รับเงิน<input name="received_date" class="ui-input ui-input-bordered" type="date" max="${today}" required value="${esc(preset?.cash_receipt?.received_date||today)}"></label>
    <label>ผู้รับเงิน<input name="collector" class="ui-input ui-input-bordered" required minlength="2" maxlength="150" value="${esc(preset?.cash_receipt?.collector||'')}"></label>
    <label>หมายเหตุ<textarea name="note" class="ui-textarea ui-textarea-bordered" maxlength="1000">${esc(preset?.cash_receipt?.note||'')}</textarea></label>
    ${editing?'<label>เหตุผลแก้ไข<textarea class="ui-textarea ui-textarea-bordered" name="reason" required minlength="3" maxlength="500"></textarea></label>':'<label id="cash-attachment">ภาพใบรับเงิน (ไม่บังคับ)<input name="evidence" class="ui-file-input ui-file-input-bordered" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"><small>ไม่เกิน 5 MB</small></label>'}
    <button type="submit" class="ui-btn ui-btn-primary full">${editing?'บันทึกการแก้ไข':'บันทึกรับเงินสด · รอตรวจสอบ'}</button><p id="cash-status" role="status"></p>
  </form></div></section>`;
  const form=body.querySelector('#cash-form'), f=form.elements;let linked=null,busy=false,saved=false,lookupVersion=0;
  const amounts={donate:'',fund:''},requestIds={};
  const taxController=bindTaxRequest(form);
  const isExisting=()=>editing||f.mode.value==='existing';
  const tabs=[...body.querySelectorAll('[data-cash-kind]')];
  function selectKind(button){
    if(busy)return;
    const kind=button.dataset.cashKind;if(f.kind.value===kind)return;
    cashAdminCategory=kind;
    if(saved){renderCashAdmin(body);return;}
    if(!isExisting())amounts[f.kind.value]=f.amount.value;
    f.kind.value=kind;linked=null;lookupVersion++;f.ref.value='';$('#cash-existing-detail').textContent='';
    f.amount.value=amounts[kind]||'';
    for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    $('#cash-panel').setAttribute('aria-labelledby',button.id);$('#cash-kind-title').textContent=labels[kind];
    $('#cash-status').textContent='';update();
  }
  tabs.forEach((button,index)=>{
    button.onclick=()=>selectKind(button);
    button.onkeydown=event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();if(busy)return;selectKind(tabs[next]);tabs[next].focus();};
  });

  const parts=()=>({tables:f.tables.value.split(/[,\s]+/).filter(Boolean).map(tableNumber),lines:sizes.map(size=>({size,qty:Number(f['size_'+size].value)})).filter(it=>it.qty>0)});
  function update(){
    const existing=isExisting(),kind=f.kind.value,booking=['tables','shirts'].includes(kind),post=kind==='shirts'&&f.delivery.value==='post';
    taxController?.enable(!existing&&['donate','fund'].includes(kind));
    $('#cash-existing').hidden=!existing;$('#cash-new').hidden=existing;f.ref.required=existing;f.ref.readOnly=editing;
    for(const el of $('#cash-new').querySelectorAll('input,select,textarea'))el.disabled=existing;
    $('#cash-phone-help').textContent=booking?'จำเป็นสำหรับติดต่อผู้จอง':'ไม่บังคับ';
    f.name.required=!existing;f.phone.required=!existing&&booking;f.tables.required=!existing&&kind==='tables';
    $('#cash-tables').hidden=kind!=='tables';$('#cash-shirts').hidden=kind!=='shirts';$('#cash-shipping').hidden=!post;
    for(const k of ['recipient','address','postcode'])f[k].required=!existing&&post;
    f.amount.readOnly=existing||booking;
    if(!existing&&kind==='tables')f.amount.value=(new Set(parts().tables).size*settings.table).toFixed(2);
    if(!existing&&kind==='shirts')f.amount.value=(parts().lines.reduce((sum,it)=>sum+it.qty,0)*settings.shirt+(post?settings.shipping:0)).toFixed(2);
    if($('#cash-attachment'))$('#cash-attachment').hidden=existing;
  }
  form.addEventListener('change',update);form.addEventListener('input',e=>{if(e.target.name==='ref'){linked=null;lookupVersion++;$('#cash-existing-detail').textContent='';}if(e.target.name==='tables'||e.target.name?.startsWith('size_'))update();});
  if(!editing)$('#cash-lookup').onclick=async()=>{const version=++lookupVersion;try{linked=null;const r=await fetch('/api/admin/cash-order?ref='+encodeURIComponent(f.ref.value));const d=await r.json();if(version!==lookupVersion||!form.isConnected)return;if(!r.ok)throw new Error(d.error);if(d.type!==f.kind.value)throw new Error('เลขอ้างอิงนี้เป็นคนละประเภท กรุณาเลือกแท็บให้ตรงกับรายการ');if(d.status!=='pending'||d.payment_method==='cash')throw new Error('รายการนี้ไม่พร้อมรับเงินสด หรือบันทึกเงินสดไว้แล้ว');linked=d;f.amount.value=(d.amount_cents/100).toFixed(2);$('#cash-existing-detail').textContent=`${d.ref} · ${d.name} · ${adminOrderCategories.find(([k])=>k===d.type)?.[1]} · ${money(d.amount_cents/100)} บาท`;}catch(e){if(version===lookupVersion&&form.isConnected)$('#cash-existing-detail').textContent=e.message;}};
  update();
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;const existing=isExisting();
    if(existing&&!editing&&(!linked||linked.ref!==f.ref.value)){$('#cash-status').textContent='กรุณาค้นหาและตรวจสอบรายการเดิมก่อน';return;}
    busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
      const requestKey=[existing?'existing':'new',f.kind.value,existing?f.ref.value:''].join(':');
      const data={request_id:requestIds[requestKey]||(requestIds[requestKey]=crypto.randomUUID()),ref:existing?f.ref.value:'',amount:f.amount.value,collector:f.collector.value,received_date:f.received_date.value,note:f.note.value};
      if(editing){data.edit_receipt=true;data.reason=f.reason.value;}
      else if(!existing){Object.assign(data,{type:f.kind.value,tax_request:readTaxRequest(form),name:f.name.value,phone:f.phone.value,...parts(),delivery:f.delivery.value,recipient:f.recipient.value,address:f.address.value,postcode:f.postcode.value});const file=f.evidence.files[0];if(file){if(file.size>5*1024*1024)throw new Error('เอกสารแนบต้องไม่เกิน 5 MB');data.file=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(new Error('อ่านไฟล์ไม่สำเร็จ'));r.readAsDataURL(file);});}}
      const r=await fetch('/api/admin/cash-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),d=await r.json();if(!r.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');
      clearTaxRequest(form);saved=true;for(const el of form.elements)el.disabled=true;
      $('#cash-status').textContent=`บันทึกแล้ว · เลขอ้างอิง ${d.ref} · ${d.status==='pending'?'รอตรวจสอบ ยังไม่รวมยอด':'สถานะเดิมคงอยู่'}`;
      const next=document.createElement('button');next.type='button';next.className='ui-btn ui-btn-outline';next.textContent='ไปตรวจสอบรายการ';next.onclick=()=>{adminSearch=d.ref;adminPage=1;tab='orders';admin();};form.append(next);
    }catch(e){$('#cash-status').textContent=e.message+' · หากการเชื่อมต่อขาดหาย กดบันทึกซ้ำในฟอร์มเดิมได้โดยไม่สร้างยอดซ้ำ';submit.disabled=false;}
    finally{busy=false;}
  };
}
