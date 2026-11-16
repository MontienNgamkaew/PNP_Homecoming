<?php
declare(strict_types=1);
function admin_public(array $r): array {return ['id'=>(int)$r['id'],'username'=>$r['username'],'display_name'=>$r['display_name'],'role'=>$r['role'],'active'=>(bool)$r['active'],'revision'=>(int)$r['revision']];}
function ensure_admin_bootstrap(): void {
 if((int)query('SELECT COUNT(*) FROM admin_users')->fetchColumn()>0)return;
 transaction(function(){settings(true);if((int)query('SELECT COUNT(*) FROM admin_users')->fetchColumn()>0)return;$hash=config()['admin_password_hash']??'';if(!password_get_info($hash)['algo'])fail(503,'ยังไม่ได้ตั้งบัญชีผู้ดูแลสูงสุด');$now=time();query('INSERT INTO admin_users(username,display_name,password_hash,role,active,created,updated) VALUES (?,?,?,?,1,?,?)',['admin','ผู้ดูแลสูงสุด',$hash,'superadmin',$now,$now]);});
}
function authenticated_admin(bool $locked=false): array {
 $token=$_COOKIE['admin']??'';if(!is_string($token)||$token==='')fail(401,'กรุณาเข้าสู่ระบบ');
 $r=query('SELECT u.* FROM admin_user_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1'.($locked?' FOR UPDATE':''),[hash('sha256',$token),time()])->fetch();if(!$r)fail(401,'กรุณาเข้าสู่ระบบ');$GLOBALS['portal_admin']=admin_public($r);return $r;
}
function require_superadmin(): void {if(($GLOBALS['portal_admin']['role']??'')!=='superadmin')fail(403,'เฉพาะผู้ดูแลสูงสุดเท่านั้น');}
function admin_activity(string $action,string $kind,string $id,array $details=[]): void {
 $u=$GLOBALS['portal_admin']??null;if(!$u)throw new RuntimeException('Missing administrator identity');
 query('INSERT INTO admin_activity(actor_id,actor_username,actor_name,action,target_type,target_id,details,created) VALUES (?,?,?,?,?,?,?,?)',[$u['id'],$u['username'],$u['display_name'],$action,$kind,$id,js($details),time()]);
}
function admin_login(array $d): array {
 limited('login',10);ensure_admin_bootstrap();$username=strtolower(trim(is_string($d['username']??'admin')?($d['username']??'admin'):''));$password=$d['password']??'';
 $r=query('SELECT * FROM admin_users WHERE username=?',[$username])->fetch();$hash=$r['password_hash']??(config()['admin_password_hash']??'');
 if(!is_string($password)||strlen($password)>1024||!password_verify($password,$hash)||!$r||!(int)$r['active'])fail(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
 $token=bin2hex(random_bytes(32));
 $signed=transaction(function()use($r,$token){settings(true);$fresh=query('SELECT * FROM admin_users WHERE id=? FOR UPDATE',[(int)$r['id']])->fetch();if(!$fresh||!(int)$fresh['active']||!hash_equals($r['password_hash'],$fresh['password_hash']))fail(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');$GLOBALS['portal_admin']=admin_public($fresh);query('DELETE FROM admin_user_sessions WHERE expires<?',[time()]);query('INSERT INTO admin_user_sessions(token_hash,user_id,expires) VALUES (?,?,?)',[hash('sha256',$token),(int)$fresh['id'],time()+3600]);admin_activity('login','user',(string)$fresh['id']);return $fresh;});
 setcookie('admin',$token,['expires'=>time()+3600,'path'=>'/','secure'=>config()['secure_cookie']??true,'httponly'=>true,'samesite'=>'Strict']);return ['ok'=>true,'user'=>admin_public($signed)];
}
function begin_admin_mutation(): void {
 db()->beginTransaction();$GLOBALS['portal_admin_transaction']=true;settings(true);authenticated_admin(true);
}
function finish_admin_mutation(int $code,mixed $result): void {
 if(empty($GLOBALS['portal_admin_transaction']))return;$GLOBALS['portal_admin_transaction']=false;
 if($code<200||$code>=300){if(db()->inTransaction())db()->rollBack();return;}
 $path=$GLOBALS['portal_admin_path'];$d=$GLOBALS['portal_admin_input'];$target=(string)($result['ref']??$d['ref']??'');$kind='order';$details=[];
 $actions=['/api/admin/cash-receipt'=>'cash_recorded','/api/admin/order-status'=>'order_status','/api/admin/order-edit'=>'order_edited','/api/admin/redeem'=>'ticket_redeemed','/api/admin/ticket-reissue'=>'ticket_reissued','/api/admin/tax-request-create'=>'tax_created','/api/admin/tax-request-update'=>'tax_updated','/api/admin/settings'=>'settings_updated','/api/admin/posters'=>'poster_managed','/api/admin/blessings'=>'blessing_managed','/api/admin/users-create'=>'user_created','/api/admin/users-update'=>'user_updated','/api/admin/users-password'=>'user_password_reset','/api/admin/password'=>'password_changed','/api/admin/logout'=>'logout'];
 if(!isset($actions[$path])){db()->rollBack();throw new RuntimeException('Unaudited admin mutation');}
 if(str_contains($path,'tax-request'))$target=(string)($result['order_ref']??$target);
 if($path==='/api/admin/settings'){$kind='settings';$target='website';}
 if(in_array($path,['/api/admin/posters','/api/admin/blessings'],true)){$kind=str_contains($path,'posters')?'poster':'blessing';$target=(string)($result['id']??$d['id']??'');$details=['operation'=>$d['action']??''];}
 if(str_contains($path,'/users-')||in_array($path,['/api/admin/password','/api/admin/logout'],true)){$kind='user';$target=(string)($result['user']['id']??$d['id']??$GLOBALS['portal_admin']['id']);$details=['username'=>$result['user']['username']??$GLOBALS['portal_admin']['username']];if(isset($result['user']['role']))$details+=['role'=>$result['user']['role'],'active'=>$result['user']['active']];}
 if($path==='/api/admin/order-status')$details=['status'=>$d['status']??''];
 if($path==='/api/admin/cash-receipt')$details=['operation'=>($d['action']??'')==='edit'?'edit':(!empty($d['ref'])?'link':'record')];
 try{admin_activity($actions[$path],$kind,$target,$details);db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function admin_password_value(mixed $p): string {if(!is_string($p)||mb_strlen($p)<8||strlen($p)>72)fail(400,'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์');return $p;}
function verify_admin_password(mixed $password): void {
 $r=query('SELECT password_hash FROM admin_users WHERE id=?',[$GLOBALS['portal_admin']['id']])->fetch();
 if(!is_string($password)||!password_verify($password,$r['password_hash']))fail(403,'รหัสผ่านปัจจุบันไม่ถูกต้อง');
}
function admin_users_create(array $d): array {
 require_superadmin();$username=strtolower(text($d['username']??null,3,50,'ชื่อผู้ใช้'));if(!preg_match('/^[a-z0-9._-]{3,50}$/D',$username))fail(400,'ชื่อผู้ใช้ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
 $name=text($d['display_name']??null,2,150,'ชื่อผู้ดูแล');$role=$d['role']??'admin';if(!in_array($role,['superadmin','admin'],true))fail(400,'สิทธิ์ไม่ถูกต้อง');
 if(query('SELECT id FROM admin_users WHERE username=?',[$username])->fetch())fail(409,'ชื่อผู้ใช้นี้มีอยู่แล้ว');
 $hash=password_hash(admin_password_value($d['password']??null),PASSWORD_DEFAULT);$now=time();query('INSERT INTO admin_users(username,display_name,password_hash,role,active,created,updated) VALUES (?,?,?,?,1,?,?)',[$username,$name,$hash,$role,$now,$now]);return ['user'=>admin_public(query('SELECT * FROM admin_users WHERE id=?',[(int)db()->lastInsertId()])->fetch())];
}
function admin_users_update(array $d): array {
 require_superadmin();$id=$d['id']??null;if(!is_int($id)||$id<1)fail(400,'บัญชีไม่ถูกต้อง');$old=query('SELECT * FROM admin_users WHERE id=? FOR UPDATE',[$id])->fetch();if(!$old)fail(404,'ไม่พบบัญชี');
 if(($d['revision']??null)!==(int)$old['revision'])fail(409,'บัญชีถูกแก้ไขแล้ว กรุณาโหลดใหม่');$active=$d['active']??null;$role=$d['role']??null;if(!is_bool($active)||!in_array($role,['admin','superadmin'],true))fail(400,'ข้อมูลสิทธิ์ไม่ถูกต้อง');
 if($id===$GLOBALS['portal_admin']['id']&&(!$active||$role!=='superadmin'))fail(409,'ไม่สามารถปิดบัญชีหรือลดสิทธิ์ผู้ดูแลสูงสุดที่กำลังใช้งาน');
 if($old['role']==='superadmin'&&(int)$old['active']&&(!$active||$role!=='superadmin')&&(int)query("SELECT COUNT(*) FROM admin_users WHERE role='superadmin' AND active=1")->fetchColumn()<=1)fail(409,'ต้องมีผู้ดูแลสูงสุดที่ใช้งานได้อย่างน้อยหนึ่งคน');
 query('UPDATE admin_users SET display_name=?,role=?,active=?,revision=revision+1,updated=? WHERE id=?',[text($d['display_name']??null,2,150,'ชื่อผู้ดูแล'),$role,(int)$active,time(),$id]);if($old['role']!==$role||(bool)$old['active']!==$active)query('DELETE FROM admin_user_sessions WHERE user_id=?',[$id]);return ['user'=>admin_public(query('SELECT * FROM admin_users WHERE id=?',[$id])->fetch())];
}
function admin_reset_password(array $d): array {
 require_superadmin();verify_admin_password($d['current_password']??null);$id=$d['id']??null;if(!is_int($id)||$id<1||!query('SELECT id FROM admin_users WHERE id=?',[$id])->fetch())fail(404,'ไม่พบบัญชี');
 query('UPDATE admin_users SET password_hash=?,revision=revision+1,updated=? WHERE id=?',[password_hash(admin_password_value($d['new_password']??null),PASSWORD_DEFAULT),time(),$id]);query('DELETE FROM admin_user_sessions WHERE user_id=?',[$id]);return ['ok'=>true,'user'=>admin_public(query('SELECT * FROM admin_users WHERE id=?',[$id])->fetch())];
}
function admin_change_password(array $d): array {
 verify_admin_password($d['current_password']??null);$id=$GLOBALS['portal_admin']['id'];query('UPDATE admin_users SET password_hash=?,revision=revision+1,updated=? WHERE id=?',[password_hash(admin_password_value($d['new_password']??null),PASSWORD_DEFAULT),time(),$id]);query('DELETE FROM admin_user_sessions WHERE user_id=?',[$id]);return ['ok'=>true,'signed_out'=>true];
}
function admin_activity_list(array $d): array {
 $ref=text($d['ref']??'',0,80,'เลขอ้างอิง');if($ref==='')require_superadmin();$args=[];$where='';if($ref!==''){$where=" WHERE target_type='order' AND target_id=?";$args[]=$ref;}
 $page=max(1,min(100000,(int)($d['page']??1)));$count=(int)query('SELECT COUNT(*) FROM admin_activity'.$where,$args)->fetchColumn();$offset=($page-1)*50;
 $rows=query('SELECT id,actor_id,actor_username,actor_name,action,target_type,target_id,details,created FROM admin_activity'.$where." ORDER BY id DESC LIMIT 50 OFFSET $offset",$args)->fetchAll();foreach($rows as &$r){foreach(['id','actor_id','created'] as $k)$r[$k]=(int)$r[$k];$r['details']=json_decode($r['details'],true);}
 return ['items'=>$rows,'count'=>$count,'page'=>$page,'page_size'=>50];
}
function admin_attributed_orders(array $rows): array {
 if(!$rows)return [];$marks=implode(',',array_fill(0,count($rows),'?'));$latest=[];$created=[];
 foreach(query("SELECT target_id,actor_name,action,details FROM admin_activity WHERE target_type='order' AND target_id IN ($marks) ORDER BY id",array_column($rows,'ref'))->fetchAll() as $a){$latest[$a['target_id']]=$a['actor_name'];$details=json_decode($a['details'],true);if($a['action']==='cash_recorded'&&($details['operation']??'')==='record'&&!isset($created[$a['target_id']]))$created[$a['target_id']]=$a['actor_name'];}
 return array_map(function($r)use($latest,$created){$r['recorded_by']=$created[$r['ref']]??(payment_receipt($r)?'ผู้ดูแลเดิม (ไม่ระบุบัญชี)':'ผู้แจ้งรายการ');$r['last_managed_by']=$latest[$r['ref']]??'ยังไม่มีประวัติผู้จัดการ';return public_order($r);},$rows);
}
