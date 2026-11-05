<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/lib.php';
if(!password_get_info(config()['admin_password_hash']??'')['algo'])throw new RuntimeException('Set admin_password_hash first');
$sql=file_get_contents(__DIR__.'/schema.sql');foreach(explode(';',$sql) as $statement)if(trim($statement))db()->exec($statement);
transaction(function(){query('INSERT IGNORE INTO app_settings VALUES (1,?,1)',[js(default_settings())]);query('INSERT IGNORE INTO reference_counter VALUES (1,100000)');});
$assets=$argv[1]??dirname(__DIR__).'/public_html/assets';
foreach([['default-compact','คืนสู่เหย้าศิษย์เก่า ครั้งที่ 2','poster-compact-v1.png'],['default-celebration','ทอดผ้าป่าเพื่อการศึกษา ครบรอบ 30 ปี','poster-celebration-v2.png']] as [$id,$title,$file]){if(is_file($assets.'/'.$file))query('INSERT IGNORE INTO posters(id,title,mime,image,created) VALUES (?,?,?,?,?)',[$id,$title,'image/png',file_get_contents($assets.'/'.$file),time()]);}
if(!query('SELECT id FROM blessings LIMIT 1')->fetch())query('INSERT INTO blessings(message,active,created_at) VALUES (?,1,?)',['ขออานุภาพแห่งบุญกุศล ดลบันดาลให้ท่านและครอบครัวมีความสุขความเจริญ',time()]);
echo "Installation checked; existing records preserved.\n";
