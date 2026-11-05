# ผลตรวจหลังแก้ระบบราคา การตั้งค่า และจองโต๊ะ

- ผ่าน unittest ทั้ง 7 รายการ (ชุดเดิม 2 และ regression ใหม่ 5) ใช้ฐานข้อมูลชั่วคราวแยกจากรายการจริง
- ปฏิเสธยอดโต๊ะ 1 บาท และยอดเสื้อ/จัดส่งไม่ครบ โดยไม่สร้างรายการหรือกันโต๊ะ
- คืนสถานะรายการเก่าที่โต๊ะถูกจองใหม่แล้วไม่ได้ ปฏิเสธทั้งรายการและคงเจ้าของโต๊ะเดิม
- เมื่อโต๊ะกลับมาว่าง สามารถคืนสถานะได้และกันครบทุกโต๊ะ
- จองโต๊ะเดียวกันพร้อมกัน: ได้ 201 หนึ่งรายการ และ 409 อีกหนึ่งรายการ
- ตั้งค่าต้องเข้าสู่ระบบ ค่าผิดรูปแบบถูกปฏิเสธ บันทึกจาก revision เดียวพร้อมกันสำเร็จเพียงหนึ่งรายการ
- ราคา/QR และรายการอยู่ครบหลังรีสตาร์ตเซิร์ฟเวอร์ทดสอบ ยอดและ pricing_snapshot ของรายการเก่าไม่เปลี่ยน
- ตรวจ UI พอร์ต 8082 กับฐานข้อมูลชั่วคราว: เข้าสู่ระบบ เปลี่ยนราคา บันทึก รีเฟรช ค่ายังอยู่ แล้วคืนราคาทดสอบเป็น 299 บาท
- Node syntax check และ Tailwind build ผ่าน
- ไม่ได้เปลี่ยน QR จริงหรือรายการในฐานข้อมูลหลัก เซิร์ฟเวอร์เดิมพอร์ต 8081 ต้องรีสตาร์ตเพื่อโหลด backend ใหม่

## การ์ดอวยพรพร้อมเสียง
- เพิ่มกราฟิกแนวตั้ง 1024 × 1536 และพื้นที่ข้อความ HTML เปลี่ยนได้จากคำอวยพรในระบบ
- ตรวจบนเบราว์เซอร์ขนาด 390 × 844: การ์ดเต็มจอ พร้อมปิด เปิด/ปิดเสียง และปุ่มเก็บรหัสติดตาม
- ทดสอบส่งสลิปจำลองที่พอร์ต 8082: API สำเร็จแล้วเปิดการ์ดและเริ่ม Web Audio source ได้ ข้อความยังระบุว่ารอตรวจสอบสลิป
- ยืนยันว่าปุ่มข้อมูลติดตามแสดง reference/token จาก API เดิมครบ
- เพิ่มไฟล์เสียงฆ้องสังเคราะห์ 4.8 วินาที ไม่มีการใช้เสียงภายนอก
- ยังไม่ได้ยืนยันเสียงผ่านลำโพงอุปกรณ์มือถือจริง; หาก autoplay ถูกบล็อก มีปุ่มแตะฟังเสียง

## เลขอ้างอิง 6 หลัก
- รายการใหม่ทั้ง orders และ legacy donations ใช้ตัวเลข 6 หลักจากลำดับร่วมใน SQLite เริ่ม 100000
- ออกเลขภายใน BEGIN IMMEDIATE ตรวจไม่ชนทั้งสองตาราง ไม่เปลี่ยนเลขรายการเก่า
- ชุดทดสอบรวม 8 รายการผ่าน รวมส่งพร้อมกันและติดตามเลขเก่า PP- ได้
- ต้องรีสตาร์ต server.py เพื่อใช้ตัวออกเลขรุ่นใหม่

