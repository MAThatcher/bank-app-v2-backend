CREATE TABLE IF NOT EXISTS ledger_labels (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('category','tag')),
 name VARCHAR(60) NOT NULL, color VARCHAR(7) NOT NULL DEFAULT '#c1a267',
 archived BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_labels_name_idx ON ledger_labels(user_id,kind,lower(name));
CREATE TABLE IF NOT EXISTS ledger_annotations (
 user_id INTEGER NOT NULL REFERENCES users(id), transaction_id INTEGER NOT NULL REFERENCES transactions(id),
 category_id INTEGER,
 PRIMARY KEY(user_id,transaction_id),
 FOREIGN KEY(category_id,user_id) REFERENCES ledger_labels(id,user_id)
);
CREATE TABLE IF NOT EXISTS ledger_tag_assignments (
 user_id INTEGER NOT NULL REFERENCES users(id), transaction_id INTEGER NOT NULL REFERENCES transactions(id), label_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,transaction_id,label_id),
 FOREIGN KEY(label_id,user_id) REFERENCES ledger_labels(id,user_id)
);
CREATE INDEX IF NOT EXISTS ledger_tag_filter_idx ON ledger_tag_assignments(user_id,label_id,transaction_id);
