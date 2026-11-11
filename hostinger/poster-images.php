<?php
declare(strict_types=1);
function optimize_poster_image(string $raw,string $mime): array {
 $info=@getimagesizefromstring($raw);if(!$info)fail(400,'ไฟล์ภาพไม่ถูกต้อง');[$w,$h]=$info;$limit=600*1024;$edge=2000;
 if($w*$h>16000000)fail(400,'กรุณาย่อภาพก่อนอัปโหลด ภาพใหญ่เกิน 16 ล้านพิกเซล');
 if(in_array($mime,['image/webp','image/jpeg'],true)&&strlen($raw)<=$limit&&max($w,$h)<=$edge)return [$raw,$mime];
 if(!function_exists('imagewebp')){if(strlen($raw)<=$limit&&max($w,$h)<=$edge)return [$raw,$mime];fail(503,'ตัวบีบอัดภาพยังไม่พร้อม กรุณาลองอัปโหลดผ่านหน้าเว็บไซต์');}
 $source=@imagecreatefromstring($raw);if(!$source)fail(400,'ไม่สามารถอ่านภาพนี้ได้');$scale=min(1,$edge/max($w,$h));
 try{
  for($step=0;$step<8;$step++){
   $width=max(1,(int)round($w*$scale));$height=max(1,(int)round($h*$scale));$image=imagecreatetruecolor($width,$height);
   try{
    $white=imagecolorallocate($image,255,255,255);imagefill($image,0,0,$white);imagecopyresampled($image,$source,0,0,0,0,$width,$height,$w,$h);
    foreach([86,82,78,74] as $quality){ob_start();$ok=imagewebp($image,null,$quality);$encoded=ob_get_clean();if(!$ok||$encoded==='')fail(400,'บีบอัดภาพไม่สำเร็จ');if(strlen($encoded)<=$limit){if(strlen($raw)<strlen($encoded)&&max($w,$h)<=$edge)return [$raw,$mime];return [$encoded,'image/webp'];}}
   }finally{unset($image);}
   $scale*=0.85;
  }
  fail(400,'ไม่สามารถบีบอัดภาพให้เล็กพอได้ กรุณาเลือกภาพอื่น');
 }finally{unset($source);}
}
