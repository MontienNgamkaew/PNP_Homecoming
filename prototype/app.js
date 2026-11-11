const $ = s => document.querySelector(s), app = $('#app');
let settings = { shirt: 299, table: 2500, shipping: 50, event: '2 มกราคม 2570', qr: {} };
let selected = new Set();
let bookedTables = {};
let adminOrders = [];
let adminRenderVersion = 0;
let adminSummary = null, adminPage = 1, adminSearch = "", adminCategory = "", adminPaymentStatus = "";
let adminBlessings = [];
let lines = [{ size: 'M', qty: 1 }];
let tab = 'overview';
const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
const money = n => Number(n).toLocaleString('th-TH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const head = (title, sub) => `<div class="page-head head-${['donate','fund','tables','shirts','track','ticket','admin'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'admin'}"><a class="back" href="#home">← กลับหน้าหลัก</a><h1>${title}</h1><p>${sub}</p></div>`;
const person = () => `<label>ชื่อ–นามสกุล<input class="ui-input ui-input-bordered" name="name" required minlength="2" placeholder="ชื่อและนามสกุลผู้โอน" autocomplete="name"></label><label>เบอร์โทรศัพท์<input class="ui-input ui-input-bordered" name="phone" required type="tel" pattern="[0-9+ ()-]{9,20}" placeholder="เบอร์ที่ติดต่อได้" autocomplete="tel"></label>`;

function qr(kind) {
  const titles = {
    donate: 'บัญชีร่วมทำบุญทอดผ้าป่าเพื่อการศึกษา',
    fund: 'บัญชีกองทุนช่างกลโรงงาน',
    tables: 'บัญชีชำระค่าจองโต๊ะจีน',
    shirts: 'บัญชีชำระค่าเสื้อที่ระลึก'
  };
  const title = titles[kind] || 'บัญชีรับโอน';
  const account = accountDetails(kind);
  if (settings.qr[kind]) {
    return `<div class="qrbox"><div style="font-weight:700;color:#102e43;margin-bottom:6px">${title}</div>${account}<img src="${settings.qr[kind]}" width="160" alt="QR สำหรับโอนเงิน"><p class="muted">ตรวจสอบชื่อบัญชีผู้รับและยอดเงินก่อนยืนยันการโอน</p></div>`;
  }
  return `<div class="qrbox"><div style="font-weight:700;color:#102e43;margin-bottom:6px">${title}</div>${account}<p class="muted">โอนเงินเข้าบัญชีด้านบน แล้วแนบสลิปเพื่อแจ้งชำระเงิน</p></div>`;
}

const slip = () => `<label class="upload">＋ แนบสลิปการโอนเงิน<input class="ui-file-input ui-file-input-bordered" name="slip" required type="file" accept="image/png,image/jpeg,application/pdf"><small class="muted">JPG, PNG หรือ PDF · ไม่เกิน 5 MB</small></label>`;

function home() {
  app.innerHTML = `
<section class="home-intro"><div class="intro-copy" style="${heroStyle(settings.hero)}">${heroCopy(settings.hero)}<div class="intro-actions"><a class="ui-btn ui-btn-accent" href="#tables">จองโต๊ะร่วมงาน <span>↗</span></a><a class="intro-donate" href="#donate">ทำบุญผ้าป่า ♡</a><a class="intro-donate" href="#fund" style="margin-left:10px">กองทุนช่างกล ⚙</a></div></div>${renderPosterCarousel()}</section>

<section class="service-grid" aria-label="กิจกรรมร่วมงาน">${[
    ['01','donate','ร่วมทำบุญทอดผ้าป่า','ส่งต่อโอกาสทางการศึกษาในโอกาส 30 ปี','ร่วมทำบุญผ้าป่า'],
    ['02','fund','กองทุนช่างกลโรงงาน','สนับสนุนอุปกรณ์การเรียนและทุนการศึกษา','สมทบกองทุนช่างกล'],
    ['03','tables','จองโต๊ะจีน','61 โต๊ะ · โต๊ะละ 8 ท่าน','฿'+money(settings.table)+' / โต๊ะ'],
    ['04','shirts','เสื้อที่ระลึก','เลือกไซซ์ XS–4XL · รับเองหรือจัดส่ง','฿'+money(settings.shirt)+' / ตัว']
  ].map(([n,k,t,d,c])=>`<a class="service-tile service-${k}" href="#${k}"><div class="service-top"><span class="service-no">${n}</span><img src="assets/design-v1/icon-${k}.png" alt=""></div><h3>${t}</h3><p>${d}</p><div class="service-bottom"><b>${c}</b><span class="service-arrow">↗</span></div></a>`).join('')}</section>
<section class="shirt-feature"><div class="shirt-feature-image"><img src="${esc(settings.shirt_image || 'assets/shirt.png')}" alt="เสื้อที่ระลึกงานคืนสู่เหย้า ด้านหน้าและด้านหลัง" loading="lazy"></div><div class="shirt-feature-copy"><span class="eyebrow">TAKE THE MEMORIES HOME</span><h2>เก็บความผูกพัน<br>ไว้ใกล้ตัว</h2><p>เสื้อที่ระลึกคืนสู่เหย้า ครั้งที่ 2</p><div class="feature-price">${money(settings.shirt)}<small>บาท / ตัว</small></div><a class="ui-btn ui-btn-primary" href="#shirts">เลือกไซซ์และจองเสื้อ ↗</a><small class="feature-delivery">รับที่วิทยาลัยฟรี · จัดส่ง ${money(settings.shipping)} บาท / คำสั่งจอง</small></div></section>`;
  startPosterCarousel();
}

async function loadTables() {
  try {
    const res = await fetch('/api/tables');
    if (res.ok) {
      const data = await res.json();
      bookedTables = data.booked || {};
      for (const n of selected) {
        if (bookedTables[n]) selected.delete(n);
      }
      updateTablesUI();
    }
  } catch (e) {
    console.warn('loadTables failed:', e);
  }
}

function renderTableButtons() {
  return tableRows.map(({row,count,start})=>`<div class="dinner-row" aria-label="แถว ${row}">${Array.from({length:count},(_,i)=>{
    const n=start+i,st=bookedTables[n],taken=st==='confirmed'||st==='pending',chosen=selected.has(n);
    const column=row==='A'||row==='B'?(i<4?i+1:i+2):i+1;
    return `<button type="button" data-table="${n}" style="grid-column:${column}" aria-label="โต๊ะ ${tableLabel(n)}${taken?' '+(st==='confirmed'?'ยืนยันแล้ว':'รอตรวจสอบ'):''}" aria-pressed="${chosen}" class="seat-table row-${row} ${chosen?'selected':''} ${st==='confirmed'?'confirmed':st==='pending'?'booked':''}" ${taken?'disabled':''} onclick="toggleTable(${n})">${Array.from({length:8},(_,j)=>`<i class="dinner-chair" style="--angle:${j*45}deg" aria-hidden="true"></i>`).join('')}<span>${tableLabel(n)}</span></button>`;
  }).join('')}${row==='A'||row==='B'?`<div class="vip-table" role="img" aria-label="โต๊ะ VIP ${row==='A'?1:2} สำหรับแขกพิเศษ ไม่เปิดจอง"><span>VIP</span><small>ไม่เปิดจอง</small></div>`:''}</div>`).join('');
}

function renderSelectionSummary() {
  if (!selected.size) return 'แตะหมายเลขโต๊ะที่ต้องการ';
  return [...selected].sort((a, b) => a - b).map(n => 'โต๊ะ ' + tableLabel(n)).join(' · ');
}

function renderTotalSummary() {
  return `<span>${selected.size} โต๊ะ · ${selected.size * 8} ท่าน</span><span>฿${money(selected.size * settings.table)}</span>`;
}

function updateTablesUI() {
  const grid = $('#table-grid');
  if (grid) grid.innerHTML = renderTableButtons();
  const selSumm = $('#table-selection-summary');
  if (selSumm) selSumm.innerHTML = renderSelectionSummary();
  const totSumm = $('#table-total-summary');
  if (totSumm) totSumm.innerHTML = renderTotalSummary();
  const btn = $('#table-checkout-btn');
  if (btn) btn.disabled = !selected.size;
}

function tables() {
  app.innerHTML = head('เลือกโต๊ะของคุณ', '61 โต๊ะ · โต๊ะละ 8 ท่าน · ' + money(settings.table) + ' บาท / โต๊ะ') + `
  <div class="layout dinner-booking-layout">
    <section class="card ui-card">
      <div class="dinner-plan-scroll"><div class="dinner-plan"><div class="dinner-stage" role="img" aria-label="เวทีการแสดงอยู่ด้านหน้าผัง"><svg viewBox="0 0 400 180" aria-hidden="true"><path d="M18 140 Q65 104 70 25 Q200 100 330 25 Q335 104 382 140 L200 72Z" fill="#f3d886"/><path d="M18 140 L200 72 382 140 300 119 100 119Z" fill="#8d245a"/><path d="M80 132H320V166H80Z" fill="#223b48"/><path d="M100 119V159M150 94V159M250 94V159M300 119V159" stroke="#7d8c8e" stroke-width="5"/><path d="M60 161H340V176H60Z" fill="#112c3d"/><path d="M70 25V6L92 15 70 19M330 25V6L352 15 330 19" fill="#d9b65e"/><circle cx="174" cy="132" r="7" fill="#efc56b"/><path d="M174 140L165 157M174 140L186 157M174 140V148" stroke="#efc56b" stroke-width="5"/><circle cx="226" cy="132" r="7" fill="#efc56b"/><path d="M226 140L216 157M226 140L235 157M226 140V148" stroke="#efc56b" stroke-width="5"/></svg><strong>เวทีการแสดง</strong></div>
      <div class="table-scroll dinner-tables-wrap">
        <div class="tables" id="table-grid">
          ${renderTableButtons()}
        </div>
      </div>
      </div></div><div class="legend">
        <span>ว่าง</span>
        <span>เลือกอยู่</span>
        <span>รอตรวจสอบ</span>
        <span>ยืนยันแล้ว</span>
      </div>
      <p class="muted">VIP 2 โต๊ะสำหรับแขกพิเศษ ไม่เปิดจอง · แตะหมายเลขโต๊ะเพื่อเลือก</p>
    </section>
    <section class="card ui-card">
      <h2>สรุปการจอง</h2>
      <p id="table-selection-summary">${renderSelectionSummary()}</p>
      <div class="total" id="table-total-summary">${renderTotalSummary()}</div>
      <button id="table-checkout-btn" class="btn ui-btn ui-btn-primary full" ${!selected.size ? 'disabled' : ''} onclick="tableCheckout()">ถัดไป · แจ้งชำระเงิน →</button>
      <p class="muted">ระบบล็อกโต๊ะอัตโนมัติในฐานข้อมูลเมื่อส่งหลักฐานการโอน</p>
    </section>
  </div>`;
  loadTables();
}

function toggleTable(n) {
  if (!tableLayout.some(t=>t.id===n) || bookedTables[n]) return;
  if (selected.has(n)) {
    selected.delete(n);
  } else {
    selected.add(n);
  }
  const btn = $(`button[data-table="${n}"]`);
  if (btn) {
    btn.classList.toggle('selected', selected.has(n));
    btn.setAttribute('aria-pressed', selected.has(n));
  }
  const selSumm = $('#table-selection-summary');
  if (selSumm) selSumm.innerHTML = renderSelectionSummary();
  const totSumm = $('#table-total-summary');
  if (totSumm) totSumm.innerHTML = renderTotalSummary();
  const checkoutBtn = $('#table-checkout-btn');
  if (checkoutBtn) checkoutBtn.disabled = !selected.size;
}

function tableCheckout() {
  const ns = [...selected].sort((a, b) => a - b);
  modal(`
    <h2>จองโต๊ะจีน</h2>
    <p>โต๊ะที่เลือก: <b>${ns.map(n => 'โต๊ะ ' + tableLabel(n)).join(', ')}</b> (${ns.length} โต๊ะ)<br>ยอดรวม: <b>฿${money(ns.length * settings.table)}</b></p>
    <form id="checkout">
      ${person()}
      ${qr('tables')}
      ${slip()}
      <button type="submit" class="btn ui-btn ui-btn-primary full">ยืนยันและส่งหลักฐานโอนเงิน →</button>
    </form>
  `);
  $('#checkout').onsubmit = async (e) => {
    e.preventDefault();
    await submitOrder(e.target, 'โต๊ะจีน', ns.length * settings.table, { tables: ns });
  };
}

function shirts() {
  app.innerHTML = head('เสื้อที่ระลึก', 'ใส่ความผูกพัน ให้วันคืนสู่เหย้า') + `
  <div class="layout">
    <section class="card ui-card">
      <img class="photo" src="${esc(settings.shirt_image || 'assets/shirt.png')}" alt="แบบเสื้อที่ระลึกงานคืนสู่เหย้า">
      <div class="sizes">${sizes.map((s, i) => `<span>${s} · ${36 + i * 2}”</span>`).join('')}</div>
      <p class="muted">ขนาดรอบอก (นิ้ว) · คลาดเคลื่อน ±0.5 นิ้ว</p>
    </section>
    <section class="card ui-card">
      <h2>จองเสื้อของคุณ</h2>
      <div class="price">${money(settings.shirt)} <small>บาท / ตัว</small></div>
      <form id="shirt-form">
        <label>ไซซ์ / จำนวน</label>
        <div id="size-lines"></div>
        <button type="button" class="btn ui-btn ui-btn-outline ui-btn-primary light" onclick="addLine()">＋ เพิ่มไซซ์</button>
        ${person()}
        <label>วิธีรับเสื้อ
          <select class="ui-select ui-select-bordered" id="delivery" name="delivery">
            <option value="pickup">รับด้วยตนเองที่วิทยาลัย · ฟรี</option>
            <option value="post">รับทางไปรษณีย์ · ${settings.shipping} บาท</option>
          </select>
        </label>
        <div id="address" hidden>
          <label>ชื่อผู้รับ<input class="ui-input ui-input-bordered" name="recipient" autocomplete="shipping name"></label>
          <label>ที่อยู่จัดส่ง<textarea class="ui-textarea ui-textarea-bordered" name="address" rows="3" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด"></textarea></label>
          <label>รหัสไปรษณีย์<input class="ui-input ui-input-bordered" name="postcode" inputmode="numeric" pattern="[0-9]{5}" maxlength="5"></label>
        </div>
        <div id="shirt-total" class="total"></div>
        <button type="submit" class="btn ui-btn ui-btn-primary full">ถัดไป · แจ้งชำระเงิน →</button>
      </form>
    </section>
  </div>`;
  renderLines();
  $('#delivery').onchange = () => {
    const post = $('#delivery').value === 'post';
    $('#address').hidden = !post;
    $('#address').querySelectorAll('input,textarea').forEach(i => i.required = post);
    shirtTotal();
  };
  $('#shirt-form').onsubmit = e => {
    e.preventDefault();
    const form = e.target;
    const amount = shirtAmount();
    modal(`
      <h2>แจ้งชำระค่าเสื้อ</h2>
      <p>${lines.reduce((s, l) => s + l.qty, 0)} ตัว · รวม ฿${money(amount)}</p>
      ${qr('shirts')}
      <form id="shirt-pay">
        ${slip()}
        <button type="submit" class="btn ui-btn ui-btn-primary full">ยืนยันและส่งหลักฐานโอนเงิน →</button>
      </form>
    `);
    $('#shirt-pay').onsubmit = async (pe) => {
      pe.preventDefault();
      await submitOrder(pe.target, 'เสื้อที่ระลึก', amount, {
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        delivery: form.elements.delivery.value,
        recipient: form.elements.recipient?.value || '',
        address: form.elements.address?.value || '',
        postcode: form.elements.postcode?.value || '',
        lines: lines.map(l => ({ ...l }))
      });
    };
  };
}

function renderLines() {
  $('#size-lines').innerHTML = lines.map((l, i) => `
    <div class="size-row">
      <select class="ui-select ui-select-bordered" aria-label="ไซซ์เสื้อ ${i + 1}" onchange="lines[${i}].size=this.value">
        ${sizes.map(s => `<option ${s === l.size ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input class="ui-input ui-input-bordered" aria-label="จำนวนเสื้อ ${i + 1}" type="number" min="1" max="100" value="${l.qty}" required oninput="lines[${i}].qty=Math.max(1,Math.min(100,Number(this.value)||1));this.value=lines[${i}].qty;shirtTotal()">
      <button type="button" class="remove" aria-label="ลบไซซ์" onclick="removeLine(${i})" ${lines.length === 1 ? 'disabled' : ''}>×</button>
    </div>
  `).join('');
  shirtTotal();
}

function addLine() { lines.push({ size: 'M', qty: 1 }); renderLines(); }
function removeLine(i) { lines.splice(i, 1); renderLines(); }
function shirtAmount() {
  return lines.reduce((s, l) => s + l.qty * settings.shirt, 0) + ($('#delivery')?.value === 'post' ? settings.shipping : 0);
}
function shirtTotal() {
  $('#shirt-total').innerHTML = `<span>รวม ${lines.reduce((s, l) => s + l.qty, 0)} ตัว${$('#delivery')?.value === 'post' ? ' + ค่าส่ง' : ''}</span><span>฿${money(shirtAmount())}</span>`;
}

// -------------------------------------------------------------
// 1. หน้าแจ้งโอนเงินร่วมทำบุญทอดผ้าป่าเพื่อการศึกษา (#donate)
// -------------------------------------------------------------
function donate() {
  app.innerHTML = head('ร่วมทำบุญทอดผ้าป่าเพื่อการศึกษา', 'ในโอกาสครบรอบ 30 ปีแห่งการก่อตั้งวิทยาลัยการอาชีพพนมไพร (2 มกราคม 2570)') + `
  <div class="layout">
    <section class="card ui-card">
      ${qr('donate')}
    </section>
    <section class="card ui-card">
      <h2>แจ้งโอนเงินทำบุญผ้าป่า</h2>
      <p class="muted" style="margin-bottom:16px">ร่วมส่งต่อโอกาสทางการศึกษา สมทบทุนพัฒนาวิทยาลัย</p>
      <form id="donation-form">
        ${person()}
        <label>ยอดร่วมทำบุญ (บาท)
          <input class="ui-input ui-input-bordered" name="amount" type="number" min="1" max="10000000" step="0.01" inputmode="decimal" placeholder="0.00" required>
        </label>
        ${slip()}
        <button type="submit" class="btn ui-btn ui-btn-primary full">ยืนยันแจ้งโอนเงินทำบุญผ้าป่า →</button>
      </form>
    </section>
  </div>`;
  $('#donation-form').onsubmit = async (e) => {
    e.preventDefault();
    await submitOrder(e.target, 'ทอดผ้าป่า', Number(e.target.elements.amount.value), {
      category: 'ร่วมทำบุญทอดผ้าป่า'
    });
  };
}

// -------------------------------------------------------------
// 2. หน้าแจ้งโอนเงินสมทบกองทุนช่างกลโรงงาน (#fund)
// -------------------------------------------------------------
function fund() {
  app.innerHTML = head('สมทบกองทุนช่างกลโรงงาน', 'สนับสนุนอุปกรณ์การเรียนรู้ ทุนการศึกษา และพัฒนาเครื่องมือให้รุ่นน้องช่างกล') + `
  <div class="layout">
    <section class="card ui-card">
      ${qr('fund')}
    </section>
    <section class="card ui-card">
      <h2>แจ้งโอนเงินสมทบกองทุนช่างกล</h2>
      <p class="muted" style="margin-bottom:16px">พลังศิษย์เก่าช่างกลโรงงาน สานฝันสร้างอนาคตให้รุ่นน้อง</p>
      <form id="fund-form">
        ${person()}
        <label>รุ่น / ปีที่สำเร็จการศึกษา (ไม่บังคับ)
          <input class="ui-input ui-input-bordered" name="batch" placeholder="เช่น รุ่น 12, ช่างกล 2555">
        </label>
        <label>ยอดร่วมสมทบทุน (บาท)
          <input class="ui-input ui-input-bordered" name="amount" type="number" min="1" max="10000000" step="0.01" inputmode="decimal" placeholder="0.00" required>
        </label>
        ${slip()}
        <button type="submit" class="btn ui-btn ui-btn-primary full">ยืนยันแจ้งโอนเงินสมทบกองทุน →</button>
      </form>
    </section>
  </div>`;
  $('#fund-form').onsubmit = async (e) => {
    e.preventDefault();
    const batch = e.target.elements.batch?.value || '';
    await submitOrder(e.target, 'กองทุนช่างกล', Number(e.target.elements.amount.value), {
      category: 'กองทุนช่างกลโรงงาน' + (batch ? ` (${batch})` : '')
    });
  };
}

function track() {
  app.innerHTML = head('ตรวจสอบสถานะรายการ', 'กรอกเบอร์โทรที่ใช้แจ้งรายการและเลขอ้างอิง') + `
  <section class="card ui-card tracking-card"><h2>ค้นหารายการของคุณ</h2><form id="track-form">
    <label>เบอร์โทรศัพท์ที่ใช้แจ้งรายการ<input class="ui-input ui-input-bordered" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="[0-9+ ()-]{9,25}" maxlength="25" placeholder="เช่น 0812345678"></label>
    <label>เลขอ้างอิง<input class="ui-input ui-input-bordered" name="ref" type="text" inputmode="numeric" required minlength="6" maxlength="40" pattern="[A-Za-z0-9-]{6,40}" placeholder="เลขอ้างอิง 6 หลัก" autocomplete="off"></label>
    <button type="submit" class="ui-btn ui-btn-primary full">ตรวจสอบสถานะ →</button></form>
    <div id="track-result" role="status" style="margin-top:20px" hidden></div><a class="tracking-ticket-link" href="#ticket">เปิดตั๋วด้วยรหัสส่วนตัว →</a></section>`;
  $('#track-form').onsubmit=async e=>{
    e.preventDefault();const form=e.target,button=form.querySelector('button'),result=$('#track-result');button.disabled=true;result.hidden=false;result.textContent='กำลังตรวจสอบข้อมูล…';
    try{
      const response=await fetch('/api/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:form.elements.ref.value.trim().toUpperCase(),phone:form.elements.phone.value.trim()})});
      const data=await response.json();if(!result.isConnected)return;
      if(!response.ok)throw new Error(data.error||'ไม่พบรายการ กรุณาตรวจสอบเบอร์โทรและเลขอ้างอิง');
      const confirmed=['confirmed','approved'].includes(data.status),rejected=data.status==='rejected';
      const type=({donate:'ร่วมทำบุญผ้าป่า',fund:'กองทุนช่างกลโรงงาน',tables:'จองโต๊ะจีน',shirts:'จองเสื้อที่ระลึก'})[data.type]||'รายการร่วมงาน';
      result.innerHTML=`<div class="tracking-result"><small>เลขอ้างอิง ${esc(data.ref)}</small><h3>${esc(type)}</h3><strong>฿${money(data.amount)}</strong><span class="ui-badge ${confirmed?'ui-badge-success':rejected?'ui-badge-error':'ui-badge-warning'}">${esc(data.label)}</span><p>${confirmed?'ตรวจสอบและยืนยันยอดเงินแล้ว':rejected?'กรุณาติดต่อผู้จัดงานเพื่อตรวจสอบรายการ':'อยู่ระหว่างตรวจสอบสลิปและยอดเงิน'}</p></div>`;
    }catch(error){if(result.isConnected)result.innerHTML=`<div class="ui-alert ui-alert-error">${esc(error.message||'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')}</div>`;}
    finally{if(button.isConnected)button.disabled=false;}
  };
}

function modal(html) {
  resetBlessingCard();
  $('#modal').removeAttribute('aria-labelledby');
  $('#modal').setAttribute('aria-label', 'รายละเอียดรายการ');
  $('#modal').innerHTML = `<div class="modal-content"><button class="remove" style="float:right" aria-label="ปิด" onclick="closeModal()">×</button>${html}</div>`;
  $('#modal').hidden = false;
  $('#modal').querySelector('button,input')?.focus();
}
function closeModal() { resetBlessingCard(); const root=$('#modal'); root.hidden=true; if(root.querySelector('#reissued-token')) root.innerHTML=''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function showPoster() { showCurrentPoster(); }

async function submitOrder(form, type, amount, extra = {}) {
  prepareBlessingAudio();
  const fileInput = form.elements.slip;
  const file = fileInput?.files?.[0];
  if (!file) {
    alert('กรุณาแนบไฟล์สลิปการโอนเงิน');
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('ขนาดไฟล์สลิปต้องไม่เกิน 5 MB');
    return false;
  }

  const submitBtn = form.querySelector('button[type="submit"], button.btn');
  const origText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'กำลังส่งข้อมูลและบันทึก... ⏳';
  }

  try {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const payload = {
      type: type,
      amount: amount,
      name: form.elements.name?.value || extra.name || '',
      phone: form.elements.phone?.value || extra.phone || '',
      file: base64Data,
      ...extra
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
      if (type === 'tables' || type === 'โต๊ะจีน') {
        await loadTables();
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = origText;
      }
      return false;
    }

    if (type === 'tables' || type === 'โต๊ะจีน') {
      selected.clear();
      await loadTables();
    }

    const typeTitle = (type === 'tables' || type === 'โต๊ะจีน') ? 'จองโต๊ะจีนสำเร็จ'
                    : (type === 'shirts' || type === 'เสื้อที่ระลึก') ? 'สั่งจองเสื้อที่ระลึกสำเร็จ'
                    : (type === 'fund' || type === 'กองทุนช่างกล') ? 'ร่วมสมทบกองทุนช่างกลสำเร็จ'
                    : 'ร่วมทำบุญทอดผ้าป่าสำเร็จ';

    showBlessingCard(data, typeTitle, amount);
    return true;
  } catch (err) {
    console.error('Submit order error:', err);
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = origText;
    }
    return false;
  }
}

async function admin() {
  const renderVersion = ++adminRenderVersion;
  if (tab === 'overview') { adminCategory=''; adminPaymentStatus=''; adminSearch=''; adminPage=1; }
  app.innerHTML = head('ภาพรวมผู้ดูแล', 'ระบบจัดการรายการจองและตรวจสอบสลิปจริง') + `
    <div class="tabs">
      ${[['overview', 'ภาพรวม'], ['cash', 'บันทึกรับเงินสด'], ['orders', 'รายการทั้งหมด (' + adminOrders.length + ')'], ['blessings', 'คำอวยพร (' + adminBlessings.length + ')'], ['posters', 'โปสเตอร์'], ['hero', 'ข้อความแบนเนอร์'], ['settings', 'ตั้งค่าเว็บไซต์']].map(([v, t]) => `
        <button class="ui-btn ui-btn-sm ${tab === v ? 'ui-btn-primary' : 'ui-btn-ghost'}" data-admin-tab="${v}" onclick="tab='${v}';admin()">${t}</button>
      `).join('')}
    </div>
    <div id="admin-body"><p class="muted">กำลังโหลดข้อมูล... ⏳</p></div>`;

  try {
    const res = await fetch('/api/admin/orders?' + adminOrderQuery());
    if (renderVersion !== adminRenderVersion || location.hash !== '#admin') return;
    if (res.status === 401) {
      $('#admin-body').innerHTML = `
        <section class="card ui-card" style="max-width:440px;margin:20px auto">
          <h2>เข้าสู่ระบบผู้ดูแล</h2>
          <p class="muted">กรุณากรอกรหัสผ่านผู้ดูแลระบบ</p>
          <form id="admin-login-form">
            <label>รหัสผ่านผู้ดูแล
              <input class="ui-input ui-input-bordered" name="password" type="password" required placeholder="รหัสผ่านอย่างน้อย 8 ตัวอักษร" autocomplete="current-password">
            </label>
            <button type="submit" class="btn ui-btn ui-btn-primary full" style="margin-top:12px">เข้าสู่ระบบ →</button>
          </form>
          <div id="login-err" style="margin-top:12px" hidden></div>
        </section>`;
      $('#admin-login-form').onsubmit = async (e) => {
        e.preventDefault();
        const pwd = e.target.elements.password.value;
        const lres = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const ldata = await lres.json();
        if (lres.ok) {
          admin();
        } else {
          const lerr = $('#login-err');
          lerr.hidden = false;
          lerr.innerHTML = `<div class="ui-alert ui-alert-error">${esc(ldata.error || 'รหัสผ่านไม่ถูกต้อง')}</div>`;
        }
      };
      return;
    }
    if (res.ok) {
      adminOrders = await res.json();
      const summaryResponse = await fetch('/api/admin/summary?' + adminOrderQuery()); if (!summaryResponse.ok) throw new Error('โหลดภาพรวมไม่สำเร็จ'); adminSummary = await summaryResponse.json();
      if (renderVersion !== adminRenderVersion || location.hash !== '#admin') return;
      if (tab==='orders' && adminPage>Math.max(1,Math.ceil(adminSummary.filtered_count/100))) {adminPage=Math.max(1,Math.ceil(adminSummary.filtered_count/100));return admin();}
    }
    if (!res.ok) throw new Error('โหลดรายการไม่สำเร็จ กรุณาลองใหม่');
    const bres = await fetch('/api/admin/blessings');
    if (renderVersion !== adminRenderVersion || location.hash !== '#admin') return;
    if (bres.ok) {
      adminBlessings = await bres.json();
    }
  } catch (err) {
    if (renderVersion !== adminRenderVersion || location.hash !== '#admin') return;
    $('#admin-body').innerHTML = `<p class="notice">${esc(err.message || 'โหลดข้อมูลไม่สำเร็จ')}</p>`; return;
  }

  await loadTables();
  if (renderVersion !== adminRenderVersion || location.hash !== '#admin') return;
  const ordersTab = document.querySelector('[data-admin-tab="orders"]');
  if (ordersTab && adminSummary) ordersTab.textContent = `รายการทั้งหมด (${money(adminSummary.total)})`;
  const body = $('#admin-body');
  body.addEventListener('change', event => {if(event.target.id==='admin-payment-status'){adminPaymentStatus=event.target.value;adminPage=1;tab='orders';admin();}});
  body.addEventListener('submit', event => { if(event.target.id==='admin-search'){event.preventDefault();adminSearch=event.target.elements.query.value.trim();adminPage=1;tab='orders';admin();} });
  body.addEventListener('click', event => {
    const category=event.target.closest('[data-order-category]'); if(category){adminCategory=category.dataset.orderCategory;adminPage=1;tab='orders';admin();}
    const reissue=event.target.closest('[data-reissue-ticket]'); if(reissue)openTicketReissue(reissue.dataset.reissueTicket);
    const receipt=event.target.closest('[data-cash-edit]');if(receipt){const order=adminOrders.find(o=>o.ref===receipt.dataset.cashEdit);if(order)renderCashAdmin(body,order);}
    const edit=event.target.closest('[data-edit-order]'); if(edit)openOrderEditor(edit.dataset.editOrder);
    const page=event.target.closest('[data-admin-page]'); if(page){adminPage=Number(page.dataset.adminPage);tab='orders';admin();}
 const button=event.target.closest('[data-edit-blessing]'); if(button){const entry=adminBlessings.find(b=>b.id===Number(button.dataset.editBlessing)); if(entry)editBlessing(entry.id,entry.message);} });

  body.insertAdjacentHTML('beforebegin', '<button class="ui-btn ui-btn-sm ui-btn-ghost" id="admin-logout">ออกจากระบบ</button>');
  $('#admin-logout').onclick = async () => { const r = await fetch('/api/admin/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); if(r.ok){adminOrders=[];adminSummary=null;adminPage=1;admin();} else alert('ออกจากระบบไม่สำเร็จ'); };

  if (tab === 'blessings') {
    body.innerHTML = `<button class="btn ui-btn ui-btn-outline mb-4" onclick="prepareBlessingAudio();blessingPreview()">ชมการ์ดอวยพรและเสียง ♫</button>
      <section class="card ui-card" style="margin-bottom:20px">
        <h2>เพิ่มคำอวยพรใหม่</h2>
        <form id="add-blessing-form">
          <label>ข้อความคำอวยพร
            <textarea class="ui-textarea ui-textarea-bordered" name="message" rows="2" placeholder="พิมพ์ข้อความคำอวยพรที่ต้องการเพิ่มลงในระบบ..." required minlength="3" maxlength="500"></textarea>
          </label>
          <button type="submit" class="btn ui-btn ui-btn-primary" style="margin-top:10px">＋ บันทึกคำอวยพรใหม่</button>
        </form>
      </section>
      <section class="card ui-card" style="overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0">คลังคำอวยพร (${adminBlessings.length})</h2>
          <small class="muted">สุ่มแสดง 1 ข้อความในการ์ดขอบคุณ</small>
        </div>
        ${adminBlessings.length ? `
          <table class="admin-table ui-table">
            <thead>
              <tr>
                <th style="width:36px">#</th>
                <th>ข้อความคำอวยพร</th>
                <th style="width:105px">สถานะ</th>
                <th style="width:170px">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${adminBlessings.map((b, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><b>❝ ${esc(b.message)} ❞</b></td>
                  <td>
                    <span class="ui-badge ${b.active ? 'ui-badge-success' : 'ui-badge-ghost'}">
                      ${b.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button type="button" class="ui-btn ui-btn-xs ui-btn-outline" onclick="toggleBlessing(${b.id})">
                        ${b.active ? 'ปิด' : 'เปิด'}
                      </button>
                      <button type="button" class="ui-btn ui-btn-xs ui-btn-outline" data-edit-blessing="${b.id}">
                        แก้ไข
                      </button>
                      <button type="button" class="ui-btn ui-btn-xs ui-btn-outline text-error" onclick="deleteBlessing(${b.id})">
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty">ยังไม่มีคำอวยพรในระบบ</div>'}
      </section>`;
    $('#add-blessing-form').onsubmit = async (e) => {
      e.preventDefault();
      const msg = e.target.elements.message.value.trim();
      if (!msg) return;
      const bres = await fetch('/api/admin/blessings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', message: msg })
      });
      if (bres.ok) {
        admin();
      } else {
        const berr = await bres.json();
        alert(berr.error || 'ไม่สามารถเพิ่มคำอวยพรได้');
      }
    };
    return;
  }

  if (tab === 'posters') {
    await loadPosters();
    renderPosterAdmin(body);
    return;
  }

  if (tab === 'cash') { renderCashAdmin(body); return; }

  if (tab === 'hero') { renderHeroAdmin(body); return; }

  if (tab === 'settings') {
    body.innerHTML = `
      <section class="card ui-card">
        <h2>ราคาและการรับชำระ</h2>
        <form id="settings">
          <div class="row">
            <label>ราคาเสื้อ / ตัว<input class="ui-input ui-input-bordered" name="shirt" type="number" min="1" step="0.01" required value="${settings.shirt}"></label>
            <label>ราคาโต๊ะจีน<input class="ui-input ui-input-bordered" name="table" type="number" min="1" step="0.01" required value="${settings.table}"></label>
          </div>
          <label>ค่าจัดส่ง / คำสั่งจอง<input class="ui-input ui-input-bordered" name="shipping" type="number" min="0" step="0.01" required value="${settings.shipping}"></label>
          <label>วันที่จัดงาน<input class="ui-input ui-input-bordered" name="event" required value="${esc(settings.event)}"></label>
          <fieldset class="shirt-image-settings"><legend>ภาพเสื้อที่ระลึก</legend>
            <img id="shirt-image-preview" src="${esc(settings.shirt_image || 'assets/shirt.png')}" alt="ภาพเสื้อที่ใช้งาน" style="width:100%;max-width:440px;border-radius:12px;margin:12px 0">
            <label>เปลี่ยนภาพเสื้อ<input class="ui-file-input ui-file-input-bordered" id="shirt-image-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="muted">JPG, PNG หรือ WebP · บีบอัดภาพเกิน 1 MB อัตโนมัติ · ต้นฉบับไม่เกิน 30 MB · แสดงทั้งหน้าหลักและหน้าจองเสื้อ</small></label>
            <p id="shirt-image-error" role="status" class="muted"></p>
            <button type="button" id="shirt-image-reset" class="btn ui-btn">ใช้ภาพเสื้อเดิมของเว็บไซต์</button>
          </fieldset>
          ${accountSettingsFields()}
          ${[['donate', 'QR ทอดผ้าป่า'], ['fund', 'QR กองทุนช่างกล'], ['tables', 'QR โต๊ะจีน'], ['shirts', 'QR เสื้อ']].map(([k, t]) => `
            <label>${t}<input class="ui-file-input ui-file-input-bordered" type="file" accept="image/png,image/jpeg" data-qr="${k}"><small class="muted">PNG / JPG ไม่เกิน 1 MB · ไม่เลือกไฟล์ใหม่จะใช้ภาพเดิม</small>${settings.qr[k] ? `<img src="${settings.qr[k]}" width="100" alt="${t} ที่บันทึกไว้" style="margin-top:8px">` : '<small class="muted">ยังไม่ได้อัปโหลด QR</small>'}</label>
          `).join('')}
          <button type="submit" class="btn ui-btn ui-btn-primary" style="margin-top:12px">บันทึกการตั้งค่า</button>
        </form>
      </section>`;
    let pendingShirtImage = settings.shirt_image || '';
    let shirtImageBusy = false;
    const shirtInput = $('#shirt-image-file');
    shirtInput.onchange = async () => {
      const file = shirtInput.files[0]; if (!file) return;
      shirtImageBusy = true; shirtInput.disabled=true;
      try {
        $('#shirt-image-error').textContent = 'กำลังเตรียมและบีบอัดภาพ…';
        const prepared = await prepareShirtImage(file);
        pendingShirtImage = prepared.data; $('#shirt-image-preview').src = prepared.data;
        const originalSize = (file.size/1024/1024).toLocaleString('th-TH',{maximumFractionDigits:2});
        const savedSize = Math.ceil(prepared.bytes/1024).toLocaleString('th-TH');
        $('#shirt-image-error').textContent = (prepared.compressed ? `บีบอัดแล้ว ${originalSize} MB → ${savedSize} KB` : `ภาพพร้อมใช้งาน ${savedSize} KB`) + ' · กดบันทึกการตั้งค่าเพื่อยืนยัน';
      } catch(error) {shirtInput.value='';$('#shirt-image-error').textContent=error.message;}
      finally {shirtImageBusy=false;shirtInput.disabled=false;}
    };
    $('#shirt-image-reset').onclick = () => {if(shirtImageBusy)return;pendingShirtImage='';shirtInput.value='';$('#shirt-image-preview').src='assets/shirt.png';$('#shirt-image-error').textContent='กดบันทึกการตั้งค่าเพื่อกลับไปใช้ภาพเดิม';};
    $('#settings').onsubmit = async e => {
      e.preventDefault();
      const form = e.target;
      if(shirtImageBusy){$('#shirt-image-error').textContent='กรุณารออ่านภาพให้เสร็จก่อน';return;}
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const draft = { ...settings, shirt_image: pendingShirtImage, qr: { ...settings.qr } };
        for (const k of ['shirt', 'table', 'shipping']) draft[k] = Number(form.elements[k].value);
        draft.event = form.elements.event.value;
        draft.accounts = readAccountSettings(form);
        for (const input of form.querySelectorAll('[data-qr]')) {
          const file = input.files[0];
          if (!file) continue;
          if (file.size > 1024 * 1024) throw new Error('QR ต้องมีขนาดไม่เกิน 1 MB ต่อภาพ');
          draft.qr[input.dataset.qr] = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('อ่านไฟล์ QR ไม่สำเร็จ'));
            reader.readAsDataURL(file);
          });
        }
        const response = await fetch('/api/admin/settings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        settings = data;
        modal('<h2>บันทึกแล้ว ✓</h2><p>บันทึกราคา ภาพเสื้อ บัญชี และ QR ลงฐานข้อมูลแล้ว รายการเดิมยังคงยอดเดิม</p><button class="btn ui-btn ui-btn-primary full" onclick="closeModal();location.hash=\'home\'">ดูหน้าหลัก</button>');
      } catch (error) {
        alert(error.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
      } finally {
        button.disabled = false;
      }
    };
    return;
  }

  const confirmedSum = adminOrders.filter(o => o.status === 'confirmed').reduce((s, o) => s + (o.amount_cents / 100), 0);
  const pendingCount = adminOrders.filter(o => o.status === 'pending').length;
  const bookedTableCount = Object.keys(bookedTables).length;
  const shirtCount = adminOrders.filter(o => o.type === 'shirts' && o.status !== 'rejected').reduce((s, o) => s + (o.items ? o.items.reduce((a, it) => a + it.qty, 0) : 0), 0);

  if (tab === 'overview') {
    body.innerHTML = `
      <div class="stats">
        ${[
          ['ยอดยืนยันแล้ว', '฿' + money(adminSummary ? adminSummary.confirmed_cents / 100 : confirmedSum)],
          ...(adminSummary?.by_payment ? [['เงินสดยืนยันแล้ว','฿'+money(adminSummary.by_payment.cash_cents/100)],['เงินโอนยืนยันแล้ว','฿'+money(adminSummary.by_payment.transfer_cents/100)]] : []),
          ['รอตรวจสอบ', (adminSummary ? adminSummary.pending : pendingCount) + ' รายการ'],
          ['โต๊ะที่จอง', (adminSummary ? adminSummary.booked_tables : bookedTableCount) + ' / 61'],
          ['เสื้อที่จอง', (adminSummary ? adminSummary.shirt_count : shirtCount) + ' ตัว']
        ].map(([t, n]) => `<div class="stat"><span class="muted">${t}</span><b>${n}</b></div>`).join('')}
      </div>
      <div class="section-title"><h2>รายการล่าสุด</h2></div>`;
  }

  if (tab === 'orders') body.innerHTML = '';
  renderAdminOrderList(body);
}

