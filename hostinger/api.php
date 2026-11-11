<?php
declare(strict_types=1);
require getenv('PORTAL_LIB') ?: dirname(__DIR__).'/portal-private/lib.php';
require_once dirname(getenv('PORTAL_LIB') ?: dirname(__DIR__).'/portal-private/lib.php').'/tax.php';
try {
 $c=config();$method=$_SERVER['REQUEST_METHOD'];$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
 if($method==='OPTIONS')reply(204,'','text/plain');
 if(!in_array($method,['GET','POST'],true))fail(405,'วิธีเรียกไม่ถูกต้อง');
 if($method==='POST'){
    if(($_SERVER['HTTP_ORIGIN']??'')!==$c['origin'])fail(403,'คำขอไม่ถูกต้อง');
    if(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]!=='application/json')fail(415,'รูปแบบคำขอไม่ถูกต้อง');
    $length=(int)($_SERVER['CONTENT_LENGTH']??0);if($length<1||$length>7*1024*1024)fail(413,'ไฟล์ใหญ่เกินไป');
    $raw=file_get_contents('php://input',false,null,0,7*1024*1024+1);if(strlen($raw)>7*1024*1024)fail(413,'ไฟล์ใหญ่เกินไป');
    $d=json_decode($raw,true,512,JSON_THROW_ON_ERROR);if(!is_array($d)||!str_starts_with(ltrim($raw),'{'))fail(400,'ข้อมูลไม่ถูกต้อง');
 }
 if(str_starts_with($path,'/api/admin/')&&$path!=='/api/admin/login')auth();
 if($method==='GET'){
    if($path==='/api/admin/tax-requests')reply(200,tax_requests_list($_GET));
    if($path==='/api/admin/tax-request')reply(200,tax_request_detail(text($_GET['ref']??null,1,40,'เลขอ้างอิง')));
    if(in_array($path,['/api/admin/reports','/api/admin/report.csv'],true)){
       require dirname(getenv('PORTAL_LIB') ?: dirname(__DIR__).'/portal-private/lib.php').'/reports.php';$filters=report_filters($_GET);
       if($path==='/api/admin/report.csv')export_report_csv($filters,text($_GET['dataset']??'summary',1,30,'รายงาน'));
       reply(200,report_summary($filters));
    }

    if($path==='/api/totals'){
       $totals=array_fill_keys(['donate','fund','tables','shirts'],0);
       foreach(query("SELECT type,COALESCE(SUM(amount_cents),0) AS cents FROM orders WHERE status='confirmed' GROUP BY type")->fetchAll() as $r){if(array_key_exists($r['type'],$totals))$totals[$r['type']]=(int)$r['cents'];}
       reply(200,['by_type'=>$totals,'total_cents'=>array_sum($totals),'updated_at'=>gmdate('c')]);
    }

    if($path==='/api/settings/revision')reply(200,['revision'=>(int)query('SELECT revision FROM app_settings WHERE id=1')->fetchColumn()]);
    if($path==='/api/settings')reply(200,settings());
    if($path==='/api/posters'){$rows=query('SELECT id,title,LENGTH(image) AS bytes,LEFT(SHA2(image,256),16) AS version FROM posters WHERE deleted_at IS NULL ORDER BY CASE id WHEN \'default-compact\' THEN 0 ELSE 1 END,created,id')->fetchAll();foreach($rows as &$r){$r['bytes']=(int)$r['bytes'];$r['url']='/api/posters/'.$r['id'].'/image?v='.$r['version'];unset($r['version']);}reply(200,$rows);}
    if(preg_match('~^/api/posters/([a-zA-Z0-9-]+)/image$~D',$path,$m)){$r=query('SELECT mime,image FROM posters WHERE id=? AND deleted_at IS NULL',[$m[1]])->fetch();if(!$r)fail(404,'ไม่พบโปสเตอร์');$hash=hash('sha256',$r['image']);$headers=['ETag'=>'"'.$hash.'"','Cache-Control'=>($_GET['v']??'')===substr($hash,0,16)?'public, max-age=86400, immutable':'public, max-age=0, must-revalidate'];if(($_SERVER['HTTP_IF_NONE_MATCH']??'')==='"'.$hash.'"')reply(304,'',$r['mime'],$headers);reply(200,$r['image'],$r['mime'],$headers);}
    if($path==='/api/tables'){$rows=query('SELECT table_number,status FROM table_bookings')->fetchAll();$booked=[];$pending=0;$confirmed=0;foreach($rows as $r){$booked[(string)$r['table_number']]=$r['status'];$pending+=$r['status']==='pending';$confirmed+=$r['status']==='confirmed';}reply(200,['booked'=>(object)$booked,'summary'=>['total'=>61,'available'=>61-count(array_filter($rows,fn($r)=>(int)$r['table_number']<=61)),'pending'=>$pending,'confirmed'=>$confirmed]]);}
    if($path==='/api/blessings/random')reply(200,['blessing'=>query('SELECT message FROM blessings WHERE active=1 ORDER BY RAND() LIMIT 1')->fetchColumn()?:'ขอให้ท่านและครอบครัวมีความสุขความเจริญ']);
    if($path==='/api/admin/ticket'){reply(200,electronic_ticket(text($_GET['ref']??null,1,40,'เลขอ้างอิง')));}
    if($path==='/api/admin/cash-order'){$ref=text($_GET['ref']??null,6,40,'เลขอ้างอิง');$r=query('SELECT * FROM orders WHERE ref=?',[$ref])->fetch();if(!$r)fail(404,'ไม่พบรายการ');reply(200,public_order($r));}
    if($path==='/api/admin/blessings'){$rows=query('SELECT * FROM blessings ORDER BY id')->fetchAll();foreach($rows as &$r){$r['id']=(int)$r['id'];$r['active']=(int)$r['active'];}reply(200,$rows);}
    if($path==='/api/admin/orders'){
       [$where,$args]=order_search();$page=max(1,min(100000,(int)($_GET['page']??1)));$offset=($page-1)*100;$rows=query("SELECT ref,type,name,phone,amount_cents,transferred,delivery_method,recipient_name,shipping_address,postcode,tables_list,category,status,created,pricing_snapshot,mime FROM orders$where ORDER BY created DESC,ref DESC LIMIT 100 OFFSET $offset",$args)->fetchAll();reply(200,array_map('public_order',$rows));
    }
    if($path==='/api/admin/summary'){
       $r=query("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END),0) AS confirmed_cents,SUM(status='pending') AS pending FROM orders")->fetch();
       $cash=(int)query("SELECT COALESCE(SUM(amount_cents),0) FROM orders WHERE status='confirmed' AND JSON_UNQUOTE(JSON_EXTRACT(pricing_snapshot,'$.payment_receipt.method'))='cash'")->fetchColumn();$r['by_payment']=['cash_cents'=>$cash,'transfer_cents'=>(int)$r['confirmed_cents']-$cash];
       $r['shirt_count']=(int)query("SELECT COALESCE(SUM(i.qty),0) FROM order_items i JOIN orders o ON i.order_ref=o.ref WHERE o.type='shirts' AND o.status<>'rejected'")->fetchColumn();
       $r['booked_tables']=(int)query('SELECT COUNT(*) FROM table_bookings')->fetchColumn();foreach(['total','confirmed_cents','pending'] as $k)$r[$k]=(int)$r[$k];[$where,$args]=order_search();$filtered=query("SELECT COUNT(*) AS filtered_count,COALESCE(SUM(amount_cents),0) AS filtered_cents,COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END),0) AS filtered_confirmed_cents FROM orders".$where,$args)->fetch();foreach($filtered as $k=>$v)$r[$k]=(int)$v;
       $r['by_type']=[];foreach(query("SELECT type,COUNT(*) AS total,COALESCE(SUM(status='pending'),0) AS pending,COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END),0) AS confirmed_cents FROM orders GROUP BY type")->fetchAll() as $group){foreach(['total','pending','confirmed_cents'] as $k)$group[$k]=(int)$group[$k];$r['by_type'][$group['type']]=$group;}$r['page_size']=100;reply(200,$r);
    }
    if(preg_match('~^/api/admin/order-slip/([A-Za-z0-9-]+)$~D',$path,$m)){$r=query('SELECT mime,slip FROM orders WHERE ref=?',[$m[1]])->fetch();if(!$r||$r['mime']==='text/plain')fail(404,'รายการนี้ไม่มีเอกสารแนบ');$ext=['image/png'=>'png','image/jpeg'=>'jpg','application/pdf'=>'pdf','image/webp'=>'webp'][$r['mime']]??'bin';reply(200,$r['slip'],$r['mime'],['Content-Disposition'=>'inline; filename="'.$m[1].'.'.$ext.'"','Content-Security-Policy'=>"sandbox; default-src 'none'"]);}
    fail(404,'ไม่พบหน้า');
 }
 if($path==='/api/admin/login'){
    limited('login',10);$hash=$c['admin_password_hash']??'';
    if(!password_get_info($hash)['algo'])fail(503,'ยังไม่ได้ตั้งรหัสผ่านผู้ดูแล');
    if(!is_string($d['password']??null)||strlen($d['password'])<8||strlen($d['password'])>1024||!password_verify($d['password'],$hash))fail(401,'รหัสผ่านไม่ถูกต้อง');
    $token=bin2hex(random_bytes(32));query('DELETE FROM admin_sessions WHERE expires<?',[time()]);query('INSERT INTO admin_sessions VALUES (?,?)',[hash('sha256',$token),time()+3600]);
    setcookie('admin',$token,['expires'=>time()+3600,'path'=>'/','secure'=>$c['secure_cookie']??true,'httponly'=>true,'samesite'=>'Strict']);reply(200,['ok'=>true]);
 }
 if($path==='/api/admin/logout'){query('DELETE FROM admin_sessions WHERE token_hash=?',[hash('sha256',$_COOKIE['admin']??'')]);setcookie('admin','',['expires'=>1,'path'=>'/','secure'=>$c['secure_cookie']??true,'httponly'=>true,'samesite'=>'Strict']);reply(200,['ok'=>true]);}
 if($path==='/api/admin/settings'){
    $new=validated_settings($d);$saved=transaction(function()use($new,$d){$old=settings(true);if(($d['revision']??null)!==$old['revision'])fail(409,'มีผู้ดูแลแก้การตั้งค่าแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก');query('INSERT INTO settings_audit(old_config,new_config,at) VALUES (?,?,?)',[js($old),js($new),time()]);query('UPDATE app_settings SET config=?,revision=revision+1 WHERE id=1',[js($new)]);return settings();});reply(200,$saved);
 }
 if($path==='/api/admin/posters'){
    if(($d['action']??'')==='delete'){$s=query('UPDATE posters SET deleted_at=? WHERE id=? AND deleted_at IS NULL',[time(),$d['id']??'']);if(!$s->rowCount())fail(404,'ไม่พบโปสเตอร์');reply(200,['ok'=>true]);}
    if(($d['action']??'')!=='add')fail(400,'คำสั่งไม่ถูกต้อง');$title=text($d['title']??null,1,150,'ชื่อโปสเตอร์');[$raw,$mime]=image_file($d['file']??null,5*1024*1024);require_once dirname(getenv('PORTAL_LIB') ?: dirname(__DIR__).'/portal-private/lib.php').'/poster-images.php';[$raw,$mime]=optimize_poster_image($raw,$mime);$id=bin2hex(random_bytes(12));query('INSERT INTO posters(id,title,mime,image,created) VALUES (?,?,?,?,?)',[$id,$title,$mime,$raw,time()]);reply(201,['id'=>$id,'title'=>$title,'bytes'=>strlen($raw),'url'=>'/api/posters/'.$id.'/image']);
 }
 if($path==='/api/admin/blessings'){
    $action=$d['action']??'';$id=(int)($d['id']??0);
    if($action==='add'){$message=text($d['message']??null,3,500,'คำอวยพร');query('INSERT INTO blessings(message,active,created_at) VALUES (?,1,?)',[$message,time()]);reply(201,['ok'=>true,'id'=>(int)db()->lastInsertId()]);}
    if(!query('SELECT id FROM blessings WHERE id=?',[$id])->fetch())fail(404,'ไม่พบคำอวยพร');
    if($action==='edit')query('UPDATE blessings SET message=? WHERE id=?',[text($d['message']??null,3,500,'คำอวยพร'),$id]);
    elseif($action==='toggle'){if(!in_array($d['active']??null,[0,1],true))fail(400,'สถานะไม่ถูกต้อง');query('UPDATE blessings SET active=? WHERE id=?',[$d['active'],$id]);}
    elseif($action==='delete')query('DELETE FROM blessings WHERE id=?',[$id]);else fail(400,'คำสั่งไม่ถูกต้อง');reply(200,['ok'=>true]);
 }
 if($path==='/api/status'&&array_key_exists('phone',$d)){
    limited('phone-lookup',20);$ref=$d['ref']??'';$phone=canonical_phone($d['phone']);$message='ไม่พบรายการ กรุณาตรวจสอบเบอร์โทรและเลขอ้างอิง';
    if(!is_string($ref)||strlen(trim($ref))<1||strlen(trim($ref))>40||$phone==='')fail(404,$message);$ref=strtoupper(trim($ref));
    $r=query('SELECT type,amount_cents,status,phone FROM orders WHERE ref=?',[$ref])->fetch();
    if(!$r||!hash_equals(canonical_phone($r['phone']),$phone))fail(404,$message);
    $labels=['pending'=>'รอตรวจสอบ','confirmed'=>'ยืนยันแล้ว','approved'=>'ตรวจสอบแล้ว','rejected'=>'ไม่ผ่านการตรวจสอบ'];
    reply(200,['ref'=>$ref,'type'=>$r['type'],'amount'=>$r['amount_cents']/100,'status'=>$r['status'],'label'=>$labels[$r['status']]??$r['status']]);
 }
 if(in_array($path,['/api/status','/api/ticket'],true)){
    limited('lookup',60);$ref=text($d['ref']??null,1,40,'เลขอ้างอิง');$token=text($d['token']??null,1,200,'รหัสติดตาม');
    if($path==='/api/ticket')reply(200,electronic_ticket($ref,$token));
    $r=query('SELECT status FROM orders WHERE ref=? AND secret_hash=?',[$ref,hash('sha256',$token)])->fetch();if(!$r)fail(404,'เลขอ้างอิงหรือรหัสติดตามไม่ถูกต้อง');
    $labels=['pending'=>'รอตรวจสอบ','confirmed'=>'ยืนยันแล้ว','approved'=>'ตรวจสอบแล้ว','rejected'=>'ไม่ผ่านการตรวจสอบ'];reply(200,['status'=>$r['status'],'label'=>$labels[$r['status']]??$r['status']]);
 }
 if($path==='/api/admin/tax-request-create')reply(200,admin_create_tax_request($d));
 if($path==='/api/admin/tax-request-update')reply(200,update_tax_request($d));
 if($path==='/api/orders'){
    limited('orders',15);if(!empty($d['website']))fail(400,'ข้อมูลไม่ถูกต้อง');[$raw,$mime]=image_file($d['file']??null,5*1024*1024,true);$digest=hash('sha256',$raw);$token=bin2hex(random_bytes(32));
    $out=transaction(function()use($d,$raw,$mime,$digest,$token){$c=settings(true);[$r,$tables,$items]=normalize_order($d,$c);$tax=validated_tax_request($d['tax_request']??null,$r['type'],$r['name']);
       if(cents($d['amount']??null,1)!==$r['amount_cents'])fail(409,'ยอดเงินไม่ตรงกับราคาปัจจุบัน กรุณาโหลดหน้าใหม่และตรวจยอดก่อนแจ้งชำระ');
       if(query('SELECT ref FROM orders WHERE digest=?',[$digest])->fetch())fail(409,'สลิปนี้เคยส่งในระบบแล้ว กรุณาใช้เลขอ้างอิงเดิม');
       $ref=allocate_ref();$r+=['ref'=>$ref,'secret_hash'=>hash('sha256',$token),'transferred'=>date('Y-m-d H:i:s'),'digest'=>$digest,'mime'=>$mime,'slip'=>$raw,'status'=>'pending','created'=>time()];
       $keys=array_keys($r);query('INSERT INTO orders (`'.implode('`,`',$keys).'`) VALUES ('.implode(',',array_fill(0,count($keys),'?')).')',array_values($r));claim_tables($ref,$tables,'pending');foreach($items as $it)query('INSERT INTO order_items(order_ref,size,qty) VALUES (?,?,?)',[$ref,$it['size'],$it['qty']]);
       create_tax_request($ref,$tax);
       return ['ref'=>$ref,'token'=>$token,'status'=>'pending','type'=>$r['type'],'amount'=>$r['amount_cents']/100,'blessing'=>query('SELECT message FROM blessings WHERE active=1 ORDER BY RAND() LIMIT 1')->fetchColumn()?:'ขอให้ท่านและครอบครัวมีความสุขความเจริญ'];
    });reply(201,$out);
 }
 if($path==='/api/admin/cash-receipt'){
    $request=text($d['request_id']??null,16,80,'รหัสคำขอ');if(!preg_match('/^[a-zA-Z0-9-]+$/D',$request))fail(400,'รหัสคำขอไม่ถูกต้อง');
    $collector=text($d['collector']??null,2,150,'ผู้รับเงิน');$received=text($d['received_date']??null,10,10,'วันที่รับเงิน');
    $date=DateTimeImmutable::createFromFormat('!Y-m-d',$received,new DateTimeZone('Asia/Bangkok'));
    if(!$date||$date->format('Y-m-d')!==$received||$received>(new DateTimeImmutable('now',new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'))fail(400,'วันที่รับเงินไม่ถูกต้องหรือเป็นวันในอนาคต');
    $note=text($d['note']??'',0,1000,'หมายเหตุ');$ref=trim((string)($d['ref']??''));$edit=($d['edit_receipt']??false)===true;
    $reason=$edit?text($d['reason']??null,3,500,'เหตุผลแก้ไข'):'';
    $attachment=$d['file']??'';[$raw,$mime]=$attachment!==''?image_file($attachment,5*1024*1024,true):['','text/plain'];
    $out=transaction(function()use($d,$request,$collector,$received,$note,$ref,$edit,$reason,$raw,$mime){
       $c=settings(true);$receipt=['method'=>'cash','collector'=>$collector,'received_date'=>$received,'note'=>$note,'request_id'=>$request];
       $digest=hash('sha256','cash-receipt:'.$request);
       if($ref===''){
          if($edit)fail(400,'กรุณาระบุเลขอ้างอิง');
          if($existing=query('SELECT ref,status,type FROM orders WHERE digest=?',[$digest])->fetch())return $existing;
          [$r,$tables,$items]=normalize_order($d,$c,true);$tax=validated_tax_request($d['tax_request']??null,$r['type'],$r['name']);
          if(cents($d['amount']??null,1)!==$r['amount_cents'])fail(409,'ยอดรับเงินไม่ตรงกับราคาและรายละเอียด กรุณาตรวจสอบอีกครั้ง');
          $id=allocate_ref();$snapshot=json_decode($r['pricing_snapshot'],true);$snapshot['payment_receipt']=$receipt;$r['pricing_snapshot']=js($snapshot);
          $r+=['ref'=>$id,'secret_hash'=>hash('sha256',bin2hex(random_bytes(32))),'transferred'=>$received,'digest'=>$digest,'mime'=>$mime,'slip'=>$raw,'status'=>'pending','created'=>time()];
          $keys=array_keys($r);query('INSERT INTO orders (`'.implode('`,`',$keys).'`) VALUES ('.implode(',',array_fill(0,count($keys),'?')).')',array_values($r));
          claim_tables($id,$tables,'pending');foreach($items as $it)query('INSERT INTO order_items(order_ref,size,qty) VALUES (?,?,?)',[$id,$it['size'],$it['qty']]);
          query('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)',[$id,'',js(['action'=>'cash_created','receipt'=>$receipt,'amount_cents'=>$r['amount_cents']]),time()]);
          create_tax_request($id,$tax);
          return ['ref'=>$id,'status'=>'pending','type'=>$r['type']];
       }
       $old=query('SELECT * FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();if(!$old)fail(404,'ไม่พบรายการ');$previous=payment_receipt($old);
       if(($previous['request_id']??'')===$request)return ['ref'=>$ref,'status'=>$old['status'],'type'=>$old['type']];
       if($edit){if(!$previous)fail(409,'รายการนี้ยังไม่มีข้อมูลรับเงินสด');}
       else{if($previous)fail(409,'รายการนี้บันทึกรับเงินสดแล้ว กรุณาแก้ไขรายการเดิม');if($old['status']!=='pending')fail(409,'รับเงินสดได้เฉพาะรายการรอตรวจสอบ');}
       if(!$edit&&cents($d['amount']??null,1)!==(int)$old['amount_cents'])fail(409,'ยอดเงินไม่ตรงกับรายการเดิม');
       if(array_key_exists('tax_request',$d)&&!query('SELECT order_ref FROM tax_requests WHERE order_ref=?',[$ref])->fetch()){create_tax_request($ref,validated_tax_request($d['tax_request'],$old['type'],$old['name']));}
       $snapshot=json_decode($old['pricing_snapshot'],true)?:[];$snapshot['payment_receipt']=$receipt;
       query('UPDATE orders SET pricing_snapshot=?,transferred=? WHERE ref=?',[js($snapshot),$received,$ref]);
       // Preserve the originally uploaded slip when linking an existing order.
       query('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)',[$ref,js(['receipt'=>$previous]),js(['action'=>$edit?'cash_edited':'cash_linked','receipt'=>$receipt,'reason'=>$reason]),time()]);
       return ['ref'=>$ref,'status'=>$old['status'],'type'=>$old['type']];
    });reply(200,$out);
 }
 if($path==='/api/admin/ticket-reissue'){
    limited('ticket-reissue',30);$ref=text($d['ref']??null,1,40,'เลขอ้างอิง');$reason=text($d['reason']??null,3,500,'เหตุผล');
    if(($d['verified']??false)!==true)fail(400,'กรุณาตรวจสอบตัวตนผู้จองก่อนออกลิงก์ใหม่');
    $out=transaction(function()use($ref,$reason){settings(true);$r=query('SELECT type,status FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();if(!$r)fail(404,'ไม่พบรายการ');
       if(!in_array($r['type'],['tables','shirts'],true))fail(400,'รายการนี้ไม่มีตั๋วอิเล็กทรอนิกส์');
       if(!in_array($r['status'],['pending','confirmed'],true))fail(409,'รายการยกเลิก ไม่สามารถออกลิงก์ตั๋วใหม่ได้');
       if(query('SELECT ref FROM ticket_redemptions WHERE ref=?',[$ref])->fetch())fail(409,'ตั๋วใช้แล้ว ไม่สามารถออกลิงก์ใหม่ได้');
       $token=bin2hex(random_bytes(32));query('UPDATE orders SET secret_hash=? WHERE ref=?',[hash('sha256',$token),$ref]);
       query('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)',[$ref,'ticket_token',js(['action'=>'ticket_reissued','reason'=>$reason]),time()]);return ['ref'=>$ref,'type'=>$r['type'],'token'=>$token];
    });reply(200,$out);
 }
 if($path==='/api/admin/order-status'){
    $ref=text($d['ref']??null,1,40,'เลขอ้างอิง');$status=$d['status']??'';if(!in_array($status,['pending','confirmed','rejected'],true))fail(400,'สถานะไม่ถูกต้อง');
    transaction(function()use($ref,$status){settings(true);$r=query('SELECT * FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();if(!$r)fail(404,'ไม่พบรายการ');
       if(query('SELECT ref FROM ticket_redemptions WHERE ref=?',[$ref])->fetch()&&$status!=='confirmed')fail(409,'ตั๋วใช้แล้ว ไม่สามารถเปลี่ยนสถานะได้');
       if($r['type']==='tables'){if($status==='rejected')query('DELETE FROM table_bookings WHERE order_ref=?',[$ref]);else claim_tables($ref,array_map('intval',explode(',',$r['tables_list'])),$status);}
       query('UPDATE orders SET status=? WHERE ref=?',[$status,$ref]);query('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)',[$ref,$r['status'],$status,time()]);});reply(200,['ok'=>true]);
 }
 if($path==='/api/admin/order-edit'){
    $ref=text($d['ref']??null,1,40,'เลขอ้างอิง');$reason=text($d['reason']??null,3,500,'เหตุผลแก้ไข');
    $out=transaction(function()use($d,$ref,$reason){$c=settings(true);$old=query('SELECT * FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();if(!$old)fail(404,'ไม่พบรายการ');
       if(query('SELECT ref FROM ticket_redemptions WHERE ref=?',[$ref])->fetch())fail(409,'ตั๋วใช้แล้ว ไม่สามารถแก้รายละเอียดได้');
       // Keep original pricing for corrections; explicit repricing uses current settings.
       $snap=json_decode($old['pricing_snapshot'],true)?:[];$pricing=$c;
       if(empty($d['reprice'])){if(isset($snap['table_unit_cents']))$pricing['table']=$snap['table_unit_cents']/100;if(isset($snap['shirt_unit_cents']))$pricing['shirt']=$snap['shirt_unit_cents']/100;if(isset($snap['shipping_cents'])&&$old['delivery_method']==='post')$pricing['shipping']=$snap['shipping_cents']/100;}
       [$r,$tables,$items]=normalize_order(array_replace($d,['type'=>$old['type']]),$pricing,payment_receipt($old)!==null);
       if(empty($d['reprice'])&&in_array($old['type'],['tables','shirts'],true)&&!isset($snap[$old['type']==='tables'?'table_unit_cents':'shirt_unit_cents'])){
          $same=$old['type']==='tables'?$r['tables_list']===$old['tables_list']:($r['delivery_method']===$old['delivery_method']&&quantities(order_items($ref))===quantities($items));
          if(!$same)fail(409,'รายการเก่าไม่มีราคาต่อหน่วย กรุณาเลือกใช้ราคาปัจจุบันก่อนแก้จำนวนหรือวิธีรับ');
          $r['amount_cents']=(int)$old['amount_cents'];$r['pricing_snapshot']=$old['pricing_snapshot'];
       }
       if(isset($snap['payment_receipt'])){$updated=json_decode($r['pricing_snapshot'],true);$updated['payment_receipt']=$snap['payment_receipt'];$r['pricing_snapshot']=js($updated);}
       if(cents($d['amount']??null,1)!==$r['amount_cents'])fail(409,'ยอดเงินไม่ตรงกับรายละเอียดที่แก้ไข');
       query('DELETE FROM table_bookings WHERE order_ref=?',[$ref]);if($old['type']==='tables')claim_tables($ref,$tables,$old['status']);query('DELETE FROM order_items WHERE order_ref=?',[$ref]);foreach($items as $it)query('INSERT INTO order_items(order_ref,size,qty) VALUES (?,?,?)',[$ref,$it['size'],$it['qty']]);
       $sets=[];foreach($r as $k=>$v)$sets[]='`'.$k.'`=?';query('UPDATE orders SET '.implode(',',$sets).' WHERE ref=?',[...array_values($r),$ref]);
       unset($old['slip'],$old['secret_hash'],$old['digest']);query('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)',[$ref,js($old),js(['reason'=>$reason,'order'=>$r]),time()]);return public_order(query('SELECT * FROM orders WHERE ref=?',[$ref])->fetch());});reply(200,$out);
 }
 if($path==='/api/admin/redeem'){
    $ref=text($d['ref']??null,1,40,'เลขอ้างอิง');transaction(function()use($ref){settings(true);$r=query('SELECT type,status,delivery_method FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();if(!$r||$r['status']!=='confirmed'||!in_array($r['type'],['tables','shirts'],true)||($r['type']==='shirts'&&$r['delivery_method']!=='pickup'))fail(409,'รายการนี้ยังไม่พร้อมใช้ตั๋ว');if(query('SELECT ref FROM ticket_redemptions WHERE ref=?',[$ref])->fetch())fail(409,'ตั๋วนี้ใช้แล้ว');query('INSERT INTO ticket_redemptions VALUES (?,?)',[$ref,time()]);query('INSERT INTO order_audit(ref,old,new,at) VALUES (?,?,?,?)',[$ref,'confirmed','redeemed',time()]);});reply(200,['ok'=>true]);
 }
 fail(404,'ไม่พบเส้นทาง');
}catch(PortalError $e){reply($e->getCode(),['error'=>$e->getMessage()]);}
catch(JsonException|TypeError|ValueError $e){reply(400,['error'=>'รูปแบบข้อมูลไม่ถูกต้อง']);}
catch(PDOException $e){error_log('Portal database failure SQLSTATE '.$e->getCode());reply(503,['error'=>'ระบบฐานข้อมูลขัดข้อง กรุณาลองใหม่ภายหลัง']);}
catch(Throwable $e){error_log('Portal failure: '.get_class($e));reply(503,['error'=>'ระบบยังไม่พร้อม กรุณาติดต่อผู้ดูแล']);}
