DROP TABLE IF EXISTS two_factor_auth;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS tokens;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS account_users;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS user_details;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS account_type;
DROP TYPE IF EXISTS token_type;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
        CREATE TYPE account_type AS ENUM ('Checkings', 'Savings');
    END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'token_type') THEN
        create type token_type as enum ('AccessToken','RefreshToken');
    END IF;
END
$$;
CREATE TABLE IF NOT EXISTS
	users (
		id serial PRIMARY KEY,
		email VARCHAR(255) UNIQUE NULL,
		PASSWORD VARCHAR(255) NOT NULL,
		archived BOOLEAN DEFAULT FALSE,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		super_user BOOLEAN DEFAULT FALSE,
		archived_email VARCHAR(255) DEFAULT NULL,
		verified BOOLEAN DEFAULT FALSE
	);
CREATE TABLE IF NOT EXISTS
	user_details (
		id serial PRIMARY KEY,
		fname VARCHAR(255) NULL,
		mname VARCHAR(255) NULL,
		lname VARCHAR(255) NULL,
		address_street VARCHAR(255) NULL,
		address_city VARCHAR(255) NULL,
		address_state CHAR(2) NULL,
		address_zip NUMERIC(5, 0) NULL,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT NOT NULL,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	accounts (
		id serial PRIMARY KEY,
		NAME VARCHAR(255) DEFAULT 'Account',
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		OWNER INT NOT NULL,
		balance NUMERIC(13, 2) DEFAULT 0,
		overdraft BOOLEAN DEFAULT FALSE,
		archived BOOLEAN DEFAULT FALSE,
		TYPE account_type DEFAULT 'Checkings',
		CONSTRAINT fk_users FOREIGN KEY (OWNER) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	transactions (
		id serial PRIMARY KEY,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		account_id INT NOT NULL,
		description VARCHAR(1020) NOT NULL,
		user_id INT NOT NULL,
		amount NUMERIC(13, 2) NOT NULL,
		archived BOOLEAN DEFAULT FALSE,
		category VARCHAR(1020) NOT NULL,
		CONSTRAINT fk_accounts FOREIGN KEY (account_id) REFERENCES accounts (id),
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	tags (
		id serial PRIMARY KEY,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		archived BOOLEAN DEFAULT FALSE,
		tag VARCHAR(128),
		transaction_id INT,
		account_id INT,
		CONSTRAINT fk_accounts FOREIGN KEY (account_id) REFERENCES accounts (id),
		CONSTRAINT fk_users FOREIGN KEY (transaction_id) REFERENCES transactions (id)
	);
CREATE TABLE IF NOT EXISTS
	account_users (
		id serial PRIMARY KEY,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT,
		account_id INT,
		archived BOOLEAN DEFAULT FALSE,
		CONSTRAINT fk_accounts FOREIGN KEY (account_id) REFERENCES accounts (id),
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	notifications (
		id serial PRIMARY KEY,
		message VARCHAR(1020) NOT NULL,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT NOT NULL,
		dismissed BOOLEAN DEFAULT FALSE,
		TYPE VARCHAR(1020) DEFAULT NULL,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	tokens (
		id serial PRIMARY KEY,
		VALUE VARCHAR(1028) NOT NULL,
		TYPE token_type DEFAULT 'AccessToken',
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expire_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT NOT NULL,
		VALID BOOLEAN DEFAULT FALSE,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	disputes (
		id serial PRIMARY KEY,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT NOT NULL,
		transaction_id INT NOT NULL,
		status VARCHAR(255) DEFAULT 'Open',
		reason VARCHAR(1020) NOT NULL,
		details VARCHAR(2048) DEFAULT NULL,
		resolution VARCHAR(2048) DEFAULT NULL,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id),
		CONSTRAINT fk_transactions FOREIGN KEY (transaction_id) REFERENCES transactions (id)
	);
CREATE TABLE IF NOT EXISTS
	audit_logs (
		id serial PRIMARY KEY,
		ACTION VARCHAR(255) NOT NULL,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT NOT NULL,
		details VARCHAR(2048) DEFAULT NULL,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	sessions (
		id serial PRIMARY KEY,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INT NOT NULL,
		ip_address VARCHAR(45) NOT NULL,
		user_agent VARCHAR(512) DEFAULT NULL,
		VALID BOOLEAN DEFAULT TRUE,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);
CREATE TABLE IF NOT EXISTS
	two_factor_auth (
		id serial PRIMARY KEY,
		user_id INT UNIQUE NOT NULL,
		secret VARCHAR(255) NOT NULL,
		enabled BOOLEAN DEFAULT FALSE,
		create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		CONSTRAINT fk_users FOREIGN KEY (user_id) REFERENCES users (id)
	);