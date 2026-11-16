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