## ตัวอักษร เมนู และตั๋วอิเล็กทรอนิกส์
- ขยายข้อความรองและปุ่มเล็กเป็นประมาณ 14px ข้อความเมนู 17–18px พร้อมปรับแถบเมนูมือถือ 6 รายการ
- เปลี่ยนการ์ดจองโต๊ะจากพื้นเข้มเป็นพื้นอ่อนและสีตัวอักษรเดียวกับการ์ดอื่น
- /api/ticket ต้องมีเลขอ้างอิงและรหัสติดตามที่ตรงกัน คืนเฉพาะตั๋วของรายการโต๊ะจีน ไม่มีโทรศัพท์หรือ secret ในผลลัพธ์
- ตั๋วรอตรวจสอบ/ยกเลิกใช้เข้างานไม่ได้ ตั๋วยืนยันแล้วแสดงให้เจ้าหน้าที่ตรวจเลขอ้างอิงและสถานะก่อนเข้างาน
- ดาวน์โหลด PNG จากข้อมูลล่าสุดบนเซิร์ฟเวอร์ได้หลังจอง และจากหน้าติดตามสถานะ
- ชุดทดสอบรวม 9 รายการผ่าน ครอบคลุม pending → confirmed → rejected และสิทธิ์อ่านตั๋ว
- UI พอร์ต 8082 ฐานข้อมูลชั่วคราว: จองโต๊ะ → รับตั๋ว → ดาวน์โหลด PNG ได้จริง → ยืนยันโดยผู้ดูแล → ติดตามและรับฉบับยืนยันได้
- ตัวอย่างที่ใช้ข้อมูลสมมติอยู่ใน prototype/ticket-examples/ ไม่ใช่ตั๋วงานที่ออกให้ผู้เข้าร่วมจริง

## พื้นหลังตั๋วเขียว–ทอง
- ใช้ assets/ticket/background-v2.png ใน renderer เดียวกันทั้งหน้าดูตั๋วและ PNG ดาวน์โหลด
- แบ่งภาพเป็นหัว/กลาง/ท้ายเพื่อคงตำแหน่งหัวตั๋วและยืดพื้นที่ว่างเมื่อมีหลายโต๊ะหรือชื่อยาว
- ตรวจ PNG ที่สร้างจริงด้วยข้อมูลสมมติ เลขอ้างอิง 100000: ข้อความไม่ทับช้าง/กรอบ และสถานะยืนยันอ่านได้
- ตรวจบนมือถือ 390 × 844 และรับ download event จากปุ่มดาวน์โหลดสำเร็จ
- ภาพตัวอย่าง: prototype/ticket-examples/ticket-green-gold-example.png และ mobile-ticket-green-gold.png

## E-Ticket รับเสื้อ
- เพิ่มตั๋วเสื้อ 900 × 1040 px สำหรับตัวอย่าง 2 ไซซ์ เทียบตั๋วโต๊ะ 1080 × 1480 px; เพิ่มความสูงตามจำนวนไซซ์และชื่อยาวเพื่อไม่ตัดข้อมูล
- API ตั๋วเสื้อใช้เลขอ้างอิงและรหัสติดตาม ตรวจสิทธิ์ก่อนคืนชื่อ ไซซ์รวม จำนวนรวม ยอดเงิน และวิธีรับ; ไม่คืนเบอร์โทร/ที่อยู่เต็ม/secret
- pending/rejected ยังใช้รับเสื้อไม่ได้ confirmed รับเองใช้แสดงตรวจรายการ ส่วนไปรษณีย์ระบุวิธีรับโดยไม่อ้างว่าส่งแล้ว
- ชุดทดสอบรวม 10 รายการผ่าน รวมรวมไซซ์ซ้ำ รับเอง ไปรษณีย์ ยืนยันและยกเลิก
- ทดสอบ UI ฐานข้อมูลชั่วคราวพอร์ต 8082: M×2 + XL×1 รวม 3 ตัว 897 บาท ส่งจอง รับตั๋ว ดาวน์โหลด PNG ยืนยันโดยผู้ดูแล และเปิดตั๋วฉบับยืนยันผ่านหน้าติดตามสำเร็จ
- ตรวจมือถือ 390 × 844; ภาพตัวอย่างอยู่ใน prototype/ticket-examples/shirt-ticket-confirmed-example.png และ mobile-shirt-ticket.png

