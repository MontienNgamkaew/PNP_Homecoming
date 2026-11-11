let posterSlides=[], posterIndex=0, posterTimer=null, posterPaused=false;
async function loadPosters() {
  const response=await fetch('/api/posters',{cache:'no-store'});
  if(!response.ok) throw new Error('โหลดโปสเตอร์ไม่สำเร็จ');
  const previous=posterSlides[posterIndex]?.id;
  posterSlides=await response.json();
  posterIndex=Math.max(0,posterSlides.findIndex(p=>p.id===previous));
}
function renderPosterCarousel() {
  if(!posterSlides.length) return '<div class="poster-carousel poster-empty"><p>ยังไม่มีโปสเตอร์ประชาสัมพันธ์</p></div>';
  const slide=posterSlides[posterIndex], multiple=posterSlides.length>1;
  return `<div class="poster-carousel" role="region" aria-label="โปสเตอร์ประชาสัมพันธ์" onmouseenter="stopPosterCarousel()" onmouseleave="startPosterCarousel()"><button class="poster-showcase" onclick="showPoster()" aria-label="ขยายโปสเตอร์ปัจจุบัน"><img id="carousel-poster" src="${esc(slide.url)}" alt="${esc(slide.title)}"></button>${multiple?`<button class="poster-prev" aria-label="โปสเตอร์ก่อนหน้า" onclick="changePoster(-1)">‹</button><button class="poster-next" aria-label="โปสเตอร์ถัดไป" onclick="changePoster(1)">›</button><button id="poster-pause" class="poster-pause" aria-label="${posterPaused?'เล่นโปสเตอร์อัตโนมัติ':'หยุดโปสเตอร์อัตโนมัติ'}" onclick="togglePosterPause()">${posterPaused?'▶':'Ⅱ'}</button><span id="poster-count" class="poster-count" aria-live="off">${posterIndex+1} / ${posterSlides.length}</span>`:''}</div>`;
}
function stopPosterCarousel(){if(posterTimer){clearInterval(posterTimer);posterTimer=null;}}
function startPosterCarousel(){
  stopPosterCarousel();
  if(posterPaused||posterSlides.length<2||!document.getElementById('carousel-poster'))return;
  posterTimer=setInterval(()=>{if(!document.hidden && document.getElementById('modal').hidden)changePoster(1,false);},5000);
}
function changePoster(direction,manual=true){
  if(!posterSlides.length)return;
  posterIndex=(posterIndex+direction+posterSlides.length)%posterSlides.length;
  const image=document.getElementById('carousel-poster');
  if(!image){stopPosterCarousel();return;}
  image.src=posterSlides[posterIndex].url;image.alt=posterSlides[posterIndex].title;
  const counter=document.getElementById('poster-count');if(counter)counter.textContent=`${posterIndex+1} / ${posterSlides.length}`;
  if(manual)startPosterCarousel();
}
function togglePosterPause(){
  posterPaused=!posterPaused;
  const button=document.getElementById('poster-pause');
  if(button){button.textContent=posterPaused?'▶':'Ⅱ';button.setAttribute('aria-label',posterPaused?'เล่นโปสเตอร์อัตโนมัติ':'หยุดโปสเตอร์อัตโนมัติ');}
  startPosterCarousel();
}
function showCurrentPoster(){
  const slide=posterSlides[posterIndex];if(!slide)return;
  modal(`<img class="poster" src="${esc(slide.url)}" alt="${esc(slide.title)}">`);
}
function renderPosterAdmin(body){
  body.innerHTML=`<section class="card ui-card"><h2>จัดการโปสเตอร์</h2><p class="muted">หน้าเว็บเปลี่ยนภาพทุก 5 วินาที · ย่อและบีบอัดอัตโนมัติไม่เกิน 600 KB · ต้นฉบับ JPG, PNG, WebP ไม่เกิน 30 MB</p><form id="poster-upload"><label>ชื่อโปสเตอร์<input class="ui-input w-full" name="title" required maxlength="150" placeholder="ชื่อสำหรับอธิบายภาพ"></label><label>ไฟล์โปสเตอร์<input class="ui-file-input w-full" name="image" type="file" required accept="image/jpeg,image/png,image/webp"></label><img id="poster-upload-preview" hidden alt="ตัวอย่างแบนเนอร์หลังบีบอัด" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;margin:12px 0"><button type="submit" class="btn ui-btn ui-btn-primary full">เพิ่มโปสเตอร์</button><p id="poster-upload-result" class="muted" role="status"></p></form></section><div class="poster-admin-grid">${posterSlides.map(slide=>`<section class="card ui-card"><img src="${esc(slide.url)}" alt="${esc(slide.title)}"><h3>${esc(slide.title)}</h3>${slide.bytes?`<p class="muted">${Math.ceil(slide.bytes/1024).toLocaleString('th-TH')} KB</p>`:''}<button type="button" class="btn ui-btn ui-btn-outline" data-delete-poster="${esc(slide.id)}">ลบโปสเตอร์</button></section>`).join('')||'<p class="muted">ยังไม่มีโปสเตอร์</p>'}</div>`;
  let prepared=null,preparing=false,uploading=false;
  const uploadForm=document.getElementById('poster-upload'),uploadInput=uploadForm.elements.image,uploadButton=uploadForm.querySelector('button[type=submit]');
  async function prepare(){
    const file=uploadInput.files[0];prepared=null;const preview=document.getElementById('poster-upload-preview'),status=document.getElementById('poster-upload-result');preview.hidden=true;
    if(!file)return;
    preparing=true;uploadButton.disabled=true;uploadInput.disabled=true;status.textContent='กำลังย่อและบีบอัดภาพ…';
    try{prepared=await preparePosterImage(file);if(!status.isConnected)return;preview.src=prepared.data;preview.hidden=false;status.textContent=`${(file.size/1024/1024).toLocaleString('th-TH',{maximumFractionDigits:2})} MB → ${Math.ceil(prepared.bytes/1024).toLocaleString('th-TH')} KB · ${prepared.width} × ${prepared.height} พิกเซล · พร้อมอัปโหลด`;}
    catch(error){if(status.isConnected)status.textContent=error.message;}
    finally{preparing=false;if(uploadButton.isConnected)uploadButton.disabled=false;uploadInput.disabled=false;}
  }
  uploadInput.onchange=prepare;
  document.getElementById('poster-upload').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('button'),status=document.getElementById('poster-upload-result');
    const file=form.elements.image.files[0];if(!file)return;
    if(preparing||uploading)return;
    if(!prepared||prepared.file!==file)await prepare();
    if(!prepared)return;
    uploading=true;button.disabled=true;uploadInput.disabled=true;
    try{
      const fileData=prepared.data.split(',')[1];
      const response=await fetch('/api/admin/posters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add',title:form.elements.title.value,file:fileData})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'เพิ่มโปสเตอร์ไม่สำเร็จ');
      await loadPosters();renderPosterAdmin(body);
      document.getElementById('poster-upload-result').textContent='เพิ่มโปสเตอร์แล้ว · ขนาด '+Math.ceil((result.bytes||prepared.bytes)/1024).toLocaleString('th-TH')+' KB';
    }catch(error){status.textContent=error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';}
    finally{uploading=false;if(button.isConnected)button.disabled=false;uploadInput.disabled=false;}
  };
  body.querySelectorAll('[data-delete-poster]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;
    try{
      const response=await fetch('/api/admin/posters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',id:button.dataset.deletePoster})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'ลบไม่สำเร็จ');
      await loadPosters();renderPosterAdmin(body);
      document.getElementById('poster-upload-result').textContent='นำโปสเตอร์ออกจากการแสดงผลแล้ว';
    }catch(error){alert(error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');button.disabled=false;}
  });
}
