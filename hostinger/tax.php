<?php
declare(strict_types=1);
function validated_tax_request(mixed $value,string $type,string $name): ?array {
 if($value===null)return null;
 if(!is_array($value)||!is_bool($value['requested']??false))fail(400,'ข้อมูลขอเอกสารไม่ถูกต้อง');
 if(!($value['requested']??false))return null;
 if(!in_array($type,['donate','fund'],true))fail(400,'ขอเอกสารได้เฉพาะรายการผ้าป่าและกองทุนช่างกล');
 $id=preg_replace('/[ -]/','',text($value['tax_id']??null,1,25,'เลขประจำตัวผู้เสียภาษี'));
 if(!preg_match('/^[0-9]{13}$/D',$id))fail(400,'กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก');
 $delivery=$value['delivery']??null;if(!in_array($delivery,['pickup','line','post'],true))fail(400,'กรุณาเลือกช่องทางรับเอกสาร');
 $r=['tax_id'=>$id,'document_name'=>text($value['document_name']??$name,2,150,'ชื่อสำหรับออกเอกสาร'),'delivery'=>$delivery,'line_id'=>null,'recipient'=>null,'address'=>null,'postcode'=>null];
 if($delivery==='line')$r['line_id']=text($value['line_id']??null,1,100,'Line ID');
 if($delivery==='post'){$r['recipient']=text($value['recipient']??null,2,150,'ชื่อผู้รับเอกสาร');$r['address']=text($value['address']??null,5,1000,'ที่อยู่รับเอกสาร');$r['postcode']=text($value['postcode']??null,5,5,'รหัสไปรษณีย์');if(!ctype_digit($r['postcode']))fail(400,'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');}
 return $r;
}
function create_tax_request(string $ref,?array $data,string $reason='สร้างคำขอเอกสาร'): void {
 if(!$data)return;
 $now=time();$row=['order_ref'=>$ref,...$data,'request_status'=>'requested','admin_note'=>'','revision'=>1,'created'=>$now,'updated'=>$now];$keys=array_keys($row);
 query('INSERT INTO tax_requests (`'.implode('`,`',$keys).'`) VALUES ('.implode(',',array_fill(0,count($keys),'?')).')',array_values($row));
 query('INSERT INTO tax_request_audit(order_ref,old_data,new_data,reason,at) VALUES (?,?,?,?,?)',[$ref,null,js($row),$reason,$now]);
}
function tax_request_filter(array $input): array {
 $search=text($input['q']??'',0,150,'คำค้น');$status=$input['status']??'';$delivery=$input['delivery']??'';$payment=$input['payment_status']??'';
 if(!in_array($status,['','requested','preparing','ready','delivered','cancelled'],true)||!in_array($delivery,['','pickup','line','post'],true)||!in_array($payment,['','pending','confirmed','rejected'],true))fail(400,'ตัวกรองไม่ถูกต้อง');
 $clauses=[];$args=[];if($search!==''){$clauses[]='(t.order_ref LIKE ? OR t.document_name LIKE ? OR o.name LIKE ?)';$args=array_fill(0,3,'%'.$search.'%');}
 foreach(['t.request_status'=>$status,'t.delivery'=>$delivery,'o.status'=>$payment] as $column=>$value)if($value!==''){$clauses[]=$column.'=?';$args[]=$value;}
 return [$clauses?' WHERE '.implode(' AND ',$clauses):'',$args];
}
function tax_requests_list(array $input): array {
 $page=max(1,min(100000,(int)($input['page']??1)));[$where,$args]=tax_request_filter($input);$from=' FROM tax_requests t JOIN orders o ON o.ref=t.order_ref';
 $count=(int)query('SELECT COUNT(*)'.$from.$where,$args)->fetchColumn();$offset=($page-1)*50;
 $rows=query("SELECT t.order_ref,t.document_name,RIGHT(t.tax_id,4) AS last4,t.delivery,t.request_status,t.revision,t.created,t.updated,o.type,o.name,o.phone,o.amount_cents,o.status AS payment_status,o.pricing_snapshot".$from.$where." ORDER BY t.created DESC,t.order_ref DESC LIMIT 50 OFFSET $offset",$args)->fetchAll();
 foreach($rows as &$r){$r['tax_id_masked']='*********'.$r['last4'];$r['payment_method']=payment_receipt($r)?'cash':'transfer';unset($r['last4'],$r['pricing_snapshot']);foreach(['revision','created','updated','amount_cents'] as $k)$r[$k]=(int)$r[$k];}
 return ['items'=>$rows,'count'=>$count,'page'=>$page,'page_size'=>50];
}
function tax_request_detail(string $ref): array {
 $r=query('SELECT t.*,o.type,o.name,o.phone,o.amount_cents,o.status AS payment_status,o.pricing_snapshot FROM tax_requests t JOIN orders o ON o.ref=t.order_ref WHERE t.order_ref=?',[$ref])->fetch();if(!$r)fail(404,'ไม่พบคำขอเอกสาร');$r['payment_method']=payment_receipt($r)?'cash':'transfer';unset($r['pricing_snapshot']);foreach(['revision','created','updated','amount_cents'] as $k)$r[$k]=(int)$r[$k];return $r;
}
function update_tax_request(array $d): array {
 $ref=text($d['ref']??null,1,40,'เลขอ้างอิง');$reason=text($d['reason']??null,3,500,'เหตุผลแก้ไข');
 return transaction(function()use($d,$ref,$reason){settings(true);$old=query('SELECT * FROM tax_requests WHERE order_ref=? FOR UPDATE',[$ref])->fetch();if(!$old)fail(404,'ไม่พบคำขอเอกสาร');if(($d['revision']??null)!==(int)$old['revision'])fail(409,'มีการแก้ไขคำขอนี้แล้ว กรุณาโหลดใหม่');
  $order=query('SELECT type,name,status FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();
  $new=validated_tax_request([...$d,'requested'=>true],$order['type'],$order['name']);
  $status=$d['request_status']??$old['request_status'];if(!in_array($status,['requested','preparing','ready','delivered','cancelled'],true))fail(400,'สถานะเอกสารไม่ถูกต้อง');
  if(in_array($status,['ready','delivered'],true)&&$order['status']!=='confirmed')fail(409,'กรุณายืนยันยอดเงินก่อนระบุว่าเอกสารพร้อมรับหรือส่งมอบแล้ว');
  $new['request_status']=$status;$new['admin_note']=text($d['admin_note']??'',0,1000,'บันทึกเจ้าหน้าที่');$new['revision']=(int)$old['revision']+1;$new['updated']=time();$sets=[];foreach($new as $k=>$v)$sets[]='`'.$k.'`=?';query('UPDATE tax_requests SET '.implode(',',$sets).' WHERE order_ref=?',[...array_values($new),$ref]);
  query('INSERT INTO tax_request_audit(order_ref,old_data,new_data,reason,at) VALUES (?,?,?,?,?)',[$ref,js($old),js(['order_ref'=>$ref,...$new]),$reason,time()]);return tax_request_detail($ref);
 });
}

function admin_create_tax_request(array $d): array {
 $ref=text($d['ref']??null,1,40,'เลขอ้างอิง');$reason=text($d['reason']??null,3,500,'เหตุผล');
 return transaction(function()use($d,$ref,$reason){settings(true);$o=query('SELECT type,name,status FROM orders WHERE ref=? FOR UPDATE',[$ref])->fetch();if(!$o)fail(404,'ไม่พบรายการ');if($o['status']==='rejected')fail(409,'รายการนี้ถูกยกเลิก');if(query('SELECT order_ref FROM tax_requests WHERE order_ref=?',[$ref])->fetch())fail(409,'รายการนี้มีคำขอแล้ว กรุณาแก้ไขคำขอเดิม');
  $data=validated_tax_request([...$d,'requested'=>true],$o['type'],$o['name']);if(!$data)fail(400,'กรุณาระบุรายละเอียดขอเอกสาร');create_tax_request($ref,$data,$reason);return tax_request_detail($ref);
 });
}

// Authenticated tax-only export: full identifiers are never added to ordinary reports.
function export_tax_requests_csv(array $input): never {
 $dataset=$input['dataset']??'details';if(!in_array($dataset,['details','summary'],true))fail(400,'ประเภทรายงานไม่ถูกต้อง');
 [$where,$args]=tax_request_filter($input);
 $types=['donate'=>'ผ้าป่า','fund'=>'กองทุนช่างกล'];$payments=['pending'=>'รอตรวจสอบยอด','confirmed'=>'ยืนยันยอดแล้ว','rejected'=>'ยกเลิก / ไม่ผ่าน'];
 $states=['requested'=>'รอตรวจสอบคำขอ','preparing'=>'กำลังจัดทำ','ready'=>'พร้อมรับ / พร้อมส่ง','delivered'=>'ส่งมอบแล้ว','cancelled'=>'ยกเลิกคำขอ'];$deliveries=['pickup'=>'รับด้วยตนเองที่วิทยาลัย','line'=>'ส่งทาง Line ID','post'=>'ส่งทางไปรษณีย์'];
 $stmt=query('SELECT t.*,o.type,o.name,o.phone,o.amount_cents,o.status AS payment_status,o.pricing_snapshot,o.created AS order_created,o.transferred FROM tax_requests t JOIN orders o ON o.ref=t.order_ref'.$where.' ORDER BY t.created,t.order_ref',$args);
 $tz=new DateTimeZone('Asia/Bangkok');$date=fn($v)=>(new DateTimeImmutable('@'.(int)$v))->setTimezone($tz)->format('Y-m-d H:i:s');$money=fn($v)=>number_format((int)$v/100,2,'.','');
 header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="pnp-tax-'.$dataset.'-'.gmdate('Ymd-His').'.csv"');header('Cache-Control: no-store, private');header('X-Content-Type-Options: nosniff');
 $out=fopen('php://output','wb');fwrite($out,"\xEF\xBB\xBF");
 $write=function(array $row)use($out){$safe=array_map(fn($v)=>is_string($v)&&preg_match('/^[\x00-\x20\x{FEFF}]*[=+\-@]|^[\t\r\n]/u',$v)?"'".$v:$v,$row);fputcsv($out,$safe,',','"','',"\r\n");};
 if($dataset==='details')$write(['เลขอ้างอิง','ประเภท','ชื่อสำหรับออกเอกสาร','เลขประจำตัวผู้เสียภาษี','ชื่อผู้บริจาค','เบอร์โทรศัพท์','ยอดบริจาค (บาท)','ช่องทางชำระ','วันที่รับเงิน / แจ้งโอน','วันที่บันทึกรายการ (เวลาไทย)','สถานะยืนยันยอดเงิน','สถานะเอกสาร','ช่องทางรับเอกสาร','Line ID','ชื่อผู้รับเอกสาร','ที่อยู่รับเอกสาร','รหัสไปรษณีย์','บันทึกเจ้าหน้าที่ / เลขติดตาม','วันที่ขอเอกสาร (เวลาไทย)','แก้ไขล่าสุด (เวลาไทย)']);
 else $write(['ประเภท','ช่องทางชำระ','สถานะยืนยันยอดเงิน','สถานะเอกสาร','ช่องทางรับเอกสาร','จำนวนคำขอ','ยอดรวม (บาท)']);
 $groups=[];
 while($r=$stmt->fetch()){
  $receipt=payment_receipt($r);$method=$receipt?'เงินสด':'เงินโอน';
  if($dataset==='details')$write([$r['order_ref'],$types[$r['type']]??$r['type'],$r['document_name'],$r['tax_id'],$r['name'],$r['phone'],$money($r['amount_cents']),$method,$receipt['received_date']??$r['transferred'],$date($r['order_created']),$payments[$r['payment_status']]??$r['payment_status'],$states[$r['request_status']]??$r['request_status'],$deliveries[$r['delivery']]??$r['delivery'],$r['line_id'],$r['recipient'],$r['address'],$r['postcode'],$r['admin_note'],$date($r['created']),$date($r['updated'])]);
  else {$labels=[$types[$r['type']]??$r['type'],$method,$payments[$r['payment_status']]??$r['payment_status'],$states[$r['request_status']]??$r['request_status'],$deliveries[$r['delivery']]??$r['delivery']];$key=js($labels);if(!isset($groups[$key]))$groups[$key]=['labels'=>$labels,'count'=>0,'cents'=>0];$groups[$key]['count']++;$groups[$key]['cents']+=(int)$r['amount_cents'];}
 }
 if($dataset==='summary')foreach($groups as $g)$write([...$g['labels'],$g['count'],$money($g['cents'])]);
 fclose($out);exit;
}