## แบนเนอร์สูงครึ่งหนึ่งและโปสเตอร์ใหม่
- สร้างโปสเตอร์แนวนอน 3:1 ขนาด 2172 × 724 ด้วย built-in ImageGen: assets/poster-compact-v1.png พร้อมไฟล์ prompt
- เปลี่ยนภาพบนหน้าหลักและปุ่มขยายโปสเตอร์เป็นภาพใหม่ เก็บ assets/poster.png ต้นฉบับไว้
- วัดที่หน้าจอ 1280px: hero จาก 516.80px เหลือ 260px (ลด 49.7%)
- วัดที่หน้าจอ 390px: hero จาก 592.45px เหลือ 296px (ลด 50.0%)
- ตรวจว่าเนื้อหาไม่ล้นความสูง ปุ่มจองโต๊ะและข้อความหลักไม่ถูกตัด รูปโปสเตอร์แสดงครบ
- บนมือถือเหลือปุ่มหลักจองโต๊ะใน hero ส่วนทำบุญ/กองทุนยังเข้าถึงได้จากการ์ดและเมนูเดิม
- Tailwind build และ node syntax ผ่าน; ภาพผลลัพธ์ compact-hero-desktop.png / compact-hero-mobile.png

## โปสเตอร์หลายภาพ
- สร้าง poster-celebration-v2.png แนวนอน 2172 × 724 (~2.3 MB) ด้วย ImageGen ตามสไตล์ภาพอ้างอิง และเพิ่มคู่กับโปสเตอร์เขียว–ทองเดิม
- เพิ่มตาราง posters เก็บภาพในฐานข้อมูล รายการ/ภาพที่เผยแพร่ผ่าน /api/posters; เพิ่ม/ลบต้องใช้เซสชันแอดมิน
- ลบแบบนำออกจากการเผยแพร่ เก็บแถวเดิมเพื่อไม่ให้ภาพตั้งต้นกลับมาเองเมื่อเปิดเซิร์ฟเวอร์ใหม่
- รองรับ PNG/JPG/WebP ขนาดไม่เกิน 5 × 1024 × 1024 ไบต์ ตรวจฝั่งหน้าเว็บและเซิร์ฟเวอร์
- ทดสอบรวม 11 รายการผ่าน รวมขนาดพอดี 5 MB, เกิน 5 MB, ไฟล์ไม่ใช่รูป, ไม่เข้าสู่ระบบ, เพิ่ม/ลบ, ภาพอยู่หลังรีสตาร์ต
- ทดสอบ UI ฐานข้อมูลชั่วคราวพอร์ต 8082: เพิ่มโปสเตอร์จากไฟล์จริง แล้วลบรายการทดสอบได้
- ตรวจสลับอัตโนมัติ: เริ่มจาก 1/2 รอ 5.2 วินาที พบเป็น 2/2; มีปุ่มก่อนหน้า ถัดไป และหยุด/เล่น
- เมื่อมีภาพเดียวจะไม่ตั้ง timer; ไม่มีภาพแสดงข้อความแทน; หยุด timer เมื่อเปลี่ยนหน้า และไม่เลื่อนขณะหน้าต่างคำอวยพร/รูปขยายเปิดอยู่
- ตรวจมือถือ 390px: hero สูง 296px ตามเดิม และไม่มี horizontal overflow
- บันทึกภาพเมนูแอดมินใน prototype/poster-admin-preview.png

## Editable hero text — 2026-11-05
- Admin “ข้อความแบนเนอร์” edits eyebrow, two title lines, gold accent, description and separate desktop/mobile font sizes, with live preview.
- Settings saved through authenticated revision-checked API. Text is HTML-escaped; server checks lengths and integer font bounds.
- Regression suite: 12 tests passed. Browser QA on isolated port 8082 saved desktop title size 36 and confirmed computed home title size 36px.
- Screenshot: prototype/hero-admin-preview.png. User server 8081 requires restart to load updated Python handlers.

## Hostinger PHP release — 2026-11-05
See docs/HOSTINGER-RELEASE-2026-11-05.md for complete evidence and limits. New PHP/MySQL suite passes 10 tests; original Python suite passes 12. PHP browser workflow (dummy shirt reservation → blessing → downloaded PNG → admin correction), desktop and 390px mobile checked. No real data migration, host upload or live payments performed.

