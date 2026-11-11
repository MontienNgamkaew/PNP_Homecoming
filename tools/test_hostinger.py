"""Integration tests against disposable MySQL + PHP. Requires PORTAL_MYSQL_SOCKET.
Creates uniquely named databases, never uses the application's existing databases.
Run: PORTAL_MYSQL_SOCKET=/private/tmp/.../mysql.sock python3 tools/test_hostinger.py
"""
import base64, concurrent.futures, http.client, json, os, pathlib, socket, subprocess, tempfile, time, unittest, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Hostinger(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(prefix='portal-php-tests-');cls.folder=pathlib.Path(cls.tmp.name)
  cls.socket=os.environ['PORTAL_MYSQL_SOCKET'];cls.password=os.environ.get('PORTAL_MYSQL_PASSWORD','');cls.name='portal_test_'+uuid.uuid4().hex[:12]
  cls.sql('CREATE DATABASE '+cls.name+' CHARACTER SET utf8mb4')
  with socket.socket() as s:s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1]
  cls.config=cls.folder/'config.php'
  password_hash=subprocess.check_output(['php','-r',"echo password_hash('test-admin-long-password-1234', PASSWORD_DEFAULT);"],text=True)
  cls.config.write_text("<?php return "+"['dsn'=>"+repr('mysql:unix_socket='+cls.socket+';dbname='+cls.name+';charset=utf8mb4')+",'db_user'=>'root','db_password'=>"+repr(cls.password)+",'origin'=>'http://127.0.0.1:"+str(cls.port)+"','admin_password_hash'=>"+repr(password_hash)+",'secure_cookie'=>false];")
  cls.env={**os.environ,'PORTAL_CONFIG':str(cls.config),'PORTAL_LIB':str(ROOT/'hostinger/lib.php'),'PHP_CLI_SERVER_WORKERS':'4'}
  subprocess.run(['php',str(ROOT/'hostinger/install.php'),str(ROOT/'prototype/assets')],env=cls.env,check=True,stdout=subprocess.DEVNULL)
  cls.log=open(cls.folder/'php.log','w')
  cls.process=subprocess.Popen(['php','-S','127.0.0.1:'+str(cls.port),'-t',str(ROOT/'prototype'),str(ROOT/'tools/php_router.php')],env=cls.env,stdout=cls.log,stderr=cls.log,start_new_session=True)
  for _ in range(80):
   try:
    if cls.request('/api/settings')[0]==200:break
   except OSError:pass
   time.sleep(.1)
  else:raise RuntimeError('PHP server failed: '+(cls.folder/'php.log').read_text())
 @classmethod
 def sql(cls,sql,database=None):
  args=['mysql','--no-defaults','--socket='+cls.socket,'-uroot','--batch','--skip-column-names']
  if database:args.append(database)
  return subprocess.check_output(args,input=sql,text=True,env={**os.environ,'MYSQL_PWD':cls.password})
 @classmethod
 def request(cls,path,data=None,cookie=None,origin=None):
  conn=http.client.HTTPConnection('127.0.0.1',cls.port,timeout=20);headers={'Content-Type':'application/json','Origin':origin or 'http://127.0.0.1:'+str(cls.port)}
  if cookie:headers['Cookie']=cookie
  conn.request('GET' if data is None else 'POST',path,None if data is None else json.dumps(data),headers);r=conn.getresponse();body=r.read();mime=r.getheader('Content-Type','');result=json.loads(body) if 'application/json' in mime else body;headers=dict(r.getheaders());conn.close();return r.status,result,headers
 @classmethod
 def tearDownClass(cls):
  import signal
  os.killpg(cls.process.pid,signal.SIGTERM);cls.process.wait();cls.log.close();cls.sql('DROP DATABASE '+cls.name);cls.tmp.cleanup()
 def setUp(self):
  self.sql('DELETE FROM limits;',self.name)
  status,_,h=self.request('/api/admin/login',{'password':'test-admin-long-password-1234'});self.assertEqual(status,200);self.cookie=h['Set-Cookie'].split(';')[0]
 def payload(self,**extra):
  result=dict(type='tables',name='ผู้ทดสอบ ระบบ',phone='0812345678',amount='2500',tables=[30],file=base64.b64encode(('%PDF-1.4\n'+uuid.uuid4().hex).encode()).decode());result.update(extra);return result
 def post(self,path,data):return self.request(path,data,self.cookie)
 def test_01_auth_settings_hero_live_mode(self):
  self.assertEqual(self.request('/api/admin/orders')[0],401)
  self.assertEqual(self.request('/api/admin/settings',{})[0],401)
  self.assertEqual(self.request('/api/admin/login',{'password':'bad'},origin='https://evil.example')[0],403)
  status,c,_=self.request('/api/settings');self.assertEqual(status,200);self.assertFalse(c['payment_live']);c['hero']['desktopTitle']=40
  self.assertEqual(self.post('/api/admin/settings',c)[0],200)
  self.assertEqual(self.post('/api/admin/settings',c)[0],409)
  c=self.request('/api/settings')[1];c['hero']['desktopTitle']=True;self.assertEqual(self.post('/api/admin/settings',c)[0],400)
  c=self.request('/api/settings')[1];c['payment_live']=True;self.assertEqual(self.post('/api/admin/settings',c)[0],400)
  c=self.request('/api/settings')[1];c['hero']['desktopTitle']=34;self.assertEqual(self.post('/api/admin/settings',c)[0],200)
 def test_02_pricing_shirts_tokens_and_ticket(self):
  self.assertEqual(self.request('/api/orders',self.payload(amount='1'))[0],409)
  data=self.payload(type='shirts',amount='648',lines=[dict(size='L',qty=2)],delivery='post',recipient='ผู้รับ ทดสอบ',address='ที่อยู่ทดสอบ 123',postcode='45140')
  status,order,_=self.request('/api/orders',data);self.assertEqual(status,201,order)
  self.assertRegex(order['ref'],r'^\d{6}$');self.assertEqual(self.request('/api/orders',data)[0],409)
  ticket=self.request('/api/ticket',{'ref':order['ref'],'token':order['token']})[1];self.assertEqual(ticket['total_qty'],2);self.assertFalse(ticket['collection_valid']);self.assertNotIn('shipping_address',ticket)
  self.assertEqual(self.request('/api/ticket',{'ref':order['ref'],'token':'invalid'})[0],404)
  self.assertEqual(self.post('/api/admin/order-status',{'ref':order['ref'],'status':'confirmed'})[0],200)
  self.assertEqual(self.post('/api/admin/redeem',{'ref':order['ref']})[0],409)
 def test_03_concurrent_booking_and_atomic_reactivation(self):
  def reserve(_):return self.request('/api/orders',self.payload(tables=[11]))
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:results=list(ex.map(reserve,range(4)))
  self.assertEqual(sorted(r[0] for r in results),[201,409,409,409],results)
  first=next(r[1] for r in results if r[0]==201)
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=first['ref'],status='rejected'))[0],200)
  second=self.request('/api/orders',self.payload(tables=[11]))[1]
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=first['ref'],status='confirmed'))[0],409)
  self.assertEqual(self.request('/api/tables')[1]['booked']['11'],'pending')
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=second['ref'],status='confirmed'))[0],200)
 def test_04_edits_rollback_and_redemption(self):
  status,order,_=self.request('/api/orders',self.payload(tables=[20]));self.assertEqual(status,201)
  status,other,_=self.request('/api/orders',self.payload(tables=[21]));self.assertEqual(status,201)
  edit=dict(ref=order['ref'],name='แก้ไข ชื่อ',phone='0899999999',tables=[21],amount='2500',reason='แก้ไขทดสอบ')
  self.assertEqual(self.post('/api/admin/order-edit',edit)[0],409)
  self.assertEqual(self.request('/api/tables')[1]['booked']['20'],'pending')
  edit['tables']=[22];self.assertEqual(self.post('/api/admin/order-edit',edit)[0],200)
  self.assertNotIn('20',self.request('/api/tables')[1]['booked'])
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=order['ref'],status='confirmed'))[0],200)
  self.assertEqual(self.post('/api/admin/redeem',dict(ref=order['ref']))[0],200)
  self.assertEqual(self.post('/api/admin/redeem',dict(ref=order['ref']))[0],409)
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=order['ref'],status='rejected'))[0],409)
  self.assertEqual(self.post('/api/admin/order-edit',edit)[0],409)
 def test_05_real_images_limit_blessing_and_logout(self):
  raw=(ROOT/'prototype/assets/poster-compact-v1.png').read_bytes();encoded=base64.b64encode(raw).decode()
  status,p,_=self.post('/api/admin/posters',dict(action='add',title='ทดสอบโปสเตอร์',file=encoded));self.assertEqual(status,201,p)
  code,compressed,headers=self.request(p['url']);self.assertEqual(code,200);self.assertLess(len(compressed),len(raw));self.assertLessEqual(len(compressed),600*1024);self.assertEqual(headers['Content-Type'],'image/webp')
  self.assertEqual(self.post('/api/admin/posters',dict(action='delete',id=p['id']))[0],200)
  self.assertEqual(self.request(p['url'])[0],404)
  self.assertEqual(self.post('/api/admin/posters',dict(action='add',title='ใหญ่เกิน',file=base64.b64encode(b'x'*(5*1024*1024+1)).decode()))[0],400)
  self.assertEqual(self.post('/api/admin/posters',dict(action='add',title='ไฟล์ปลอม',file=base64.b64encode(b'\x89PNG\r\n\x1a\nfake').decode()))[0],400)
  msg="คำอวยพร ' \\ <script>";status,b,_=self.post('/api/admin/blessings',dict(action='add',message=msg));self.assertEqual(status,201)
  self.assertEqual(self.post('/api/admin/blessings',dict(action='toggle',id=b['id'],active=0))[0],200)
  self.assertEqual(self.post('/api/admin/logout',{})[0],200);self.assertEqual(self.request('/api/admin/orders',cookie=self.cookie)[0],401)
 def test_06_summary_pagination_and_backup_restore(self):
  before=self.request('/api/admin/summary',cookie=self.cookie)[1]
  # More than old 500-row limit; fixtures inserted only into this disposable DB.
  values=','.join("('fixture-%d','%s','donate','ทดสอบ','0800000000',100,'2026-11-05','','','%s','application/pdf','slip','confirmed',%d,'{}')"%(n,'0'*64,('%064x'%n),n) for n in range(501))
  self.sql('INSERT INTO orders(ref,secret_hash,type,name,phone,amount_cents,transferred,tables_list,category,digest,mime,slip,status,created,pricing_snapshot) VALUES '+values,self.name)
  summary=self.request('/api/admin/summary',cookie=self.cookie)[1];self.assertEqual(summary['total'],before['total']+501);self.assertEqual(summary['confirmed_cents'],before['confirmed_cents']+50100)
  self.assertEqual(len(self.request('/api/admin/orders?page=2',cookie=self.cookie)[1]),100)
  self.assertEqual(self.request('/api/admin/summary?q=fixture-',cookie=self.cookie)[1]['filtered_count'],501)
  self.assertEqual(len(self.request('/api/admin/orders?q=fixture-500',cookie=self.cookie)[1]),1)
  backup=self.folder/'backup.json';subprocess.run(['php',str(ROOT/'hostinger/backup.php'),str(backup)],env=self.env,check=True,stdout=subprocess.DEVNULL)
  restoredb=self.name+'_restore';self.sql('CREATE DATABASE '+restoredb+' CHARACTER SET utf8mb4')
  original=self.config.read_text();restoreconfig=self.folder/'restore.php';restoreconfig.write_text(original.replace('dbname='+self.name+';','dbname='+restoredb+';'));env={**self.env,'PORTAL_CONFIG':str(restoreconfig)}
  try:
   result=subprocess.run(['php',str(ROOT/'hostinger/restore.php'),str(backup),'--confirm-empty'],env=env,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
   self.assertEqual(int(self.sql('SELECT COUNT(*) FROM orders',restoredb)),summary['total'])
   self.assertEqual(self.sql('SELECT SUM(amount_cents) FROM orders',restoredb),self.sql('SELECT SUM(amount_cents) FROM orders',self.name))
   self.assertEqual(self.sql('SELECT SHA2(image,256) FROM posters ORDER BY id',restoredb),self.sql('SELECT SHA2(image,256) FROM posters ORDER BY id',self.name))
   result=subprocess.run(['php',str(ROOT/'hostinger/restore.php'),str(backup),'--confirm-empty'],env=env,capture_output=True);self.assertNotEqual(result.returncode,0)
  finally:self.sql('DROP DATABASE '+restoredb)
 def test_07_rate_limit(self):
  for _ in range(9):self.assertEqual(self.request('/api/admin/login',dict(password='wrong'))[0],401)
  self.assertEqual(self.request('/api/admin/login',dict(password='wrong'))[0],429)
 def test_08_sqlite_migration_preserves_legacy(self):
  import sqlite3, hashlib
  legacy=self.folder/'legacy';legacy.mkdir()
  subprocess.run(['python3','-c','import server; server.init()'],cwd=ROOT,env={**os.environ,'DATA_DIR':str(legacy)},check=True)
  path=legacy/'donations.sqlite3';token='legacy-private-token';slip=b'%PDF-1.4 legacy preserved'
  with sqlite3.connect(path) as connection:
   connection.execute('INSERT INTO donations(ref,secret_hash,name,cents,transferred,contact,digest,mime,slip,status,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)',('PP-OLD-1',hashlib.sha256(token.encode()).hexdigest(),'ผู้บริจาคเดิม',12345,'2026-11-05T09:00','legacy-contact@example.invalid',hashlib.sha256(slip).hexdigest(),'application/pdf',slip,'approved',123))
  exported=self.folder/'migration.json';subprocess.run(['python3',str(ROOT/'tools/export_sqlite.py'),str(path),str(exported)],check=True,stdout=subprocess.DEVNULL)
  target=self.name+'_migration';self.sql('CREATE DATABASE '+target+' CHARACTER SET utf8mb4');config=self.folder/'migration-config.php';config.write_text(self.config.read_text().replace('dbname='+self.name+';','dbname='+target+';'))
  env={**self.env,'PORTAL_CONFIG':str(config)}
  try:
   result=subprocess.run(['php',str(ROOT/'hostinger/restore.php'),str(exported),'--confirm-empty'],env=env,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
   self.assertEqual(self.sql("SELECT amount_cents,status,phone FROM orders WHERE ref='PP-OLD-1'",target).strip(),'12345\tconfirmed\tlegacy-contact@example.invalid')
   self.assertEqual(self.sql("SELECT SHA2(slip,256) FROM orders WHERE ref='PP-OLD-1'",target).strip(),hashlib.sha256(slip).hexdigest())
   subprocess.run(['php',str(ROOT/'hostinger/install.php'),str(ROOT/'prototype/assets')],env=env,check=True,stdout=subprocess.DEVNULL)
   self.assertEqual(self.sql('SELECT COUNT(*) FROM orders',target).strip(),'1')
  finally:self.sql('DROP DATABASE '+target)
 def test_09_release_archive_layout(self):
  import zipfile, hashlib
  archive=self.folder/'release.zip';subprocess.run(['python3',str(ROOT/'tools/build_hostinger.py'),'--output',str(archive)],check=True,stdout=subprocess.DEVNULL)
  destination=self.folder/'unpacked'
  with zipfile.ZipFile(archive) as z:
   self.assertIsNone(z.testzip());names=z.namelist();self.assertFalse(any(n.endswith('/config.php') or 'node_modules' in n or '.sqlite' in n for n in names));manifest=json.loads(z.read('release-manifest.json'))
   for name,digest in manifest.items():self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),digest)
   for name in ['index.html','theme.css','app.js']:
    self.assertEqual(z.read('public_html/'+name),(ROOT/'prototype'/name).read_bytes())
   z.extractall(destination)
  router=destination/'router.php';router.write_text("<?php if(str_starts_with(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),'/api/')){require __DIR__.'/public_html/api.php';return true;} return false;")
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  env={**self.env};env.pop('PORTAL_LIB',None);env.pop('PHP_CLI_SERVER_WORKERS',None)
  process=subprocess.Popen(['php','-S','127.0.0.1:'+str(port),'-t',str(destination/'public_html'),str(router)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  try:
   for _ in range(40):
    try:
     conn=http.client.HTTPConnection('127.0.0.1',port,timeout=2);conn.request('GET','/api/settings');response=conn.getresponse();data=json.loads(response.read());conn.close();break
    except OSError:time.sleep(.1)
   else:self.fail('Packaged API did not start')
   self.assertEqual(response.status,200,data);self.assertEqual(data['backend'],'php')
   conn=http.client.HTTPConnection('127.0.0.1',port,timeout=3);conn.request('GET','/api/admin/orders',headers={'Cookie':self.cookie});response=conn.getresponse();response.read();conn.close();self.assertEqual(response.status,200)
  finally:process.terminate();process.wait()
 def test_10_legacy_price_corrections_keep_totals(self):
  status,order,_=self.request('/api/orders',self.payload(tables=[50]));self.assertEqual(status,201)
  self.sql("UPDATE orders SET pricing_snapshot='{}',amount_cents=230000 WHERE ref='"+order['ref']+"'",self.name)
  edit=dict(ref=order['ref'],name='แก้ชื่อรายการเก่า',phone='0800000000',tables=[50],amount='2300',reason='แก้ชื่อเท่านั้น')
  status,result,_=self.post('/api/admin/order-edit',edit);self.assertEqual(status,200,result);self.assertEqual(result['amount_cents'],230000)
  edit['tables']=[51];self.assertEqual(self.post('/api/admin/order-edit',edit)[0],409)
  status,shirt,_=self.request('/api/orders',self.payload(type='shirts',amount='598',lines=[dict(size='L',qty=1),dict(size='M',qty=1)],delivery='pickup'));self.assertEqual(status,201)
  self.sql("UPDATE orders SET pricing_snapshot='{}',amount_cents=55000 WHERE ref='"+shirt['ref']+"'",self.name)
  edit=dict(ref=shirt['ref'],name='แก้ชื่อเสื้อเก่า',phone='0800000000',amount='550',lines=[dict(size='M',qty=1),dict(size='L',qty=1)],delivery='pickup',reason='รักษายอดเดิม')
  status,result,_=self.post('/api/admin/order-edit',edit);self.assertEqual(status,200,result);self.assertEqual(result['amount_cents'],55000)
  edit['lines'][0]['qty']=2;self.assertEqual(self.post('/api/admin/order-edit',edit)[0],409)
  edit.update(reprice=True,amount='897');self.assertEqual(self.post('/api/admin/order-edit',edit)[0],200)
 def test_11_layout_boundaries_and_vip_closed(self):
  self.assertEqual(self.request('/api/tables')[1]['summary']['total'],61)
  for table in (0,62,100,'VIP-1','VIP-2'):
   self.assertEqual(self.request('/api/orders',self.payload(tables=[table]))[0],400)
  self.assertEqual(self.request('/api/orders',self.payload(tables=[61]))[0],201)
 def test_12_category_and_status_filters(self):
  records={}
  for kind,amount,extra in [('donate','101.25',{}),('fund','202.50',{}),('tables','2500',{'tables':[4]}),('shirts','299',{'lines':[{'size':'M','qty':1}],'delivery':'pickup'})]:
   status,order,_=self.request('/api/orders',self.payload(type=kind,amount=amount,**extra));self.assertEqual(status,201,order);records[kind]=order
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=records['donate']['ref'],status='confirmed'))[0],200)
  rows=self.request('/api/admin/orders?type=fund&status=pending',cookie=self.cookie)[1];self.assertTrue(all(r['type']=='fund' and r['status']=='pending' for r in rows));self.assertIn(records['fund']['ref'],[r['ref'] for r in rows])
  summary=self.request('/api/admin/summary?type=donate&status=confirmed&q='+records['donate']['ref'],cookie=self.cookie)[1];self.assertEqual(summary['filtered_count'],1);self.assertEqual(summary['filtered_confirmed_cents'],10125);self.assertIn('shirts',summary['by_type'])
  self.assertEqual(self.request('/api/admin/orders?type=invalid',cookie=self.cookie)[0],400)
  self.assertEqual(self.request('/api/admin/summary?status=invalid',cookie=self.cookie)[0],400)
 def test_13_phone_lookup_and_ticket_privacy(self):
  status,order,_=self.request('/api/orders',self.payload(phone='+66 81 234 5678'));self.assertEqual(status,201)
  for phone in ['0812345678','081-234-5678','+66 81 234 5678']:
   status,result,_=self.request('/api/status',dict(ref=order['ref'],phone=phone));self.assertEqual(status,200,result);self.assertEqual(set(result),{'ref','type','amount','status','label'})
  wrong=self.request('/api/status',dict(ref=order['ref'],phone='0899999999'));missing=self.request('/api/status',dict(ref='999999',phone='0899999999'));self.assertEqual(wrong[:2],missing[:2]);self.assertEqual(wrong[0],404)
  self.assertNotEqual(self.request('/api/ticket',dict(ref=order['ref'],phone='0812345678'))[0],200)
  self.assertEqual(self.request('/api/ticket',dict(ref=order['ref'],token=order['token']))[0],200)
  self.assertEqual(set(self.request('/api/status',dict(ref=order['ref'],token=order['token']))[1]),{'status','label'})
  self.sql('DELETE FROM limits',self.name)
  for _ in range(20):self.assertEqual(self.request('/api/status',dict(ref='999999',phone='0812345678'))[0],404)
  self.assertEqual(self.request('/api/status',dict(ref='999999',phone='0812345678'))[0],429)
 def test_14_admin_ticket_reissue(self):
  for kind in ['tables','shirts']:
   status,order,_=self.request('/api/orders',self.payload(tables=[32],type=kind,amount='299' if kind=='shirts' else '2500',lines=[dict(size='M',qty=1)],delivery='pickup'));self.assertEqual(status,201)
   payload=dict(ref=order['ref'],reason='ผู้จองลืมลิงก์',verified=True)
   self.assertEqual(self.request('/api/admin/ticket-reissue',payload)[0],401)
   self.assertEqual(self.post('/api/admin/ticket-reissue',{**payload,'verified':False})[0],400)
   before=self.request('/api/admin/orders?q='+order['ref'],cookie=self.cookie)[1]
   status,result,_=self.post('/api/admin/ticket-reissue',payload);self.assertEqual(status,200,result)
   self.assertEqual(self.request('/api/ticket',dict(ref=order['ref'],token=order['token']))[0],404)
   self.assertEqual(self.request('/api/ticket',dict(ref=order['ref'],token=result['token']))[0],200)
   self.assertEqual(self.request('/api/status',dict(ref=order['ref'],phone='0812345678'))[0],200)
   self.assertEqual(self.request('/api/admin/orders?q='+order['ref'],cookie=self.cookie)[1],before)
   audit=self.sql("SELECT new FROM order_audit WHERE ref='"+order['ref']+"' ORDER BY id DESC LIMIT 1",self.name);self.assertIn('ticket_reissued',audit);self.assertNotIn(result['token'],audit)
   self.assertEqual(self.post('/api/admin/order-status',dict(ref=order['ref'],status='confirmed'))[0],200)
   self.assertEqual(self.post('/api/admin/redeem',dict(ref=order['ref']))[0],200)
   self.assertEqual(self.post('/api/admin/ticket-reissue',payload)[0],409)
  status,cancelled,_=self.request('/api/orders',self.payload(tables=[31]));self.assertEqual(status,201)
  self.post('/api/admin/order-status',dict(ref=cancelled['ref'],status='rejected'))
  self.assertEqual(self.post('/api/admin/ticket-reissue',dict(ref=cancelled['ref'],reason='ยกเลิกแล้ว',verified=True))[0],409)
 def test_15_preflight_and_production_configuration(self):
  before=self.sql('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM orders',self.name)
  result=subprocess.run(['php',str(ROOT/'hostinger/check.php')],env=self.env,capture_output=True,text=True)
  self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  self.assertIn('PASS Four account settings',result.stdout)
  self.assertEqual(self.sql('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM orders',self.name),before)
  self.assertNotIn('test-admin-long-password-1234',result.stdout+result.stderr)
  for origin,secure,valid in [('http://example.com',False,False),('https://example.com',False,False),('https://user@example.com',True,False),('https://example.com#fragment',True,False),('https://example.com',True,True)]:
   config=self.folder/('origin-'+uuid.uuid4().hex+'.php');config.write_text("<?php return ['origin'=>"+repr(origin)+",'secure_cookie'=>"+('true' if secure else 'false')+"];")
   env={**self.env,'PORTAL_CONFIG':str(config)}
   code='require '+json.dumps(str(ROOT/'hostinger/lib.php'))+'; try {config();exit(0);} catch(Throwable $e){exit(3);}'
   result=subprocess.run(['php','-r',code],env=env,capture_output=True)
   self.assertEqual(result.returncode,0 if valid else 3,origin)
 def test_16_lightweight_settings_revision(self):
  settings=self.request('/api/settings')[1];status,revision,_=self.request('/api/settings/revision');self.assertEqual(status,200);self.assertEqual(revision,{'revision':settings['revision']})
  settings['hero']['eyebrow']='ตรวจเลขรุ่น';status,saved,_=self.post('/api/admin/settings',settings);self.assertEqual(status,200)
  self.assertEqual(self.request('/api/settings/revision')[1],{'revision':saved['revision']})
  self.assertLess(len(json.dumps(revision)),40)
 def test_17_public_confirmed_totals(self):
  before=self.request('/api/totals')[1]
  self.assertEqual(set(before),{'by_type','total_cents','updated_at'})
  self.assertEqual(set(before['by_type']),{'donate','fund','tables','shirts'})
  refs=[]
  for kind,amount,status in [('donate','123.45','confirmed'),('fund','456.78','confirmed'),('shirts','299','pending'),('donate','999','rejected')]:
   data=self.payload(type=kind,amount=amount,tables=[])
   if kind=='shirts':data.update(lines=[dict(size='M',qty=1)],delivery='pickup')
   code,order,_=self.request('/api/orders',data);self.assertEqual(code,201,order);refs.append(order['ref'])
   if status!='pending':self.assertEqual(self.post('/api/admin/order-status',{'ref':order['ref'],'status':status})[0],200)
  try:
   response=self.request('/api/totals');self.assertEqual(response[0],200)
   result=response[1]
   self.assertEqual(result['by_type']['donate']-before['by_type']['donate'],12345)
   self.assertEqual(result['by_type']['fund']-before['by_type']['fund'],45678)
   self.assertEqual(result['by_type']['shirts'],before['by_type']['shirts'])
   self.assertEqual(result['total_cents']-before['total_cents'],58023)
   self.assertEqual(result['total_cents'],sum(result['by_type'].values()))
   self.assertEqual(response[2]['Cache-Control'],'no-store')
  finally:
   for ref in refs:self.sql("DELETE FROM order_items WHERE order_ref='"+ref+"'; DELETE FROM order_audit WHERE ref='"+ref+"'; DELETE FROM orders WHERE ref='"+ref+"'",self.name)
 def test_18_shirt_image_settings(self):
  image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII='
  original=self.request('/api/settings')[1]
  data=dict(original,shirt_image=image,qr={**original['qr'],'donate':image})
  status,saved,_=self.post('/api/admin/settings',data);self.assertEqual(status,200,saved)
  self.assertEqual(self.request('/api/settings')[1]['shirt_image'],image)
  self.assertEqual(saved['qr']['donate'],image)
  for value in ['javascript:alert(1)','data:image/jpeg;base64,'+image.split(',')[1], 'data:image/png;base64,'+base64.b64encode(b'x'*(1024*1024+1)).decode()]:
   data=dict(saved,shirt_image=value);self.assertEqual(self.post('/api/admin/settings',data)[0],400)
  data=dict(saved,shirt_image='');status,reset,_=self.post('/api/admin/settings',data);self.assertEqual(status,200);self.assertEqual(reset['shirt_image'],'')
  original['revision']=reset['revision'];self.assertEqual(self.post('/api/admin/settings',original)[0],200)
 def test_19_cash_receipts(self):
  def cash(**extra):
   d=dict(request_id=uuid.uuid4().hex,type='donate',name='ไม่ประสงค์ออกนาม',phone='',amount='120.50',collector='ผู้รับเงิน ทดสอบ',received_date='2026-01-01',note='รับที่วิทยาลัย');d.update(extra);return d
  data=cash();self.assertEqual(self.request('/api/admin/cash-receipt',data)[0],401)
  before=self.request('/api/totals')[1]['total_cents'];count=int(self.sql('SELECT COUNT(*) FROM orders',self.name))
  status,r,_=self.post('/api/admin/cash-receipt',data);self.assertEqual(status,200,r);ref=r['ref'];self.assertEqual(r['status'],'pending')
  self.assertEqual(self.post('/api/admin/cash-receipt',data)[1]['ref'],ref);self.assertEqual(int(self.sql('SELECT COUNT(*) FROM orders',self.name)),count+1)
  self.assertEqual(self.request('/api/totals')[1]['total_cents'],before)
  order=self.request('/api/admin/cash-order?ref='+ref,cookie=self.cookie)[1];self.assertEqual(order['payment_method'],'cash');self.assertEqual(order['phone'],'');self.assertFalse(order['has_slip']);self.assertNotIn('request_id',order['cash_receipt'])
  self.assertEqual(self.request('/api/admin/order-slip/'+ref,cookie=self.cookie)[0],404)
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=ref,status='confirmed'))[0],200)
  self.assertEqual(self.request('/api/totals')[1]['total_cents'],before+12050)
  edit=cash(ref=ref,edit_receipt=True,reason='แก้ชื่อผู้รับเงิน',collector='ชื่อผู้รับ แก้ไข');self.assertEqual(self.post('/api/admin/cash-receipt',edit)[0],200)
  update=dict(ref=ref,name='ผู้บริจาค แก้ไข',phone='',amount='120.50',reason='แก้ชื่อผู้บริจาค');self.assertEqual(self.post('/api/admin/order-edit',update)[0],200)
  order=self.request('/api/admin/cash-order?ref='+ref,cookie=self.cookie)[1];self.assertEqual(order['cash_receipt']['collector'],'ชื่อผู้รับ แก้ไข')
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(ref=ref))[0],409)
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(received_date='2099-01-01'))[0],400)
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(amount='-5'))[0],400)
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(collector=''))[0],400)
  # Existing table booking is converted in place; no second booking or payment.
  code,booking,_=self.request('/api/orders',self.payload(tables=[46]));self.assertEqual(code,201,booking)
  linked=cash(ref=booking['ref'],amount='2500');self.assertEqual(self.post('/api/admin/cash-receipt',linked)[0],200)
  self.assertEqual(self.post('/api/admin/cash-receipt',linked)[0],200)
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(ref=booking['ref'],amount='2500'))[0],409)
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(type='tables',phone='0812345678',tables=[46],amount='2500'))[0],409)
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(type='tables',phone='0812345678',tables=[47],amount='2500'))[0],200)
  code,shirt,_=self.post('/api/admin/cash-receipt',cash(type='shirts',phone='0812345678',lines=[dict(size='XL',qty=2)],delivery='pickup',amount='598'));self.assertEqual(code,200,shirt)
  self.assertEqual(self.post('/api/admin/order-status',dict(ref=shirt['ref'],status='confirmed'))[0],200)
  reissued=self.post('/api/admin/ticket-reissue',dict(ref=shirt['ref'],reason='มอบตั๋วผู้จอง',verified=True))[1]
  self.assertTrue(self.request('/api/ticket',dict(ref=shirt['ref'],token=reissued['token']))[1]['collection_valid'])
  self.assertEqual(self.post('/api/admin/cash-receipt',cash(type='fund',amount='10'))[0],200)
  summary=self.request('/api/admin/summary',cookie=self.cookie)[1];self.assertEqual(summary['confirmed_cents'],sum(summary['by_payment'].values()))
  self.assertGreaterEqual(summary['by_payment']['cash_cents'],12050+59800)
  self.assertGreaterEqual(int(self.sql("SELECT COUNT(*) FROM order_audit WHERE ref='"+ref+"'",self.name)),4)
 def test_20_slip_inline_preview(self):
  for raw,mime in [(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII='),'image/png'),(b'%PDF-1.4 preview'+uuid.uuid4().hex.encode(),'application/pdf')]:
   status,order,_=self.request('/api/orders',self.payload(type='donate',tables=[],amount='100',file=base64.b64encode(raw).decode()));self.assertEqual(status,201,order)
   path='/api/admin/order-slip/'+order['ref'];self.assertEqual(self.request(path)[0],401)
   status,body,headers=self.request(path,cookie=self.cookie);self.assertEqual(status,200);self.assertEqual(body,raw)
   self.assertTrue(headers['Content-Disposition'].startswith('inline;'))
   self.assertEqual(headers['Content-Type'],mime);self.assertEqual(headers['Cache-Control'],'no-store')
   self.assertEqual(headers['X-Frame-Options'],'DENY')
 def test_21_admin_latest_ticket_matches_holder(self):
  self.assertEqual(self.request('/api/admin/ticket?ref=100000')[0],401)
  for payment in ['cash','transfer']:
   for kind in ['tables','shirts']:
    extra={'tables':[55 if payment=='cash' else 56]} if kind=='tables' else {'lines':[{'size':'L','qty':2}],'delivery':'pickup'}
    data=self.payload(type=kind,amount='2500' if kind=='tables' else '598',**extra)
    if payment=='cash':
     data.update(request_id=uuid.uuid4().hex,collector='ผู้รับเงินทดสอบ',received_date='2026-01-01');code,order,_=self.post('/api/admin/cash-receipt',data);self.assertEqual(code,200,order)
     token=self.post('/api/admin/ticket-reissue',dict(ref=order['ref'],verified=True,reason='มอบตั๋วผู้จอง'))[1]['token']
    else:
     code,order,_=self.request('/api/orders',data);self.assertEqual(code,201,order);token=order['token']
    ref=order['ref'];self.assertEqual(self.post('/api/admin/order-status',dict(ref=ref,status='confirmed'))[0],200)
    hash_before=self.sql("SELECT secret_hash FROM orders WHERE ref='"+ref+"'",self.name)
    audit_before=self.sql("SELECT COUNT(*) FROM order_audit WHERE ref='"+ref+"'",self.name)
    def compare():
     code,staff,_=self.request('/api/admin/ticket?ref='+ref,cookie=self.cookie);self.assertEqual(code,200,staff)
     code,holder,_=self.request('/api/ticket',{'ref':ref,'token':token});self.assertEqual(code,200,holder);self.assertEqual(staff,holder)
     for private in ['token','secret_hash','phone','shipping_address','cash_receipt']:self.assertNotIn(private,staff)
     return staff
    self.assertEqual(compare()['status'],'confirmed')
    self.assertEqual(self.sql("SELECT secret_hash FROM orders WHERE ref='"+ref+"'",self.name),hash_before)
    self.assertEqual(self.sql("SELECT COUNT(*) FROM order_audit WHERE ref='"+ref+"'",self.name),audit_before)
    edit={**data,'ref':ref,'name':'ชื่อแก้ไข ล่าสุด','reason':'แก้ชื่อผู้จอง'};self.assertEqual(self.post('/api/admin/order-edit',edit)[0],200)
    self.assertEqual(compare()['name'],'ชื่อแก้ไข ล่าสุด')
    self.assertEqual(self.post('/api/admin/redeem',{'ref':ref})[0],200);self.assertTrue(compare()['redeemed'])
  self.assertEqual(self.request('/api/admin/ticket?ref=missing',cookie=self.cookie)[0],404)
 def test_22_reports_and_csv_exports(self):
  import csv,io,datetime
  self.assertEqual(self.request('/api/admin/reports')[0],401)
  self.assertEqual(self.request('/api/admin/report.csv')[0],401)
  start=int(datetime.datetime(2020,1,1,17,tzinfo=datetime.timezone.utc).timestamp());refs=[]
  cases=[('transfer','shirts','947','confirmed',{'lines':[{'size':'XS','qty':1},{'size':'M','qty':2}],'delivery':'post','recipient':'ผู้รับทดสอบ','address':'ที่อยู่ทดสอบ 123','postcode':'45140'}),('cash','shirts','1196','confirmed',{'lines':[{'size':'M','qty':1},{'size':'M','qty':2},{'size':'4XL','qty':1}],'delivery':'pickup'}),('transfer','shirts','1495','pending',{'lines':[{'size':'L','qty':5}],'delivery':'pickup'}),('transfer','shirts','2093','rejected',{'lines':[{'size':'XL','qty':7}],'delivery':'pickup'}),('cash','donate','10.25','confirmed',{}),('transfer','fund','20.50','confirmed',{}),('cash','tables','2500','confirmed',{'tables':[58]})]
  for index,(method,kind,amount,status,extra) in enumerate(cases):
   data=self.payload(type=kind,name='=1+1' if index==1 else 'ผู้จอง ชื่อซ้ำ',amount=amount,**extra)
   if method=='cash':data.update(request_id=uuid.uuid4().hex,collector='รับเงิน ทดสอบ',received_date='2020-01-02');code,r,_=self.post('/api/admin/cash-receipt',data);self.assertEqual(code,200,r)
   else:code,r,_=self.request('/api/orders',data);self.assertEqual(code,201,r)
   ref=r['ref'];refs.append(ref)
   if status!='pending':self.assertEqual(self.post('/api/admin/order-status',{'ref':ref,'status':status})[0],200)
   self.sql("UPDATE orders SET created="+str(start+(86399 if index==1 else 0))+" WHERE ref='"+ref+"'",self.name)
  params='?from=2020-01-02&to=2020-01-02'
  code,d,_=self.request('/api/admin/reports'+params,cookie=self.cookie);self.assertEqual(code,200,d)
  self.assertEqual(d['order_count'],5);self.assertEqual(d['shirt_qty'],7);self.assertEqual(d['table_count'],1);self.assertEqual(d['guests'],8)
  self.assertEqual(d['total_cents'],467375);sizes={r['size']:r for r in d['shirt_sizes']};self.assertEqual(sizes['M'],dict(size='M',qty=5,pickup=3,post=2));self.assertEqual(sizes['L']['qty'],0)
  self.assertEqual(self.request('/api/admin/reports'+params+'&status=active',cookie=self.cookie)[1]['shirt_qty'],12)
  self.assertEqual(self.request('/api/admin/reports'+params+'&payment=cash',cookie=self.cookie)[1]['shirt_qty'],4)
  self.assertEqual(self.request('/api/admin/reports?from=2020-01-03&to=2020-01-03',cookie=self.cookie)[1]['order_count'],0)
  def exported(dataset):
   code,raw,h=self.request('/api/admin/report.csv'+params+'&dataset='+dataset,cookie=self.cookie);self.assertEqual(code,200,raw);self.assertTrue(raw.startswith(b'\xef\xbb\xbf'));self.assertIn('attachment',h['Content-Disposition']);return list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
  rows=exported('shirt-sizes');self.assertEqual(rows[-1],['รวม','4','3','7'])
  people=exported('shirt-people');self.assertEqual(len(people),3);self.assertEqual(sum(int(r[10]) for r in people[1:]),7);self.assertTrue(any(r[1]=="'=1+1" for r in people[1:]))
  lines=exported('shirt-lines');self.assertEqual(len(lines),5);self.assertEqual(sum(int(r[3]) for r in lines[1:]),7)
  self.assertEqual(exported('summary')[-1][1:3],['5','4673.75']);orders=exported('orders');self.assertEqual(len(orders),6);self.assertTrue(any('G6'==r[8] for r in orders[1:]))
  for rows in [people,lines,orders]:
   text=json.dumps(rows,ensure_ascii=False);self.assertNotIn('0812345678',text);self.assertNotIn('45140',text);self.assertNotIn('secret_hash',text)
  self.assertEqual(self.request('/api/admin/reports?status=bad',cookie=self.cookie)[0],400)
  self.assertEqual(self.request('/api/admin/reports?from=2020-02-31',cookie=self.cookie)[0],400)
  self.assertEqual(self.request('/api/admin/reports?from=2020-02-03&to=2020-01-01',cookie=self.cookie)[0],400)
  self.assertEqual(self.request('/api/admin/report.csv?dataset=bad',cookie=self.cookie)[0],400)
  import hashlib
  values=','.join("('report-%d','%s','donate','ทดสอบรายงาน','0800000000',100,'2020-01-02','%s','text/plain','','confirmed',%d,'{}')"%(n,'0'*64,hashlib.sha256(('report-fixture-'+str(n)).encode()).hexdigest(),start) for n in range(150))
  self.sql('INSERT INTO orders(ref,secret_hash,type,name,phone,amount_cents,transferred,digest,mime,slip,status,created,pricing_snapshot) VALUES '+values,self.name)
  self.assertEqual(len(exported('orders')),156)

 def test_23_poster_compression_cache_and_private_backup(self):
  import hashlib
  raw=(ROOT/'prototype/assets/poster-celebration-v2.png').read_bytes()
  code,poster,_=self.post('/api/admin/posters',dict(action='add',title='บีบอัดโปสเตอร์',file=base64.b64encode(raw).decode()));self.assertEqual(code,201,poster);self.assertLessEqual(poster['bytes'],600*1024)
  slides=self.request('/api/posters')[1];slide=next(p for p in slides if p['id']==poster['id']);self.assertIn('?v=',slide['url']);self.assertEqual(slide['bytes'],poster['bytes'])
  code,image,headers=self.request(slide['url']);self.assertEqual(code,200);self.assertEqual(headers['Content-Type'],'image/webp');self.assertIn('immutable',headers['Cache-Control'])
  conn=http.client.HTTPConnection('127.0.0.1',self.port);conn.request('GET',slide['url'],headers={'If-None-Match':headers['ETag']});response=conn.getresponse();self.assertEqual(response.status,304);self.assertEqual(response.read(),b'');conn.close()
  id='legacy-large-poster';self.sql("INSERT INTO posters(id,title,mime,image,created) VALUES ('"+id+"','legacy','image/png',UNHEX('"+raw.hex()+"'),1)",self.name)
  backup=self.folder/'poster-backup.json';before=self.sql('SELECT COUNT(*) FROM orders',self.name)
  subprocess.run(['php',str(ROOT/'hostinger/optimize-posters.php'),str(backup)],env=self.env,check=True,capture_output=True)
  saved=json.loads(backup.read_text());original=next(r for r in saved['posters'] if r['id']==id);self.assertEqual(base64.b64decode(original['image_base64']),raw);self.assertEqual(original['sha256'],hashlib.sha256(raw).hexdigest());self.assertEqual(backup.stat().st_mode&0o777,0o600)
  code,image,h=self.request('/api/posters/'+id+'/image');self.assertEqual(h['Content-Type'],'image/webp');self.assertLess(len(image),len(raw));self.assertLessEqual(len(image),600*1024)
  self.assertEqual(self.sql('SELECT COUNT(*) FROM orders',self.name),before)
  repeat=subprocess.run(['php',str(ROOT/'hostinger/optimize-posters.php'),str(backup)],env=self.env,capture_output=True);self.assertNotEqual(repeat.returncode,0)
 def test_24_tax_requests_validation_privacy_and_workflow(self):
  tax={'requested':True,'tax_id':'0000000000000','document_name':'ผู้ขอเอกสารทดสอบ','delivery':'pickup'}
  before=int(self.sql('SELECT COUNT(*) FROM orders',self.name))
  for invalid in [{**tax,'tax_id':'123'}, {**tax,'delivery':'line'}, {**tax,'delivery':'post','address':'ที่อยู่','recipient':'ผู้รับ','postcode':'x'}, {**tax,'requested':'yes'}]:
   self.assertEqual(self.request('/api/orders',self.payload(type='donate',amount='100',tax_request=invalid))[0],400)
  self.assertEqual(self.request('/api/orders',self.payload(tables=[59],tax_request=tax))[0],400)
  self.assertEqual(int(self.sql('SELECT COUNT(*) FROM orders',self.name)),before)
  refs=[]
  for kind,delivery in [('donate','pickup'),('fund','line'),('donate','post')]:
   info={**tax,'delivery':delivery,'line_id':'test.line-id','recipient':'ผู้รับเอกสารทดสอบ','address':'ที่อยู่รับเอกสาร 123','postcode':'45140'}
   code,order,_=self.request('/api/orders',self.payload(type=kind,amount='100',tax_request=info));self.assertEqual(code,201,order);refs.append(order['ref'])
   self.assertNotIn(tax['tax_id'],json.dumps(order));self.assertNotIn('tax_id',json.dumps(self.request('/api/status',{'ref':order['ref'],'phone':'0812345678'})[1]))
  self.assertEqual(self.request('/api/admin/tax-requests')[0],401)
  listing=self.request('/api/admin/tax-requests',cookie=self.cookie)[1];self.assertEqual(listing['count'],3)
  self.assertNotIn(tax['tax_id'],json.dumps(listing));self.assertTrue(all(r['tax_id_masked'].endswith('0000') for r in listing['items']))
  ref=refs[-1];d=self.request('/api/admin/tax-request?ref='+ref,cookie=self.cookie)[1];self.assertEqual(d['tax_id'],tax['tax_id']);self.assertEqual(d['address'],'ที่อยู่รับเอกสาร 123')
  self.assertEqual(self.request('/api/admin/tax-request?ref='+ref)[0],401)
  update={**d,'ref':ref,'reason':'ตรวจข้อมูลคำขอ','request_status':'ready'}
  self.assertEqual(self.post('/api/admin/tax-request-update',update)[0],409)
  self.assertEqual(self.post('/api/admin/order-status',{'ref':ref,'status':'confirmed'})[0],200)
  code,edited,_=self.post('/api/admin/tax-request-update',update);self.assertEqual(code,200,edited);self.assertEqual(edited['request_status'],'ready')
  self.assertEqual(self.post('/api/admin/tax-request-update',update)[0],409)
  update={**edited,'ref':ref,'reason':'เปลี่ยนช่องทางรับ','delivery':'line','line_id':'new.line-id'};code,edited,_=self.post('/api/admin/tax-request-update',update);self.assertEqual(code,200,edited);self.assertIsNone(edited['address']);self.assertIsNone(edited['postcode'])
  self.assertEqual(int(self.sql("SELECT COUNT(*) FROM tax_request_audit WHERE order_ref='"+ref+"'",self.name)),3)
  code,ordinary,_=self.request('/api/orders',self.payload(type='donate',amount='200',tax_request={'requested':False,'tax_id':tax['tax_id']}));self.assertEqual(code,201);self.assertEqual(int(self.sql("SELECT COUNT(*) FROM tax_requests WHERE order_ref='"+ordinary['ref']+"'",self.name)),0)
  self.assertEqual(self.post('/api/admin/tax-request-create',{**tax,'ref':ordinary['ref'],'reason':'ผู้บริจาคแจ้งเพิ่มเติม'})[0],200)
  self.assertEqual(self.post('/api/admin/tax-request-create',{**tax,'ref':ordinary['ref'],'reason':'สร้างซ้ำ'})[0],409)
  # Cash receipt creates the same private request atomically and remains pending.
  cash=self.payload(type='fund',amount='150',request_id=uuid.uuid4().hex,collector='ผู้รับเงินทดสอบ',received_date='2026-01-01',tax_request={**tax,'delivery':'line','line_id':'cash.line'})
  code,order,_=self.post('/api/admin/cash-receipt',cash);self.assertEqual(code,200,order);self.assertEqual(order['status'],'pending')
  self.assertEqual(self.post('/api/admin/cash-receipt',cash)[1]['ref'],order['ref']);self.assertEqual(int(self.sql("SELECT COUNT(*) FROM tax_requests WHERE order_ref='"+order['ref']+"'",self.name)),1)
  # Ordinary staff lists, reports, ticket data and public settings never gain tax identifiers.
  for path in ['/api/admin/orders','/api/admin/reports','/api/settings']:
   body=self.request(path,cookie=self.cookie)[1];self.assertNotIn(tax['tax_id'],json.dumps(body))
  csv=self.request('/api/admin/report.csv?dataset=orders&status=all',cookie=self.cookie)[1];self.assertNotIn(tax['tax_id'].encode(),csv)
 def test_25_tax_backup_restore(self):
  tax={'requested':True,'tax_id':'0000000000000','document_name':'ชื่อเอกสารทดสอบ','delivery':'post','recipient':'ผู้รับทดสอบ','address':'ที่อยู่สำรองทดสอบ 123','postcode':'45140'}
  code,r,_=self.request('/api/orders',self.payload(type='donate',amount='99',tax_request=tax));self.assertEqual(code,201,r)
  backup=self.folder/'tax-backup.json';subprocess.run(['php',str(ROOT/'hostinger/backup.php'),str(backup)],env=self.env,check=True,capture_output=True)
  saved=json.loads(backup.read_text());self.assertIn('tax_requests',saved['tables']);self.assertIn('tax_request_audit',saved['tables'])
  target=self.name+'_tax_restore';self.sql('CREATE DATABASE '+target+' CHARACTER SET utf8mb4');config=self.folder/'tax-restore-config.php';config.write_text(self.config.read_text().replace('dbname='+self.name+';','dbname='+target+';'))
  try:
   restored=subprocess.run(['php',str(ROOT/'hostinger/restore.php'),str(backup),'--confirm-empty'],env={**self.env,'PORTAL_CONFIG':str(config)},capture_output=True);self.assertEqual(restored.returncode,0,restored.stderr)
   self.assertEqual(self.sql("SELECT tax_id FROM tax_requests WHERE order_ref='"+r['ref']+"'",target).strip(),tax['tax_id'])
  finally:self.sql('DROP DATABASE '+target)
 def test_26_tax_csv_exports(self):
  import csv,io,urllib.parse
  tax={'requested':True,'tax_id':'0000000000000','document_name':'=SUM(1,2)','delivery':'post','recipient':'ผู้รับทดสอบ','address':'บ้านเลขที่ 1, อาคาร "ทดสอบ"\nถนนตัวอย่าง','postcode':'00123'}
  code,o,_=self.request('/api/orders',self.payload(type='donate',amount='123.45',tax_request=tax));self.assertEqual(code,201,o);ref=o['ref']
  code,cash,_=self.post('/api/admin/cash-receipt',self.payload(type='fund',amount='50',request_id=uuid.uuid4().hex,collector='ผู้รับเงินทดสอบ',received_date='2026-11-11',tax_request={**tax,'document_name':'ผู้รับเอกสารเงินสด','delivery':'line','line_id':'@test.line'}));self.assertEqual(code,200,cash)
  self.assertEqual(self.post('/api/admin/order-status',{'ref':ref,'status':'confirmed'})[0],200)
  self.assertEqual(self.request('/api/admin/tax-requests.csv')[0],401)
  def export(query=''):
   code,body,headers=self.request('/api/admin/tax-requests.csv?'+query,cookie=self.cookie);self.assertEqual(code,200,body);self.assertIn('text/csv',headers['Content-Type']);self.assertIn('no-store',headers['Cache-Control']);self.assertTrue(body.startswith(b'\xef\xbb\xbf'));return list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))))
  rows=export('q='+ref+'&page=999');self.assertEqual(len(rows),1);r=rows[0]
  self.assertEqual(r['เลขประจำตัวผู้เสียภาษี'],'0000000000000');self.assertEqual(r['เบอร์โทรศัพท์'],'0812345678');self.assertEqual(r['รหัสไปรษณีย์'],'00123');self.assertEqual(r['ชื่อสำหรับออกเอกสาร'],"'=SUM(1,2)");self.assertEqual(r['ที่อยู่รับเอกสาร'],tax['address']);self.assertEqual(r['ยอดบริจาค (บาท)'],'123.45');self.assertEqual(r['สถานะยืนยันยอดเงิน'],'ยืนยันยอดแล้ว')
  rows=export('q='+cash['ref']);self.assertEqual(rows[0]['ช่องทางชำระ'],'เงินสด');self.assertEqual(rows[0]['วันที่รับเงิน / แจ้งโอน'],'2026-11-11');self.assertEqual(rows[0]['Line ID'],"'@test.line")
  rows=export('dataset=summary&q='+ref+'&payment_status=confirmed');self.assertEqual(len(rows),1);self.assertEqual(rows[0]['จำนวนคำขอ'],'1');self.assertEqual(rows[0]['ยอดรวม (บาท)'],'123.45');self.assertNotIn(tax['tax_id'],json.dumps(rows));self.assertEqual(export('q='+ref+'&payment_status=pending'),[])
  filtered=self.request('/api/admin/tax-requests?payment_status=confirmed&q='+ref,cookie=self.cookie)[1];self.assertEqual(filtered['count'],1)
  for query in ['dataset=unknown','payment_status=unknown','delivery=unknown']:
   self.assertEqual(self.request('/api/admin/tax-requests.csv?'+query,cookie=self.cookie)[0],400)
  # More than one list page: exports must include all matching requests, not 50.
  columns='ref,secret_hash,type,name,phone,amount_cents,transferred,digest,mime,slip,status,created,pricing_snapshot'
  for n in range(51):
   cloned=str(900000+n)
   self.sql("INSERT INTO orders ("+columns+") SELECT '"+cloned+"',secret_hash,type,'csv-bulk',phone,amount_cents,transferred,SHA2('csv-bulk-"+cloned+"',256),mime,slip,status,created,pricing_snapshot FROM orders WHERE ref='"+ref+"'; INSERT INTO tax_requests (order_ref,tax_id,document_name,delivery,request_status,admin_note,revision,created,updated) SELECT '"+cloned+"',tax_id,'csv-bulk',delivery,request_status,admin_note,revision,created,updated FROM tax_requests WHERE order_ref='"+ref+"';",self.name)
  self.assertEqual(len(export('q=csv-bulk&page=2')),51)
  self.assertEqual(self.request('/api/admin/tax-requests?q=csv-bulk',cookie=self.cookie)[1]['count'],51)
  rows=export('dataset=summary&q=csv-bulk');self.assertEqual(rows[0]['จำนวนคำขอ'],'51');self.assertEqual(rows[0]['ยอดรวม (บาท)'],'6295.95')
if __name__=='__main__':unittest.main(verbosity=2)