async function changeOrderStatus(ref, status) {
  try {
    const res = await fetch('/api/admin/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, status })
    });
    if (res.ok) {
      await admin();
    } else {
      const err = await res.json();
      alert(err.error || 'ไม่สามารถเปลี่ยนสถานะได้');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

async function toggleBlessing(id) {
  try {
    const res = await fetch('/api/admin/blessings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id })
    });
    if (res.ok) admin();
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

async function editBlessing(id, oldMsg) {
  const newMsg = prompt('แก้ไขข้อความคำอวยพร:', oldMsg);
  if (!newMsg || newMsg.trim() === oldMsg) return;
  try {
    const res = await fetch('/api/admin/blessings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', id, message: newMsg.trim() })
    });
    if (res.ok) admin();
    else {
      const err = await res.json();
      alert(err.error || 'ไม่สามารถแก้ไขได้');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

async function deleteBlessing(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบคำอวยพรนี้ออกจากระบบ?')) return;
  try {
    const res = await fetch('/api/admin/blessings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });
    if (res.ok) admin();
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

let routeVersion = 0;
async function loadSettings() {
  if (Number.isInteger(settings.revision)) {
    const revisionResponse=await fetch('/api/settings/revision',{cache:'no-store'});
    if(revisionResponse.ok){const latest=await revisionResponse.json();if(latest.revision===settings.revision)return;}
    else if(revisionResponse.status!==404)throw new Error('ตรวจสอบค่าตั้งล่าสุดไม่สำเร็จ');
  }
  const response = await fetch('/api/settings', { cache: 'no-store' });
  if (!response.ok) throw new Error('ไม่สามารถโหลดราคาและ QR จากเซิร์ฟเวอร์ได้');
  const data = await response.json();
  settings = data;
}

async function route() {
  stopPosterCarousel();
  stopTotals();
  const version = ++routeVersion;
  app.innerHTML = '<p class="muted" role="status">กำลังโหลดข้อมูลล่าสุด…</p>';
  try { await Promise.all([loadSettings(), loadPosters()]); } catch (error) {
    if (version !== routeVersion) return;
    app.innerHTML = `<section class="card ui-card"><h2>โหลดข้อมูลไม่สำเร็จ</h2><p>${esc(error.message)}</p><button class="btn ui-btn ui-btn-primary full" onclick="route()">ลองอีกครั้ง</button></section>`;
    return;
  }
  if (version !== routeVersion) return;
  let page = location.hash.slice(1) || 'home';
  let privateTicket=null;
  if(page.startsWith('ticket?')){const params=new URLSearchParams(page.slice(7));privateTicket={ref:params.get('ref')||'',token:params.get('token')||''};history.replaceState(null,'','#ticket');page='ticket';}
  if (!['home', 'shirts', 'tables', 'donate', 'fund', 'track', 'ticket', 'admin', 'totals', 'blessing-preview'].includes(page)) page = 'home';
  document.querySelectorAll('header nav a, .mobile-nav a').forEach(a => {
    a.classList.toggle('active', a.hash === '#' + page);
  });
  ({ home, shirts, tables, donate, fund, track, totals, ticket:()=>ticketAccess(privateTicket), admin, 'blessing-preview': blessingPreview }[page])();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
