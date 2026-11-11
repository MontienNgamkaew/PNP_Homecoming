"""Local prototype and event portal. Python 3.9+, standard library only."""
import base64, binascii, hashlib, hmac, json, os, re, secrets, sqlite3, time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('DATA_DIR', ROOT / 'data'))
DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
DB = DATA / 'donations.sqlite3'
ADMIN = os.environ.get('ADMIN_PASSWORD', '')
SESSIONS = {}
MAX_FILE = 5 * 1024 * 1024
DEFAULT_HERO = {'eyebrow': 'HOMECOMING / ครั้งที่ 2', 'line1': 'คิดถึงกัน', 'line2': 'กลับมา', 'accent': 'พบกัน.', 'description': 'คืนสู่เหย้าศิษย์เก่า การอาชีพพนมไพร\nฉลอง 30 ปีแห่งความผูกพัน', 'desktopTitle': 34, 'mobileTitle': 27, 'desktopLabel': 14, 'mobileLabel': 12, 'desktopDescription': 14, 'mobileDescription': 14}
DEFAULT_ACCOUNTS = {kind: {'bank': 'ธนาคารออมสิน', 'name': 'ระดมทุนทรัพยากร วก.พนมไพร', 'number': '020441298401'} for kind in ('donate', 'fund', 'tables', 'shirts')}
DEFAULT_SETTINGS = {'shirt': 299, 'table': 2500, 'shipping': 50, 'event': '2 มกราคม 2570', 'qr': {}}
QR_KINDS = {'donate', 'fund', 'tables', 'shirts'}

def canonical_phone(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9+ ()-]{9,25}', value.strip()): return ''
    digits = re.sub(r'[^0-9]', '', value)
    if digits.startswith('0066') and len(digits) in (12, 13): digits = '0' + digits[4:]
    elif digits.startswith('66') and len(digits) in (10, 11): digits = '0' + digits[2:]
    return digits if 9 <= len(digits) <= 15 else ''

def admin_order_filter(url):
    params = parse_qs(urlsplit(url).query)
    q = params.get('q', [''])[0].strip()
    kind = params.get('type', [''])[0]
    status = params.get('status', [''])[0]
    if len(q) > 150 or kind not in ('', 'donate', 'fund', 'tables', 'shirts') or status not in ('', 'pending', 'confirmed', 'rejected'):
        raise ValueError('ตัวกรองไม่ถูกต้อง')
    page = max(1, min(100000, int(params.get('page', ['1'])[0])))
    clauses, args = [], []
    if q:
        clauses.append('(ref LIKE ? OR name LIKE ? OR phone LIKE ?)')
        args.extend(['%' + q + '%'] * 3)
    for key, value in (('type', kind), ('status', status)):
        if value:
            clauses.append(key + '=?')
            args.append(value)
    return (' WHERE ' + ' AND '.join(clauses) if clauses else ''), args, page

def allocate_reference(c):
    """Called inside BEGIN IMMEDIATE so orders and legacy donations share one sequence."""
    number = c.execute('SELECT next_number FROM reference_counter WHERE id=1').fetchone()[0]
    while number <= 999999:
        ref = str(number)
        number += 1
        if not c.execute('SELECT 1 FROM orders WHERE ref=? UNION ALL SELECT 1 FROM donations WHERE ref=?', (ref, ref)).fetchone():
            c.execute('UPDATE reference_counter SET next_number=? WHERE id=1', (number,))
            return ref
    raise RuntimeError('reference_number_capacity_reached')

def cents(value, minimum=0):
    amount = Decimal(str(value))
    if not amount.is_finite() or not minimum <= amount <= 10000000 or amount != amount.quantize(Decimal('.01')):
        raise ValueError('จำนวนเงินไม่ถูกต้อง')
    return int(amount * 100)

def read_settings(c):
    row = c.execute('SELECT config, revision FROM app_settings WHERE id=1').fetchone()
    config = json.loads(row['config'])
    return {**config, 'accounts': {kind: {**value, **config.get('accounts', {}).get(kind, {})} for kind, value in DEFAULT_ACCOUNTS.items()}, 'hero': {**DEFAULT_HERO, **config.get('hero', {})}, 'revision': row['revision']}