## Revised A–G seating plan — 2026-11-05
- 61 public tables: A1–A8 (IDs 1–8), B1–B8 (9–16), C1–G9 (17–61), with two noninteractive VIP blocks between columns 4 and 5 of rows A/B. Existing numeric IDs and bookings preserved; no stored orders renumbered or deleted.
- New orders reject IDs outside 1–61 and VIP strings in both Python and PHP APIs. Labels are shared in selection, checkout, ticket PNG, admin details/editor; numeric IDs remain API/storage keys.
- Python: 13 tests passed. PHP/MySQL: 11 integration tests passed, including VIP/out-of-layout rejection.
- Browser: 61 selectable tables, 2 VIP blocks, no interactive VIP elements; A1 + G9 gives 2 tables / 16 guests / 5,000 baht. Desktop plan fully visible; 390px mobile page width remains 390 with internal horizontal plan scrolling.
- Screenshot: prototype/table-plan-vip-preview.png. Hostinger package v2 replaces v1 for future installs; not uploaded to hosting.

## Bank account details — 2026-11-05
- Added independent donate/fund account settings: bank, account name and canonical numeric-string account number. Initial values from supplied image: ธนาคารออมสิน / ระดมทุนทรัพยากร วก.พนมไพร / 020441298401, used for both categories pending independent admin edits.
- Both Python and PHP validate fields, preserve leading zeros, strip spaces/hyphens in numbers and return defaults for pre-existing configs. New settings share existing authentication, audit and optimistic revision checks.
- Public account card and copy button on both pages. Browser copy → paste confirmed exact 12-digit string 020441298401. Mobile 390px: no horizontal page overflow. Admin settings save confirmed.
- Python regression suite: 14 passed. PHP account validator exercised separately (valid grouped number, independent settings, invalid numbers); PHP syntax and JS checks passed. No new Hostinger archive generated, per user instruction.
- Preview database preserved privately before restart; persistent preview wrapper now /private/tmp/portal-preserved-preview.py, data /private/tmp/portal-preview-preserved-data. Password unchanged; admin sessions reset on restart.

## Accounts for dinner and shirts — 2026-11-05
- Extended account settings/card/copy controls to tables and shirts. All four categories have independent bank/name/number; older two-category saved settings gain defaults without changing existing donate/fund values.
- Added independent table/shirt account regression; Python suite 15 passed. PHP four-category validator and old two-category compatibility passed without database or release packaging.
- Browser: dinner checkout copy→paste matched 020441298401; shirt payment displays its account; admin shows all four account fieldsets. Existing saved QR images were preserved. No orders submitted during browser QA.
- No new Hostinger archive generated, per user request. Screenshots: prototype/table-account-preview.png, prototype/shirt-account-preview.png, prototype/accounts-admin-four-preview.png.

## Remove demo-facing copy — 2026-11-05
- Removed top demo banner, demo/payment warning labels, donation/fund mock-data notices and generated fake QR SVG. Missing QR now shows account details with ordinary bank-transfer instructions; uploaded QR remains unchanged.
- Admin preview controls now use พรีวิว/ชม instead of ตัวอย่าง. A preview blessing still explicitly says there is no payment record, avoiding a false payment receipt.
- Browser checked home/donate/fund/tables/shirts/track: no ทดลอง / ตัวอย่าง / สมมติ / DEMO ONLY text and no .demo banner. JS syntax checks passed. Screenshot prototype/production-copy-preview.png.
- All four stored QR images matched byte-for-byte during inspection. Native barcode reader decoded an EMV Thai bill-payment payload with merchant name kanarcheappanomphrai. This checks QR content structure, not actual receiving account ownership or bank settlement.
- No new Hostinger package, deployment or bank transaction performed.

