# คืนสู่เหย้าศิษย์เก่า การอาชีพพนมไพร ครั้งที่ 2

เว็บไซต์สำหรับแจ้งทำบุญ จองโต๊ะจีน จองเสื้อ ติดตามสถานะ และผู้ดูแล ใช้ Tailwind CSS + daisyUI ฝั่งเว็บ

- **Hostinger Business release:** PHP 8.2+ / MySQL or MariaDB in `hostinger/`, with the existing `prototype/` frontend. See [installation guide](docs/README-HOSTINGER.md) and [latest readiness review](docs/PREDEPLOY-LATEST.md).
- **รุ่นอ้างอิงในเครื่อง:** Python 3.9+ / SQLite ใน `server.py` ยังคงเก็บไว้ คำสั่งด้านล่างใช้กับรุ่นนี้

Account details and uploaded QR images come from admin settings. Missing QR falls back to bank-transfer details; no generated demo QR is displayed. Host-specific staging and recipient verification are still required before public launch.

## GitHub deployment

See [GitHub → Hostinger setup](docs/GITHUB-HOSTINGER.md). GitHub Actions deployment is manual and requires Hostinger SSH environment secrets; pushing source does not deploy production.

## เริ่มใช้งาน

รันจากโฟลเดอร์โปรเจกต์หลัก:

```sh
PORT=8081 python3 server.py
```

เปิด http://127.0.0.1:8081/ และ http://127.0.0.1:8081/#admin
ห้ามใช้ `python3 -m http.server` แทน เพราะเว็บต้องเรียก API

ผู้ดูแลต้องมี ADMIN_PASSWORD อย่างน้อย 16 ตัวอักษร ตั้งใน Terminal โดยไม่ใส่รหัสผ่านในคำสั่ง:

```sh
read -s 'ADMIN_PASSWORD?รหัสผ่านผู้ดูแล: '
export ADMIN_PASSWORD
PORT=8081 python3 server.py
```

หลังแก้ server.py ให้หยุดเซิร์ฟเวอร์เดิมด้วย Control+C แล้วรันใหม่ใน Terminal เดิมเพื่อคงตัวแปรสภาพแวดล้อม เซสชันผู้ดูแลจะหมดอายุเมื่อรีสตาร์ต แต่ข้อมูลรายการและการตั้งค่ายังคงอยู่

ฐานข้อมูล: `data/donations.sqlite3` หรือโฟลเดอร์ `DATA_DIR` ที่กำหนด ควรสำรองก่อนเปลี่ยนรุ่น เซิร์ฟเวอร์เพิ่มตาราง/คอลัมน์ที่ขาดโดยไม่ลบรายการเดิม

## การตั้งค่าและยอดเงิน

- ราคาเริ่มต้น: เสื้อ 299 บาท / โต๊ะ 2,500 บาท / จัดส่ง 50 บาทต่อคำสั่งจอง
- `/api/settings` ให้ทุกหน้ารับราคา วันจัดงาน และ QR เดียวกันจากฐานข้อมูล
- `/api/admin/settings` ต้องเข้าสู่ระบบ เก็บประวัติและป้องกันผู้ดูแลบันทึกทับค่ารุ่นเก่า
- QR แยก 4 ประเภท เป็น PNG/JPG ไม่เกิน 1 MB ต่อภาพ ไม่เลือกไฟล์ใหม่จะใช้ภาพเดิม
- เซิร์ฟเวอร์คำนวณยอดโต๊ะจากจำนวนโต๊ะ และยอดเสื้อจากจำนวนตัว/วิธีรับ หากยอดที่ส่งไม่ตรงจะไม่บันทึกรายการ (HTTP 409)
- รายการเก่าคงยอดและข้อมูลราคาขณะจองไว้ใน pricing_snapshot รายการก่อนการอัปเกรดยังคงยอดเดิมโดยไม่สมมติราคาย้อนหลัง
- การจองและเปลี่ยนสถานะโต๊ะอยู่ใน transaction การคืนสถานะรายการเก่าจะทำได้ต่อเมื่อโต๊ะว่างหรือยังเป็นของรายการนั้น ถ้าเป็นของรายการอื่นจะปฏิเสธทั้งรายการ

## ตรวจสอบและพัฒนา

```sh
npm --prefix prototype ci
npm --prefix prototype run build:css
node --check prototype/app.js
python3 -m unittest discover -s tests -v
```

รายละเอียดธีมอยู่ใน `prototype/README.md` เอกสารระบบรุ่นเก่าเก็บใน `docs/README-legacy.md` เพื่ออ้างอิงประวัติ ไม่ใช่คำแนะนำเริ่มระบบปัจจุบัน

## ขอบเขตปัจจุบัน

ยังต้องใช้ QR จริงที่ผู้จัดยืนยันและตรวจเทียบสลิปกับรายการธนาคารโดยผู้ดูแล ยังไม่มีการตรวจธุรกรรมธนาคารอัตโนมัติ การรันนี้รับเฉพาะ loopback ไม่ใช่การเผยแพร่อินเทอร์เน็ต รหัสผ่านผู้ดูแลเป็นแบบร่วมและเซสชันมีอายุ 1 ชั่วโมง
