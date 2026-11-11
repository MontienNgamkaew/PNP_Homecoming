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
