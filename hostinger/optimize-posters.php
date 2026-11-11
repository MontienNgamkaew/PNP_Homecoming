<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/lib.php';require __DIR__.'/poster-images.php';
$path=$argv[1]??'';if(!$path||file_exists($path))throw new RuntimeException('Provide a new private backup path');
$rows=query('SELECT id,mime,image FROM posters WHERE deleted_at IS NULL ORDER BY id')->fetchAll();$backup=['format'=>'poster-image-backup-v1','created'=>gmdate('c'),'posters'=>[]];$changes=[];
foreach($rows as $row){[$raw,$mime]=optimize_poster_image($row['image'],$row['mime']);$backup['posters'][]=['id'=>$row['id'],'mime'=>$row['mime'],'image_base64'=>base64_encode($row['image']),'sha256'=>hash('sha256',$row['image'])];$changes[]=['id'=>$row['id'],'raw'=>$raw,'mime'=>$mime,'old_hash'=>hash('sha256',$row['image']),'before'=>strlen($row['image'])];}
$fp=fopen($path,'x');if(!$fp)throw new RuntimeException('Cannot create backup');chmod($path,0600);$json=js($backup);if(fwrite($fp,$json)!==strlen($json))throw new RuntimeException('Backup write incomplete; no images updated');fclose($fp);
transaction(function()use($changes){foreach($changes as $r){$s=query('UPDATE posters SET image=?,mime=? WHERE id=? AND SHA2(image,256)=? AND deleted_at IS NULL',[$r['raw'],$r['mime'],$r['id'],$r['old_hash']]);echo $r['id'].' '.$r['before'].' -> '.strlen($r['raw']).' bytes; rows='.$s->rowCount()."\n";}});
echo 'Original public images backed up; SHA256 '.hash_file('sha256',$path)."\n";
