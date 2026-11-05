# ตรวจความพร้อมก่อนขึ้น Hostinger — 5 พฤศจิกายน 2569

**ผล: พร้อมสำหรับนำรุ่นล่าสุดไปติดตั้งและตรวจรับบน staging ของ Hostinger Business** ยังไม่ได้ตรวจบัญชี hPanel/โดเมน/เซิร์ฟเวอร์จริง และยังไม่เปิดใช้งานสาธารณะ ไม่ได้สร้าง ZIP ใหม่ตามคำสั่งให้พักการจัดชุดไว้ ZIP v1–v5 เก่าไม่ใช่ source รุ่นปัจจุบัน

## ผลตรวจที่ผ่าน

- Python regression suite **20/20** รายการ
- PHP/MySQL integration **15 ชุด**: รันชุดหลัก 14 ชุดโดยเว้นการสร้าง archive และเพิ่มทดสอบ revision API อีก 1 ชุด ครอบคลุมจองชนกัน ยอดที่เซิร์ฟเวอร์คำนวณ แก้รายการ/คืนโต๊ะ บัญชีและ QR โปสเตอร์เกินขนาด การค้นหาเกิน 500 รายการ การตรวจสถานะด้วยโทรศัพท์ ความเป็นส่วนตัวของตั๋ว ออกลิงก์ใหม่ ป้องกันใช้ซ้ำ ย้ายข้อมูล และสำรอง–กู้คืน
- ตัวติดตั้งและ check.php ผ่านกับ MySQL ชั่วคราว; check.php อ่านอย่างเดียว ไม่เปลี่ยนจำนวนรายการหรือยอด
- PHP syntax 7 ไฟล์ / JavaScript syntax 8 ไฟล์ / CSS build ผ่าน
- ตรวจรายการไฟล์สำหรับส่งมอบ **56 ไฟล์** ด้วย --check-only ไม่มีฐานข้อมูล config จริง รหัสผ่าน node_modules หรือภาพตรวจงานหลุดเข้า allowlist และไม่มี archive ถูกสร้าง
- ทดสอบ client loader: โหลดครั้งแรก ตรวจรุ่นเดิม รับรุ่นใหม่เมื่อราคาเปลี่ยน หยุดเมื่อ API ขัดข้อง และ fallback สำหรับ API เก่า ผ่านทั้งหมด
- Browser ใช้ PHP กับสำเนาค่าตั้งปัจจุบันในฐานข้อมูลแยก ตรวจ 7 หน้า home/donate/fund/tables/shirts/track/ticket: ไม่พบภาพเสีย ข้อความทดลอง หรือ horizontal page overflow ทั้ง desktop และ mobile 390px
- Browser PHP: เข้าผู้ดูแล/บัญชี 4 หมวด จองโต๊ะ A2 ด้วยสลิปจำลอง รับเลขอ้างอิง เปิดภาพตั๋ว และค้นหาสถานะด้วยโทรศัพท์สำเร็จ ไม่มี console error ในรอบตรวจ

การทดสอบธุรกรรมทั้งหมดใช้ข้อมูลสังเคราะห์ในฐานข้อมูลแยก ไม่เพิ่มรายการหรือเปลี่ยนรหัสตั๋วผู้ใช้ในพรีวิวจริง และไม่ทำธุรกรรมธนาคาร

## จุดที่แก้ในรอบตรวจนี้

1. แก้คู่มือจาก import.php ที่ไม่มีอยู่ เป็น restore.php และระบุลำดับย้ายเข้าฐานข้อมูลใหม่ว่างก่อนรัน installer
2. นำสวิตช์โหมดรับเงินจริงเก่าที่ไม่ได้ควบคุมการรับรายการออกจาก UI PHP เพื่อไม่ให้แอดมินเข้าใจผิด ยังคง metadata payment_live เพื่ออ่านข้อมูล/รองรับ client เดิม ไม่มีการใช้ field นี้เป็นสวิตช์ปิดรับรายการ
3. เพิ่ม hostinger/check.php สำหรับ PHP/extensions, HTTPS/cookie, password hash, DB connection, packet size, InnoDB/utf8mb4, บัญชี 4 ประเภท, reference capacity และโต๊ะนอกผัง
4. ปฏิเสธ production config ที่ใช้ HTTP หรือปิด Secure cookie บน host ภายนอก; HTTP ยังคงใช้ทดสอบได้เฉพาะ localhost/loopback และบังคับรหัส admin login อย่างน้อย 16 ตัวอักษร
5. API settings เดิมมีขนาดวัดได้ **1,729,182 bytes** เพราะรวม QR จึงเพิ่ม revision endpoint ขนาดเล็กและให้ SPA โหลดข้อมูลเต็มเฉพาะตอนเริ่มหรือ revision เปลี่ยน ทุกครั้งที่เปลี่ยนหน้ายังตรวจ revision แบบ no-store และ backend ยังคำนวณราคาเอง การลดโหลดไม่ปิดการตรวจราคาหรือใช้ค่าเก่าเงียบ ๆ

