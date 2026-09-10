
-- Additive upgrade for existing databases. The caller runs this in a transaction.
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    request_key UUID NOT NULL,
    source_account_id INTEGER NOT NULL REFERENCES accounts(id),
    destination_account_id INTEGER NOT NULL REFERENCES accounts(id),
    amount NUMERIC(13,2) NOT NULL CHECK (amount > 0),
    description VARCHAR(512) NOT NULL,
    source_balance_before NUMERIC(13,2) NOT NULL,
    source_balance_after NUMERIC(13,2) NOT NULL,
    destination_balance_before NUMERIC(13,2) NOT NULL,
    destination_balance_after NUMERIC(13,2) NOT NULL,
    create_date TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transfers_distinct_accounts CHECK (source_account_id <> destination_account_id),
    CONSTRAINT transfers_user_id_request_key_key UNIQUE (user_id, request_key)
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES transfers(id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_transfer_id_account_id_key
    ON transactions(transfer_id, account_id);

