const heroTextFields = [['eyebrow','หัวข้อด้านบน'],['line1','ข้อความหลัก บรรทัดที่ 1'],['line2','ข้อความหลัก บรรทัดที่ 2'],['accent','ข้อความเน้นสีทอง'],['description','คำบรรยาย']];
const heroSizeFields = [['Title','ข้อความหลัก',64],['Label','หัวข้อด้านบน',28],['Description','คำบรรยาย',28]];
function heroStyle(h) {
  return ['desktop','mobile'].flatMap(mode => heroSizeFields.map(([key]) => `--hero-${mode}-${key.toLowerCase()}:${Number(h[mode+key])}px`)).join(';');
}
function heroCopy(h) {
  return `<span class="edition-label"><i></i> ${esc(h.eyebrow)}</span><h1>${esc(h.line1)}<br>${esc(h.line2)}<span>${esc(h.accent)}</span></h1><p>${esc(h.description).replace(/\n/g,'<br>')}</p>`;
}
function renderHeroAdmin(body) {
  body.innerHTML = `<section class="card ui-card"><h2>ข้อความแบนเนอร์หน้าหลัก</h2><form id="hero-settings">
    ${heroTextFields.map(([key,label])=>`<label>${label}${key==='description'?`<textarea class="ui-textarea ui-textarea-bordered" name="${key}" maxlength="400" rows="3">${esc(settings.hero[key])}</textarea>`:`<input class="ui-input ui-input-bordered" name="${key}" maxlength="100" value="${esc(settings.hero[key])}">`}</label>`).join('')}
    <div class="row">${[['desktop','คอมพิวเตอร์'],['mobile','มือถือ']].map(([mode,label])=>`<fieldset><legend>ขนาดตัวอักษร · ${label} (px)</legend>${heroSizeFields.map(([key,text,max])=>`<label>${text}<input class="ui-input ui-input-bordered" name="${mode+key}" type="number" min="12" max="${max}" step="1" required value="${settings.hero[mode+key]}"></label>`).join('')}</fieldset>`).join('')}</div>
    <h3>พรีวิวก่อนบันทึก</h3><label>ดูพรีวิว<select class="ui-select ui-select-bordered" id="hero-preview-mode"><option value="desktop">คอมพิวเตอร์</option><option value="mobile">มือถือ</option></select></label>
    <div id="hero-preview" class="intro-copy hero-text-preview"></div>
    <button class="ui-btn ui-btn-primary" type="submit">บันทึกข้อความแบนเนอร์</button><p class="muted" id="hero-save-status" role="status"></p>
  </form></section>`;
  const form = document.querySelector('#hero-settings');
  const draftHero = () => Object.fromEntries([...heroTextFields.map(([key])=>[key,form.elements[key].value]),...['desktop','mobile'].flatMap(mode=>heroSizeFields.map(([key])=>[mode+key,Number(form.elements[mode+key].value)]))]);
  const preview = () => {
    const h=draftHero(), target=document.querySelector('#hero-preview');
    target.classList.toggle('hero-preview-mobile',document.querySelector('#hero-preview-mode').value==='mobile');
    target.style.cssText=heroStyle(h); target.innerHTML=heroCopy(h);
  };
  form.addEventListener('input',preview); form.addEventListener('change',preview); preview();
  form.onsubmit=async e=>{
    e.preventDefault(); const button=form.querySelector('button[type="submit"]'),status=document.querySelector('#hero-save-status');button.disabled=true;status.textContent='กำลังบันทึก…';
    try {
      const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...settings,hero:draftHero()})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'บันทึกไม่สำเร็จ');settings=data;status.textContent='บันทึกแล้ว ✓ ข้อความใหม่จะแสดงบนหน้าหลัก';
    } catch(error) {status.textContent=error.message||'เชื่อมต่อไม่สำเร็จ';} finally {button.disabled=false;}
  };
}
