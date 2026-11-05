import base64, http.client, json, os, socket, subprocess, sys, tempfile, time, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Flow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        with socket.socket() as s:
            s.bind(('127.0.0.1',0)); cls.port=s.getsockname()[1]
        env={**os.environ,'DATA_DIR':cls.tmp.name,'ADMIN_PASSWORD':'test-only-long-password','PORT':str(cls.port)}
        cls.process=subprocess.Popen([sys.executable,str(ROOT/'server.py')],env=env,stdout=subprocess.DEVNULL)
        for i in range(50):
            try:
                c=http.client.HTTPConnection('127.0.0.1',cls.port);c.request('GET','/');r=c.getresponse();r.read();c.close();break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('Server did not start')
    @classmethod
    def tearDownClass(cls):
        cls.process.terminate();cls.process.wait();cls.tmp.cleanup()
    def req(self,path,data=None,cookie=None,origin=True):
        c=http.client.HTTPConnection('127.0.0.1',self.port)
        headers={'Content-Type':'application/json'}
        if origin: headers['Origin']=f'http://127.0.0.1:{self.port}'
        if cookie:headers['Cookie']=cookie
        c.request('POST' if data is not None else 'GET',path,json.dumps(data) if data is not None else None,headers)
        r=c.getresponse(); raw=r.read();head=dict(r.getheaders());status=r.status;c.close()
        return status,json.loads(raw) if 'application/json' in head.get('Content-Type','') else raw,head
    def test_end_to_end_and_access(self):
        self.assertEqual(self.req('/api/admin/list')[0],401)
        sample={'name':'ผู้ทดสอบ ระบบ','amount':'2500.50','transferred':'2026-01-01T10:30','contact':'','consent':True,'website':'','file':base64.b64encode(b'%PDF-1.4\ntest-only').decode()}
        self.assertEqual(self.req('/api/donations',sample,origin=False)[0],403)
        self.assertEqual(self.req('/api/donations',{**sample,'file':base64.b64encode(b'<script>bad</script>').decode()})[0],400)
        self.assertEqual(self.req('/api/donations',{**sample,'amount':'NaN'})[0],400)
        self.assertEqual(self.req('/api/donations',{**sample,'amount':'1.001'})[0],400)
        status,result,_=self.req('/api/donations',sample);self.assertEqual(status,201);self.assertEqual(result['status'],'pending')
        self.assertEqual(self.req('/api/donations',sample)[0],409)
        ref=result['ref']; token=result['token']
        self.assertRegex(ref, r'^[0-9]{6}$')
        self.assertEqual(self.req('/api/status',{'ref':ref,'token':'wrong'})[0],404)
        status,value,_=self.req('/api/status',{'ref':ref,'token':token});self.assertEqual(status,200);self.assertEqual(set(value),{'status','label'})
        self.assertEqual(self.req('/api/admin/slip/'+ref)[0],401)
        self.assertEqual(self.req('/api/admin/status',{'ref':ref,'status':'approved'})[0],401)
        status,_,headers=self.req('/api/admin/login',{'password':'test-only-long-password'});self.assertEqual(status,200)
        cookie=headers['Set-Cookie'].split(';')[0];self.assertIn('HttpOnly',headers['Set-Cookie'])
        status,rows,_=self.req('/api/admin/list',cookie=cookie);self.assertEqual(rows[0]['cents'],250050);self.assertNotIn('secret_hash',rows[0])
        status,slip,h=self.req('/api/admin/slip/'+ref,cookie=cookie);self.assertEqual(status,200);self.assertIn('attachment',h['Content-Disposition'])
        self.assertEqual(self.req('/api/admin/status',{'ref':ref,'status':'approved'},cookie)[0],200)
        self.assertEqual(self.req('/api/status',{'ref':ref,'token':token})[1]['status'],'approved')
        self.assertEqual(self.req('/api/admin/logout',{},cookie)[0],200)
        self.assertEqual(self.req('/api/admin/list',cookie=cookie)[0],401)
        self.assertEqual(self.req('/data/donations.sqlite3')[0],404)
        for i in range(11): last=self.req('/api/admin/login',{'password':'wrong'})[0]
        self.assertEqual(last,429)
if __name__=='__main__':unittest.main()
