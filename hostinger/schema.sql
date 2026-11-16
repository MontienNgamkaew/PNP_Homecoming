CREATE TABLE IF NOT EXISTS app_settings (id INT PRIMARY KEY, config LONGTEXT NOT NULL, revision INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS reference_counter (id INT PRIMARY KEY, next_number INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS orders (
 ref VARCHAR(40) PRIMARY KEY, secret_hash CHAR(64) NOT NULL, type VARCHAR(16) NOT NULL,
 name VARCHAR(150) NOT NULL, phone VARCHAR(150) NOT NULL, amount_cents BIGINT NOT NULL,
 transferred VARCHAR(40) NOT NULL, delivery_method VARCHAR(16), recipient_name VARCHAR(150), shipping_address TEXT, postcode VARCHAR(5),
 tables_list VARCHAR(500), category VARCHAR(150), digest CHAR(64) NOT NULL UNIQUE, mime VARCHAR(40) NOT NULL, slip MEDIUMBLOB NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending', created BIGINT NOT NULL, pricing_snapshot TEXT NOT NULL,
 INDEX orders_created(created), INDEX orders_type_status(type,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS table_bookings (table_number INT PRIMARY KEY, order_ref VARCHAR(40) NOT NULL, status VARCHAR(16) NOT NULL, updated_at BIGINT NOT NULL, FOREIGN KEY(order_ref) REFERENCES orders(ref)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_items (id BIGINT AUTO_INCREMENT PRIMARY KEY, order_ref VARCHAR(40) NOT NULL, item_type VARCHAR(16) NOT NULL DEFAULT 'shirt', size VARCHAR(8) NOT NULL, qty INT NOT NULL, FOREIGN KEY(order_ref) REFERENCES orders(ref)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY, ref VARCHAR(40) NOT NULL, old LONGTEXT, new LONGTEXT, at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS settings_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY, old_config LONGTEXT NOT NULL, new_config LONGTEXT NOT NULL, at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS blessings (id BIGINT AUTO_INCREMENT PRIMARY KEY, message TEXT NOT NULL, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS posters (id VARCHAR(40) PRIMARY KEY, title VARCHAR(150) NOT NULL, mime VARCHAR(40) NOT NULL, image MEDIUMBLOB NOT NULL, created BIGINT NOT NULL, deleted_at BIGINT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS limits (bucket CHAR(64) PRIMARY KEY, count INT NOT NULL, expires BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash CHAR(64) PRIMARY KEY, expires BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ticket_redemptions (ref VARCHAR(40) PRIMARY KEY, redeemed BIGINT NOT NULL, FOREIGN KEY(ref) REFERENCES orders(ref)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_requests (
 order_ref VARCHAR(40) PRIMARY KEY, tax_id CHAR(13) NOT NULL, document_name VARCHAR(150) NOT NULL,
 delivery VARCHAR(16) NOT NULL, line_id VARCHAR(100), recipient VARCHAR(150), address TEXT, postcode VARCHAR(5),
 request_status VARCHAR(16) NOT NULL DEFAULT 'requested', admin_note TEXT NOT NULL,
 revision INT NOT NULL DEFAULT 1, created BIGINT NOT NULL, updated BIGINT NOT NULL,
 FOREIGN KEY(order_ref) REFERENCES orders(ref), INDEX tax_status(request_status,created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tax_request_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, order_ref VARCHAR(40) NOT NULL, old_data LONGTEXT, new_data LONGTEXT NOT NULL,
 reason VARCHAR(500) NOT NULL, at BIGINT NOT NULL, FOREIGN KEY(order_ref) REFERENCES orders(ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS admin_users (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, display_name VARCHAR(150) NOT NULL,
 password_hash VARCHAR(255) NOT NULL, role VARCHAR(16) NOT NULL, active TINYINT NOT NULL DEFAULT 1,
 revision INT NOT NULL DEFAULT 1, created BIGINT NOT NULL, updated BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS admin_user_sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL, expires BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES admin_users(id), INDEX admin_session_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS admin_activity (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, actor_id BIGINT NOT NULL, actor_username VARCHAR(50) NOT NULL,
 actor_name VARCHAR(150) NOT NULL, action VARCHAR(80) NOT NULL, target_type VARCHAR(32) NOT NULL,
 target_id VARCHAR(80) NOT NULL, details TEXT NOT NULL, created BIGINT NOT NULL,
 FOREIGN KEY(actor_id) REFERENCES admin_users(id), INDEX activity_target(target_type,target_id,created), INDEX activity_actor(actor_id,created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
