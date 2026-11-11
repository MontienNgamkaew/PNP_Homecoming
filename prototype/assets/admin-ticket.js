let adminTicketState=null;
function clearAdminTicket(){
  if(adminTicketState){adminTicketState.controller?.abort();adminTicketState=null;}
}
async function openAdminTicket(ref){
  modal(`<section id="admin-ticket-preview"><h2>E-Ticket ${esc(ref)}</h2><p class="muted">ตั๋วรายการเดียวกับผู้จอง · อ่านข้อมูลล่าสุดโดยไม่เปลี่ยนลิงก์ตั๋วเดิม</p><div class="admin-ticket-controls"><button type="button" class="ui-btn ui-btn-primary" id="admin-print-ticket" disabled>พิมพ์ตั๋ว</button><button type="button" class="ui-btn ui-btn-outline" id="admin-refresh-ticket" disabled>อัปเดตข้อมูล</button></div><p id="admin-ticket-status" class="muted" role="status">กำลังโหลดตั๋วล่าสุด…</p><div id="admin-ticket-image"></div></section>`);
  const root=document.querySelector('#admin-ticket-preview'),state={ref,controller:null,busy:false};adminTicketState=state;
  async function refresh(print=false){
    if(state.busy||adminTicketState!==state)return;state.busy=true;
    const controls=root.querySelectorAll('button');controls.forEach(b=>b.disabled=true);
    const status=root.querySelector('#admin-ticket-status');status.textContent='กำลังโหลดข้อมูลตั๋วล่าสุด…';
    root.querySelector('#admin-ticket-image').replaceChildren();
    const controller=new AbortController();state.controller=controller;const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const r=await fetch('/api/admin/ticket?ref='+encodeURIComponent(ref),{cache:'no-store',signal:controller.signal}),ticket=await r.json();
      if(!r.ok)throw new Error(ticket.error||'โหลดตั๋วไม่สำเร็จ');
      const canvas=await makeTicketCanvas(ticket);if(adminTicketState!==state||!root.isConnected)return;
      const img=document.createElement('img');img.className='electronic-ticket-image'+(ticket.type==='shirts'?' shirt-ticket-image':'');img.alt='E-Ticket '+ticket.ref;img.src=canvas.toDataURL('image/png');root.querySelector('#admin-ticket-image').replaceChildren(img);
      await img.decode();if(adminTicketState!==state||!root.isConnected)return;
      status.textContent='สถานะล่าสุด: '+ticket.label+' · เลขอ้างอิง '+ticket.ref;
      root.dataset.ready='true';
      if(print)window.print();
    }catch(error){if(adminTicketState===state){root.dataset.ready='false';status.textContent=error.name==='AbortError'?'โหลดตั๋วนานเกินไป กรุณากดอัปเดตข้อมูล':error.message;}}
    finally{clearTimeout(timeout);state.busy=false;if(adminTicketState===state){root.querySelector('#admin-refresh-ticket').disabled=false;root.querySelector('#admin-print-ticket').disabled=root.dataset.ready!=='true';}}
  }
  root.querySelector('#admin-print-ticket').onclick=()=>refresh(true);
  root.querySelector('#admin-refresh-ticket').onclick=()=>refresh();
  await refresh();
}
