<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');
function config(): array {
    static $config;
    if ($config === null) {
        $path = getenv('PORTAL_CONFIG') ?: __DIR__.'/config.php';
        if (!is_file($path)) throw new RuntimeException('Configuration missing');
        $config = require $path;
        if (!is_array($config) || !preg_match('~^https?://[^/]+$~D', $config['origin'] ?? '')) throw new RuntimeException('Invalid origin');
        $origin=parse_url($config['origin']);
        if(!$origin||empty($origin['host'])||isset($origin['user'])||isset($origin['pass'])||isset($origin['query'])||isset($origin['fragment']))throw new RuntimeException('Invalid origin');
        $local=in_array(strtolower($origin['host']),['localhost','127.0.0.1','[::1]'],true);
        if(!$local&&(!str_starts_with($config['origin'],'https://')||($config['secure_cookie']??true)!==true))throw new RuntimeException('Public sites require HTTPS and secure cookies');
        if (($config['secure_cookie'] ?? true) && !str_starts_with($config['origin'], 'https://')) throw new RuntimeException('HTTPS required');
    }
    return $config;
}
function db(): PDO {
    static $db;
    if (!$db) {
        $c=config();
        $db=new PDO($c['dsn'],$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    }
    return $db;
}
function query(string $sql, array $args=[]): PDOStatement {$s=db()->prepare($sql);$s->execute($args);return $s;}
function js(mixed $value): string {return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);}
function fail(int $code,string $message): never {throw new PortalError($message,$code);}
class PortalError extends RuntimeException {}
function reply(int $code,mixed $data,string $mime='application/json; charset=utf-8',array $headers=[]): never {
    http_response_code($code);header('Content-Type: '.$mime);header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    foreach($headers as $k=>$v)header($k.': '.$v);
    echo str_starts_with($mime,'application/json')?js($data):$data;exit;
}
function text(mixed $v,int $min,int $max,string $label): string {
    if(!is_string($v))fail(400,$label.'ไม่ถูกต้อง');$v=trim($v);
    if(mb_strlen($v)<$min||mb_strlen($v)>$max)fail(400,$label.'ไม่ถูกต้อง');return $v;
}
function cents(mixed $v,int $min=0): int {
    if(is_bool($v)||(!is_string($v)&&!is_int($v)&&!is_float($v))||!preg_match('/^\d{1,8}(?:\.\d{1,2})?$/D',(string)$v))fail(400,'จำนวนเงินไม่ถูกต้อง');
    $parts=explode('.',(string)$v);$n=(int)$parts[0]*100+(int)str_pad($parts[1]??'',2,'0');
    if($n<$min*100||$n>1000000000)fail(400,'จำนวนเงินไม่ถูกต้อง');return $n;
}
function default_hero(): array {return ['eyebrow'=>'HOMECOMING / ครั้งที่ 2','line1'=>'คิดถึงกัน','line2'=>'กลับมา','accent'=>'พบกัน.','description'=>"คืนสู่เหย้าศิษย์เก่า การอาชีพพนมไพร\nฉลอง 30 ปีแห่งความผูกพัน",'desktopTitle'=>34,'mobileTitle'=>27,'desktopLabel'=>14,'mobileLabel'=>12,'desktopDescription'=>14,'mobileDescription'=>14];}
function default_accounts(): array {$a=['bank'=>'ธนาคารออมสิน','name'=>'ระดมทุนทรัพยากร วก.พนมไพร','number'=>'020441298401'];return ['donate'=>$a,'fund'=>$a,'tables'=>$a,'shirts'=>$a];}
function default_settings(): array {return ['shirt'=>299,'table'=>2500,'shipping'=>50,'event'=>'2 มกราคม 2570','qr'=>(object)[],'hero'=>default_hero(),'accounts'=>default_accounts(),'payment_live'=>false];}
function settings(bool $lock=false): array {
    $r=query('SELECT config,revision FROM app_settings WHERE id=1'.($lock?' FOR UPDATE':''))->fetch();
    $c=json_decode($r['config'],true,512,JSON_THROW_ON_ERROR);$c=array_replace(default_settings(),$c);
    foreach(default_accounts() as $kind=>$account)$c['accounts'][$kind]=array_replace($account,$c['accounts'][$kind]??[]);
    $c['hero']=array_replace(default_hero(),$c['hero']??[]);$c['qr']=(object)($c['qr']??[]);$c['revision']=(int)$r['revision'];$c['backend']='php';return $c;
}
function image_file(mixed $encoded,int $max,bool $pdf=false): array {
    if(!is_string($encoded)||strlen($encoded)>ceil($max/3)*4)fail(400,'ไฟล์ใหญ่เกินกำหนด');
    $raw=base64_decode($encoded,true);if($raw===false||strlen($raw)<1||strlen($raw)>$max)fail(400,'ไฟล์ไม่ถูกต้องหรือใหญ่เกินกำหนด');
    if($pdf&&str_starts_with($raw,'%PDF-'))return [$raw,'application/pdf'];
    $image=@getimagesizefromstring($raw);
    if(!$image||!in_array($image['mime'],['image/png','image/jpeg','image/webp'],true)||$image[0]*$image[1]>40000000)fail(400,'รองรับภาพ PNG, JPG, WebP ที่ถูกต้องเท่านั้น');
    return [$raw,$image['mime']];
}
function validated_settings(array $d): array {
    $r=[];foreach(['shirt','table','shipping'] as $k)$r[$k]=cents($d[$k]??null,$k==='shipping'?0:1)/100;
    $r['event']=text($d['event']??null,1,150,'วันที่จัดงาน');
    $shirt=$d['shirt_image']??'';if($shirt!==''){if(!is_string($shirt)||!preg_match('~^data:(image/(?:png|jpeg|webp));base64,(.+)$~sD',$shirt,$m))fail(400,'ภาพเสื้อไม่ถูกต้อง');[$raw,$mime]=image_file($m[2],1024*1024);if($mime!==$m[1])fail(400,'ภาพเสื้อไม่ถูกต้อง');}$r['shirt_image']=$shirt;
    $r['qr']=[];$qr=$d['qr']??[];if(!is_array($qr)||array_diff(array_keys($qr),['donate','fund','tables','shirts']))fail(400,'ประเภท QR ไม่ถูกต้อง');
    foreach($qr as $k=>$v){if(!is_string($v)||!preg_match('~^data:(image/(?:png|jpeg));base64,(.+)$~sD',$v,$m))fail(400,'QR ไม่ถูกต้อง');[$raw,$mime]=image_file($m[2],1024*1024);if($mime!==$m[1])fail(400,'QR ไม่ถูกต้อง');$r['qr'][$k]=$v;}
    $r['qr']=(object)$r['qr'];$hero=$d['hero']??default_hero();if(!is_array($hero))fail(400,'ข้อมูลแบนเนอร์ไม่ถูกต้อง');
    foreach(default_hero() as $k=>$v){$val=$hero[$k]??$v;if(is_string($v)){$r['hero'][$k]=text($val,0,$k==='description'?400:100,'ข้อความแบนเนอร์');}else{if(!is_int($val)||$val<12||$val>(str_contains($k,'Title')?64:28))fail(400,'ขนาดตัวอักษรไม่ถูกต้อง');$r['hero'][$k]=$val;}}
    $accounts=$d['accounts']??default_accounts();
    if(!is_array($accounts)||array_diff(array_keys($accounts),array_keys(default_accounts())))fail(400,'ข้อมูลบัญชีไม่ถูกต้อง');
    $accounts=array_replace(default_accounts(),$accounts);
    foreach(array_keys(default_accounts()) as $kind){$a=$accounts[$kind];if(!is_array($a))fail(400,'ข้อมูลบัญชีไม่ถูกต้อง');$number=$a['number']??null;if(!is_string($number))fail(400,'เลขบัญชีไม่ถูกต้อง');$number=preg_replace('/[ -]/','',trim($number));if(!preg_match('/^[0-9]{6,20}$/D',$number))fail(400,'เลขบัญชีไม่ถูกต้อง');$r['accounts'][$kind]=['bank'=>text($a['bank']??null,1,100,'ธนาคาร'),'name'=>text($a['name']??null,2,150,'ชื่อบัญชี'),'number'=>$number];}
    if(isset($d['payment_live'])&&!is_bool($d['payment_live']))fail(400,'โหมดรับชำระไม่ถูกต้อง');
    $r['payment_live']=$d['payment_live']??false;
    if($r['payment_live']&&count((array)$r['qr'])!==4)fail(400,'กรุณาตั้ง QR จริงครบทั้ง 4 ประเภทก่อนเปิดรับชำระ');return $r;
}
function auth(): void {
    $t=$_COOKIE['admin']??'';if(!is_string($t)||!query('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires>?',[hash('sha256',$t),time()])->fetch())fail(401,'กรุณาเข้าสู่ระบบ');
}
function limited(string $scope,int $max): void {
    // REMOTE_ADDR is supplied by web server. Do not accept client-controlled X-Forwarded-For.
    $key=hash('sha256',$scope.($_SERVER['REMOTE_ADDR']??''));$now=time();
    query('DELETE FROM limits WHERE expires<?',[$now]);
    query('INSERT INTO limits(bucket,count,expires) VALUES (?,1,?) ON DUPLICATE KEY UPDATE count=count+1',[$key,$now+900]);
    if((int)query('SELECT count FROM limits WHERE bucket=?',[$key])->fetchColumn()>$max)fail(429,'ส่งบ่อยเกินไป กรุณาลองใหม่ใน 15 นาที');
}
function transaction(callable $fn): mixed {
    db()->beginTransaction();try{$r=$fn();db()->commit();return $r;}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function normalize_order(array $d,array $c,bool $cash=false): array {
    $map=['tables'=>'tables','โต๊ะจีน'=>'tables','shirts'=>'shirts','เสื้อที่ระลึก'=>'shirts','donate'=>'donate','ทอดผ้าป่า'=>'donate','fund'=>'fund','กองทุนช่างกล'=>'fund'];
    $type=$map[$d['type']??'']??null;if(!$type)fail(400,'ประเภทรายการไม่ถูกต้อง');
    $r=['type'=>$type,'name'=>text($d['name']??null,2,150,'ชื่อ–นามสกุล'),'phone'=>text($d['phone']??'',($cash&&in_array($type,['donate','fund'],true))?0:9,20,'เบอร์โทร'),'delivery_method'=>null,'recipient_name'=>null,'shipping_address'=>null,'postcode'=>null,'tables_list'=>'','category'=>$type==='fund'?'กองทุนช่างกลโรงงาน':($type==='donate'?'ร่วมทำบุญทอดผ้าป่า':null)];
    if($r['phone']!==''&&!preg_match('/^[0-9+ ()-]{9,20}$/D',$r['phone']))fail(400,'เบอร์โทรไม่ถูกต้อง');$tables=[];$items=[];$price=['settings_revision'=>$c['revision']];
    if($type==='tables'){
        if(!isset($d['tables'])||!is_array($d['tables'])||!count($d['tables'])||count($d['tables'])>61)fail(400,'กรุณาเลือกโต๊ะ');
        foreach($d['tables'] as $n){if(!(is_int($n)||(is_string($n)&&ctype_digit($n)))||(int)$n<1||(int)$n>61)fail(400,'หมายเลขโต๊ะไม่ถูกต้อง');$tables[]=(int)$n;}
        $tables=array_values(array_unique($tables));sort($tables);$r['tables_list']=implode(',',$tables);$price['table_unit_cents']=cents($c['table'],1);$amount=count($tables)*$price['table_unit_cents'];
    }elseif($type==='shirts'){
        if(!isset($d['lines'])||!is_array($d['lines'])||!count($d['lines'])||count($d['lines'])>100)fail(400,'กรุณาเลือกเสื้อ');
        foreach($d['lines'] as $it){if(!is_array($it))fail(400,'รายการเสื้อไม่ถูกต้อง');$size=$it['size']??'';$qty=$it['qty']??0;if(!in_array($size,['XS','S','M','L','XL','2XL','3XL','4XL'],true)||!is_int($qty)||$qty<1||$qty>100)fail(400,'ไซซ์หรือจำนวนเสื้อไม่ถูกต้อง');$items[]=['size'=>$size,'qty'=>$qty];}
        $delivery=$d['delivery']??'pickup';if(!in_array($delivery,['pickup','post'],true))fail(400,'วิธีรับเสื้อไม่ถูกต้อง');$r['delivery_method']=$delivery;
        if($delivery==='post'){$r['recipient_name']=text($d['recipient']??null,1,150,'ชื่อผู้รับ');$r['shipping_address']=text($d['address']??null,5,1000,'ที่อยู่');$r['postcode']=text($d['postcode']??null,5,5,'รหัสไปรษณีย์');if(!ctype_digit($r['postcode']))fail(400,'รหัสไปรษณีย์ไม่ถูกต้อง');}
        $price['shirt_unit_cents']=cents($c['shirt'],1);$price['shipping_cents']=$delivery==='post'?cents($c['shipping']):0;$amount=array_sum(array_column($items,'qty'))*$price['shirt_unit_cents']+$price['shipping_cents'];
    }else{$amount=cents($d['amount']??null,1);}
    $r['amount_cents']=$amount;$r['pricing_snapshot']=js($price);return [$r,$tables,$items];
}
function allocate_ref(): string {
    $n=(int)query('SELECT next_number FROM reference_counter WHERE id=1 FOR UPDATE')->fetchColumn();
    while($n<=999999&&query('SELECT ref FROM orders WHERE ref=?',[(string)$n])->fetch())$n++;
    if($n>999999)fail(409,'เลขอ้างอิงเต็มแล้ว กรุณาติดต่อผู้ดูแล');query('UPDATE reference_counter SET next_number=? WHERE id=1',[$n+1]);return (string)$n;
}
function claim_tables(string $ref,array $tables,string $status): void {
    if($status==='rejected')return;
    foreach($tables as $n){$old=query('SELECT order_ref FROM table_bookings WHERE table_number=? FOR UPDATE',[$n])->fetchColumn();if($old!==false&&$old!==$ref)fail(409,'โต๊ะหมายเลข '.$n.' ถูกจองแล้ว กรุณาเลือกโต๊ะอื่น');query('INSERT INTO table_bookings VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),updated_at=VALUES(updated_at)',[$n,$ref,$status,time()]);}
}
function order_items(string $ref): array {$items=query('SELECT size,SUM(qty) AS qty FROM order_items WHERE order_ref=? GROUP BY size',[$ref])->fetchAll();foreach($items as &$it)$it['qty']=(int)$it['qty'];return $items;}
function canonical_phone(mixed $value): string {
    if(!is_string($value)||!preg_match('/^[0-9+ ()-]{9,25}$/D',trim($value)))return '';
    $digits=preg_replace('/[^0-9]/','',$value);
    if(str_starts_with($digits,'0066')&&in_array(strlen($digits),[12,13],true))$digits='0'.substr($digits,4);
    elseif(str_starts_with($digits,'66')&&in_array(strlen($digits),[10,11],true))$digits='0'.substr($digits,2);
    return strlen($digits)>=9&&strlen($digits)<=15?$digits:'';
}
function order_search(): array {
    $q=$_GET['q']??'';$kind=$_GET['type']??'';$status=$_GET['status']??'';
    if(!is_string($q)||mb_strlen($q)>150||!in_array($kind,['','donate','fund','tables','shirts'],true)||!in_array($status,['','pending','confirmed','rejected'],true))fail(400,'ตัวกรองไม่ถูกต้อง');
    $clauses=[];$args=[];$q=trim($q);
    if($q!==''){$clauses[]='(ref LIKE ? OR name LIKE ? OR phone LIKE ?)';$args=array_fill(0,3,'%'.$q.'%');}
    foreach(['type'=>$kind,'status'=>$status] as $key=>$value)if($value!==''){$clauses[]=$key.'=?';$args[]=$value;}
    return [count($clauses)?' WHERE '.implode(' AND ',$clauses):'',$args];
}
function quantities(array $items): array {$r=[];foreach($items as $it)$r[$it['size']]=($r[$it['size']]??0)+(int)$it['qty'];ksort($r);return $r;}
function payment_receipt(array $r): ?array {return (json_decode($r['pricing_snapshot']??'{}',true)?:[])['payment_receipt']??null;}
function public_order(array $r): array {$receipt=payment_receipt($r);$r['payment_method']=$receipt?'cash':'transfer';if($receipt){unset($receipt['request_id']);$r['cash_receipt']=$receipt;}$r['has_slip']=!empty($r['mime'])&&$r['mime']!=='text/plain';unset($r['secret_hash'],$r['digest'],$r['slip'],$r['mime']);$r['amount_cents']=(int)$r['amount_cents'];$r['created']=(int)$r['created'];if($r['type']==='shirts')$r['items']=order_items($r['ref']);return $r;}
