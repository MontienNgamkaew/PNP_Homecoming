const taxFormControllers=new WeakMap();
const taxDeliveryLabels={pickup:'รับด้วยตนเองที่วิทยาลัย',line:'ส่งทาง Line ID',post:'ส่งทางไปรษณีย์'};
const taxStateLabels={requested:'รอตรวจสอบคำขอ',preparing:'กำลังจัดทำ',ready:'พร้อมรับ / พร้อมส่ง',delivered:'ส่งมอบแล้ว',cancelled:'ยกเลิกคำขอ'};
function taxRequestFields(force=false){
 if(settings.backend!=='php')return '';
 return `<fieldset class="tax-request-fields"><legend>เอกสารสำหรับลดหย่อนภาษี</legend>
 <label ${force?'hidden':''}>ต้องการขอเอกสารลดหย่อนภาษีหรือไม่<select class="ui-select ui-select-bordered" name="tax_requested"><option value="no">ไม่ต้องการ</option><option value="yes" ${force?'selected':''}>ต้องการขอเอกสาร</option></select></label>
 <div data-tax-details hidden><p class="muted">กรอกข้อมูลสำหรับให้เจ้าหน้าที่ตรวจสอบและจัดทำเอกสาร</p>
 <label>ชื่อผู้เสียภาษี / ชื่อสำหรับออกเอกสาร<input class="ui-input ui-input-bordered" name="tax_document_name" minlength="2" maxlength="150" autocomplete="off"></label>
 <label>เลขประจำตัวผู้เสียภาษี 13 หลัก<input class="ui-input ui-input-bordered" name="tax_id" type="text" inputmode="numeric" pattern="[0-9]{13}" maxlength="25" autocomplete="off" placeholder="กรอกตัวเลข 13 หลัก"></label>
 <label>ช่องทางรับเอกสาร<select class="ui-select ui-select-bordered" name="tax_delivery">${Object.entries(taxDeliveryLabels).map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select></label>
 <label data-tax-line hidden>Line ID สำหรับรับเอกสาร<input class="ui-input ui-input-bordered" name="tax_line_id" maxlength="100" autocomplete="off"></label>
 <div data-tax-post hidden><label>ชื่อผู้รับเอกสาร<input class="ui-input ui-input-bordered" name="tax_recipient" minlength="2" maxlength="150" autocomplete="off"></label><label>ที่อยู่รับเอกสาร<textarea class="ui-textarea ui-textarea-bordered" name="tax_address" minlength="5" maxlength="1000" autocomplete="off"></textarea></label><label>รหัสไปรษณีย์<input class="ui-input ui-input-bordered" name="tax_postcode" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="off"></label></div>
 <p class="muted">เป็นการส่งคำขอให้เจ้าหน้าที่ตรวจสอบ การขอเอกสารยังไม่ใช่การยืนยันสิทธิลดหย่อนภาษี</p></div></fieldset>`;
}
function bindTaxRequest(form,{force=false,data=null}={}){
 const root=form.querySelector('.tax-request-fields');if(!root)return null;const f=form.elements;let enabled=true,touched=false;
 function update(){
  const wanted=enabled&&(force||f.tax_requested.value==='yes'),delivery=f.tax_delivery.value;
  root.hidden=!enabled;root.querySelector('[data-tax-details]').hidden=!wanted;
  root.querySelector('[data-tax-line]').hidden=delivery!=='line';root.querySelector('[data-tax-post]').hidden=delivery!=='post';
  for(const input of root.querySelectorAll('input,textarea,select')){if(input===f.tax_requested){input.disabled=!enabled;continue;}const key=input.name;const relevant=!['tax_line_id','tax_recipient','tax_address','tax_postcode'].includes(key)||(key==='tax_line_id'?delivery==='line':delivery==='post');input.disabled=!(wanted&&relevant);input.required=wanted&&relevant;}
 }
 f.tax_id.addEventListener('input',()=>{f.tax_id.value=f.tax_id.value.replace(/[ -]/g,'');});
 f.tax_document_name.addEventListener('input',()=>{touched=true;});
 if(f.name)f.name.addEventListener('input',()=>{if(!touched)f.tax_document_name.value=f.name.value;});
 f.tax_requested.addEventListener('change',()=>{if(!f.tax_document_name.value)f.tax_document_name.value=f.name?.value||'';update();});f.tax_delivery.addEventListener('change',()=>{if(f.tax_delivery.value==='post'&&!f.tax_recipient.value)f.tax_recipient.value=f.tax_document_name.value;update();});
 if(data){f.tax_requested.value='yes';for(const [key,name] of Object.entries({tax_id:'tax_id',document_name:'tax_document_name',delivery:'tax_delivery',line_id:'tax_line_id',recipient:'tax_recipient',address:'tax_address',postcode:'tax_postcode'}))f[name].value=data[key]||'';touched=true;}
 const controller={enable(value){enabled=value;update();},read(){if(!enabled||(!force&&f.tax_requested.value!=='yes'))return {requested:false};return {requested:true,tax_id:f.tax_id.value.replace(/[ -]/g,''),document_name:f.tax_document_name.value,delivery:f.tax_delivery.value,line_id:f.tax_line_id.value,recipient:f.tax_recipient.value,address:f.tax_address.value,postcode:f.tax_postcode.value};},clear(){f.tax_requested.value='no';for(const input of root.querySelectorAll('input,textarea'))input.value='';touched=false;update();}};
 taxFormControllers.set(form,controller);update();return controller;
}
function readTaxRequest(form){return taxFormControllers.get(form)?.read()||{requested:false};}
function clearTaxRequest(form){taxFormControllers.get(form)?.clear();}
let taxAdminFilters={q:'',status:'',delivery:'',page:1},taxRenderVersion=0;
async function renderTaxAdmin(body){
 const version=++taxRenderVersion;
 if(settings.backend!=='php'){body.innerHTML='<p class="notice">ใช้แท็บนี้ในระบบ PHP บนเว็บไซต์หลัก</p>';return;}
 body.innerHTML=`<section class="card ui-card"><h2>การลดหย่อนภาษี</h2><p class="muted">คำขอจากผ้าป่าและกองทุนช่างกล ทั้งเงินสดและเงินโอน · สถานะเอกสารแยกจากสถานะยืนยันยอดเงิน</p><button type="button" class="ui-btn ui-btn-outline" id="tax-add-request">เพิ่มคำขอจากเลขอ้างอิงเดิม</button><form id="tax-filters" class="tax-filters"><label>ค้นหาเลขอ้างอิงหรือชื่อ<input class="ui-input ui-input-bordered" name="q" maxlength="150" value="${esc(taxAdminFilters.q)}"></label><label>สถานะเอกสาร<select class="ui-select ui-select-bordered" name="status"><option value="">ทุกสถานะ</option>${Object.entries(taxStateLabels).map(([k,t])=>`<option value="${k}" ${taxAdminFilters.status===k?'selected':''}>${t}</option>`).join('')}</select></label><label>วิธีรับ<select class="ui-select ui-select-bordered" name="delivery"><option value="">ทุกช่องทาง</option>${Object.entries(taxDeliveryLabels).map(([k,t])=>`<option value="${k}" ${taxAdminFilters.delivery===k?'selected':''}>${t}</option>`).join('')}</select></label><button class="ui-btn ui-btn-primary">ค้นหา</button></form><p id="tax-list-status" class="muted" role="status">กำลังโหลด…</p><div id="tax-list"></div></section>`;
 const form=body.querySelector('#tax-filters');form.onsubmit=e=>{e.preventDefault();taxAdminFilters={...Object.fromEntries(new FormData(form)),page:1};renderTaxAdmin(body);};
 body.querySelector('#tax-add-request').onclick=()=>openTaxEditor(null,body);
 try{
  const r=await fetch('/api/admin/tax-requests?'+new URLSearchParams(taxAdminFilters),{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'โหลดคำขอไม่สำเร็จ');if(version!==taxRenderVersion||!body.isConnected||!body.querySelector('#tax-list'))return;
  body.querySelector('#tax-list-status').textContent=`พบ ${money(d.count)} คำขอ · หน้า ${d.page} / ${Math.max(1,Math.ceil(d.count/50))}`;
  body.querySelector('#tax-list').innerHTML=d.items.length?`<div class="admin-orders-scroll"><table class="ui-table"><thead><tr><th>เลขอ้างอิง / ประเภท</th><th>ผู้ขอเอกสาร</th><th>ยอด / การชำระเงิน</th><th>วิธีรับ</th><th>สถานะเอกสาร</th><th>รายละเอียด</th></tr></thead><tbody>${d.items.map(o=>`<tr><td><b>${esc(o.order_ref)}</b><br>${o.type==='donate'?'ผ้าป่า':'กองทุนช่างกล'}</td><td>${esc(o.document_name)}<br><small>${esc(o.tax_id_masked)}</small></td><td>฿${money(o.amount_cents/100)}<br>${o.payment_method==='cash'?'เงินสด':'เงินโอน'} · ${o.payment_status==='confirmed'?'ยืนยันยอดแล้ว':o.payment_status==='rejected'?'ยกเลิก / ไม่ผ่าน':'รอตรวจสอบยอด'}</td><td>${esc(taxDeliveryLabels[o.delivery])}</td><td>${esc(taxStateLabels[o.request_status])}</td><td><button type="button" class="ui-btn ui-btn-sm ui-btn-outline" data-tax-ref="${esc(o.order_ref)}">ดู / แก้ไข</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">ยังไม่มีคำขอตรงกับตัวกรอง</p>';
  const pager=document.createElement('div');pager.className='admin-pagination';for(const [text,page,disabled] of [['ก่อนหน้า',d.page-1,d.page<=1],['ถัดไป',d.page+1,d.page*50>=d.count]]){const button=document.createElement('button');button.type='button';button.className='ui-btn ui-btn-sm';button.textContent=text;button.disabled=disabled;button.onclick=()=>{taxAdminFilters.page=page;renderTaxAdmin(body);};pager.append(button);}body.querySelector('#tax-list').append(pager);
  body.querySelectorAll('[data-tax-ref]').forEach(button=>button.onclick=()=>openTaxEditor(button.dataset.taxRef,body));
 }catch(error){if(version===taxRenderVersion&&body.querySelector('#tax-list-status'))body.querySelector('#tax-list-status').textContent=error.message;}
}
async function openTaxEditor(ref,body){
 let data=null;
 if(ref){
  modal('<section id="tax-editor"><h2>กำลังโหลดคำขอเอกสาร…</h2></section>');const loading=document.querySelector('#tax-editor');
  try{const response=await fetch('/api/admin/tax-request?ref='+encodeURIComponent(ref),{cache:'no-store'});data=await response.json();if(!loading.isConnected||!body.isConnected)return;if(!response.ok)throw new Error(data.error||'โหลดข้อมูลไม่สำเร็จ');}
  catch(error){if(loading.isConnected)modal(`<h2>โหลดข้อมูลไม่สำเร็จ</h2><p>${esc(error.message)}</p>`);return;}
 }
 if(!body.isConnected)return;
 modal(`<section id="tax-editor"><h2>${ref?'รายละเอียดคำขอ '+esc(ref):'เพิ่มคำขอเอกสาร'}</h2>${ref?`<p>${esc(data.name)} · ฿${money(data.amount_cents/100)} · ${data.payment_method==='cash'?'เงินสด':'เงินโอน'} · ${data.payment_status==='confirmed'?'ยืนยันยอดแล้ว':data.payment_status==='rejected'?'รายการยกเลิก':'รอตรวจสอบยอด'}</p>`:''}<form id="tax-admin-form">${ref?'':'<label>เลขอ้างอิงรายการผ้าป่าหรือกองทุน<input class="ui-input ui-input-bordered" name="ref" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric"></label>'}${taxRequestFields(true)}${ref?`<label>สถานะเอกสาร<select class="ui-select ui-select-bordered" name="request_status">${Object.entries(taxStateLabels).map(([k,t])=>`<option value="${k}" ${data.request_status===k?'selected':''}>${t}</option>`).join('')}</select></label><label>บันทึกเจ้าหน้าที่ / เลขติดตามไปรษณีย์<textarea class="ui-textarea ui-textarea-bordered" name="admin_note" maxlength="1000">${esc(data.admin_note)}</textarea></label>`:''}<label>เหตุผลการ${ref?'แก้ไข':'เพิ่มคำขอ'}<textarea class="ui-textarea ui-textarea-bordered" name="reason" required minlength="3" maxlength="500"></textarea></label><button type="submit" class="ui-btn ui-btn-primary full">บันทึกคำขอ</button><p id="tax-edit-status" role="status"></p></form></section>`);
 const form=document.querySelector('#tax-admin-form');bindTaxRequest(form,{force:true,data});
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{const payload={...readTaxRequest(form),ref:ref||form.elements.ref.value,reason:form.elements.reason.value};if(ref)Object.assign(payload,{revision:data.revision,request_status:form.elements.request_status.value,admin_note:form.elements.admin_note.value});const r=await fetch(ref?'/api/admin/tax-request-update':'/api/admin/tax-request-create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');if(form.isConnected){closeModal();if(body.isConnected)renderTaxAdmin(body);}}catch(error){if(form.isConnected)form.querySelector('#tax-edit-status').textContent=error.message;}finally{button.disabled=false;}};
}
