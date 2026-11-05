/* Private e-tickets: tracking token authenticates requests but never appears in PNG. */
let ticketCredentials = null;
let ticketBackgroundPromise;
function loadTicketBackground() {
  if (!ticketBackgroundPromise) {
    ticketBackgroundPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { ticketBackgroundPromise = null; reject(new Error('โหลดพื้นหลังตั๋วไม่สำเร็จ กรุณาลองใหม่')); };
      image.src = 'assets/ticket/background-v2.png';
    });
  }
  return ticketBackgroundPromise;
}
async function fetchElectronicTicket(credentials) {
  const response = await fetch('/api/ticket', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'โหลดตั๋วไม่สำเร็จ');
  return data;
}
function wrapTicketText(ctx, value, width) {
  const chars = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(String(value))].map(s=>s.segment) : [...String(value)];
  let line = '', lines = [];
  for (const c of chars) {
    if (ctx.measureText(line+c).width > width && line) {lines.push(line);line='';}
    line += c;
  }
  if (line) lines.push(line);
  return lines;
}
async function makeTicketCanvas(ticket) {
  const [background] = await Promise.all([loadTicketBackground(), document.fonts.ready]);
  if (ticket.type === 'shirts') return makeShirtTicketCanvas(ticket, background);
  const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
  canvas.width=1080;
  ctx.font='500 40px Prompt, sans-serif';
  const nameLines=wrapTicketText(ctx,ticket.name,880);
  const tables=[];for(let i=0;i<ticket.tables.length;i+=8)tables.push(ticket.tables.slice(i,i+8));
  canvas.height=1480+Math.max(0,tables.length-1)*88+Math.max(0,nameLines.length-1)*54;
  const h=canvas.height;
  // Keep the decorative header/footer fixed while extending the blank body for long tickets.
  const sourceHeader = Math.round(background.naturalHeight * .272);
  const sourceFooter = Math.round(background.naturalHeight * .045);
  ctx.drawImage(background,0,0,background.naturalWidth,sourceHeader,0,0,1080,405);
  ctx.drawImage(background,0,sourceHeader,background.naturalWidth,background.naturalHeight-sourceHeader-sourceFooter,0,405,1080,h-473);
  ctx.drawImage(background,0,background.naturalHeight-sourceFooter,background.naturalWidth,sourceFooter,0,h-68,1080,68);
  function text(value,y,size=34,color='#204c3b',weight=400){ctx.fillStyle=color;ctx.font=`${weight} ${size}px Prompt, sans-serif`;ctx.textAlign='center';ctx.fillText(value,540,y);}
  text('E-TICKET / ตั๋วอิเล็กทรอนิกส์',130,31,'#edc86d',500);
  text('คืนสู่เหย้าศิษย์เก่า ครั้งที่ 2',210,48,'#fff',600);
  text('วิทยาลัยการอาชีพพนมไพร',280,39,'#fff',400);
  text('30 ปีแห่งความผูกพัน',340,29,'#e3d5a5');
  const valid=ticket.admission_valid, rejected=ticket.status==='rejected';
  ctx.fillStyle=valid?'#e4f2e6':rejected?'#f8e1dc':'#fff2d3';ctx.fillRect(90,425,900,95);
  text(ticket.redeemed?'ใช้ตั๋วเข้างานแล้ว':valid?'ยืนยันแล้ว · ใช้แสดงเพื่อเข้างาน':rejected?'ยกเลิก / ไม่ผ่านการตรวจสอบ':'รอตรวจสอบ · ยังใช้เข้างานไม่ได้',486,32,valid?'#24583b':rejected?'#943d32':'#7d5c18',500);
  text(ticket.event,600,39,'#15533c',500);text(ticket.venue,657,31);
  text('เลขอ้างอิงการจอง',745,28,'#718069');
  text(ticket.ref,840,82,'#15533c',700);
  text('ชื่อผู้จอง',918,28,'#718069');
  nameLines.forEach((line,i)=>text(line,978+i*54,40,'#204c3b',500));
  let y=1055+(nameLines.length-1)*54;
  text('หมายเลขโต๊ะ',y,28,'#718069'); y+=65;
  tables.forEach(row=>{text(row.map(n=>tableLabel(n)).join('  ·  '),y,40,'#15533c',600);y+=75;});
  text(`${ticket.tables.length} โต๊ะ · ${ticket.guests} ท่าน · โต๊ะละ 8 ท่าน`,y+10,32);
  ctx.strokeStyle='#d8c89a';ctx.setLineDash([12,12]);ctx.beginPath();ctx.moveTo(90,h-240);ctx.lineTo(990,h-240);ctx.stroke();ctx.setLineDash([]);
  text('กรุณาแสดงตั๋วให้เจ้าหน้าที่ตรวจเลขอ้างอิงและสถานะ',h-178,27,'#536c53');
  text(valid?'ตั๋วนี้อ้างอิงสถานะ ณ เวลาดาวน์โหลด':rejected?'กรุณาติดต่อผู้จัดงานเกี่ยวกับรายการนี้':'ดาวน์โหลดฉบับยืนยันได้เมื่อตรวจสลิปผ่านแล้ว',h-125,25,'#536c53');
  text('ออกเมื่อ '+new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}),h-77,22,'#77856a');
  return canvas;
}
async function showElectronicTicket(ref,token) {
  ticketCredentials={ref,token};
  modal('<h2>กำลังเตรียมตั๋ว…</h2>');
  try {
    const ticket=await fetchElectronicTicket(ticketCredentials);
    if(!ticket) throw new Error('ไม่พบตั๋ว หรือรหัสติดตามไม่ถูกต้อง');
    const canvas=await makeTicketCanvas(ticket);
    const isShirt = ticket.type === 'shirts';
    const title = isShirt ? 'ตั๋วรับเสื้อที่ระลึก' : 'ตั๋วอิเล็กทรอนิกส์';
    const message = ticket.redeemed ? 'ตั๋วนี้ถูกใช้แล้ว กรุณาติดต่อเจ้าหน้าที่หากต้องการตรวจสอบ' : isShirt ? shirtTicketStatus(ticket) : ticket.admission_valid ? 'ยืนยันแล้ว พร้อมแสดงให้เจ้าหน้าที่ตรวจเข้างาน' : ticket.status === 'rejected' ? 'รายการนี้ถูกยกเลิกหรือไม่ผ่านการตรวจสอบ' : 'รอตรวจสอบสลิป ดาวน์โหลดฉบับยืนยันได้ภายหลัง';
    modal(`<h2>${title}</h2><p class="muted">${esc(message)}</p><img class="electronic-ticket-image ${isShirt ? 'shirt-ticket-image' : ''}" src="${canvas.toDataURL('image/png')}" alt="${title} เลขอ้างอิง ${esc(ticket.ref)}"><button id="download-ticket" type="button" class="btn ui-btn ui-btn-primary full" onclick="downloadElectronicTicket()">ดาวน์โหลด${isShirt ? 'ตั๋วรับเสื้อ' : 'ตั๋ว'} PNG ↓</button><p id="ticket-download-status" class="muted" role="status">ไฟล์ตั๋วไม่แสดงเบอร์โทร ที่อยู่ หรือรหัสติดตามส่วนตัว</p>`);
  } catch(error) {modal(`<h2>โหลดตั๋วไม่สำเร็จ</h2><p>${esc(error.message)}</p>`);}
}
async function downloadElectronicTicket() {
  if(!ticketCredentials) return;
  const button=document.getElementById('download-ticket'),status=document.getElementById('ticket-download-status');
  button.disabled=true;
  try {
    const ticket=await fetchElectronicTicket(ticketCredentials); // Always export latest status.
    if(!ticket)throw new Error('ไม่พบตั๋ว');
    const canvas=await makeTicketCanvas(ticket);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('สร้างไฟล์ไม่สำเร็จ');
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`${ticket.type === 'shirts' ? 'shirt-ticket' : 'ticket'}-${ticket.ref}-${ticket.status}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent='เตรียมไฟล์ดาวน์โหลดแล้ว · สถานะตั๋ว: '+ticket.label;
  }catch(error){status.textContent=error.message || 'ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่';}
  finally{button.disabled=false;}
}
async function addTicketToTracking(ref,token,container) {
  try {
    const ticket=await fetchElectronicTicket({ref,token});
    if(!ticket || !container.isConnected)return;
    const button=document.createElement('button');button.type='button';button.className='btn ui-btn ui-btn-primary full';
    button.textContent=ticket.type === 'shirts' ? 'ดูและดาวน์โหลดตั๋วรับเสื้อ ↓' : 'ดูและดาวน์โหลดตั๋วเข้างาน ↓';button.onclick=()=>showElectronicTicket(ref,token);container.append(button);
  }catch(_){ /* Status result remains readable; ticket can be retried by tracking again. */ }
}
function showReceiptTicket(){if(activeBlessingReceipt)showElectronicTicket(activeBlessingReceipt.ref,activeBlessingReceipt.token);}

function shirtTicketStatus(ticket) {
  if (ticket.redeemed) return 'รับเสื้อแล้ว · ตั๋วนี้ถูกใช้แล้ว';
  if (ticket.status === 'rejected') return 'ยกเลิก / ไม่ผ่านการตรวจสอบ';
  if (!ticket.payment_confirmed) return 'รอตรวจสอบสลิป · ยังใช้รับเสื้อไม่ได้';
  return ticket.delivery_method === 'post' ? 'ยืนยันชำระแล้ว · รับทางไปรษณีย์' : 'ยืนยันชำระแล้ว · แสดงเพื่อตรวจรับเสื้อ';
}
function makeShirtTicketCanvas(ticket, background) {
  if (!ticket.items?.length) throw new Error('รายการไม่มีข้อมูลไซซ์เสื้อ กรุณาติดต่อผู้ดูแล');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  canvas.width=900;
  ctx.font='500 34px Prompt, sans-serif';
  const names=wrapTicketText(ctx,ticket.name,740);
  const post=ticket.delivery_method==='post';
  const recipient=post && ticket.recipient_name ? wrapTicketText(ctx,'ผู้รับ: '+ticket.recipient_name,740) : [];
  const rows=[];for(let i=0;i<ticket.items.length;i+=2)rows.push(ticket.items.slice(i,i+2));
  const nameExtra=Math.max(0,names.length-1)*46;
  canvas.height=1040+Math.max(0,rows.length-1)*60+nameExtra+Math.max(0,recipient.length-1)*42;
  const h=canvas.height,header=Math.round(background.naturalHeight*.272),footer=Math.round(background.naturalHeight*.045);
  ctx.drawImage(background,0,0,background.naturalWidth,header,0,0,900,252);
  ctx.drawImage(background,0,header,background.naturalWidth,background.naturalHeight-header-footer,0,252,900,h-306);
  ctx.drawImage(background,0,background.naturalHeight-footer,background.naturalWidth,footer,0,h-54,900,54);
  function text(value,y,size=30,color='#204c3b',weight=400,x=450){ctx.font=`${weight} ${size}px Prompt, sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(value,x,y);}
  text('E-TICKET / ตั๋วรับเสื้อที่ระลึก',82,33,'#edc86d',500);
  text('คืนสู่เหย้าศิษย์เก่า ครั้งที่ 2',146,38,'#fff',600);
  text('วิทยาลัยการอาชีพพนมไพร · 30 ปี',202,27,'#e3d5a5');
  const confirmed=ticket.payment_confirmed,rejected=ticket.status==='rejected';
  ctx.fillStyle=confirmed?'#e4f2e6':rejected?'#f8e1dc':'#fff2d3';ctx.fillRect(65,276,770,70);
  text(shirtTicketStatus(ticket),321,27,confirmed?'#24583b':rejected?'#943d32':'#7d5c18',500);
  text('เลขอ้างอิงการจอง',387,25,'#718069');text(ticket.ref,461,70,'#15533c',700);
  text('ชื่อผู้จอง',512,25,'#718069');names.forEach((line,i)=>text(line,560+i*46,34,'#204c3b',500));
  let y=612+nameExtra;text('ไซซ์ / จำนวนเสื้อ',y,26,'#718069');y+=52;
  rows.forEach(row=>{row.forEach((item,i)=>text(`${item.size} × ${item.qty} ตัว`,y,34,'#15533c',600,row.length===1?450:260+i*380));y+=60;});
  text(`รวม ${ticket.total_qty} ตัว · ยอดชำระ ฿${money(ticket.amount)}`,y+9,31,'#15533c',600);
  text(post?'วิธีรับ: ไปรษณีย์':'วิธีรับ: รับด้วยตนเองที่วิทยาลัย',y+65,29);
  if (post) {
    if(recipient.length)recipient.forEach((line,i)=>text(line,y+110+i*42,28));
    else text('จัดส่งตามข้อมูลในรายการจอง',y+110,28);
  } else text(ticket.venue,y+110,28);
  ctx.strokeStyle='#d8c89a';ctx.setLineDash([10,10]);ctx.beginPath();ctx.moveTo(65,h-155);ctx.lineTo(835,h-155);ctx.stroke();ctx.setLineDash([]);
  text(post?'หลักฐานการสั่งเสื้อ · ไม่ใช่การยืนยันว่าส่งพัสดุแล้ว':'แสดงตั๋วให้เจ้าหน้าที่ตรวจรายการก่อนส่งมอบเสื้อ',h-110,25,'#536c53');
  text('สถานะ ณ เวลาดาวน์โหลด · '+new Date().toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok'}),h-67,23,'#77856a');
  return canvas;
}

function ticketAccess(credentials=null){
  app.innerHTML=head('ตั๋วอิเล็กทรอนิกส์','เปิดตั๋วจากลิงก์หรือรหัสส่วนตัวที่ได้รับหลังแจ้งชำระเงิน')+`<section class="card ui-card tracking-card"><h2>เปิดตั๋วของคุณ</h2><form id="ticket-access-form"><label>เลขอ้างอิง<input class="ui-input ui-input-bordered" name="ref" required maxlength="40" autocomplete="off"></label><label>รหัสส่วนตัวสำหรับตั๋ว<input class="ui-input ui-input-bordered" name="token" type="password" required maxlength="200" autocomplete="off"></label><button class="ui-btn ui-btn-primary full">เปิดตั๋ว →</button></form><a class="tracking-ticket-link" href="#track">ตรวจสถานะด้วยเบอร์โทร →</a></section>`;
  const form=document.querySelector('#ticket-access-form');
  form.onsubmit=e=>{e.preventDefault();showElectronicTicket(form.elements.ref.value.trim().toUpperCase(),form.elements.token.value.trim());};
  if(credentials?.ref&&credentials?.token){form.elements.ref.value=credentials.ref;form.elements.token.value=credentials.token;showElectronicTicket(credentials.ref,credentials.token);}
}
function privateTicketUrl(data){return location.origin+location.pathname+'#ticket?'+new URLSearchParams({ref:data.ref,token:data.token});}
async function copyPrivateTicketLink(){
  if(!activeBlessingReceipt)return;const status=document.getElementById('copy-tracking-status');
  try{await navigator.clipboard.writeText(privateTicketUrl(activeBlessingReceipt));status.textContent='คัดลอกลิงก์ตั๋วแล้ว กรุณาเก็บไว้เป็นส่วนตัว';}
  catch(_){const input=document.createElement('input');input.className='ui-input full';input.readOnly=true;input.value=privateTicketUrl(activeBlessingReceipt);input.setAttribute('aria-label','ลิงก์ตั๋วส่วนตัว');status.replaceChildren(input);input.focus();input.select();}
}