def validate_settings(d):
    result = {key: cents(d.get(key), 0 if key == 'shipping' else 1) / 100
              for key in ('shirt', 'table', 'shipping')}
    event = d.get('event')
    if not isinstance(event, str) or not 1 <= len(event.strip()) <= 150:
        raise ValueError('กรุณาระบุวันจัดงาน')
    result['event'] = event.strip()
    shirt = d.get('shirt_image', '')
    if shirt != '':
        if not isinstance(shirt, str) or ',' not in shirt:
            raise ValueError('ภาพเสื้อไม่ถูกต้อง')
        header, payload = shirt.split(',', 1)
        raw = base64.b64decode(payload, validate=True)
        valid = ((header == 'data:image/png;base64' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or
                 (header == 'data:image/jpeg;base64' and raw.startswith(b'\xff\xd8\xff')) or
                 (header == 'data:image/webp;base64' and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'))
        if not valid or not 0 < len(raw) <= 1024 * 1024:
            raise ValueError('ภาพเสื้อต้องเป็น JPG, PNG หรือ WebP ไม่เกิน 1 MB')
    result['shirt_image'] = shirt

    qr = d.get('qr', {})
    if not isinstance(qr, dict) or set(qr) - QR_KINDS:
        raise ValueError('ประเภท QR ไม่ถูกต้อง')
    result['qr'] = {}
    for key, value in qr.items():
        if not isinstance(value, str) or ',' not in value:
            raise ValueError('ไฟล์ QR ไม่ถูกต้อง')
        header, payload = value.split(',', 1)
        raw = base64.b64decode(payload, validate=True)
        valid = ((header == 'data:image/png;base64' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or
                 (header == 'data:image/jpeg;base64' and raw.startswith(b'\xff\xd8\xff')))
        if not valid or not 0 < len(raw) <= 1024 * 1024:
            raise ValueError('QR ต้องเป็น PNG หรือ JPG ขนาดไม่เกิน 1 MB ต่อภาพ')
        result['qr'][key] = value
    hero = d.get('hero', DEFAULT_HERO)
    if not isinstance(hero, dict):
        raise ValueError('ข้อมูลแบนเนอร์ไม่ถูกต้อง')
    result['hero'] = {}
    for key, default in DEFAULT_HERO.items():
        value = hero.get(key, default)
        if isinstance(default, str):
            if not isinstance(value, str) or len(value) > (400 if key == 'description' else 100):
                raise ValueError('ข้อความแบนเนอร์ยาวเกินกำหนด')
        elif isinstance(value, bool) or not isinstance(value, int) or not 12 <= value <= (64 if 'Title' in key else 28):
            raise ValueError('ขนาดตัวอักษรไม่ถูกต้อง')
        result['hero'][key] = value
    accounts = d.get('accounts', DEFAULT_ACCOUNTS)
    if not isinstance(accounts, dict) or set(accounts) - set(DEFAULT_ACCOUNTS):
        raise ValueError('ข้อมูลบัญชีไม่ถูกต้อง')
    accounts = {**DEFAULT_ACCOUNTS, **accounts}
    result['accounts'] = {}
    for kind, account in accounts.items():
        if not isinstance(account, dict): raise ValueError('ข้อมูลบัญชีไม่ถูกต้อง')
        clean = {}
        for key, minimum, maximum in (('bank', 1, 100), ('name', 2, 150), ('number', 6, 20)):
            value = account.get(key)
            if not isinstance(value, str): raise ValueError('ข้อมูลบัญชีไม่ถูกต้อง')
            value = value.strip()
            if key == 'number': value = re.sub(r'[ -]', '', value)
            if not minimum <= len(value) <= maximum or (key == 'number' and not re.fullmatch(r'[0-9]+', value)):
                raise ValueError('กรุณาตรวจสอบชื่อธนาคาร ชื่อบัญชี และเลขบัญชี')
            clean[key] = value
        result['accounts'][kind] = clean
    return result
STATUSES = {
    'pending': 'รอตรวจสอบ',
    'approved': 'ตรวจสอบแล้ว',
    'confirmed': 'ยืนยันแล้ว',
    'rejected': 'ไม่ผ่านการตรวจสอบ'
}

def connect():
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    return c

def init():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS donations (
          ref TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, name TEXT NOT NULL,
          cents INTEGER NOT NULL, transferred TEXT NOT NULL, contact TEXT NOT NULL,
          digest TEXT UNIQUE NOT NULL, mime TEXT NOT NULL, slip BLOB NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, ref TEXT, old TEXT, new TEXT, at INTEGER);
        CREATE TABLE IF NOT EXISTS limits (bucket TEXT PRIMARY KEY, count INTEGER, expires INTEGER);

        CREATE TABLE IF NOT EXISTS orders (
          ref TEXT PRIMARY KEY,
          secret_hash TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          transferred TEXT NOT NULL,
          delivery_method TEXT,
          recipient_name TEXT,
          shipping_address TEXT,
          postcode TEXT,
          tables_list TEXT,
          category TEXT,
          digest TEXT UNIQUE NOT NULL,
          mime TEXT NOT NULL,
          slip BLOB NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS table_bookings (
          table_number INTEGER PRIMARY KEY,
          order_ref TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (order_ref) REFERENCES orders(ref) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_ref TEXT NOT NULL,
          item_type TEXT NOT NULL DEFAULT 'shirt',
          size TEXT NOT NULL,
          qty INTEGER NOT NULL,
          FOREIGN KEY (order_ref) REFERENCES orders(ref) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS order_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ref TEXT NOT NULL,
          old TEXT,
          new TEXT,
          at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS blessings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS settings_audit (
          id INTEGER PRIMARY KEY, old_config TEXT NOT NULL, new_config TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS reference_counter (
          id INTEGER PRIMARY KEY CHECK(id=1), next_number INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS posters (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, mime TEXT NOT NULL,
          image BLOB NOT NULL, created INTEGER NOT NULL, deleted_at INTEGER);
        ''')

        for poster_id, title, filename in (
            ('default-compact', 'คืนสู่เหย้าศิษย์เก่า ครั้งที่ 2', 'poster-compact-v1.png'),
            ('default-celebration', 'ทอดผ้าป่าเพื่อการศึกษา ครบรอบ 30 ปี', 'poster-celebration-v2.png'),
        ):
            image_path = ROOT / 'prototype' / 'assets' / filename
            if image_path.is_file():
                c.execute('INSERT OR IGNORE INTO posters(id,title,mime,image,created) VALUES (?,?,?,?,?)',
                          (poster_id,title,'image/png',image_path.read_bytes(),int(time.time())))

        c.execute('INSERT OR IGNORE INTO reference_counter VALUES (1,100000)')

        c.execute('INSERT OR IGNORE INTO app_settings VALUES (1, ?, 1)', (json.dumps(DEFAULT_SETTINGS, ensure_ascii=False),))
        if 'pricing_snapshot' not in {r['name'] for r in c.execute('PRAGMA table_info(orders)')}:
            c.execute("ALTER TABLE orders ADD COLUMN pricing_snapshot TEXT NOT NULL DEFAULT '{}'")

        cnt = c.execute('SELECT COUNT(*) FROM blessings').fetchone()[0]
        if cnt == 0:
            now = int(time.time())
            defaults = [
                "ขออานุภาพแห่งบุญกุศล ดลบันดาลให้ท่านและครอบครัวประสบแต่ความสุข ความเจริญ มีสุขภาพพลานามัยสมบูรณ์แข็งแรง",
                "ขอให้การงานก้าวหน้า ค้าขายร่ำรวย เงินทองไหลมาเทมา กิจการรุ่งเรืองยิ่งๆ ขึ้นไป",
                "ขอให้พบเจอแต่มิตรสหายที่ดี ชีวิตราบรื่น ปราศจากอุปสรรคและโรคภัยไข้เจ็บทั้งปวง",
                "พลังแห่งการให้ ส่งต่อโอกาสสู่รุ่นน้อง ขอให้ท่านเจริญด้วยอายุ วรรณะ สุขะ พละ และปฏิภาณธนสารสมบัติ",
                "30 ปีแห่งความผูกพัน ขอให้ความรักและความคิดถึงนำพาความสุขและความสำเร็จอันงดงามมาสู่ชีวิตท่าน",
                "ขอบคุณที่ร่วมสร้างอนาคตให้รุ่นน้องการอาชีพพนมไพร ขอให้ท่านมีเกียรติยศชื่อเสียงและเจริญรุ่งเรืองในหน้าที่การงาน",
                "ขอคุณพระศรีรัตนตรัยและสิ่งศักดิ์สิทธิ์ คุ้มครองปกป้องท่านและครอบครัวให้แคล้วคลาดปลอดภัย ร่มเย็นเป็นสุข",
                "ขอให้สมหวังในสิ่งที่ปรารถนา คิดสิ่งใดที่เป็นกุศลขอให้สำเร็จสัมฤทธิผลทุกประการ",
                "ทุกบาททุกสตางค์ที่ท่านร่วมแบ่งปัน ขอให้งอกเงยเป็นความมั่งคั่งและโชคลาภกลับคืนสู่ท่านร้อยเท่าพันทวี",
                "ยินดีต้อนรับกลับบ้านการอาชีพพนมไพร ขอให้การพบกันครั้งนี้เติมเต็มรอยยิ้ม ความสุข และความทรงจำอันล้ำค่าตลอดไป"
            ]
            for b in defaults:
                c.execute('INSERT INTO blessings (message, active, created_at) VALUES (?, 1, ?)', (b, now))
    os.chmod(DB, 0o600)

def get_mime(path_obj):
    ext = path_obj.suffix.lower()
    return {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain; charset=utf-8',
        '.wav': 'audio/wav',
    }.get(ext, 'application/octet-stream')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass # Never put donor data or tracking tokens in logs.

    def send(self, code, value, mime='application/json; charset=utf-8', extra=None):
        body = json.dumps(value, ensure_ascii=False).encode() if isinstance(value, (dict, list)) else value
        self.send_response(code)
        headers = {
            'Content-Type': mime,
            'Content-Length': str(len(body)),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: blob:; "
                "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
            ),
            **(extra or {})
        }
        origin = self.headers.get('Origin', '')
        if origin in ('http://127.0.0.1:8080', 'http://127.0.0.1:8081', 'http://localhost:8080', 'http://localhost:8081'):
            headers['Access-Control-Allow-Origin'] = origin
            headers['Access-Control-Allow-Credentials'] = 'true'
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get('Origin', '')
        self.send_response(204)
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Cookie')
            self.send_header('Access-Control-Allow-Credentials', 'true')
        self.end_headers()

    def authenticated(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie',''))
            token = cookie['admin'].value
            return SESSIONS.get(token,0) > time.time()
        except (KeyError, ValueError):
            return False

    def limited(self, scope, maximum):
        # Loopback prototype: never trust forwarded IP headers.
        bucket = hashlib.sha256((scope + self.client_address[0]).encode()).hexdigest()
        now = int(time.time())
        with connect() as c:
            c.execute('DELETE FROM limits WHERE expires < ?', (now,))
            c.execute('INSERT OR IGNORE INTO limits VALUES (?,0,?)', (bucket, now+900))
            c.execute('UPDATE limits SET count=count+1 WHERE bucket=?', (bucket,))
            return c.execute('SELECT count FROM limits WHERE bucket=?',(bucket,)).fetchone()[0] > maximum

    def serve_file(self, target_path):
        try:
            resolved = target_path.resolve()
            proto_dir = (ROOT / 'prototype').resolve()
            pub_dir = (ROOT / 'public').resolve()
            if not (str(resolved).startswith(str(proto_dir)) or str(resolved).startswith(str(pub_dir))):
                return self.send(403, {'error':'การเข้าถึงไม่ถูกต้อง'})
            if not resolved.is_file():
                return self.send(404, {'error':'ไม่พบหน้า'})
            return self.send(200, resolved.read_bytes(), get_mime(resolved))
        except Exception:
            return self.send(404, {'error':'ไม่พบหน้า'})

    def do_GET(self):
        path = self.path.split('?')[0]

        if path == '/api/posters':
            with connect() as c:
                rows = c.execute("SELECT id,title FROM posters WHERE deleted_at IS NULL ORDER BY CASE id WHEN 'default-compact' THEN 0 ELSE 1 END,created,id").fetchall()
            return self.send(200, [{**dict(row), 'url':'/api/posters/'+row['id']+'/image'} for row in rows])
        if path.startswith('/api/posters/') and path.endswith('/image'):
            poster_id = path.split('/')[3]
            with connect() as c:
                row = c.execute('SELECT mime,image FROM posters WHERE id=? AND deleted_at IS NULL', (poster_id,)).fetchone()
            if not row: return self.send(404, {'error':'ไม่พบโปสเตอร์'})
            return self.send(200, row['image'], row['mime'])

        if path == '/api/totals':
            totals = dict.fromkeys(('donate', 'fund', 'tables', 'shirts'), 0)
            with connect() as c:
                rows = c.execute("SELECT type,COALESCE(SUM(amount_cents),0) AS cents FROM orders WHERE status='confirmed' GROUP BY type").fetchall()
            for row in rows:
                if row['type'] in totals:
                    totals[row['type']] = int(row['cents'])
            return self.send(200, {'by_type':totals, 'total_cents':sum(totals.values())})

        if path == '/api/settings/revision':
            with connect() as c:
                revision = c.execute('SELECT revision FROM app_settings WHERE id=1').fetchone()[0]
            return self.send(200, {'revision':revision})

        if path == '/api/settings':
            with connect() as c:
                settings = read_settings(c)
            return self.send(200, settings)

        # 1. Real-time table status
        if path == '/api/tables':
            with connect() as c:
                rows = c.execute('SELECT table_number, status, order_ref FROM table_bookings ORDER BY table_number ASC').fetchall()
                booked = {str(r['table_number']): r['status'] for r in rows}
                confirmed_cnt = sum(1 for r in rows if r['status'] == 'confirmed')
                pending_cnt = sum(1 for r in rows if r['status'] == 'pending')
            return self.send(200, {
                'booked': booked,
                'summary': {
                    'total': 61,
                    'available': 61 - sum(1 for r in rows if r['table_number'] <= 61),
                    'pending': pending_cnt,
                    'confirmed': confirmed_cnt
                }
            })

        # 1.1 Random active blessing
        if path == '/api/blessings/random':
            with connect() as c:
                row = c.execute('SELECT message FROM blessings WHERE active=1 ORDER BY RANDOM() LIMIT 1').fetchone()
            msg = row['message'] if row else "ขออานุภาพแห่งบุญกุศล ดลบันดาลให้ท่านและครอบครัวประสบแต่ความสุขความเจริญ"
            return self.send(200, {'blessing': msg})

        # 1.2 Admin blessings list
        if path == '/api/admin/blessings':
            if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
            with connect() as c:
                rows = c.execute('SELECT id, message, active, created_at FROM blessings ORDER BY id ASC').fetchall()
            return self.send(200, [dict(r) for r in rows])

        if path == '/api/admin/summary':
            if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
            try: where, args, page = admin_order_filter(self.path)
            except (ValueError, TypeError): return self.send(400, {'error':'ตัวกรองไม่ถูกต้อง'})
            with connect() as c:
                result = dict(c.execute("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END),0) AS confirmed_cents,COALESCE(SUM(status='pending'),0) AS pending FROM orders").fetchone())
                result['shirt_count'] = c.execute("SELECT COALESCE(SUM(i.qty),0) FROM order_items i JOIN orders o ON i.order_ref=o.ref WHERE o.type='shirts' AND o.status<>'rejected'").fetchone()[0]
                result['booked_tables'] = c.execute('SELECT COUNT(*) FROM table_bookings').fetchone()[0]
                result.update(dict(c.execute("SELECT COUNT(*) AS filtered_count,COALESCE(SUM(amount_cents),0) AS filtered_cents,COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END),0) AS filtered_confirmed_cents FROM orders" + where, args).fetchone()))
                result['by_type'] = {row['type']: dict(row) for row in c.execute("SELECT type,COUNT(*) AS total,COALESCE(SUM(status='pending'),0) AS pending,COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END),0) AS confirmed_cents FROM orders GROUP BY type")}
                result['page_size'] = 100
            return self.send(200, result)

        # 2. Admin orders list
        if path == '/api/admin/orders':
            if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
            try: where, args, page = admin_order_filter(self.path)
            except (ValueError, TypeError): return self.send(400, {'error':'ตัวกรองไม่ถูกต้อง'})
            with connect() as c:
                rows = c.execute("SELECT ref,type,name,phone,amount_cents,transferred,delivery_method,recipient_name,shipping_address,postcode,tables_list,category,status,created FROM orders" + where + " ORDER BY created DESC,ref DESC LIMIT 100 OFFSET ?", [*args, (page-1)*100]).fetchall()
                res = []
                for r in rows:
                    od = dict(r)
                    if od['type'] == 'shirts':
                        items = c.execute('SELECT size, qty FROM order_items WHERE order_ref=?', (od['ref'],)).fetchall()
                        od['items'] = [dict(it) for it in items]
                    res.append(od)
            return self.send(200, res)

        # 3. Admin legacy donations list
        if path == '/api/admin/list':
            if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
            with connect() as c:
                rows = c.execute('SELECT ref,name,cents,transferred,contact,status,created FROM donations ORDER BY created DESC LIMIT 500').fetchall()
            return self.send(200, [dict(r) for r in rows])

        # 4. Admin order slip download
        if path.startswith('/api/admin/order-slip/'):
            if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
            ref = path.rsplit('/', 1)[1]
            with connect() as c:
                row = c.execute('SELECT ref, mime, slip FROM orders WHERE ref=?', (ref,)).fetchone()
                if not row:
                    row = c.execute('SELECT ref, mime, slip FROM donations WHERE ref=?', (ref,)).fetchone()
            if not row: return self.send(404, {'error':'ไม่พบรายการ'})
            ext = {'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'}.get(row['mime'], 'bin')
            return self.send(200, row['slip'], row['mime'], {
                'Content-Disposition': f'inline; filename="{row["ref"]}.{ext}"',
                'Content-Security-Policy': "sandbox; default-src 'none'"
            })

        # 5. Admin legacy slip download
        if path.startswith('/api/admin/slip/'):
            if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
            ref = path.rsplit('/', 1)[1]
            with connect() as c:
                row = c.execute('SELECT ref, mime, slip FROM donations WHERE ref=?', (ref,)).fetchone()
            if not row: return self.send(404, {'error':'ไม่พบรายการ'})
            ext = {'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'}.get(row['mime'], 'bin')
            return self.send(200, row['slip'], row['mime'], {
                'Content-Disposition': f'attachment; filename="{row["ref"]}.{ext}"',
                'Content-Security-Policy': "sandbox; default-src 'none'"
            })

        # 6. Static files routing
        if path == '/':
            return self.serve_file(ROOT / 'prototype' / 'index.html')
        if path in ('/theme.css', '/app.js'):
            return self.serve_file(ROOT / 'prototype' / path.lstrip('/'))
        if path.startswith('/assets/'):
            return self.serve_file(ROOT / 'prototype' / path.lstrip('/'))
        if path == '/admin':
            return self.serve_file(ROOT / 'public' / 'admin.html')
        if path in ('/admin.js', '/style.css'):
            return self.serve_file(ROOT / 'public' / path.lstrip('/'))
        if path in ('/legacy', '/legacy/'):
            return self.serve_file(ROOT / 'public' / 'index.html')
        if path == '/legacy/app.js':
            return self.serve_file(ROOT / 'public' / 'app.js')

        return self.send(404, {'error':'ไม่พบหน้า'})

    def do_POST(self):
        # Require browser same-origin requests, including login (CSRF/login-CSRF).
        origin = self.headers.get('Origin', '')
        expected = ('https' if os.environ.get('SECURE_COOKIE') == '1' else 'http') + '://' + self.headers.get('Host', '')
        valid_dev_origins = ('http://127.0.0.1:8080', 'http://127.0.0.1:8081', 'http://localhost:8080', 'http://localhost:8081')
        if not origin or (origin != expected and origin not in valid_dev_origins):
            return self.send(403, {'error':'คำขอไม่ถูกต้อง'})

        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length < 7 * 1024 * 1024: return self.send(413, {'error':'ไฟล์ใหญ่เกินไป'})
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.send(415, {'error':'รูปแบบคำขอไม่ถูกต้อง'})
            d = json.loads(self.rfile.read(length))
            if not isinstance(d, dict): raise ValueError()
            path = self.path

            if path == '/api/admin/posters':
                if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
                if d.get('action') == 'delete':
                    with connect() as c:
                        result = c.execute('UPDATE posters SET deleted_at=? WHERE id=? AND deleted_at IS NULL', (int(time.time()), str(d.get('id',''))))
                        if not result.rowcount: return self.send(404, {'error':'ไม่พบโปสเตอร์'})
                    return self.send(200, {'ok':True})
                if d.get('action') != 'add': raise ValueError()
                title = str(d.get('title','')).strip()
                if not 1 <= len(title) <= 150:
                    return self.send(400, {'error':'กรุณาระบุชื่อโปสเตอร์ไม่เกิน 150 ตัวอักษร'})
                image_data = base64.b64decode(d.get('file',''), validate=True)
                if not 0 < len(image_data) <= MAX_FILE:
                    return self.send(400, {'error':'โปสเตอร์ต้องมีขนาดไม่เกิน 5 MB ต่อไฟล์'})
                mime = 'image/png' if image_data.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if image_data.startswith(b'\xff\xd8\xff') else 'image/webp' if image_data.startswith(b'RIFF') and image_data[8:12] == b'WEBP' else None
                if not mime: return self.send(400, {'error':'รองรับภาพ JPG, PNG หรือ WebP เท่านั้น'})
                poster_id = secrets.token_hex(12)
                with connect() as c:
                    c.execute('INSERT INTO posters(id,title,mime,image,created) VALUES (?,?,?,?,?)',
                              (poster_id,title,mime,image_data,int(time.time())))
                return self.send(201, {'id':poster_id, 'title':title, 'url':'/api/posters/'+poster_id+'/image'})

            if path == '/api/admin/settings':
                if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
                config = validate_settings(d)
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    old = read_settings(c)
                    if d.get('revision') != old['revision']:
                        return self.send(409, {'error':'มีผู้ดูแลแก้การตั้งค่าแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก'})
                    previous = {k: v for k, v in old.items() if k != 'revision'}
                    c.execute('INSERT INTO settings_audit(old_config,new_config,at) VALUES (?,?,?)',
                              (json.dumps(previous, ensure_ascii=False), json.dumps(config, ensure_ascii=False), int(time.time())))
                    c.execute('UPDATE app_settings SET config=?, revision=revision+1 WHERE id=1',
                              (json.dumps(config, ensure_ascii=False),))
                    saved = read_settings(c)
                return self.send(200, saved)

            if path == '/api/admin/login':
                if self.limited('login', 10): return self.send(429, {'error':'ลองใหม่ใน 15 นาที'})
                if len(ADMIN) < 16: return self.send(503, {'error':'ยังไม่ได้ตั้งรหัสผ่านผู้ดูแลอย่างน้อย 16 ตัวอักษร'})
                if not hmac.compare_digest(str(d.get('password','')), ADMIN): return self.send(401, {'error':'รหัสผ่านไม่ถูกต้อง'})
                token = secrets.token_urlsafe(32)
                for old in list(SESSIONS):
                    if SESSIONS[old] < time.time(): del SESSIONS[old]
                SESSIONS[token] = time.time() + 3600
                cookie = f'admin={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600'
                if os.environ.get('SECURE_COOKIE') == '1': cookie += '; Secure'
                return self.send(200, {'ok':True}, extra={'Set-Cookie':cookie})

            if path == '/api/admin/logout':
                cookie = SimpleCookie(self.headers.get('Cookie',''))
                if 'admin' in cookie: SESSIONS.pop(cookie['admin'].value, None)
                return self.send(200, {'ok':True}, extra={'Set-Cookie':'admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})

            if path == '/api/admin/status':
                if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
                if d.get('status') not in STATUSES: raise ValueError()
                with connect() as c:
                    row = c.execute('SELECT status FROM donations WHERE ref=?', (str(d.get('ref','')),)).fetchone()
                    if not row: return self.send(404, {'error':'ไม่พบรายการ'})
                    c.execute('UPDATE donations SET status=? WHERE ref=?', (d['status'], d['ref']))
                    c.execute('INSERT INTO audit(ref,old,new,at) VALUES (?,?,?,?)', (d['ref'], row[0], d['status'], int(time.time())))
                return self.send(200, {'ok':True})

            if path == '/api/admin/ticket-reissue':
                if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
                if self.limited('ticket-reissue', 30): return self.send(429, {'error':'ออกลิงก์บ่อยเกินไป กรุณาลองใหม่ใน 15 นาที'})
                ref, reason = d.get('ref'), d.get('reason')
                if d.get('verified') is not True or not isinstance(ref, str) or not 1 <= len(ref.strip()) <= 40 or not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 500:
                    return self.send(400, {'error':'กรุณาตรวจสอบตัวตนและระบุเหตุผลการออกลิงก์ใหม่'})
                ref, reason = ref.strip(), reason.strip()
                token = secrets.token_urlsafe(32)
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    row = c.execute('SELECT type,status FROM orders WHERE ref=?', (ref,)).fetchone()
                    if not row: return self.send(404, {'error':'ไม่พบรายการ'})
                    if row['type'] not in ('tables', 'shirts'): return self.send(400, {'error':'รายการนี้ไม่มีตั๋วอิเล็กทรอนิกส์'})
                    if row['status'] not in ('pending', 'confirmed'): return self.send(409, {'error':'รายการยกเลิก ไม่สามารถออกลิงก์ตั๋วใหม่ได้'})
                    redemption_table = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_redemptions'").fetchone()
                    if redemption_table and c.execute('SELECT ref FROM ticket_redemptions WHERE ref=?', (ref,)).fetchone():
                        return self.send(409, {'error':'ตั๋วใช้แล้ว ไม่สามารถออกลิงก์ใหม่ได้'})
                    c.execute('UPDATE orders SET secret_hash=? WHERE ref=?', (hashlib.sha256(token.encode()).hexdigest(), ref))
                    c.execute('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)', (ref, 'ticket_token', json.dumps({'action':'ticket_reissued','reason':reason},ensure_ascii=False), int(time.time())))
                return self.send(200, {'ref':ref,'type':row['type'],'token':token})

            if path == '/api/admin/order-status':
                if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
                ref = str(d.get('ref', '')).strip()
                new_status = str(d.get('status', '')).strip()
                if new_status not in ('pending', 'confirmed', 'rejected'): raise ValueError()
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    row = c.execute('SELECT status, type, tables_list FROM orders WHERE ref=?', (ref,)).fetchone()
                    if not row: return self.send(404, {'error':'ไม่พบรายการ'})
                    if row['type'] == 'tables' and new_status != 'rejected':
                        numbers = [int(n) for n in row['tables_list'].split(',') if n]
                        if not numbers: return self.send(409, {'error':'รายการไม่มีหมายเลขโต๊ะ กรุณาตรวจสอบข้อมูล'})
                        placeholders = ','.join('?' for _ in numbers)
                        conflicts = c.execute(f'SELECT table_number FROM table_bookings WHERE table_number IN ({placeholders}) AND order_ref != ?', (*numbers, ref)).fetchall()
                        if conflicts:
                            return self.send(409, {'error':'ไม่สามารถคืนสถานะได้ โต๊ะถูกจองโดยรายการอื่นแล้ว'})
                        for n in numbers:
                            c.execute('INSERT INTO table_bookings(table_number,order_ref,status,updated_at) VALUES (?,?,?,?) ON CONFLICT(table_number) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at',
                                      (n, ref, new_status, int(time.time())))
                    c.execute('UPDATE orders SET status=? WHERE ref=?', (new_status, ref))
                    c.execute('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)', (ref, row['status'], new_status, int(time.time())))
                    if row['type'] == 'tables':
                        if new_status == 'rejected':
                            c.execute('DELETE FROM table_bookings WHERE order_ref=?', (ref,))
                        elif new_status == 'confirmed':
                            c.execute('UPDATE table_bookings SET status="confirmed", updated_at=? WHERE order_ref=?', (int(time.time()), ref))
                        elif new_status == 'pending':
                            c.execute('UPDATE table_bookings SET status="pending", updated_at=? WHERE order_ref=?', (int(time.time()), ref))
                return self.send(200, {'ok':True})

            if path == '/api/admin/blessings':
                if not self.authenticated(): return self.send(401, {'error':'กรุณาเข้าสู่ระบบ'})
                action = str(d.get('action', 'add')).strip()
                with connect() as c:
                    if action == 'add':
                        msg = str(d.get('message', '')).strip()
                        if not 3 <= len(msg) <= 500:
                            return self.send(400, {'error':'ข้อความคำอวยพรต้องมีความยาวระหว่าง 3–500 ตัวอักษร'})
                        c.execute('INSERT INTO blessings (message, active, created_at) VALUES (?, 1, ?)', (msg, int(time.time())))
                        new_id = c.execute('SELECT last_insert_rowid()').fetchone()[0]
                        return self.send(201, {'ok': True, 'id': new_id})
                    elif action == 'edit':
                        bid = int(d.get('id', 0))
                        msg = str(d.get('message', '')).strip()
                        if not 3 <= len(msg) <= 500:
                            return self.send(400, {'error':'ข้อความคำอวยพรต้องมีความยาวระหว่าง 3–500 ตัวอักษร'})
                        c.execute('UPDATE blessings SET message=? WHERE id=?', (msg, bid))
                        return self.send(200, {'ok': True})
                    elif action == 'toggle':
                        bid = int(d.get('id', 0))
                        row = c.execute('SELECT active FROM blessings WHERE id=?', (bid,)).fetchone()
                        if not row: return self.send(404, {'error':'ไม่พบคำอวยพร'})
                        new_active = 0 if row['active'] == 1 else 1
                        c.execute('UPDATE blessings SET active=? WHERE id=?', (new_active, bid))
                        return self.send(200, {'ok': True, 'active': new_active})
                    elif action == 'delete':
                        bid = int(d.get('id', 0))
                        c.execute('DELETE FROM blessings WHERE id=?', (bid,))
                        return self.send(200, {'ok': True})
                    else:
                        return self.send(400, {'error':'การกระทำไม่ถูกต้อง'})

            if path == '/api/ticket':
                if self.limited('lookup', 60): return self.send(429, {'error':'ลองใหม่ใน 15 นาที'})
                ref = str(d.get('ref', '')).strip()
                token_hash = hashlib.sha256(str(d.get('token', '')).strip().encode()).hexdigest()
                with connect() as c:
                    row = c.execute('SELECT ref,type,name,tables_list,amount_cents,status,delivery_method,recipient_name FROM orders WHERE ref=? AND secret_hash=? AND type IN ("tables","shirts")', (ref, token_hash)).fetchone()
                    if not row: return self.send(404, {'error':'ไม่พบตั๋ว หรือรหัสติดตามไม่ถูกต้อง'})
                    event = read_settings(c)['event']
                    common = {'ref':row['ref'], 'type':row['type'], 'name':row['name'],
                              'amount':row['amount_cents']/100, 'event':event,
                              'venue':'วิทยาลัยการอาชีพพนมไพร', 'status':row['status'],
                              'label':STATUSES.get(row['status'], row['status'])}
                    if row['type'] == 'shirts':
                        sizes = ['XS','S','M','L','XL','2XL','3XL','4XL']
                        items = [dict(r) for r in c.execute('SELECT size,SUM(qty) AS qty FROM order_items WHERE order_ref=? GROUP BY size', (ref,))]
                        items.sort(key=lambda item:sizes.index(item['size']) if item['size'] in sizes else len(sizes))
                        return self.send(200, {**common, 'items':items,
                                               'total_qty':sum(item['qty'] for item in items),
                                               'delivery_method':row['delivery_method'],
                                               'recipient_name':row['recipient_name'] if row['delivery_method']=='post' else None,
                                               'payment_confirmed':row['status']=='confirmed',
                                               'collection_valid':row['status']=='confirmed' and row['delivery_method']=='pickup'})
                numbers = [int(n) for n in row['tables_list'].split(',') if n]
                return self.send(200, {**common, 'tables':numbers, 'guests':len(numbers)*8,
                                       'admission_valid':row['status']=='confirmed'})

            if path == '/api/status' and 'phone' in d:
                if self.limited('phone-lookup', 20): return self.send(429, {'error':'ค้นหาบ่อยเกินไป กรุณาลองใหม่ใน 15 นาที'})
                ref = d.get('ref', '')
                phone = canonical_phone(d.get('phone'))
                if not isinstance(ref, str) or not 1 <= len(ref.strip()) <= 40 or not phone:
                    return self.send(404, {'error':'ไม่พบรายการ กรุณาตรวจสอบเบอร์โทรและเลขอ้างอิง'})
                ref = ref.strip().upper()
                with connect() as c:
                    row = c.execute('SELECT type,amount_cents,status,phone FROM orders WHERE ref=?', (ref,)).fetchone()
                    if not row:
                        row = c.execute("SELECT 'donate' AS type,cents AS amount_cents,status,contact AS phone FROM donations WHERE ref=?", (ref,)).fetchone()
                if not row or not hmac.compare_digest(phone, canonical_phone(row['phone'])):
                    return self.send(404, {'error':'ไม่พบรายการ กรุณาตรวจสอบเบอร์โทรและเลขอ้างอิง'})
                return self.send(200, {'ref':ref,'type':row['type'],'amount':row['amount_cents']/100,'status':row['status'],'label':STATUSES.get(row['status'],row['status'])})

            if path == '/api/status':
                if self.limited('lookup', 60): return self.send(429, {'error':'ลองใหม่ใน 15 นาที'})
                ref = str(d.get('ref','')).strip()
                token = str(d.get('token','')).strip()
                shash = hashlib.sha256(token.encode()).hexdigest()
                with connect() as c:
                    row = c.execute('SELECT status FROM orders WHERE ref=? AND secret_hash=?', (ref, shash)).fetchone()
                    if not row:
                        row = c.execute('SELECT status FROM donations WHERE ref=? AND secret_hash=?', (ref, shash)).fetchone()
                if not row: return self.send(404, {'error':'เลขอ้างอิงหรือรหัสติดตามไม่ถูกต้อง'})
                st = row[0]
                return self.send(200, {'status': st, 'label': STATUSES.get(st, st)})

            # -------------------------------------------------------------
            # Unified POST /api/orders (tables, shirts, donate, fund)
            # -------------------------------------------------------------
            if path == '/api/orders':
                if self.limited('orders', 15): return self.send(429, {'error':'ส่งบ่อยเกินไป กรุณาลองใหม่ใน 15 นาที'})
                if d.get('website'): raise ValueError('Honeypot triggered')

                raw_type = str(d.get('type', '')).strip()
                type_map = {
                    'tables': 'tables', 'โต๊ะจีน': 'tables',
                    'shirts': 'shirts', 'เสื้อที่ระลึก': 'shirts',
                    'donate': 'donate', 'ทอดผ้าป่า': 'donate',
                    'fund': 'fund', 'กองทุนช่างกล': 'fund',
                }
                order_type = type_map.get(raw_type)
                if not order_type:
                    return self.send(400, {'error':'ประเภทรายการไม่ถูกต้อง'})

                name = str(d.get('name', '')).strip()
                phone = str(d.get('phone', '')).strip()
                if not 2 <= len(name) <= 150:
                    return self.send(400, {'error':'กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง (2–150 ตัวอักษร)'})
                if not 9 <= len(phone) <= 20:
                    return self.send(400, {'error':'กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ (9–20 หลัก)'})

                amount = Decimal(str(d.get('amount', '0')))
                if not amount.is_finite() or amount < Decimal('1') or amount > Decimal('10000000') or amount != amount.quantize(Decimal('.01')):
                    return self.send(400, {'error':'จำนวนเงินไม่ถูกต้อง'})
                amount_cents = int(amount * 100)

                slip = base64.b64decode(d.get('file', ''), validate=True)
                if not 0 < len(slip) <= MAX_FILE:
                    return self.send(400, {'error':'แนบสลิปขนาดไม่เกิน 5 MB'})
                mime = 'image/png' if slip.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if slip.startswith(b'\xff\xd8\xff') else 'application/pdf' if slip.startswith(b'%PDF-') else None
                if not mime:
                    return self.send(400, {'error':'รองรับเฉพาะไฟล์ PNG, JPG หรือ PDF ที่มีลายเซ็นถูกต้อง'})
                digest = hashlib.sha256(slip).hexdigest()

                table_nums = []
                if order_type == 'tables':
                    tables_raw = d.get('tables', [])
                    if not isinstance(tables_raw, list) or len(tables_raw) == 0:
                        return self.send(400, {'error':'กรุณาเลือกหมายเลขโต๊ะอย่างน้อย 1 โต๊ะ'})
                    for t in tables_raw:
                        try:
                            if isinstance(t, bool) or str(t) != str(int(t)): raise ValueError()
                            n = int(t)
                            if not 1 <= n <= 61: raise ValueError()
                            table_nums.append(n)
                        except (ValueError, TypeError):
                            return self.send(400, {'error': f'หมายเลขโต๊ะไม่ถูกต้อง: {t}'})
                    table_nums = sorted(list(set(table_nums)))

                parsed_lines = []
                delivery = None
                recipient = None
                address = None
                postcode = None
                if order_type == 'shirts':
                    lines = d.get('lines', [])
                    if not isinstance(lines, list) or len(lines) == 0:
                        return self.send(400, {'error':'กรุณาเลือกไซซ์และจำนวนเสื้ออย่างน้อย 1 รายการ'})
                    valid_sizes = {'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'}
                    for item in lines:
                        if not isinstance(item, dict): raise ValueError()
                        sz = str(item.get('size', '')).upper()
                        try:
                            if isinstance(item.get('qty'), bool) or str(item.get('qty')) != str(int(item.get('qty', 0))): raise ValueError()
                            qty = int(item.get('qty', 0))
                        except (ValueError, TypeError):
                            qty = 0
                        if sz not in valid_sizes or not 1 <= qty <= 100:
                            return self.send(400, {'error':'ข้อมูลขนาดหรือจำนวนเสื้อไม่ถูกต้อง'})
                        parsed_lines.append((sz, qty))

                    delivery = str(d.get('delivery', 'pickup')).lower()
                    if delivery not in ('pickup', 'post'): delivery = 'pickup'
                    if delivery == 'post':
                        recipient = str(d.get('recipient', '')).strip()
                        address = str(d.get('address', '')).strip()
                        postcode = str(d.get('postcode', '')).strip()
                        if not recipient or not address or len(postcode) != 5 or not postcode.isdigit():
                            return self.send(400, {'error':'กรุณากรอกชื่อผู้รับ ที่อยู่จัดส่ง และรหัสไปรษณีย์ 5 หลักให้ครบถ้วน'})

                category = 'กองทุนช่างกลโรงงาน' if order_type == 'fund' else 'ร่วมทำบุญทอดผ้าป่า' if order_type == 'donate' else None
                token = secrets.token_urlsafe(32)
                secret_hash = hashlib.sha256(token.encode()).hexdigest()
                now = int(time.time())
                from datetime import timezone, timedelta
                thai_now = datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M:%S')

                with connect() as c:
                    # Serialize pricing and seat ownership checks with inserts and admin updates.
                    c.execute('BEGIN IMMEDIATE')
                    config = read_settings(c)
                    pricing = {'settings_revision': config['revision']}
                    expected_cents = amount_cents
                    if order_type == 'tables':
                        pricing['table_unit_cents'] = cents(config['table'], 1)
                        expected_cents = len(table_nums) * pricing['table_unit_cents']
                    elif order_type == 'shirts':
                        pricing['shirt_unit_cents'] = cents(config['shirt'], 1)
                        pricing['shipping_cents'] = cents(config['shipping']) if delivery == 'post' else 0
                        expected_cents = sum(qty for _, qty in parsed_lines) * pricing['shirt_unit_cents'] + pricing['shipping_cents']
                    if amount_cents != expected_cents:
                        return self.send(409, {'error':'ยอดเงินไม่ตรงกับราคาปัจจุบัน กรุณาโหลดหน้าใหม่และตรวจยอดก่อนแจ้งชำระ',
                                               'expected_amount': expected_cents / 100})
                    # Check duplicate slip across both orders and donations
                    dup = c.execute('SELECT ref FROM orders WHERE digest=?', (digest,)).fetchone()
                    if not dup:
                        dup = c.execute('SELECT ref FROM donations WHERE digest=?', (digest,)).fetchone()
                    if dup:
                        return self.send(409, {'error':'สลิปนี้เคยส่งในระบบแล้ว กรุณาใช้เลขอ้างอิงเดิม หรือติดต่อผู้จัดงาน'})

                    # If table booking, check collision in transaction
                    if order_type == 'tables':
                        placeholders = ','.join('?' * len(table_nums))
                        taken = c.execute(f'SELECT table_number FROM table_bookings WHERE table_number IN ({placeholders})', table_nums).fetchall()
                        if taken:
                            taken_nums = ', '.join(str(r['table_number']) for r in taken)
                            return self.send(409, {'error': f'โต๊ะหมายเลข {taken_nums} ถูกจองแล้ว กรุณาเลือกโต๊ะอื่น'})

                    ref = allocate_reference(c)

                    tables_str = ','.join(str(n) for n in table_nums) if order_type == 'tables' else ''
                    c.execute('''
                        INSERT INTO orders (
                            ref, secret_hash, type, name, phone, amount_cents, transferred,
                            delivery_method, recipient_name, shipping_address, postcode,
                            tables_list, category, digest, mime, slip, status, created
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ''', (
                        ref, secret_hash, order_type, name, phone, amount_cents, thai_now,
                        delivery, recipient, address, postcode, tables_str, category,
                        digest, mime, slip, 'pending', now
                    ))
                    c.execute('UPDATE orders SET pricing_snapshot=? WHERE ref=?', (json.dumps(pricing), ref))

                    if order_type == 'tables':
                        for n in table_nums:
                            c.execute('INSERT INTO table_bookings (table_number, order_ref, status, updated_at) VALUES (?,?,?,?)',
                                      (n, ref, 'pending', now))

                    if order_type == 'shirts':
                        for sz, qty in parsed_lines:
                            c.execute('INSERT INTO order_items (order_ref, item_type, size, qty) VALUES (?,?,?,?)',
                                      (ref, 'shirt', sz, qty))

                    blessing_row = c.execute('SELECT message FROM blessings WHERE active=1 ORDER BY RANDOM() LIMIT 1').fetchone()
                    blessing_msg = blessing_row['message'] if blessing_row else "ขออานุภาพแห่งบุญกุศล ดลบันดาลให้ท่านและครอบครัวประสบแต่ความสุข ความเจริญ มีสุขภาพพลานามัยสมบูรณ์แข็งแรง"

                return self.send(201, {
                    'ref': ref,
                    'token': token,
                    'status': 'pending',
                    'type': order_type,
                    'amount': float(amount),
                    'blessing': blessing_msg
                })

            # -------------------------------------------------------------
            # Legacy POST /api/donations (maintained for backward compatibility)
            # -------------------------------------------------------------
            if path == '/api/donations':
                if self.limited('submit', 10): return self.send(429, {'error':'ส่งบ่อยเกินไป กรุณาลองใหม่ใน 15 นาที'})
                if d.get('website') or d.get('consent') is not True: raise ValueError()
                name, contact = str(d.get('name','')).strip(), str(d.get('contact','')).strip()
                if not 2 <= len(name) <= 150 or len(contact) > 150: raise ValueError()
                amount = Decimal(str(d.get('amount','')))
                if not amount.is_finite() or not Decimal('0.01') <= amount <= Decimal('99999999.99') or amount != amount.quantize(Decimal('.01')): raise ValueError()
                transferred = datetime.strptime(str(d.get('transferred','')), '%Y-%m-%dT%H:%M')
                from datetime import timezone, timedelta
                thai_now = datetime.now(timezone(timedelta(hours=7))).replace(tzinfo=None)
                if transferred > thai_now or transferred.year < 2020: raise ValueError()
                slip = base64.b64decode(d.get('file',''), validate=True)
                if not 0 < len(slip) <= MAX_FILE: return self.send(400, {'error':'แนบสลิปขนาดไม่เกิน 5 MB'})
                mime = 'image/png' if slip.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if slip.startswith(b'\xff\xd8\xff') else 'application/pdf' if slip.startswith(b'%PDF-') else None
                if not mime: return self.send(400, {'error':'รองรับเฉพาะ PNG, JPG และ PDF ที่มีรูปแบบไฟล์ตรงกัน'})
                digest = hashlib.sha256(slip).hexdigest()
                token = secrets.token_urlsafe(32)
                try:
                    with connect() as c:
                        c.execute('BEGIN IMMEDIATE')
                        ref = allocate_reference(c)
                        c.execute('INSERT INTO donations(ref,secret_hash,name,cents,transferred,contact,digest,mime,slip,created) VALUES (?,?,?,?,?,?,?,?,?,?)', (ref,hashlib.sha256(token.encode()).hexdigest(),name,int(amount*100),transferred.isoformat(timespec='minutes'),contact,digest,mime,slip,int(time.time())))
                except sqlite3.IntegrityError:
                    return self.send(409, {'error':'สลิปนี้เคยส่งแล้ว กรุณาใช้เลขอ้างอิงและรหัสติดตามเดิม หากสูญหายให้แจ้งผู้จัดงานผ่านช่องทางที่ท่านยืนยันแล้ว'})
                return self.send(201, {'ref':ref, 'token':token, 'status':'pending'})

            return self.send(404, {'error':'ไม่พบเส้นทาง'})

        except (ValueError, TypeError, InvalidOperation, binascii.Error, OverflowError):
            return self.send(400, {'error':'กรุณาตรวจสอบข้อมูล จำนวนเงิน และวันเวลาที่โอน'})
        except Exception:
            return self.send(500, {'error':'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง'})

if __name__ == '__main__':
    init()
    port = int(os.environ.get('PORT','8080'))
    print(f'Local: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
