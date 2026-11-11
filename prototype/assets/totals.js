let totalsTimer = null, totalsController = null;
function stopTotals() {
  clearInterval(totalsTimer); totalsTimer = null;
  totalsController?.abort(); totalsController = null;
}
function totals() {
  const categories = [['donate','01','ทอดผ้าป่าเพื่อการศึกษา','♡'],['fund','02','กองทุนช่างกลโรงงาน','⚙'],['tables','03','จองโต๊ะจีน','◉'],['shirts','04','เสื้อที่ระลึก','✦']];
  app.innerHTML = `<section class="totals-board" id="totals-board" aria-label="ยอดร่วมงานที่ยืนยันแล้ว">
    <div class="totals-toolbar"><a href="#home">← หน้าหลัก</a><button class="totals-screen" type="button">⛶ เต็มหน้าจอ</button></div>
    <div class="totals-title"><img class="totals-event-logo" src="assets/totals/event-logo-cutout-v1.webp" alt="คืนสู่เหย้าศิษย์เก่า การอาชีพพนมไพร ครั้งที่ 2" width="480" height="270"><span>30 ปี แห่งความผูกพัน</span><h1>พลังศิษย์เก่า เพื่ออนาคตรุ่นน้อง</h1><p>คืนสู่เหย้า การอาชีพพนมไพร ครั้งที่ 2</p></div>
    <div class="totals-grand"><span>ยอดรวมทั้ง 4 ประเภท</span><strong id="totals-grand-value">—</strong><span class="totals-unit">บาท</span></div>
    <div class="totals-categories">${categories.map(([key,n,title,icon])=>`<article class="totals-category totals-${key}"><div class="totals-category-top"><span>${n}</span><span aria-hidden="true">${icon}</span></div><h2>${title}</h2><div><strong id="totals-${key}-value">—</strong><small>บาท</small></div></article>`).join('')}</div>
    <div class="totals-foot"><span>เฉพาะยอดที่ตรวจสอบและยืนยันแล้ว</span><span id="totals-update" role="status">กำลังโหลดข้อมูล…</span><button type="button" class="totals-refresh">↻ อัปเดตยอด</button></div>
  </section>`;
  const board = document.getElementById('totals-board');
  const format = cents => (cents / 100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  let busy = false;
  async function refresh() {
    if (busy || !board.isConnected) return;
    busy = true; const controller = new AbortController(); totalsController = controller;
    const timeout = setTimeout(()=>controller.abort(),12000);
    try {
      const response = await fetch('/api/totals',{cache:'no-store',signal:controller.signal});
      if(!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if(!Number.isSafeInteger(data.total_cents) || data.total_cents < 0 || categories.some(([key])=>!Number.isSafeInteger(data.by_type?.[key]) || data.by_type[key]<0) || categories.reduce((sum,[key])=>sum+data.by_type[key],0)!==data.total_cents) throw new Error('invalid totals');
      if(!board.isConnected) return;
      document.getElementById('totals-grand-value').textContent = format(data.total_cents);
      for(const [key] of categories) document.getElementById(`totals-${key}-value`).textContent = format(data.by_type[key]);
      board.classList.remove('totals-stale');
      document.getElementById('totals-update').textContent = 'อัปเดต '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · ทุก 15 วินาที';
    } catch(error) {
      if(board.isConnected) {board.classList.add('totals-stale'); document.getElementById('totals-update').textContent='เชื่อมต่อไม่สำเร็จ · กำลังแสดงยอดล่าสุดที่โหลดได้';}
    } finally { clearTimeout(timeout); busy=false; if(totalsController===controller) totalsController=null; }
  }
  const screen = board.querySelector('.totals-screen');
  screen.addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(board.requestFullscreen) await board.requestFullscreen();
      else {board.classList.toggle('totals-expanded'); screen.textContent=board.classList.contains('totals-expanded')?'✕ ปิดเต็มจอ':'⛶ เต็มหน้าจอ';}
    } catch(error) {board.classList.toggle('totals-expanded'); screen.textContent=board.classList.contains('totals-expanded')?'✕ ปิดเต็มจอ':'⛶ เต็มหน้าจอ';}
  });
  board.addEventListener('fullscreenchange',()=>{screen.textContent=document.fullscreenElement?'✕ ออกจากเต็มจอ':'⛶ เต็มหน้าจอ';});
  board.addEventListener('keydown',event=>{if(event.key==='Escape'){board.classList.remove('totals-expanded');screen.textContent='⛶ เต็มหน้าจอ';}});
  board.querySelector('.totals-refresh').addEventListener('click',refresh);
  refresh(); totalsTimer=setInterval(()=>{if(!document.hidden) refresh();},15000);
}