## ข้อมูลต้นทางและสำรอง

- พรีวิวปัจจุบัน: `/private/tmp/portal-preview-preserved-data/donations.sqlite3` — 0 orders, 0 legacy donations, QR อัปโหลด 4 รายการ, โปสเตอร์ 2 รายการ, ไม่มีโต๊ะนอกผัง
- ฐานข้อมูลเก่า: `data/donations.sqlite3` — 1 order และ 1 table booking, schema เก่ากว่าและไม่มี app_settings ห้ามนำมาทับพรีวิวล่าสุดหรือถือว่าเป็นข้อมูลชุดเดียวกัน
- สำรองพรีวิวล่าสุดแบบไฟล์แยกไว้ที่ `data/preview-backup-20261105-171837.sqlite3`, permission 600, SQLite integrity_check = ok
- SHA-256 สำเนา: `541256cce8fbc02ba9f28d3b648271c2140e4107a11cfbd7fab47feb29a4bd43`
- ไม่ได้รวมฐานข้อมูลเก่าเข้าไฟล์ล่าสุด ไม่ลบข้อมูลเดิม ก่อนย้ายจริงต้องเลือกต้นทาง ตรวจยอด และทำสำรองรอบสุดท้ายในช่วงหยุดรับรายการ

## สิ่งที่ยังต้องตรวจบน Hostinger จริง

1. โดเมนปลายทาง, SSL/Force HTTPS และ origin ใน private config ต้องตรงกัน รวม www/non-www
2. PHP 8.2+ พร้อมส่วนขยาย / MySQL หรือ MariaDB / dedicated DB user / private config และรหัส admin จริงที่ไม่ใช้รหัสพรีวิว
3. รัน check.php หลัง install หรือ restore, ตรวจว่า portal-private เข้าจากเว็บไม่ได้ และทดสอบ /api/settings/revision, login และ uploads ผ่าน LiteSpeed/.htaccess จริง
4. ตรวจ post_max_size >= 8M, memory_limit >= 128M และ DB max_allowed_packet >= 8 MiB ผ่าน runtime เว็บจริง ค่า CLI เพียงอย่างเดียวไม่ยืนยัน .user.ini ของเว็บ
5. ยืนยันชื่อผู้รับของ QR/เลขบัญชีในแอปธนาคารและตรวจขั้นตอนเทียบสลิปกับยอดเข้าบัญชี ระบบไม่ได้เชื่อมธนาคารตรวจเงินเข้าอัตโนมัติ
6. กำหนดสำรองอัตโนมัติ เก็บนอก document root/นอกเซิร์ฟเวอร์ และทดสอบกู้คืนบนฐานข้อมูลแยก
7. ทดสอบมือถือจริง การดาวน์โหลด PNG และภาระงานตามจำนวนผู้ใช้คาดการณ์ ระบบ pending ยังไม่มีเวลาหมดอายุอัตโนมัติ ต้องให้แอดมินจัดการรายการค้าง

รอบนี้ใช้ PHP 8.5.7 / MySQL 9.6 ในเครื่อง ไม่ได้รัน matrix PHP 8.2 หรือ MariaDB จริง และไม่อ้างว่าทดสอบ peak load ของแพ็กเกจ Hostinger แล้ว

## คำสั่งอ้างอิง

```sh
python3 -m unittest discover -s tests -v
node tools/test_client_settings.cjs
npm --prefix prototype run build:css
python3 tools/build_hostinger.py --check-only
# หลังติดตั้งบนโฮสต์และกำหนด config แล้ว:
php portal-private/check.php
```

ภาพตรวจ PHP ล่าสุด: `prototype/predeploy-latest-desktop.png` คู่มือขั้นตอน: `docs/README-HOSTINGER.md`
