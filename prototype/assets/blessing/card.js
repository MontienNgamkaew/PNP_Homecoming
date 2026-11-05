/* Full-screen graphic blessing card. No donor data is persisted in the browser. */
let blessingAudioContext, blessingAudioBuffer, blessingAudioLoad, blessingAudioSource;
let blessingSoundMuted = false;
try { blessingSoundMuted = localStorage.getItem('blessing-sound-muted') === 'true'; } catch (_) {}
let activeBlessingReceipt = null;
function prepareBlessingAudio() {
  try {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    blessingAudioContext ||= new AudioEngine();
    // Run resume synchronously from the submit/replay click, before awaiting the API.
    blessingAudioContext.resume().catch(() => {});
    if (!blessingAudioLoad) {
      blessingAudioLoad = fetch('assets/blessing/gong-soft-v1.wav')
        .then(r => { if (!r.ok) throw new Error('Audio unavailable'); return r.arrayBuffer(); })
        .then(bytes => blessingAudioContext.decodeAudioData(bytes))
        .then(buffer => { blessingAudioBuffer = buffer; })
        .catch(() => { blessingAudioLoad = null; });
    }
  } catch (_) { /* Keep the receipt usable when audio is unavailable. */ }
}
function stopBlessingSound() {
  if (blessingAudioSource) {
    try { blessingAudioSource.stop(); } catch (_) {}
    blessingAudioSource = null;
  }
}
async function playBlessingSound() {
  if (blessingSoundMuted) return;
  if (blessingAudioLoad) await blessingAudioLoad;
  if (blessingSoundMuted || !document.querySelector('.blessing-screen')) return;
  const status = document.getElementById('blessing-sound-status');
  if (!blessingAudioBuffer || blessingAudioContext?.state !== 'running') {
    if (status) status.textContent = 'แตะ “ฟังเสียงฆ้อง” เพื่อเปิดเสียง';
    return;
  }
  stopBlessingSound();
  const source = blessingAudioContext.createBufferSource();
  const gain = blessingAudioContext.createGain();
  gain.gain.value = .65;
  source.buffer = blessingAudioBuffer;
  source.connect(gain).connect(blessingAudioContext.destination);
  source.start();
  blessingAudioSource = source;
  if (status) status.textContent = 'เสียงฆ้องบรรเลงหนึ่งครั้ง';
}
function replayBlessingSound() {
  if (blessingSoundMuted) toggleBlessingSound();
  prepareBlessingAudio();
  playBlessingSound();
}
function toggleBlessingSound() {
  blessingSoundMuted = !blessingSoundMuted;
  try { localStorage.setItem('blessing-sound-muted', String(blessingSoundMuted)); } catch (_) {}
  if (blessingSoundMuted) stopBlessingSound();
  const button = document.getElementById('blessing-mute');
  if (button) {
    button.textContent = blessingSoundMuted ? 'เสียง: ปิด' : 'เสียง: เปิด';
    button.setAttribute('aria-pressed', String(!blessingSoundMuted));
  }
  const status = document.getElementById('blessing-sound-status');
  if (status) status.textContent = blessingSoundMuted ? 'ปิดเสียงแล้ว' : 'เปิดเสียงแล้ว';
}
function resetBlessingCard() {
  stopBlessingSound();
  document.getElementById('modal').classList.remove('blessing-mode');
  document.body.classList.remove('blessing-open');
}
function showBlessingCard(data, typeTitle, amount, preview = false) {
  closeModal();
  activeBlessingReceipt = preview ? null : data;
  const root = document.getElementById('modal');
  root.classList.add('blessing-mode');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'blessing-title');
  root.innerHTML = `<article class="blessing-screen">
    <div class="blessing-controls"><button type="button" id="blessing-mute" aria-pressed="${!blessingSoundMuted}" onclick="toggleBlessingSound()">${blessingSoundMuted ? 'เสียง: ปิด' : 'เสียง: เปิด'}</button><button type="button" aria-label="ปิดการ์ดอวยพร" onclick="closeModal()">ปิด ×</button></div>
    <div class="blessing-inner"><header class="blessing-heading"><span class="blessing-kicker">${preview ? 'พรีวิวการ์ดอวยพร · ไม่มีรายการชำระเงิน' : 'ด้วยความขอบคุณจากใจ'}</span><div class="blessing-emblem" aria-hidden="true">๓๐</div><span>คืนสู่เหย้า พนมไพร · ครั้งที่ 2</span></header>
    <section class="blessing-message"><span class="blessing-rule" aria-hidden="true">✦</span><h2 id="blessing-title">ขอสิ่งดีงาม<br><em>จงบังเกิดแก่ท่าน</em></h2><p>${esc(data.blessing || 'ขอให้ท่านและครอบครัวประสบแต่ความสุข ความเจริญ มีสุขภาพแข็งแรง และสมหวังในสิ่งที่ปรารถนา')}</p><span class="blessing-rule" aria-hidden="true">✦</span></section>
    <footer class="blessing-footer"><p>${preview ? 'คำอวยพรเปลี่ยนได้จากเมนูผู้ดูแล' : `${esc(typeTitle)} · ฿${money(amount)}`}</p>${preview ? '' : '<span class="blessing-pending">ได้รับข้อมูลแล้ว · รอตรวจสอบสลิป</span>'}
    <div class="blessing-actions"><button type="button" onclick="replayBlessingSound()">ฟังเสียงฆ้อง ♫</button>${preview ? '<button type="button" onclick="closeModal()">กลับสู่เว็บไซต์ →</button>' : `<button type="button" class="blessing-receipt-button" onclick="showBlessingReceipt()">${['tables','shirts'].includes(data.type) ? 'รับตั๋วและเก็บเลขอ้างอิง →' : 'เก็บเลขอ้างอิงรายการ →'}</button>`}</div><span id="blessing-sound-status" class="blessing-sound-status" role="status" aria-live="polite"></span></footer></div>
    </article>`;
  root.hidden = false;
  document.body.classList.add('blessing-open');
  root.querySelector('#blessing-mute').focus();
  playBlessingSound();
}
function showBlessingReceipt() {
  const data = activeBlessingReceipt;
  if (!data) return;
  const hasTicket=['tables','shirts'].includes(data.type);
  modal(`<h2>เก็บเลขอ้างอิงรายการ</h2><p class="muted">ตรวจสถานะภายหลังด้วยเบอร์โทรที่ใช้แจ้งรายการและเลขอ้างอิงนี้</p><label>เลขอ้างอิง<input class="ui-input w-full" readonly value="${esc(data.ref)}"></label>${hasTicket?`<details class="ticket-secret"><summary>รหัสส่วนตัวสำหรับเปิดตั๋ว</summary><textarea class="ui-textarea w-full" readonly rows="3" aria-label="รหัสส่วนตัวสำหรับตั๋ว">${esc(data.token)}</textarea><small>เก็บรหัสหรือลิงก์ตั๋วนี้เป็นส่วนตัว</small></details><button type="button" class="ui-btn ui-btn-primary full" onclick="showReceiptTicket()">${data.type==='shirts'?'ดูและดาวน์โหลดตั๋วรับเสื้อ ↓':'ดูและดาวน์โหลดตั๋วเข้างาน ↓'}</button><button type="button" class="ui-btn ui-btn-outline full" onclick="copyPrivateTicketLink()">คัดลอกลิงก์ตั๋วส่วนตัว</button>`:''}<button type="button" class="ui-btn ui-btn-outline full" onclick="copyBlessingTracking()">คัดลอกเลขอ้างอิง</button><p id="copy-tracking-status" class="muted" role="status"></p><a class="ui-btn ui-btn-outline full" href="#track" onclick="closeModal()">ตรวจสอบสถานะ →</a>`);
}
async function copyBlessingTracking() {
  if (!activeBlessingReceipt) return;
  const status = document.getElementById('copy-tracking-status');
  try {
    await navigator.clipboard.writeText(`เลขอ้างอิง: ${activeBlessingReceipt.ref}`);
    status.textContent = 'คัดลอกแล้ว กรุณาเก็บไว้เป็นส่วนตัว';
  } catch (_) { status.textContent = 'คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกจากช่องด้านบน'; }
}
function blessingPreview() {
  if (location.hash === '#blessing-preview') home();
  showBlessingCard({blessing:'ขออานุภาพแห่งบุญกุศล ดลบันดาลให้ท่านและครอบครัวประสบแต่ความสุข ความเจริญ มีสุขภาพพลานามัยสมบูรณ์แข็งแรง'}, '', 0, true);
}

document.addEventListener('keydown', event => {
  const root = document.getElementById('modal');
  if (event.key !== 'Tab' || root.hidden || !root.classList.contains('blessing-mode')) return;
  const items = [...root.querySelectorAll('button:not(:disabled),a[href],input,textarea')];
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
