<?php
declare(strict_types=1);
// Included only by authenticated admin report routes.
function report_filters(array $input): array {
 $f=['type'=>$input['type']??'all','status'=>$input['status']??'confirmed','payment'=>$input['payment']??'all','from'=>$input['from']??'','to'=>$input['to']??''];
 foreach(['type'=>['all','donate','fund','tables','shirts'],'status'=>['confirmed','pending','active','rejected','all'],'payment'=>['all','cash','transfer']] as $k=>$allowed)if(!is_string($f[$k])||!in_array($f[$k],$allowed,true))fail(400,'ตัวกรองรายงานไม่ถูกต้อง');
 $tz=new DateTimeZone('Asia/Bangkok');
 foreach(['from','to'] as $k){if(!is_string($f[$k]))fail(400,'วันที่ไม่ถูกต้อง');if($f[$k]!==''){$d=DateTimeImmutable::createFromFormat('!Y-m-d',$f[$k],$tz);if(!$d||$d->format('Y-m-d')!==$f[$k])fail(400,'วันที่ไม่ถูกต้อง');}}
 if($f['from']!==''&&$f['to']!==''&&$f['from']>$f['to'])fail(400,'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');return $f;
}
function report_where(array $f): array {
 $where=[];$args=[];
 if($f['type']!=='all'){$where[]='o.type=?';$args[]=$f['type'];}
 if($f['status']==='active')$where[]="o.status IN ('pending','confirmed')";
 elseif($f['status']!=='all'){$where[]='o.status=?';$args[]=$f['status'];}
 foreach(['from'=>'>=','to'=>'<'] as $k=>$op)if($f[$k]!==''){$date=new DateTimeImmutable($f[$k],new DateTimeZone('Asia/Bangkok'));if($k==='to')$date=$date->modify('+1 day');$where[]='o.created '.$op.' ?';$args[]=$date->getTimestamp();}
 $cash="COALESCE(JSON_UNQUOTE(JSON_EXTRACT(o.pricing_snapshot,'$.payment_receipt.method')),'transfer')='cash'";
 if($f['payment']!=='all')$where[]=$f['payment']==='cash'?$cash:'NOT ('.$cash.')';
 return [$where?' WHERE '.implode(' AND ',$where):'',$args,$cash];
}
function report_summary(array $f): array {
 return transaction(function()use($f){settings(true);[$where,$args,$cash]=report_where($f);
  $by=[];foreach(['donate','fund','tables','shirts'] as $kind)$by[$kind]=['count'=>0,'amount_cents'=>0,'cash_cents'=>0,'transfer_cents'=>0];
  foreach(query("SELECT o.type,COUNT(*) AS count,COALESCE(SUM(o.amount_cents),0) AS amount_cents,COALESCE(SUM(CASE WHEN $cash THEN o.amount_cents ELSE 0 END),0) AS cash_cents FROM orders o$where GROUP BY o.type",$args)->fetchAll() as $r){foreach(['count','amount_cents','cash_cents'] as $key)$r[$key]=(int)$r[$key];$r['transfer_cents']=$r['amount_cents']-$r['cash_cents'];$kind=$r['type'];unset($r['type']);if(isset($by[$kind]))$by[$kind]=$r;}
  $sizes=[];foreach(['XS','S','M','L','XL','2XL','3XL','4XL'] as $size)$sizes[$size]=['size'=>$size,'qty'=>0,'pickup'=>0,'post'=>0];
  $shirtFilter=$f;$shirtFilter['type']=$f['type']==='all'?'shirts':$f['type'];[$sw,$sa]=report_where($shirtFilter);
  if(in_array($f['type'],['all','shirts'],true))foreach(query("SELECT i.size,SUM(i.qty) AS qty,SUM(CASE WHEN o.delivery_method='pickup' THEN i.qty ELSE 0 END) AS pickup,SUM(CASE WHEN o.delivery_method='post' THEN i.qty ELSE 0 END) AS post FROM order_items i JOIN orders o ON o.ref=i.order_ref$sw GROUP BY i.size",$sa)->fetchAll() as $r){foreach(['qty','pickup','post'] as $k)$r[$k]=(int)$r[$k];if(isset($sizes[$r['size']]))$sizes[$r['size']]=$r;}
  $tableExpr="CASE WHEN o.tables_list='' OR o.tables_list IS NULL THEN 0 ELSE LENGTH(o.tables_list)-LENGTH(REPLACE(o.tables_list,',',''))+1 END";
  $tableCount=(int)query("SELECT COALESCE(SUM(CASE WHEN o.type='tables' THEN $tableExpr ELSE 0 END),0) FROM orders o$where",$args)->fetchColumn();
  return ['filters'=>$f,'by_type'=>$by,'total_cents'=>array_sum(array_column($by,'amount_cents')),'order_count'=>array_sum(array_column($by,'count')),'shirt_sizes'=>array_values($sizes),'shirt_qty'=>array_sum(array_column($sizes,'qty')),'table_count'=>$tableCount,'guests'=>$tableCount*8,'generated_at'=>gmdate('c'),'date_basis'=>'วันที่บันทึกรายการ (เวลาไทย)'];
 });
}
function report_csv_cell(mixed $v): mixed {
 if(is_string($v)&&preg_match('/^[\x00-\x20\x{FEFF}]*[=+\-@]|^[\t\r\n]/u',$v))return "'".$v;
 return $v;
}
function report_table_names(string $list): string {
 $labels=[];foreach(array_filter(explode(',',$list)) as $value){$n=(int)$value;if($n>=1&&$n<=8)$labels[]='A'.$n;elseif($n<=16&&$n>=9)$labels[]='B'.($n-8);elseif($n>=17&&$n<=61)$labels[]=chr(67+intdiv($n-17,9)).(($n-17)%9+1);}
 return implode(', ',$labels);
}
function export_report_csv(array $f,string $dataset): never {
 if(!in_array($dataset,['summary','orders','shirt-sizes','shirt-people','shirt-lines'],true))fail(400,'ประเภทรายงานไม่ถูกต้อง');
 if(str_starts_with($dataset,'shirt-')){if(!in_array($f['type'],['all','shirts'],true))fail(400,'กรุณาเลือกประเภทเสื้อ');$f['type']='shirts';}
 $summary=report_summary($f);[$where,$args,$cash]=report_where($f);
 // A repeatable read makes the sizes/people rows in a file one consistent snapshot.
 db()->beginTransaction();
 try{
  $typeLabels=['donate'=>'ผ้าป่า','fund'=>'กองทุนช่างกล','tables'=>'จองโต๊ะจีน','shirts'=>'จองเสื้อ'];$statuses=['pending'=>'รอตรวจสอบ','confirmed'=>'ยืนยันแล้ว','rejected'=>'ยกเลิก / ไม่ผ่าน'];$allSizes=['XS','S','M','L','XL','2XL','3XL','4XL'];
  $filename='pnp-'.$dataset.'-'.$f['type'].'-'.$f['status'].'-'.$f['payment'].'-'.($f['from']?:'all').'-'.($f['to']?:'all').'-'.gmdate('Ymd-His').'.csv';
  header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="'.$filename.'"');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
  $out=fopen('php://output','wb');fwrite($out,"\xEF\xBB\xBF");
  $write=function(array $row)use($out){fputcsv($out,array_map('report_csv_cell',$row),',','"','',"\r\n");};$money=fn($c)=>number_format((int)$c/100,2,'.','');
  if($dataset==='summary'){
   $write(['ประเภท','จำนวนรายการ','ยอดรวม (บาท)','เงินสด (บาท)','เงินโอน (บาท)']);$cashTotal=0;$transferTotal=0;
   foreach($summary['by_type'] as $kind=>$r){$write([$typeLabels[$kind],$r['count'],$money($r['amount_cents']),$money($r['cash_cents']),$money($r['transfer_cents'])]);$cashTotal+=$r['cash_cents'];$transferTotal+=$r['transfer_cents'];}
   $write(['รวม',$summary['order_count'],$money($summary['total_cents']),$money($cashTotal),$money($transferTotal)]);
  }elseif($dataset==='shirt-sizes'){
   $write(['ไซซ์','รับที่วิทยาลัย (ตัว)','ไปรษณีย์ (ตัว)','รวม (ตัว)']);$pickup=0;$post=0;
   foreach($summary['shirt_sizes'] as $r){$write([$r['size'],$r['pickup'],$r['post'],$r['qty']]);$pickup+=$r['pickup'];$post+=$r['post'];}$write(['รวม',$pickup,$post,$summary['shirt_qty']]);
  }else{
   $columns=[];foreach($allSizes as $size)$columns[]="COALESCE((SELECT SUM(i.qty) FROM order_items i WHERE i.order_ref=o.ref AND i.size='$size'),0) AS qty_$size";
   $stmt=query('SELECT o.ref,o.type,o.name,o.amount_cents,o.created,o.transferred,o.status,o.delivery_method,o.tables_list,o.pricing_snapshot,'.implode(',',$columns)." FROM orders o$where ORDER BY o.created,o.ref",$args);
   if($dataset==='shirt-lines')$write(['เลขอ้างอิง','ผู้จอง','ไซซ์','จำนวน (ตัว)','วิธีรับ','ช่องทางชำระ','สถานะ']);
   elseif($dataset==='shirt-people')$write(['เลขอ้างอิง','ผู้จอง',...$allSizes,'รวม (ตัว)','วิธีรับ','ยอดต่อรายการรวมค่าจัดส่ง (บาท)','ช่องทางชำระ','สถานะ']);
   else $write(['เลขอ้างอิง','วันที่บันทึก (เวลาไทย)','ประเภท','ชื่อผู้บริจาค / ผู้จอง','ยอดต่อรายการรวมค่าจัดส่ง (บาท)','ช่องทางชำระ','วันที่รับเงิน / แจ้งโอน','สถานะ','รหัสโต๊ะ','จำนวนโต๊ะ','จำนวนผู้ร่วมโต๊ะ','วิธีรับเสื้อ',...$allSizes,'รวมเสื้อ (ตัว)']);
   while($r=$stmt->fetch()){
    $quantities=[];foreach($allSizes as $size)$quantities[]=(int)$r['qty_'.$size];$qty=array_sum($quantities);$receipt=payment_receipt($r);$method=$receipt?'เงินสด':'เงินโอน';$status=$statuses[$r['status']]??$r['status'];$delivery=$r['type']==='shirts'?($r['delivery_method']==='post'?'ไปรษณีย์':'รับที่วิทยาลัย'):'';
    if($dataset==='shirt-lines'){foreach($allSizes as $i=>$size)if($quantities[$i])$write([$r['ref'],$r['name'],$size,$quantities[$i],$delivery,$method,$status]);}
    elseif($dataset==='shirt-people')$write([$r['ref'],$r['name'],...$quantities,$qty,$delivery,$money($r['amount_cents']),$method,$status]);
    else{$tables=report_table_names((string)$r['tables_list']);$count=$tables===''?0:count(explode(', ',$tables));$date=(new DateTimeImmutable('@'.$r['created']))->setTimezone(new DateTimeZone('Asia/Bangkok'))->format('Y-m-d H:i:s');$write([$r['ref'],$date,$typeLabels[$r['type']]??$r['type'],$r['name'],$money($r['amount_cents']),$method,$receipt['received_date']??$r['transferred'],$status,$tables,$count,$count*8,$delivery,...$quantities,$qty]);}
   }
  }
  fclose($out);db()->commit();exit;
 }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
