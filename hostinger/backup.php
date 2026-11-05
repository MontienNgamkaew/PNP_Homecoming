<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/lib.php';
$path=$argv[1]??'';if(!$path||file_exists($path))throw new RuntimeException('Provide a new private backup filename');
$tables=['app_settings','reference_counter','orders','table_bookings','order_items','order_audit','settings_audit','blessings','posters','ticket_redemptions'];
$backup=['format'=>'portal-backup-v1','created'=>date(DATE_ATOM),'tables'=>[]];
transaction(function()use($tables,&$backup){foreach($tables as $table){$rows=query('SELECT * FROM `'.$table.'`')->fetchAll();foreach($rows as &$r){foreach(['slip','image'] as $column)if(isset($r[$column]))$r[$column]=['base64'=>base64_encode($r[$column])];}unset($r);$backup['tables'][$table]=$rows;}});
$fp=fopen($path,'x');if(!$fp)throw new RuntimeException('Cannot create backup');chmod($path,0600);fwrite($fp,js($backup));fclose($fp);echo "Backup written; SHA256 ".hash_file('sha256',$path)."\n";
