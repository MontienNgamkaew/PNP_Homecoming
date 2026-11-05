<?php
// Copy OUTSIDE public_html as portal-private/config.php; never commit real secrets.
return [
    'dsn' => 'mysql:host=localhost;dbname=YOUR_DATABASE;charset=utf8mb4',
    'db_user' => 'YOUR_DATABASE_USER',
    'db_password' => 'YOUR_DATABASE_PASSWORD',
    'origin' => 'https://YOUR_DOMAIN',
    // Generate locally: php -r 'echo password_hash(readline("Admin password: "), PASSWORD_DEFAULT), PHP_EOL;'
    'admin_password_hash' => 'REPLACE_WITH_PASSWORD_HASH',
    'secure_cookie' => true,
];
