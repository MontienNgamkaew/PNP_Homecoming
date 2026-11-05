"""Test orders, table bookings, concurrency, shirts, and status updates."""
import base64, hashlib, json, os, socket, sqlite3, subprocess, sys, tempfile, time, unittest
from pathlib import Path
from http.client import HTTPConnection

ROOT = Path(__file__).resolve().parents[1]

class TestOrdersAndTables(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.data_dir = Path(cls.tmp.name)
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            cls.port = s.getsockname()[1]
        env = {
            **os.environ,
            'DATA_DIR': str(cls.data_dir),
            'ADMIN_PASSWORD': 'test-admin-long-password-1234',
            'PORT': str(cls.port)
        }
        cls.process = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], env=env)
        for _ in range(50):
            try:
                c = HTTPConnection('127.0.0.1', cls.port, timeout=2)
                c.request('GET', '/')
                r = c.getresponse()
                r.read()
                c.close()
                break
            except (OSError, ConnectionRefusedError):
                time.sleep(0.1)
        else:
            raise RuntimeError('Server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait()
        cls.tmp.cleanup()

    def req(self, path, data=None, cookie=None, origin=True):
        c = HTTPConnection('127.0.0.1', self.port, timeout=5)
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = f'http://127.0.0.1:{self.port}'
        if cookie:
            headers['Cookie'] = cookie
        body = json.dumps(data) if data is not None else None
        c.request('POST' if data is not None else 'GET', path, body, headers)
        r = c.getresponse()
        raw = r.read()
        ctype = r.getheader('Content-Type', '')
        c.close()
        res = json.loads(raw) if 'application/json' in ctype else raw
        return r.status, res, dict(r.getheaders())

    def test_full_workflow(self):
        # 1. Initially all 100 tables should be available
        status, data, _ = self.req('/api/tables')
        self.assertEqual(status, 200)
        self.assertEqual(data['summary']['available'], 61)
        self.assertEqual(data['summary']['pending'], 0)
        self.assertEqual(len(data['booked']), 0)

        # 2. Book tables 5 and 6
        valid_slip = base64.b64encode(b'%PDF-1.4\nvalid-slip-content-1').decode()
        order_table_data = {
            'type': 'tables',
            'name': 'สมชาย สายบุญ',
            'phone': '0812345678',
            'amount': '5000.00',
            'tables': [5, 6],
            'file': valid_slip
        }
        status, res, _ = self.req('/api/orders', order_table_data)
        self.assertEqual(status, 201)
        self.assertEqual(res['type'], 'tables')
        ref_table = res['ref']
        self.assertRegex(ref_table, r'^[0-9]{6}$')
        token_table = res['token']

        # 3. Tables 5 and 6 should now be 'pending'
        status, data, _ = self.req('/api/tables')
        self.assertEqual(status, 200)
        self.assertEqual(data['booked']['5'], 'pending')
        self.assertEqual(data['booked']['6'], 'pending')
        self.assertEqual(data['summary']['available'], 59)
        self.assertEqual(data['summary']['pending'], 2)

        # 4. Another user tries to book table 6 -> Conflict 409!
        slip2 = base64.b64encode(b'%PDF-1.4\nvalid-slip-content-2').decode()
        conflict_data = {
            'type': 'tables',
            'name': 'สมหญิง มั่งมี',
            'phone': '0899999999',
            'amount': '2500.00',
            'tables': [6],
            'file': slip2
        }
        status, res, _ = self.req('/api/orders', conflict_data)
        self.assertEqual(status, 409)
        self.assertIn('โต๊ะหมายเลข 6 ถูกจองแล้ว', res['error'])

        # 5. Book shirts with post delivery
        slip3 = base64.b64encode(b'%PDF-1.4\nvalid-slip-content-3').decode()
        shirt_data = {
            'type': 'shirts',
            'name': 'มานะ อดทน',
            'phone': '0823456789',
            'amount': '648.00',
            'delivery': 'post',
            'recipient': 'มานะ อดทน',
            'address': '123 หมู่ 4 ต.พนมไพร อ.พนมไพร จ.ร้อยเอ็ด',
            'postcode': '45140',
            'lines': [
                {'size': 'L', 'qty': 1},
                {'size': 'XL', 'qty': 1}
            ],
            'file': slip3
        }
        status, res_shirt, _ = self.req('/api/orders', shirt_data)
        self.assertEqual(status, 201)
        self.assertEqual(res_shirt['type'], 'shirts')
        ref_shirt = res_shirt['ref']
        self.assertRegex(ref_shirt, r'^[0-9]{6}$')
        self.assertNotEqual(ref_table, ref_shirt)
        token_shirt = res_shirt['token']

        # 6. Check status via /api/status for tables and shirts
        status, st_res, _ = self.req('/api/status', {'ref': ref_table, 'token': token_table})
        self.assertEqual(status, 200)
        self.assertEqual(st_res['status'], 'pending')

        status, st_res, _ = self.req('/api/status', {'ref': ref_shirt, 'token': token_shirt})
        self.assertEqual(status, 200)
        self.assertEqual(st_res['status'], 'pending')

        # 7. Admin login and check orders
        status, _, h = self.req('/api/admin/login', {'password': 'test-admin-long-password-1234'})
        self.assertEqual(status, 200)
        cookie = h['Set-Cookie'].split(';')[0]

        status, orders, _ = self.req('/api/admin/orders', cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(len(orders), 2)
        shirt_order = next(o for o in orders if o['ref'] == ref_shirt)
        self.assertEqual(len(shirt_order['items']), 2)
        self.assertEqual(shirt_order['recipient_name'], 'มานะ อดทน')

        # 8. Admin confirms table order -> status becomes confirmed
        status, _, _ = self.req('/api/admin/order-status', {'ref': ref_table, 'status': 'confirmed'}, cookie=cookie)
        self.assertEqual(status, 200)

        status, data, _ = self.req('/api/tables')
        self.assertEqual(data['booked']['5'], 'confirmed')
        self.assertEqual(data['booked']['6'], 'confirmed')
        self.assertEqual(data['summary']['confirmed'], 2)
        self.assertEqual(data['summary']['pending'], 0)

        # 9. Admin rejects table order -> tables are FREED!
        status, _, _ = self.req('/api/admin/order-status', {'ref': ref_table, 'status': 'rejected'}, cookie=cookie)
        self.assertEqual(status, 200)

        status, data, _ = self.req('/api/tables')
        self.assertNotIn('5', data['booked'])
        self.assertNotIn('6', data['booked'])
        self.assertEqual(data['summary']['available'], 61)

        # 10. Table 6 can now be booked by someone else!
        status, res_rebook, _ = self.req('/api/orders', conflict_data)
        self.assertEqual(status, 201)

if __name__ == '__main__':
    unittest.main()