## Admin payment categories and reconciliation — 2026-11-05
- Added four clickable category cards (donate/fund/tables/shirts), independent counts/pending counts/confirmed totals, full-list view, search and payment-status filter. Rows show reference, donor/customer name and phone, category details, table labels or shirt sizes/quantities/delivery address, amount, notification time, authenticated slip link and editable confirmation status.
- Both backend list/summary endpoints now support parameterized q/type/status filters and 100-row pagination. Group totals and filtered monetary totals aggregate all matching database records, independently of page size. Invalid category/status rejected; authentication required.
- Python full suite: 16 passed. PHP/MySQL selected tests for >500-row aggregate/pagination/backup and combined category/status search: 2 passed. No release ZIP/package test invoked, honoring the user's packaging pause.
- Browser QA on separate disposable database: 4 synthetic categories visible, selecting tables shows 1 relevant row, confirming a pending table removes it from pending results and raises the confirmed group sum. Fund selection shows only its row; no stale loading message. 390px mobile has no page overflow; table scrolls internally. Async render guard prevents stale category requests replacing current view.
- Screenshot prototype/admin-categories-preview.png contains synthetic QA records only, not actual donations. User preview database preserved unchanged; no synthetic orders added there.

## Phone + reference status lookup — 2026-11-05
- Public tracking form now requests only phone + reference. New phone-authenticated status responses contain exactly ref/type/amount/status/label, never names, phones, addresses, slips or ticket credentials. Wrong phone and absent reference return the same 404 response.
- Canonical phone comparison supports spaces/hyphens and Thai +66/0066 forms without changing stored phone values. New lookups limited to 20 requests per IP per 15 minutes in both Python/PHP. Legacy token-based status response remains unchanged for old clients; tickets still require the original high-entropy token.
- Added separate #ticket form and private ticket URL in fragment. Success receipt copies reference for tracking and a separate private ticket link for dinner/shirts. On opening a private URL, the secret is removed from the visible URL/history entry; no token is placed in HTTP query strings or PNGs.
- Python full suite 18 passed; PHP selected pricing/ticket and new phone-lookup/privacy/rate-limit tests 2 passed. JS/PHP syntax and CSS build passed.
- Browser QA on disposable fixture database: phone + ref returned status/type/amount with no ticket-download button. After a fixture shirt order, copied private URL opened the correct ticket and changed the URL to #ticket. Mobile 390px had exactly phone/ref fields and no page overflow.
- Screenshot prototype/phone-reference-status-preview.png uses synthetic QA data. User preview data preserved. No Hostinger package/deployment generated.

## Admin ticket reissue — 2026-11-05
- Added “ออกลิงก์ตั๋วใหม่” buttons to eligible dinner/shirt rows in both preview and PHP frontend. Modal requires a reason and identity-check acknowledgement; new token/link can be copied once and token DOM is cleared on closing the result.
- Authenticated same-origin POST /api/admin/ticket-reissue rotates only secret_hash inside a transaction, records action/reason in order_audit without plaintext secrets, and returns the new token in that response only. Rate limited to 30 requests/IP/15 minutes. Donation/fund, rejected and redeemed orders cannot be reissued (redemption enforced in PHP and when a compatible redemption table exists in Python).
- Python full suite 19 passed: old token/status access invalidated, new ticket works, phone lookup unaffected, all other stored order columns unchanged, audit omits old/new plaintext tokens, unauthorized/unverified/non-ticket/cancelled requests rejected.
- PHP targeted reissue test passed for dinner and pickup shirt, including post-redemption rejection and unchanged public admin order details. No release packaging invoked.
- Browser QA on disposable data: reissue controls visible only on ticket rows and correct identity/reason modal opens. Screenshot prototype/admin-ticket-reissue-preview.png contains synthetic QA records. No real user ticket was reissued.

## Latest Hostinger readiness audit — 2026-11-05
See docs/PREDEPLOY-LATEST.md. Python 20 passed; PHP/MySQL 14-case suite excluding archive creation plus revision probe targeted test passed (15 cases). Added tested read-only check.php, stricter production HTTPS/cookie config and password length checks, fixed stale migration instructions, removed obsolete payment mode UI. SPA settings now checks revision before reloading 1.73MB QR-containing settings; client loader behavior test passed. Source-only allowlist 56 files validated without ZIP creation. Seven PHP pages verified desktop/mobile, PHP reservation→ticket→phone status smoke passed on disposable data. Private durable preview backup created and integrity checked. Host-specific checks still pending; no deployment or new archive.
