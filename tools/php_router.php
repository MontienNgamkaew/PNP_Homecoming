<?php
// LOCAL QA ONLY. Production uses public_html/.htaccess.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(str_starts_with($path,'/api/')){require dirname(__DIR__).'/hostinger/api.php';return true;}
return false;
