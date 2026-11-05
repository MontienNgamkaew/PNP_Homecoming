"""Read-only export of legacy SQLite into the private PHP backup format.
Usage: python3 tools/export_sqlite.py /path/donations.sqlite3 /NEW/private/export.json
Never publish the resulting file: it includes personal data and payment slips.
"""
import base64, datetime, json, os, sqlite3, sys
from pathlib import Path
source, destination = map(Path, sys.argv[1:3])
if destination.exists():
    raise SystemExit('Destination exists; choose a new private file')
c = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
c.row_factory = sqlite3.Row
names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
tables = ['app_settings','reference_counter','orders','table_bookings','order_items','order_audit','settings_audit','blessings','posters','ticket_redemptions']
result = {'format':'portal-backup-v1','created':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':{}}
c.execute('BEGIN')
for table in tables:
    rows = [dict(r) for r in c.execute('SELECT * FROM '+table)] if table in names else []
    for r in rows:
        for key in ('slip','image'):
            if key in r: r[key] = {'base64':base64.b64encode(r[key]).decode()}
    result['tables'][table] = rows
# Preserve old /legacy donations as ordinary donate orders, retaining tokens and slips.
refs = {r['ref'] for r in result['tables']['orders']}
if 'donations' in names:
    for row in c.execute('SELECT * FROM donations'):
        r = dict(row)
        if r['ref'] in refs: raise SystemExit('Reference collision with legacy donation; resolve before migration')
        result['tables']['orders'].append(dict(ref=r['ref'],secret_hash=r['secret_hash'],type='donate',name=r['name'],phone=r['contact'],amount_cents=r['cents'],transferred=r['transferred'],delivery_method=None,recipient_name=None,shipping_address=None,postcode=None,tables_list='',category='ร่วมทำบุญทอดผ้าป่า',digest=r['digest'],mime=r['mime'],slip={'base64':base64.b64encode(r['slip']).decode()},status='confirmed' if r['status']=='approved' else r['status'],created=r['created'],pricing_snapshot='{}'))
    if 'audit' in names:
        for row in c.execute('SELECT * FROM audit'):
            r = dict(row); r.pop('id',None);result['tables']['order_audit'].append(r)
for r in result['tables']['app_settings']:
    config=json.loads(r['config']);config['payment_live']=False;r['config']=json.dumps(config,ensure_ascii=False)
c.rollback();c.close()
fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f: json.dump(result,f,ensure_ascii=False)
print(json.dumps({k:len(v) for k,v in result['tables'].items()}))
