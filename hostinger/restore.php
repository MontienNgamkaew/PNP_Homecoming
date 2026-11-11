<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/lib.php';
if(($argv[2]??'')!=='--confirm-empty')throw new RuntimeException('Usage: php restore.php /private/backup.json --confirm-empty (NEW empty database only)');
$backup=json_decode(file_get_contents($argv[1]),true,512,JSON_THROW_ON_ERROR);if(($backup['format']??'')!=='portal-backup-v1')throw new RuntimeException('Unknown backup format');
$tables=['app_settings','reference_counter','orders','table_bookings','order_items','order_audit','settings_audit','blessings','posters','ticket_redemptions','tax_requests','tax_request_audit'];
if(array_diff(array_keys($backup['tables']??[]),$tables))throw new RuntimeException('Unexpected tables');
foreach(explode(';',file_get_contents(__DIR__.'/schema.sql')) as $statement)if(trim($statement))db()->exec($statement);
transaction(function()use($tables,$backup){foreach($tables as $table)if((int)query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn()!==0)throw new RuntimeException('Destination is not empty. Use a NEW database; existing records were not changed.');
 foreach($tables as $table){$columns=query('SHOW COLUMNS FROM `'.$table.'`')->fetchAll(PDO::FETCH_COLUMN);foreach($backup['tables'][$table]??[] as $r){if(array_diff(array_keys($r),$columns))throw new RuntimeException('Unexpected columns');foreach(['slip','image'] as $column)if(isset($r[$column])){if(!is_array($r[$column])||!isset($r[$column]['base64']))throw new RuntimeException('Invalid binary');$r[$column]=base64_decode($r[$column]['base64'],true);if($r[$column]===false)throw new RuntimeException('Invalid base64');}$keys=array_keys($r);query('INSERT INTO `'.$table.'` (`'.implode('`,`',$keys).'`) VALUES ('.implode(',',array_fill(0,count($keys),'?')).')',array_values($r));}}
 if(!query('SELECT id FROM app_settings WHERE id=1')->fetch()||!query('SELECT id FROM reference_counter WHERE id=1')->fetch())throw new RuntimeException('Incomplete backup');
});
foreach($tables as $table)echo $table.': '.query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn()."\n";
echo "Restore committed. Sessions not restored; sign in again.\n";
