<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/lib.php';require_once __DIR__.'/admins.php';
foreach(explode(';',file_get_contents(__DIR__.'/admin-schema.sql')) as $sql)if(trim($sql))db()->exec($sql);
ensure_admin_bootstrap();echo "Administrator schema ready; existing credentials preserved.\n";
