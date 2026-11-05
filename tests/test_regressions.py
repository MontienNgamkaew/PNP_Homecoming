"""Regression checks for authoritative pricing, settings, and atomic table ownership."""
import base64
import concurrent.futures
import json
import os
import sqlite3
import subprocess
import sys
import time
import unittest
from http.client import HTTPConnection
import test_orders_and_tables as fixture

class Regressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.TestOrdersAndTables.setUpClass()
        cls.port = fixture.TestOrdersAndTables.port
        cls.data_dir = fixture.TestOrdersAndTables.data_dir

    @classmethod
    def tearDownClass(cls):
        fixture.TestOrdersAndTables.tearDownClass()

    def setUp(self):
        with sqlite3.connect(self.data_dir / 'donations.sqlite3') as c:
            for table in ('table_bookings', 'order_items', 'order_audit', 'orders', 'settings_audit', 'limits'):
                c.execute('DELETE FROM ' + table)
            c.execute('UPDATE app_settings SET config=?, revision=1 WHERE id=1', (json.dumps(dict(shirt=299, table=2500, shipping=50, event='2 มกราคม 2570', qr={})),))
        status, _, headers = self.req('/api/admin/login', {'password':'test-admin-long-password-1234'})
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.serial = 0

    def test_hero_settings_validation_and_save(self):
        draft = self.settings()
        self.assertEqual(draft['hero']['desktopTitle'], 34)
        draft['hero'].update(line1='ยินดีต้อนรับ', mobileTitle=32, description='บรรทัดแรก\nบรรทัดที่สอง')
        self.assertEqual(self.req('/api/admin/settings', draft)[0], 401)
        status, saved, _ = self.req('/api/admin/settings', draft, self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(self.settings()['hero'], draft['hero'])
        for value in (65, 11, True, '32'):
            invalid = {**saved, 'hero': {**saved['hero'], 'desktopTitle': value}}
            self.assertEqual(self.req('/api/admin/settings', invalid, self.cookie)[0], 400)
        self.assertEqual(self.settings()['hero'], draft['hero'])

    def test_new_layout_rejects_vip_and_outside_tables(self):
        for number in (0, 62, 100, 'VIP-1', 'VIP-2'):
            self.assertEqual(self.order(tables=[number])[0], 400)
        self.assertEqual(self.order(tables=[61])[0], 201)

    def test_accounts_are_separate_validated_and_preserve_leading_zero(self):
        draft = self.settings()
        self.assertEqual(draft['accounts']['donate']['number'], '020441298401')
        self.assertEqual(draft['accounts']['fund']['number'], '020441298401')
        draft['accounts']['fund'].update(name='บัญชีกองทุนทดสอบ', number='0012 3456 7890')
        self.assertEqual(self.req('/api/admin/settings', draft)[0], 401)
        status, saved, _ = self.req('/api/admin/settings', draft, self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(saved['accounts']['fund']['number'], '001234567890')
        self.assertEqual(saved['accounts']['donate']['name'], 'ระดมทุนทรัพยากร วก.พนมไพร')
        for number in ('ABC12345', '123', 20441298401):
            bad = {**saved, 'accounts': {**saved['accounts'], 'fund': {**saved['accounts']['fund'], 'number': number}}}
            self.assertEqual(self.req('/api/admin/settings', bad, self.cookie)[0], 400)
        self.assertEqual(self.settings()['accounts'], saved['accounts'])

    def test_table_and_shirt_accounts_are_independent(self):
        draft = self.settings()
        original = draft['accounts']['donate'].copy()
        draft['accounts']['tables'].update(name='บัญชีโต๊ะจีนทดสอบ', number='0011 2233 4455')
        draft['accounts']['shirts'].update(name='บัญชีเสื้อทดสอบ', number='0099 8877 6655')
        status, saved, _ = self.req('/api/admin/settings', draft, self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(saved['accounts']['tables']['number'], '001122334455')
        self.assertEqual(saved['accounts']['shirts']['number'], '009988776655')
        self.assertEqual(saved['accounts']['donate'], original)
        self.assertEqual(self.settings()['accounts'], saved['accounts'])

    def test_admin_filters_and_category_totals(self):
        self.assertEqual(self.req('/api/admin/summary')[0], 401)
        records = {}
        for kind, amount, extra in [('donate','101.25',{}),('fund','202.50',{}),('tables','2500',{'tables':[4]}),('shirts','299',{'lines':[{'size':'M','qty':1}],'delivery':'pickup'})]:
            status, order, _ = self.order(type=kind, amount=amount, **extra)
            self.assertEqual(status, 201)
            records[kind] = order
        self.assertEqual(self.status(records['donate']['ref'], 'confirmed')[0], 200)
        self.assertEqual(self.status(records['tables']['ref'], 'confirmed')[0], 200)
        status, rows, _ = self.req('/api/admin/orders?type=fund&status=pending', cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual([r['ref'] for r in rows], [records['fund']['ref']])
        summary = self.req('/api/admin/summary?type=fund&status=pending', cookie=self.cookie)[1]
        self.assertEqual(summary['total'], 4)
        self.assertEqual(summary['filtered_count'], 1)
        self.assertEqual(summary['filtered_cents'], 20250)
        self.assertEqual(summary['filtered_confirmed_cents'], 0)
        self.assertEqual(summary['by_type']['donate']['confirmed_cents'], 10125)
        self.assertEqual(self.req('/api/admin/orders?type=tables&status=confirmed&q='+records['tables']['ref'], cookie=self.cookie)[1][0]['ref'], records['tables']['ref'])
        self.assertEqual(self.req('/api/admin/orders?type=fund&status=confirmed', cookie=self.cookie)[1], [])
        self.assertEqual(self.req('/api/admin/orders?type=invalid', cookie=self.cookie)[0], 400)
        self.assertEqual(self.req('/api/admin/summary?status=invalid', cookie=self.cookie)[0], 400)

    def test_phone_reference_status_keeps_tickets_private(self):
        status, order, _ = self.order(phone='+66 81 234 5678')
        self.assertEqual(status, 201)
        for phone in ('0812345678', '081-234-5678', '+66 81 234 5678'):
            status, result, _ = self.req('/api/status', dict(ref=order['ref'], phone=phone))
            self.assertEqual(status, 200)
            self.assertEqual(set(result), {'ref','type','amount','status','label'})
            self.assertEqual(result['amount'], 2500)
        wrong = self.req('/api/status', dict(ref=order['ref'], phone='0899999999'))
        missing = self.req('/api/status', dict(ref='999999', phone='0899999999'))
        self.assertEqual((wrong[0], wrong[1]), (missing[0], missing[1]))
        self.assertEqual(wrong[0], 404)
        self.assertEqual(self.req('/api/status', dict(ref=order['ref'], phone='0899999999', token=order['token']))[0], 404)
        self.assertEqual(self.req('/api/ticket', dict(ref=order['ref'], phone='0812345678'))[0], 404)
        self.assertEqual(self.req('/api/ticket', dict(ref=order['ref'], token=order['token']))[0], 200)
        self.assertEqual(set(self.req('/api/status', dict(ref=order['ref'], token=order['token']))[1]), {'status','label'})

    def test_phone_status_lookup_is_rate_limited(self):
        for _ in range(20):
            self.assertEqual(self.req('/api/status', dict(ref='999999', phone='0812345678'))[0], 404)
        self.assertEqual(self.req('/api/status', dict(ref='999999', phone='0812345678'))[0], 429)

    def test_admin_reissues_tickets_without_changing_orders(self):
        for kind in ('tables', 'shirts'):
            status, order, _ = self.order(type=kind, amount='299' if kind=='shirts' else '2500', lines=[{'size':'M','qty':1}], delivery='pickup')
            self.assertEqual(status, 201)
            payload=dict(ref=order['ref'],reason='ผู้จองลืมลิงก์ตั๋ว',verified=True)
            self.assertEqual(self.req('/api/admin/ticket-reissue', payload)[0], 401)
            self.assertEqual(self.req('/api/admin/ticket-reissue', {**payload,'verified':False}, self.cookie)[0], 400)
            with sqlite3.connect(self.data_dir/'donations.sqlite3') as c:
                c.row_factory=sqlite3.Row
                before=dict(c.execute('SELECT * FROM orders WHERE ref=?',(order['ref'],)).fetchone())
            status, result, _ = self.req('/api/admin/ticket-reissue', payload, self.cookie)
            self.assertEqual(status, 200)
            self.assertNotEqual(result['token'], order['token'])
            self.assertEqual(self.req('/api/ticket', dict(ref=order['ref'],token=order['token']))[0],404)
            self.assertEqual(self.req('/api/status', dict(ref=order['ref'],token=order['token']))[0],404)
            self.assertEqual(self.req('/api/ticket', dict(ref=order['ref'],token=result['token']))[0],200)
            self.assertEqual(self.req('/api/status', dict(ref=order['ref'],phone='0800000000'))[0],200)
            with sqlite3.connect(self.data_dir/'donations.sqlite3') as c:
                c.row_factory=sqlite3.Row
                after=dict(c.execute('SELECT * FROM orders WHERE ref=?',(order['ref'],)).fetchone())
                audit=c.execute('SELECT new FROM order_audit WHERE ref=? ORDER BY id DESC LIMIT 1',(order['ref'],)).fetchone()[0]
            self.assertNotEqual(before.pop('secret_hash'), after.pop('secret_hash'))
            self.assertEqual(before, after)
            self.assertEqual(json.loads(audit)['action'],'ticket_reissued')
            self.assertNotIn(result['token'],audit)
            self.assertNotIn(order['token'],audit)
            self.assertEqual(self.status(order['ref'],'rejected')[0],200)
            self.assertEqual(self.req('/api/admin/ticket-reissue',payload,self.cookie)[0],409)
        status, donor, _=self.order(type='donate',amount='100')
        self.assertEqual(self.req('/api/admin/ticket-reissue',dict(ref=donor['ref'],reason='ทดสอบรายการ',verified=True),self.cookie)[0],400)

    def test_settings_revision_probe_tracks_updates(self):
        old = self.settings()
        self.assertEqual(self.req('/api/settings/revision')[1], {'revision':old['revision']})
        draft = {**old, 'table':2600}
        status,saved,_ = self.req('/api/admin/settings',draft,self.cookie)
        self.assertEqual(status,200)
        self.assertEqual(self.req('/api/settings/revision')[1], {'revision':saved['revision']})
        self.assertEqual(self.settings()['table'],2600)

    def req(self, *args, **kwargs):
        return fixture.TestOrdersAndTables.req(self, *args, **kwargs)

    def payload(self, **extra):
        self.serial += 1
        return dict(type='tables', name='Regression test', phone='0800000000', amount='2500', tables=[1],
                    file=base64.b64encode(('%PDF-1.4\nregression-'+str(self.serial)).encode()).decode(), **extra)

    def order(self, **extra):
        payload = self.payload()
        payload.update(extra)
        return self.req('/api/orders', payload)

    def status(self, ref, status):
        return self.req('/api/admin/order-status', dict(ref=ref, status=status), cookie=self.cookie)

    def settings(self):
        return self.req('/api/settings')[1]

    def test_price_is_authoritative(self):
        self.assertEqual(self.order(amount='1')[0], 409)
        self.assertEqual(self.req('/api/tables')[1]['summary']['available'], 61)
        self.assertEqual(self.req('/api/admin/orders', cookie=self.cookie)[1], [])
        lines = [dict(size='L', qty=2)]
        for amount in ('1', '598', '647.99'):
            self.assertEqual(self.order(type='shirts', amount=amount, lines=lines, delivery='post', recipient='Test', address='Test address', postcode='45140')[0], 409)
        self.assertEqual(self.order(type='shirts', amount='648', lines=lines, delivery='post', recipient='Test', address='Test address', postcode='45140')[0], 201)
        self.assertEqual(self.order(type='shirts', amount='598', lines=lines, delivery='pickup')[0], 201)
        self.assertEqual(self.order(type='fund', amount='77.25')[0], 201)
        self.assertEqual(self.order(type='shirts', amount='299', lines=[dict(size='L', qty=1.5)])[0], 400)
        self.assertEqual(self.order(tables=[True])[0], 400)

    def test_settings_persist_and_old_orders_keep_prices(self):
        status, old, _ = self.order(tables=[10])
        self.assertEqual(status, 201)
        draft = self.settings()
        # Genuine 1px PNG, used solely as QR upload fixture.
        qr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
        draft.update(table=2700.50, shirt=320.25, shipping=60.50, qr={'shirts':qr})
        self.assertEqual(self.req('/api/admin/settings', draft)[0], 401)
        status, saved, _ = self.req('/api/admin/settings', draft, cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(saved['revision'], 2)
        self.assertEqual(self.settings(), saved) # unauthenticated, independent request
        self.assertEqual(self.req('/api/admin/settings', draft, cookie=self.cookie)[0], 409)
        self.assertEqual(self.order(tables=[11])[0], 409)
        self.assertEqual(self.order(tables=[11], amount='2700.50')[0], 201)
        self.assertEqual(self.order(type='shirts', amount='701', lines=[dict(size='M', qty=2)], delivery='post', recipient='Test', address='Address', postcode='45140')[0], 201)
        with sqlite3.connect(self.data_dir / 'donations.sqlite3') as c:
            amount, snapshot = c.execute('SELECT amount_cents,pricing_snapshot FROM orders WHERE ref=?', (old['ref'],)).fetchone()
            self.assertEqual(amount, 250000)
            self.assertEqual(json.loads(snapshot)['table_unit_cents'], 250000)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM settings_audit').fetchone()[0], 1)
        h = fixture.TestOrdersAndTables
        h.process.terminate(); h.process.wait()
        h.process = subprocess.Popen([sys.executable, str(fixture.ROOT / 'server.py')], env={**os.environ, 'DATA_DIR':str(self.data_dir), 'ADMIN_PASSWORD':'test-admin-long-password-1234', 'PORT':str(self.port)}, stdout=subprocess.DEVNULL)
        for _ in range(50):
            try:
                if self.settings() == saved: break
            except OSError: pass
            time.sleep(.1)
        else: self.fail('Settings did not survive server restart')
        self.assertEqual(self.settings()['qr']['shirts'], qr)
        self.assertEqual(self.req('/api/status', dict(ref=old['ref'], token=old['token']))[1]['status'], 'pending')

    def test_reactivation_is_atomic_and_reclaims_only_free_tables(self):
        status, old, _ = self.order(tables=[1,2], amount='5000')
        self.assertEqual(status, 201)
        self.assertEqual(self.status(old['ref'], 'rejected')[0], 200)
        status, other, _ = self.order(tables=[2])
        self.assertEqual(status, 201)
        for state in ('pending','confirmed'):
            self.assertEqual(self.status(old['ref'], state)[0], 409)
        booked = self.req('/api/tables')[1]['booked']
        self.assertEqual(booked, {'2':'pending'})
        self.assertEqual(self.req('/api/status',dict(ref=old['ref'],token=old['token']))[1]['status'], 'rejected')
        self.assertEqual(self.status(other['ref'], 'rejected')[0], 200)
        for state in ('confirmed','pending','confirmed'):
            self.assertEqual(self.status(old['ref'], state)[0], 200)
            self.assertEqual(self.req('/api/tables')[1]['booked'], {'1':state, '2':state})

    def test_concurrent_bookings_and_settings(self):
        payloads = [self.payload(), self.payload()]
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            statuses = list(pool.map(lambda p: self.req('/api/orders',p)[0], payloads))
        self.assertEqual(sorted(statuses), [201,409])
        self.assertEqual(self.req('/api/tables')[1]['summary']['pending'], 1)
        a = self.settings(); b = {**a, 'table':2600}
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            statuses = list(pool.map(lambda p:self.req('/api/admin/settings',p,cookie=self.cookie)[0], [a,b]))
        self.assertEqual(sorted(statuses), [200,409])

    def test_invalid_settings_leave_previous_values(self):
        before = self.settings()
        for field, value in [('table',0),('shipping',-1),('shirt','NaN'),('table',12.345),('qr',{'shirts':'data:image/svg+xml;base64,PHN2Zz4='})]:
            self.assertEqual(self.req('/api/admin/settings',{**before,field:value},cookie=self.cookie)[0],400)
            self.assertEqual(self.settings(),before)

    def test_numeric_references_are_unique_and_legacy_tracking_survives(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            payloads = [self.payload(), self.payload()]
            for p in payloads:
                p.update(type='donate', amount='10')
            results = list(pool.map(lambda p:self.req('/api/orders',p), payloads))
        refs = []
        for status, data, _ in results:
            self.assertEqual(status,201)
            self.assertRegex(data['ref'],r'^[0-9]{6}$')
            refs.append(data['ref'])
        self.assertEqual(len(set(refs)),2)
        old = results[0][1]
        with sqlite3.connect(self.data_dir / 'donations.sqlite3') as c:
            c.execute('UPDATE orders SET ref=? WHERE ref=?',('PP-LEGACY123456',old['ref']))
        self.assertEqual(self.req('/api/status',dict(ref='PP-LEGACY123456',token=old['token']))[0],200)
        self.assertEqual(self.order(type='fund',amount='20')[0],201)

    def test_ticket_is_private_and_tracks_current_admission_status(self):
        status, order, _ = self.order(tables=[10,11], amount='5000')
        self.assertEqual(status,201)
        key = dict(ref=order['ref'],token=order['token'])
        self.assertEqual(self.req('/api/ticket',dict(ref=order['ref'],token='wrong'))[0],404)
        status, ticket, _ = self.req('/api/ticket',key)
        self.assertEqual(status,200)
        self.assertEqual(ticket['tables'],[10,11])
        self.assertEqual(ticket['guests'],16)
        self.assertEqual(ticket['amount'],5000)
        self.assertFalse(ticket['admission_valid'])
        self.assertFalse({'phone','token','secret_hash'} & set(ticket))
        self.assertEqual(self.status(order['ref'],'confirmed')[0],200)
        self.assertTrue(self.req('/api/ticket',key)[1]['admission_valid'])
        self.assertEqual(self.status(order['ref'],'rejected')[0],200)
        self.assertFalse(self.req('/api/ticket',key)[1]['admission_valid'])
        _, other, _ = self.order(type='fund',amount='20')
        self.assertEqual(self.req('/api/ticket',dict(ref=other['ref'],token=other['token']))[0],404)

    def test_shirt_ticket_sizes_collection_and_postal_delivery(self):
        lines = [dict(size='XL',qty=2),dict(size='M',qty=1),dict(size='M',qty=2)]
        status, order, _ = self.order(type='shirts',amount='1495',lines=lines,delivery='pickup')
        self.assertEqual(status,201)
        key = dict(ref=order['ref'],token=order['token'])
        self.assertEqual(self.req('/api/ticket',{**key,'token':'wrong'})[0],404)
        status, ticket, _ = self.req('/api/ticket',key)
        self.assertEqual(status,200)
        self.assertEqual(ticket['type'],'shirts')
        self.assertEqual(ticket['items'],[dict(size='M',qty=3),dict(size='XL',qty=2)])
        self.assertEqual(ticket['total_qty'],5)
        self.assertEqual(ticket['amount'],1495)
        self.assertFalse(ticket['collection_valid'])
        self.assertFalse(ticket['payment_confirmed'])
        self.assertFalse({'phone','token','secret_hash','shipping_address','postcode'} & set(ticket))
        self.assertEqual(self.status(order['ref'],'confirmed')[0],200)
        ticket = self.req('/api/ticket',key)[1]
        self.assertTrue(ticket['collection_valid'])
        self.assertTrue(ticket['payment_confirmed'])
        self.assertEqual(self.status(order['ref'],'rejected')[0],200)
        self.assertFalse(self.req('/api/ticket',key)[1]['collection_valid'])
        status, post, _ = self.order(type='shirts',amount='1545',lines=lines,delivery='post',recipient='Postal recipient',address='Test address',postcode='45140')
        self.assertEqual(status,201)
        self.assertEqual(self.status(post['ref'],'confirmed')[0],200)
        postal = self.req('/api/ticket',dict(ref=post['ref'],token=post['token']))[1]
        self.assertEqual(postal['delivery_method'],'post')
        self.assertEqual(postal['recipient_name'],'Postal recipient')
        self.assertEqual(postal['total_qty'],5)
        self.assertFalse(postal['collection_valid'])
        self.assertTrue(postal['payment_confirmed'])

    def test_posters_upload_limits_delete_and_restart(self):
        status, initial, _ = self.req('/api/posters')
        self.assertEqual(status,200)
        self.assertEqual(len(initial),2)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=')
        payload = dict(action='add',title='Poster test',file=base64.b64encode(png).decode())
        self.assertEqual(self.req('/api/admin/posters',payload)[0],401)
        self.assertEqual(self.req('/api/admin/posters',{**payload,'file':base64.b64encode(b'<svg></svg>').decode()},cookie=self.cookie)[0],400)
        exact = png + b'\0' * (5*1024*1024-len(png))
        status, added, _ = self.req('/api/admin/posters',{**payload,'file':base64.b64encode(exact).decode()},cookie=self.cookie)
        self.assertEqual(status,201)
        status, raw, headers = self.req(added['url'])
        self.assertEqual(status,200)
        self.assertEqual(len(raw),5*1024*1024)
        self.assertEqual(headers['Content-Type'],'image/png')
        self.assertEqual(self.req('/api/admin/posters',{**payload,'file':base64.b64encode(exact+b'1').decode()},cookie=self.cookie)[0],400)
        self.assertEqual(self.req('/api/admin/posters',dict(action='delete',id=added['id']))[0],401)
        # Uploaded images survive a backend restart.
        h=fixture.TestOrdersAndTables
        h.process.terminate();h.process.wait()
        h.process=subprocess.Popen([sys.executable,str(fixture.ROOT/'server.py')],env={**os.environ,'DATA_DIR':str(self.data_dir),'ADMIN_PASSWORD':'test-admin-long-password-1234','PORT':str(self.port)},stdout=subprocess.DEVNULL)
        for _ in range(50):
            try:
                if self.req('/api/posters')[0]==200:break
            except OSError:pass
            time.sleep(.1)
        else:self.fail('Poster server did not restart')
        self.assertIn(added['id'],[p['id'] for p in self.req('/api/posters')[1]])
        _,_,headers=self.req('/api/admin/login',{'password':'test-admin-long-password-1234'})
        self.cookie=headers['Set-Cookie'].split(';')[0]
        for poster in self.req('/api/posters')[1]:
            self.assertEqual(self.req('/api/admin/posters',dict(action='delete',id=poster['id']),cookie=self.cookie)[0],200)
            self.assertEqual(self.req(poster['url'])[0],404)
        self.assertEqual(self.req('/api/posters')[1],[])
        # Re-running initialization must not resurrect deleted default posters.
        with sqlite3.connect(self.data_dir/'donations.sqlite3') as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM posters WHERE deleted_at IS NOT NULL').fetchone()[0],3)
