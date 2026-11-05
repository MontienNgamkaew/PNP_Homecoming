# GitHub → Hostinger Business

Repository: https://github.com/MontienNgamkaew/PNP_Homecoming

ใช้ GitHub Actions ส่งไฟล์ที่ผ่าน allowlist ไป Hostinger ผ่าน SSH โดยไม่ใช้ ZIP และไม่ clone source ทั้งหมดเข้า public_html ตัว repository เป็น Public จึงห้ามเพิ่มรหัสผ่าน ฐานข้อมูล สลิป หรือ config.php

## Workflow ที่เตรียมไว้

- **Project checks**: ทำงานเมื่อ push main หรือเปิด PR ตรวจ CSS/JS/PHP, Python, MySQL integration และ client settings loader
- **Deploy to Hostinger**: กด Run workflow เองจาก main เท่านั้น ไม่ deploy เมื่อ push อัตโนมัติ ใช้ environment `hostinger-production` และควรตั้ง required reviewer / deployment branch ให้เป็น main
- Source/checks ถูกส่งขึ้น GitHub ได้โดยยังไม่ตั้งค่าโฮสต์ การ push ครั้งแรกไม่เปิดเว็บไซต์จริง

## ตั้งค่าครั้งแรกบนโฮสต์

1. เปิด SSH ของแพ็กเกจใน hPanel จด host/user/port จริงจากแผงควบคุม เปิด SSL/Force HTTPS ของโดเมนเป้าหมาย
2. ใช้ SSH key สำหรับการ deploy โดยเฉพาะ เพิ่ม public key ลง authorized_keys ของบัญชี Hostinger เก็บ private key เฉพาะใน GitHub Environment secrets ห้ามส่งลงแชตหรือ commit
3. ตรวจ SSH host fingerprint กับข้อมูลที่เชื่อถือได้ของ Hostinger แล้วเก็บ known_hosts ที่ตรวจแล้ว รวมรูปแบบ `[host]:port` เมื่อ port ไม่ใช่ 22 ห้ามใช้ StrictHostKeyChecking=no
4. สร้างฐานข้อมูลเฉพาะและจัดวาง private config นอก public_html ตาม [คู่มือติดตั้ง](README-HOSTINGER.md)
5. เตรียม backend ครั้งแรกโดย clone repo ไปโฟลเดอร์ source นอก document root แล้วคัดลอก `hostinger/lib.php`, `schema.sql`, `install.php`, `check.php`, `backup.php`, `restore.php`, `config.example.php` ไป `DOMAIN_DIR/portal-private/` เปลี่ยน config.example.php เป็น config.php และกรอกค่าเฉพาะบนโฮสต์
6. เลือกเริ่มฐานข้อมูลใหม่ หรือกู้คืนข้อมูลพรีวิวล่าสุดเข้าฐานข้อมูลใหม่ว่างตามคู่มือ อย่านำฐานข้อมูล/ไฟล์ export ใส่ GitHub ตัว installer ใช้ assets ใน source repo สำหรับ seed posters ได้ (`php portal-private/install.php /ABS/SOURCE/prototype/assets`)
7. รัน `php portal-private/check.php` ให้ผ่านก่อน deploy

`DOMAIN_DIR` ต้องเป็นโฟลเดอร์แม่ของ public_html ของเว็บไซต์เฉพาะนี้ เช่น `/home/u123456789/domains/pnp.montien.tech` ห้ามใช้โฟลเดอร์เว็บไซต์อื่น ต้องมี public_html และ portal-private/config.php ก่อนรัน workflow แรก หาก hPanel ใช้โครงสร้างอื่น ให้ปรับ validator ใน script ตามเส้นทางจริงก่อน ไม่คาดเดาเส้นทาง

## GitHub Environment secrets

ไป Repository → Settings → Environments → `hostinger-production` → Add environment secret:

| Secret | ค่า |
| --- | --- |
| HOSTINGER_SSH_HOST | IP/hostname จากหน้า SSH ของ Hostinger |
| HOSTINGER_SSH_USER | ชื่อ SSH user |
| HOSTINGER_SSH_PORT | port จริงจาก hPanel |
| HOSTINGER_DOMAIN_DIR | โฟลเดอร์แม่ของ public_html แบบ absolute |
| HOSTINGER_SSH_PRIVATE_KEY | private key สำหรับ deploy โดยเฉพาะ |
| HOSTINGER_SSH_KNOWN_HOSTS | known_hosts ที่ยืนยัน fingerprint แล้ว |

รหัสฐานข้อมูลและ password hash แอดมินอยู่ใน config.php บนโฮสต์ ไม่ต้องใส่ใน GitHub และ workflow ไม่แก้หรือลบ config.php

## Deploy

1. ตรวจ Project checks เป็นสีเขียว
2. ไป Actions → Deploy to Hostinger → Run workflow → main
3. Approve environment หากตั้ง reviewer ไว้
4. ระบบ build/check, เตรียมเฉพาะไฟล์ที่อนุญาต, เชื่อม SSH ที่ยืนยัน host key, สำรอง code เดิมนอก public_html, ส่ง source โดยไม่ใช้ --delete และรัน check.php บน host
5. ตรวจ URL จริง, /api/settings/revision, login, QR/บัญชี, จอง/แนบสลิป และตั๋วบน staging ก่อนเปิดผู้ใช้

Workflow ไม่รัน migration หรือ reset ฐานข้อมูล และไม่เก็บ production backup ลง GitHub code backup อยู่ `DOMAIN_DIR/.deploy-backups/UTC_TIMESTAMP/code-before-deploy.tar.gz` อาจมี private config ต้องรักษาสิทธิ์/กำหนด retention บน host การสำรองนี้ครอบคลุมไฟล์ ไม่ใช่ฐานข้อมูล ต้องกำหนด DB backup แยก

## ข้อจำกัดและ rollback

- การ deploy ใช้ rsync --delay-updates ทำให้การเปลี่ยนไฟล์แต่ละไฟล์เป็นช่วงท้ายการส่ง แต่ไม่ใช่ transaction ของทั้งเว็บไซต์ ควร deploy ในช่วงไม่รับรายการ/maintenance ที่กำหนดไว้
- หาก check หลังส่งล้มเหลว workflow จะรายงาน failure และไม่ reset/restore ฐานข้อมูลอัตโนมัติ ตรวจ log ที่ไม่มีข้อมูลลับก่อนแก้หรือคืน code backup ด้วย SSH
- ไม่ใช้เมนู Git ใน hPanel ให้ clone repository นี้ตรงเข้า public_html เพราะ repository มี source/test/schema ที่ไม่ใช่ไฟล์สาธารณะ หากเคยเชื่อมเมนู Git ไว้ให้หยุด auto-deployment ของเส้นทางเดียวกันก่อน
