const accountKinds = [['donate','ทอดผ้าป่า'],['fund','กองทุนช่างกลโรงงาน'],['tables','จองโต๊ะจีน'],['shirts','เสื้อที่ระลึก']];
function accountDetails(kind) {
  const account=settings.accounts?.[kind];if(!account)return '';
  const grouped=account.number.replace(/(.{4})(?=.)/g,'$1 ');
  return `<section class="bank-account" aria-label="รายละเอียดบัญชี${accountKinds.find(([key])=>key===kind)?.[1]||''}"><span class="bank-name">${esc(account.bank)}</span><span class="account-caption">เลขบัญชี</span><strong class="account-number">${esc(grouped)}</strong><p>ชื่อบัญชี <b>${esc(account.name)}</b></p><button type="button" class="ui-btn ui-btn-outline copy-account" data-copy-account="${kind}">คัดลอกเลขบัญชี</button><span class="copy-account-status" role="status" data-copy-status="${kind}"></span></section>`;
}
function accountSettingsFields() {
  return `<h3 class="account-settings-title">บัญชีรับโอนเงิน</h3><div class="account-settings-grid">${accountKinds.map(([kind,label])=>{
    const a=settings.accounts[kind];return `<fieldset class="account-setting"><legend>${label}</legend><label>ธนาคาร<input class="ui-input ui-input-bordered" name="account_${kind}_bank" required maxlength="100" value="${esc(a.bank)}"></label><label>ชื่อบัญชี<input class="ui-input ui-input-bordered" name="account_${kind}_name" required minlength="2" maxlength="150" value="${esc(a.name)}"></label><label>เลขบัญชี<input class="ui-input ui-input-bordered" name="account_${kind}_number" type="text" inputmode="numeric" autocomplete="off" required pattern="[0-9 -]{6,30}" maxlength="30" value="${esc(a.number)}"></label></fieldset>`;
  }).join('')}</div>`;
}
function readAccountSettings(form) {
  return Object.fromEntries(accountKinds.map(([kind])=>[kind,Object.fromEntries(['bank','name','number'].map(key=>[key,form.elements[`account_${kind}_${key}`].value]))]));
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy-account]');if(!button)return;
  const kind=button.dataset.copyAccount,number=settings.accounts?.[kind]?.number;
  const status=button.parentElement.querySelector('[data-copy-status]');if(!number)return;
  try {
    if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(number);status.textContent='คัดลอกเลขบัญชีแล้ว ✓';button.textContent='คัดลอกแล้ว ✓';
  } catch(_){
    const input=document.createElement('input');input.className='ui-input ui-input-bordered';input.readOnly=true;input.value=number;input.setAttribute('aria-label','เลขบัญชีสำหรับคัดลอก');status.replaceChildren(input);input.focus();input.select();status.append(document.createTextNode(' แตะค้างเพื่อคัดลอกเลขบัญชี'));
  }
});
