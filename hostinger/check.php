<?php
declare(strict_types=1);
// Read-only preflight; keep outside public_html and run using the host's PHP CLI.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$failed=false;
function check_result(string $name,bool $ok,string $detail=''): void {
    global $failed;if(!$ok)$failed=true;echo ($ok?'PASS ':'FAIL ').$name.($detail!==''?' — '.$detail:'').PHP_EOL;
}
check_result('PHP >= 8.2',version_compare(PHP_VERSION,'8.2.0','>='),PHP_VERSION);
foreach(['pdo_mysql','mbstring','fileinfo','openssl'] as $extension)check_result('Extension '.$extension,extension_loaded($extension));
check_result('Image metadata support',function_exists('getimagesizefromstring'));
require __DIR__.'/lib.php';
try{
 $c=config();$url=parse_url($c['origin']);$local=in_array(strtolower($url['host']??''),['localhost','127.0.0.1','[::1]'],true);
 check_result('HTTPS origin',str_starts_with($c['origin'],'https://')||$local,$local?'local verification only':$c['origin']);
 check_result('Secure admin cookie',($c['secure_cookie']??true)===true||$local);
 check_result('Admin password hash',(bool)password_get_info($c['admin_password_hash']??'')['algo']);
 $path=getenv('PORTAL_CONFIG')?:__DIR__.'/config.php';$mode=fileperms($path)&0777;
 if($mode&0077)echo "WARN Private config should normally have mode 600; confirm host account isolation.\n";
 $version=(string)query('SELECT VERSION()')->fetchColumn();check_result('MySQL/MariaDB connection',db()->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql',$version);
 $packet=(int)query('SELECT @@max_allowed_packet')->fetchColumn();check_result('max_allowed_packet >= 8 MiB',$packet>=8*1024*1024,(string)$packet);
 $required=['app_settings','reference_counter','orders','table_bookings','order_items','order_audit','settings_audit','blessings','posters','limits','admin_sessions','ticket_redemptions','tax_requests','tax_request_audit'];
 $tables=query('SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->fetchAll();$indexed=array_column($tables,null,'TABLE_NAME');
 foreach($required as $table){$r=$indexed[$table]??null;check_result('Table '.$table,$r&&strtoupper($r['ENGINE']??'')==='INNODB'&&str_starts_with($r['TABLE_COLLATION']??'','utf8mb4'));}
 if(!$failed){
   $settings=settings();check_result('Four account settings',count($settings['accounts'])===4);
   foreach($settings['accounts'] as $kind=>$account)check_result('Account '.$kind,isset($account['name'],$account['bank'],$account['number'])&&(bool)preg_match('/^[0-9]{6,20}$/D',$account['number']));
   echo 'INFO Uploaded QR: '.count((array)$settings['qr'])."/4; missing QR uses bank details. Verify recipient in banking app.\n";
   $outside=(int)query('SELECT COUNT(*) FROM table_bookings WHERE table_number NOT BETWEEN 1 AND 61')->fetchColumn();check_result('Existing tables fit A–G layout',$outside===0);
   check_result('Reference counter',(int)query('SELECT next_number FROM reference_counter WHERE id=1')->fetchColumn()<=999999);
 }
 echo "INFO This read-only CLI check does not verify web PHP limits, LiteSpeed rewrites, SSL/DNS, restore scheduling or bank ownership.\n";
}catch(Throwable $e){check_result('Configuration/database ready',false,'Check private configuration, DB credentials, schema and permissions; secrets are not printed.');}
exit($failed?1:0);
