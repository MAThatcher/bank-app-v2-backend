
/*
 * Real PostgreSQL regression checks. Run: node test/integration/transfers.postgres.js
 * Creates and removes its own isolated schema; never modifies application rows.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { PrismaClient, Prisma } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '../../src/config/.env') });
process.env.NODE_ENV = 'test';
const adapter = require('../../src/prisma/client');
const service = require('../../src/services/TransferService');
const schema = 'transfer_test_' + Date.now() + '_' + randomBytes(4).toString('hex');
assert.match(schema, /^transfer_test_[0-9]+_[0-9a-f]+$/);

const core = `
CREATE TYPE account_type AS ENUM ('Checkings', 'Savings');
CREATE TABLE users (
 id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, password VARCHAR(255) NOT NULL,
 archived BOOLEAN DEFAULT FALSE, create_date TIMESTAMP(6) DEFAULT NOW(), update_date TIMESTAMP(6) DEFAULT NOW(),
 super_user BOOLEAN DEFAULT FALSE, archived_email VARCHAR(255), verified BOOLEAN DEFAULT TRUE
);
CREATE TYPE token_type AS ENUM ('AccessToken', 'RefreshToken');
CREATE TABLE audit_logs (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), action VARCHAR(255) NOT NULL,
 details VARCHAR(2048), create_date TIMESTAMP(6) DEFAULT NOW()
);
CREATE TABLE sessions (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), ip_address VARCHAR(45) NOT NULL,
 user_agent VARCHAR(512), valid BOOLEAN DEFAULT TRUE, expires_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
 create_date TIMESTAMP(6) DEFAULT NOW(), update_date TIMESTAMP(6) DEFAULT NOW()
);
CREATE TABLE tokens (
 id SERIAL PRIMARY KEY, value VARCHAR(1028) NOT NULL, type token_type DEFAULT 'AccessToken',
 create_date TIMESTAMP(6) DEFAULT NOW(), expire_date TIMESTAMP(6) DEFAULT NOW(), user_id INTEGER NOT NULL REFERENCES users(id), valid BOOLEAN DEFAULT FALSE
);
CREATE TABLE accounts (
 id SERIAL PRIMARY KEY, name VARCHAR(255) DEFAULT 'Account', create_date TIMESTAMP(6) DEFAULT NOW(),
 update_date TIMESTAMP(6) DEFAULT NOW(), owner INTEGER NOT NULL REFERENCES users(id),
 balance NUMERIC(13,2) DEFAULT 0, overdraft BOOLEAN DEFAULT FALSE, archived BOOLEAN DEFAULT FALSE,
 type account_type DEFAULT 'Checkings'
);
CREATE TABLE account_users (
 id SERIAL PRIMARY KEY, create_date TIMESTAMP(6) DEFAULT NOW(), update_date TIMESTAMP(6) DEFAULT NOW(),
 user_id INTEGER REFERENCES users(id), account_id INTEGER REFERENCES accounts(id), archived BOOLEAN DEFAULT FALSE
);
CREATE TABLE notifications (
 id SERIAL PRIMARY KEY, message VARCHAR(1020) NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
 type VARCHAR(1020), dismissed BOOLEAN DEFAULT FALSE,
 create_date TIMESTAMP(6) DEFAULT NOW(), update_date TIMESTAMP(6) DEFAULT NOW()
);
CREATE TABLE transactions (
 id SERIAL PRIMARY KEY, create_date TIMESTAMP(6) DEFAULT NOW(), update_date TIMESTAMP(6) DEFAULT NOW(),
 account_id INTEGER NOT NULL REFERENCES accounts(id), description VARCHAR(1020) NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id), amount NUMERIC(13,2) NOT NULL,
 archived BOOLEAN DEFAULT FALSE, category VARCHAR(1020) NOT NULL
);
CREATE TABLE disputes (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), transaction_id INTEGER NOT NULL REFERENCES transactions(id),
 status VARCHAR(255) DEFAULT 'Open', reason VARCHAR(1020) NOT NULL, details VARCHAR(2048), resolution VARCHAR(2048),
 create_date TIMESTAMP(6) DEFAULT NOW(), update_date TIMESTAMP(6) DEFAULT NOW()
);`;

async function main() {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must be configured');
    const admin = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    await admin.connect();
    let db, created = false, passed = 0;
    try {
        await admin.query('CREATE SCHEMA "' + schema + '"');
        created = true;
        await admin.query('SET search_path TO "' + schema + '"');
        await admin.query(core);
        const upgrade = fs.readFileSync(path.resolve(__dirname, '../../prisma/sql/add-transfers.sql'), 'utf8');
        await admin.query(upgrade);
        // The additive schema upgrade is safe to repeat.
        await admin.query(upgrade);
        const emailUpgrade = fs.readFileSync(path.resolve(__dirname, '../../prisma/sql/add-notification-email.sql'), 'utf8');
        await admin.query(emailUpgrade);
        await admin.query(emailUpgrade);
        const preferencesUpgrade = fs.readFileSync(path.resolve(__dirname, '../../prisma/sql/add-preferences-disputes.sql'), 'utf8');
        await admin.query(preferencesUpgrade);
        await admin.query(preferencesUpgrade);
        const impersonationUpgrade = fs.readFileSync(path.resolve(__dirname, '../../prisma/sql/add-impersonation.sql'), 'utf8');
        await admin.query(impersonationUpgrade);
        await admin.query(impersonationUpgrade);
        const labelsUpgrade=fs.readFileSync(path.resolve(__dirname,'../../prisma/sql/add-ledger-labels.sql'),'utf8');
        await admin.query(labelsUpgrade); await admin.query(labelsUpgrade);

        const url = new URL(process.env.DATABASE_URL);
        url.searchParams.set('schema', schema);
        db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
        const run = (callback, options) => db.$transaction(callback, options);
        adapter.runTransaction = run;
        adapter.transfers.findUnique = args => db.transfers.findUnique(args);
        adapter.accounts.findMany = args => db.accounts.findMany(args);
        const user = await db.users.create({ data: { email: 'transfer-test@example.test', password: 'test-only', verified: true } });
        const outsider = await db.users.create({ data: { email: 'outsider@example.test', password: 'test-only' } });

        async function pair(a = '100.25', b = '25.10', overdraft = false) {
            const source = await db.accounts.create({ data: { owner: user.id, name: 'Source', balance: a, overdraft } });
            const destination = await db.accounts.create({ data: { owner: user.id, name: 'Destination', balance: b } });
            for (const account of [source, destination]) await db.account_users.create({ data: { user_id: user.id, account_id: account.id } });
            const input = { sourceAccountId: source.id, destinationAccountId: destination.id, amount: '10.75',
                description: 'Integration transfer', expectedSourceBalance: a, expectedDestinationBalance: b, idempotencyKey: randomUUID() };
            return { source, destination, input };
        }
        async function balance(id) { return (await db.accounts.findUnique({ where: { id } })).balance.toFixed(2); }
        async function check(name, callback) { await callback(); passed++; console.log('PASS ' + name); }

        const first = await pair();
        let completed;
        await check('exact cents, conservation of funds and two linked entries', async () => {
            completed = await service.createTransfer(user.id, first.input);
            assert.equal(await balance(first.source.id), '89.50');
            assert.equal(await balance(first.destination.id), '35.85');
            const entries = await db.transactions.findMany({ where: { transfer_id: completed.transfer.id } });
            assert.equal(entries.length, 2);
            assert.equal(entries.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).toString(), '0');
            assert.equal(new Prisma.Decimal(await balance(first.source.id)).plus(await balance(first.destination.id)).toFixed(2), '125.35');
        });
        await check('replaying a committed request does not move money twice', async () => {
            const retry = await service.createTransfer(user.id, first.input);
            assert.equal(retry.replayed, true);
            assert.equal(retry.transfer.id, completed.transfer.id);
            assert.equal(await balance(first.source.id), '89.50');
            assert.equal(await db.transactions.count({ where: { transfer_id: completed.transfer.id } }), 2);
            assert.equal(await db.notifications.count({ where: { user_id: user.id, message: { contains: completed.transfer.id } } }), 1);
        });
        await check('concurrent identical requests produce one transfer', async () => {
            const p = await pair('100.00', '0.00');
            const result = await Promise.all([service.createTransfer(user.id, p.input), service.createTransfer(user.id, p.input)]);
            assert.equal(result[0].transfer.id, result[1].transfer.id);
            assert.equal(await balance(p.source.id), '89.25');
            assert.equal(await balance(p.destination.id), '10.75');
            assert.equal(await db.transfers.count({ where: { user_id: user.id, request_key: p.input.idempotencyKey } }), 1);
        });
        await check('stale confirmation is rejected without another debit', async () => {
            await assert.rejects(service.createTransfer(user.id, { ...first.input, idempotencyKey: randomUUID() }), { code: 'BALANCE_CHANGED' });
            assert.equal(await balance(first.source.id), '89.50');
        });
        await check('a one-cent overdraft is refused', async () => {
            const p = await pair('0.20', '0.00');
            await assert.rejects(service.createTransfer(user.id, { ...p.input, amount: '0.21' }), { code: 'INSUFFICIENT_FUNDS' });
            assert.equal(await balance(p.source.id), '0.20');
            assert.equal(await balance(p.destination.id), '0.00');
        });
        await check('sanctioned overdraft preserves cents', async () => {
            const p = await pair('0.20', '0.00', true);
            await service.createTransfer(user.id, { ...p.input, amount: '0.21' });
            assert.equal(await balance(p.source.id), '-0.01');
            assert.equal(await balance(p.destination.id), '0.21');
        });
        await check('outsiders cannot debit or credit inaccessible vaults', async () => {
            const p = await pair();
            await assert.rejects(service.createTransfer(outsider.id, p.input), { code: 'VAULT_UNAVAILABLE' });
            assert.equal(await balance(p.source.id), '100.25');
        });
        await check('archived memberships and accounts are excluded', async () => {
            const p = await pair();
            await db.account_users.updateMany({ where: { account_id: p.destination.id }, data: { archived: true } });
            await assert.rejects(service.createTransfer(user.id, p.input), { code: 'VAULT_UNAVAILABLE' });
            await db.account_users.updateMany({ where: { account_id: p.destination.id }, data: { archived: false } });
            await db.accounts.update({ where: { id: p.destination.id }, data: { archived: true } });
            await assert.rejects(service.createTransfer(user.id, p.input), { code: 'VAULT_UNAVAILABLE' });
            assert.equal(await balance(p.source.id), '100.25');
        });
        await check('failure on the second ledger entry rolls back both balances and the receipt', async () => {
            const p = await pair();
            adapter.runTransaction = (callback, options) => run(async tx => {
                let entries = 0;
                const wrapped = new Proxy(tx, { get(target, property) {
                    if (property === 'transactions') return { create: args => {
                        if (++entries === 2) throw new Error('injected ledger failure');
                        return tx.transactions.create(args);
                    } };
                    const value = Reflect.get(target, property);
                    return typeof value === 'function' ? value.bind(target) : value;
                } });
                return callback(wrapped);
            }, options);
            try { await assert.rejects(service.createTransfer(user.id, p.input), /injected ledger failure/); }
            finally { adapter.runTransaction = run; }
            assert.equal(await balance(p.source.id), '100.25');
            assert.equal(await balance(p.destination.id), '25.10');
            assert.equal(await db.transfers.count({ where: { request_key: p.input.idempotencyKey } }), 0);
            assert.equal(await db.transactions.count({ where: { account_id: { in: [p.source.id, p.destination.id] } } }), 0);
        });
        await check('notification failure rolls back money, ledger entries and receipt', async () => {
            const p = await pair();
            adapter.runTransaction = (callback, options) => run(tx => callback(new Proxy(tx, { get(target, property) {
                if (property === 'notifications') return { create: () => { throw new Error('injected notification failure'); } };
                const value = Reflect.get(target, property);
                return typeof value === 'function' ? value.bind(target) : value;
            } })), options);
            try { await assert.rejects(service.createTransfer(user.id, p.input), /injected notification failure/); }
            finally { adapter.runTransaction = run; }
            assert.equal(await balance(p.source.id), '100.25');
            assert.equal(await balance(p.destination.id), '25.10');
            assert.equal(await db.transfers.count({ where: { request_key: p.input.idempotencyKey } }), 0);
            assert.equal(await db.transactions.count({ where: { account_id: p.source.id } }), 0);
        });
        await check('notification dismissal cannot change another recipient', async () => {
            const notifications = require('../../src/models/Notifications.model');
            const original = adapter.notifications;
            adapter.notifications = db.notifications;
            try {
                const own = await notifications.createNotification('Owned dispatch', user.id, db, 'general');
                const outsiderNote = await notifications.createNotification('Private dispatch', outsider.id, db, 'general');
                assert.equal((await notifications.dismissNotification(user.id, outsiderNote.rows[0].id)).rows.length, 0);
                await notifications.dismissAllNotifications(user.id);
                assert.equal((await db.notifications.findUnique({ where: { id: own.rows[0].id } })).dismissed, true);
                assert.equal((await db.notifications.findUnique({ where: { id: outsiderNote.rows[0].id } })).dismissed, false);
                assert.equal(await notifications.getUnreadCount(user.id), 0);
            } finally { adapter.notifications = original; }
        });
        await check('opposite-direction requests finish without deadlock and require a fresh review', async () => {
            const p = await pair('100.00', '100.00');
            const opposite = { ...p.input, sourceAccountId: p.destination.id, destinationAccountId: p.source.id, idempotencyKey: randomUUID() };
            const results = await Promise.allSettled([service.createTransfer(user.id, p.input), service.createTransfer(user.id, opposite)]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            assert.equal(results.find(r => r.status === 'rejected').reason.code, 'BALANCE_CHANGED');
        });
        await check('same key used concurrently on different vault pairs commits only one transfer', async () => {
            const a = await pair(), b = await pair();
            b.input.idempotencyKey = a.input.idempotencyKey;
            const results = await Promise.allSettled([service.createTransfer(user.id, a.input), service.createTransfer(user.id, b.input)]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            assert.equal(results.find(r => r.status === 'rejected').reason.code, 'REQUEST_KEY_REUSED');
            assert.equal(await db.transfers.count({ where: { request_key: a.input.idempotencyKey } }), 1);
        });
        await check('destination overflow does not debit the source', async () => {
            const p = await pair('100.00', '99999999999.99');
            await assert.rejects(service.createTransfer(user.id, { ...p.input, amount: '0.01' }), { code: 'BALANCE_LIMIT' });
            assert.equal(await balance(p.source.id), '100.00');
        });
        const { createDispatcher } = require('../../src/services/NotificationEmailWorker');
        await check('concurrent email workers claim each committed alert once', async () => {
            const expected = await db.notifications.count({ where: { email_status: 'pending' } });
            const delivered = [];
            const send = async (email, note) => { delivered.push(note.id); };
            const one = createDispatcher({ db, send }), two = createDispatcher({ db, send });
            await Promise.all([one.runOnce(), two.runOnce()]);
            await one.runOnce();
            assert.equal(delivered.length, expected, JSON.stringify(await db.notifications.findMany({ select: { id: true, email_status: true, email_last_error: true, email_next_attempt: true } })));
            assert.equal(new Set(delivered).size, expected);
            assert.equal(await db.notifications.count({ where: { email_status: 'sent' } }), expected);
        });
        await check('SMTP failure persists retry state without changing balances', async () => {
            const note = await db.notifications.create({ data: { user_id: user.id, message: 'Retry check', type: 'transfer', email_status: 'pending' } });
            const before = await balance(first.source.id);
            await createDispatcher({ db, send: async () => { const error = new Error('temporary'); error.code = 'ETIMEDOUT'; throw error; } }).runOnce();
            const queued = await db.notifications.findUnique({ where: { id: note.id } });
            assert.equal(queued.email_status, 'retry'); assert.equal(queued.email_attempts, 1);
            assert.ok(queued.email_next_attempt > new Date());
            assert.equal(await balance(first.source.id), before);
        });
        await check('rolled-back notifications never enter the email queue', async () => {
            const marker = randomUUID();
            await assert.rejects(db.$transaction(async tx => {
                await require('../../src/models/Notifications.model').createNotification(marker, user.id, tx, 'transfer');
                throw new Error('rollback queued alert');
            }), /rollback queued alert/);
            assert.equal(await db.notifications.count({ where: { message: marker } }), 0);
        });
        await check('expired leases recover while general notes stay out of email', async () => {
            const recovered = await db.notifications.create({ data: { user_id: user.id, message: 'Recover queue', type: 'membership', email_status: 'processing', email_attempts: 1, email_lease: randomUUID(), email_locked_until: new Date(0) } });
            const plain = await db.notifications.create({ data: { user_id: user.id, message: 'No email', type: 'general' } });
            const delivered = [];
            await createDispatcher({ db, send: async (email, note) => delivered.push(note.id) }).runOnce();
            assert.deepEqual(delivered, [recovered.id]);
            assert.equal((await db.notifications.findUnique({ where: { id: plain.id } })).email_status, 'disabled');
        });
        const settings = require('../../src/services/VaultSettingsService');
        const member = await db.users.create({ data: { email: 'vault-member@example.test', password: 'test-only', verified: true } });
        const managed = await pair('100.00', '0.00');
        await check('shared members cannot read owner settings or rename a vault', async () => {
            await settings.add(user.id, managed.source.id, { email: member.email });
            await assert.rejects(settings.settings(member.id, managed.source.id), { status: 404 });
            await assert.rejects(settings.rename(member.id, managed.source.id, { accountName: 'Hijacked' }), { status: 404 });
        });
        await check('concurrent additions create one active membership and one pair of alerts', async () => {
            const p = await pair();
            const before = await db.notifications.count();
            const results = await Promise.allSettled([settings.add(user.id, p.source.id, { email: member.email }), settings.add(user.id, p.source.id, { email: member.email })]);
            assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
            assert.equal(await db.account_users.count({ where: { account_id: p.source.id, user_id: member.id, archived: false } }), 1);
            assert.equal(await db.notifications.count(), before + 2);
        });
        await check('removed members disappear from access checks and dashboard listings', async () => {
            await settings.remove(user.id, managed.source.id, { userId: member.id });
            const listed = await require('../../src/models/Accounts.model').getAccountsForUser(member.email);
            assert.equal(listed.rows.some(row => row.id === managed.source.id), false);
            await assert.rejects(settings.transfer(user.id, managed.source.id, { email: member.email, confirm: true }), { status: 409 });
            const before = await db.notifications.count();
            await settings.remove(user.id, managed.source.id, { userId: member.id });
            assert.equal(await db.notifications.count(), before);
        });
        await check('re-adding and transferring ownership preserves the former owner as a member', async () => {
            await settings.add(user.id, managed.source.id, { email: member.email });
            await settings.transfer(user.id, managed.source.id, { email: member.email, confirm: true });
            await assert.rejects(settings.rename(user.id, managed.source.id, { accountName: 'Old command' }), { status: 404 });
            await settings.rename(member.id, managed.source.id, { accountName: 'New command' });
            assert.ok(await db.account_users.findFirst({ where: { account_id: managed.source.id, user_id: user.id, archived: false } }));
        });
        await check('overdraft cannot be disabled with a negative balance', async () => {
            const p = await pair('-0.01', '0.00', true);
            await assert.rejects(settings.overdraft(user.id, p.source.id, { overdraft: false }), { status: 409 });
            assert.equal((await db.accounts.findUnique({ where: { id: p.source.id } })).overdraft, true);
        });
        await check('closure and incoming transfers serialize without stranding funds', async () => {
            const p = await pair('100.00', '0.00');
            const results = await Promise.allSettled([settings.close(user.id, p.destination.id, { confirmName: 'Destination' }), service.createTransfer(user.id, p.input)]);
            assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
            const target = await db.accounts.findUnique({ where: { id: p.destination.id } });
            if (target.archived) { assert.equal(target.balance.toFixed(2), '0.00'); assert.equal(await balance(p.source.id), '100.00'); }
            else { assert.equal(target.balance.toFixed(2), '10.75'); assert.equal(await balance(p.source.id), '89.25'); }
        });
        await check('closure retains ledger history while revoking every membership', async () => {
            const p = await pair('0.00', '0.00');
            const record = await db.transactions.create({ data: { account_id: p.source.id, user_id: user.id, amount: '0.00', category: 'History', description: 'Retained history' } });
            await settings.close(user.id, p.source.id, { confirmName: 'Source' });
            assert.equal((await db.transactions.findUnique({ where: { id: record.id } })).archived, true);
            assert.equal(await db.account_users.count({ where: { account_id: p.source.id, archived: false } }), 0);
        });
        await check('a withdrawal rechecks membership after a concurrent revocation', async () => {
            const p = await pair('100.00', '0.00');
            await settings.add(user.id, p.source.id, { email: member.email });
            adapter.accounts.findUnique = args => db.accounts.findUnique(args);
            adapter.account_users.findMany = args => db.account_users.findMany(args);
            const transactions = require('../../src/models/Transactions.model');
            const access = transactions.checkUserAccountAccess;
            let calls = 0;
            transactions.checkUserAccountAccess = async (...args) => {
                const result = await access(...args);
                if (++calls === 1) await settings.remove(user.id, p.source.id, { userId: member.id });
                return result;
            };
            const res = { status(code) { this.code = code; return this; }, json() { return this; }, send() { return this; } };
            try {
                await require('../../src/controllers/transactions.controller').createTransaction({ user: { user: { id: member.id } }, body: { accountId: p.source.id, transactionAmount: '-1.00', description: 'Race check', category: 'General' } }, res);
            } finally { transactions.checkUserAccountAccess = access; }
            assert.equal(res.code, 404); assert.equal(calls, 2); assert.equal(await balance(p.source.id), '100.00');
            assert.equal(await db.transactions.count({ where: { account_id: p.source.id } }), 0);
        });
        const archives = require('../../src/services/LedgerArchivesService');
        adapter.$queryRaw = (...args) => db.$queryRaw(...args);
        const reader = await db.users.create({ data: { email: 'archive-reader@example.test', password: 'test-only', verified: true } });
        const vaultA = await db.accounts.create({ data: { owner: reader.id, name: 'Archive A' } });
        const vaultB = await db.accounts.create({ data: { owner: reader.id, name: 'Archive B' } });
        const hidden = await db.accounts.create({ data: { owner: outsider.id, name: 'Private vault' } });
        for (const vault of [vaultA,vaultB]) await db.account_users.create({ data: { account_id: vault.id, user_id: reader.id } });
        // A duplicate membership must not multiply reports or rows.
        await db.account_users.create({ data: { account_id: vaultA.id, user_id: reader.id } });
        await db.account_users.create({ data: { account_id: hidden.id, user_id: reader.id, archived: true } });
        const entry = (account, amount, date, extra = {}) => db.transactions.create({ data: { account_id: account.id, user_id: reader.id, amount, create_date: new Date(date), category: 'Campaign', description: 'Archive fixture', ...extra } });
        await entry(vaultA,'100.10','2026-01-01T00:00:00Z');
        await entry(vaultA,'-20.05','2026-01-31T23:59:59Z',{description:'=SUM(A1:A2), "supplies"'});
        await entry(vaultB,'5.00','2026-02-01T00:00:00Z',{category:'Transfer'});
        await entry(hidden,'999.00','2026-01-01T00:00:00Z',{description:'Private hidden entry'});
        await entry(vaultA,'500.00','2026-01-01T00:00:00Z',{archived:true});
        const linked = await db.transfers.create({ data: { user_id: reader.id, request_key: randomUUID(), source_account_id: vaultA.id, destination_account_id: vaultB.id, amount:'10.00', description:'Archive fixture transfer', source_balance_before:'100.10',source_balance_after:'90.10',destination_balance_before:'0.00',destination_balance_after:'10.00' } });
        await entry(vaultA,'-10.00','2026-01-15T12:00:00Z',{transfer_id:linked.id});
        await entry(vaultB,'10.00','2026-01-15T12:00:00Z',{transfer_id:linked.id});
        await check('archives exclude private and archived data without duplicating shared memberships', async () => {
            const result = await archives.search(reader.id,{});
            assert.equal(result.entries.length,5); assert.equal(result.totals.count,5);
            assert.equal(result.totals.income,'105.10'); assert.equal(result.totals.spending,'20.05'); assert.equal(result.totals.net,'85.05');
            assert.equal(result.totals.transferEntries,2);
            assert.equal((await archives.search(reader.id,{accountId:String(hidden.id)})).entries.length,0);
        });
        await check('UTC date boundaries and monthly/category reports use all matching entries', async () => {
            const january = await archives.search(reader.id,{from:'2026-01-01',to:'2026-01-31'});
            assert.equal(january.totals.count,4); assert.equal(january.totals.net,'80.05');
            assert.equal(january.monthly.length,1); assert.equal(january.monthly[0].month,'2026-01');
            assert.equal(january.categories[0].spending,'20.05');
            const single = await archives.search(reader.id,{from:'2026-01-31',to:'2026-01-31'});
            assert.equal(single.entries.length,1);
        });
        await check('linked transfers never count as income even with only one vault selected', async () => {
            const result = await archives.search(reader.id,{accountId:String(vaultB.id)});
            assert.equal(result.totals.income,'5.00'); assert.equal(result.totals.net,'5.00');
            assert.equal(result.categories[0].category,'Transfer');
            const onlyTransfers = await archives.search(reader.id,{type:'transfer'});
            assert.equal(onlyTransfers.entries.length,2); assert.equal(onlyTransfers.totals.net,'0.00'); assert.equal(onlyTransfers.categories.length,0);
        });
        await check('search and absolute amount filters are literal, scoped, and cent accurate', async () => {
            assert.equal((await archives.search(reader.id,{minAmount:'20.05',maxAmount:'20.05',type:'withdrawal'})).entries.length,1);
            assert.equal((await archives.search(reader.id,{q:'supplies'})).entries.length,1);
            assert.equal((await archives.search(reader.id,{q:"' OR 1=1 --"})).entries.length,0);
            assert.equal((await archives.search(reader.id,{category:'Transfer'})).totals.income,'5.00');
        });
        await check('CSV preserves exact amounts and escapes formula-like descriptions', async () => {
            const csv = await archives.exportCsv(reader.id,{type:'withdrawal'});
            assert.ok(csv.includes('"-20.05"')); assert.ok(csv.includes("'=SUM(A1:A2)")); assert.ok(csv.includes('""supplies""')); assert.ok(!csv.includes('Private hidden entry'));
        });
        await check('archives paginate without truncating reports or CSV exports', async () => {
            for(let index=0;index<51;index++) await entry(vaultA,'0.01','2026-03-01T00:00:00Z',{category:'Pagination'});
            const firstPage=await archives.search(reader.id,{category:'Pagination'});
            assert.equal(firstPage.entries.length,50); assert.equal(firstPage.totals.income,'0.51'); assert.ok(firstPage.nextCursor);
            const secondPage=await archives.search(reader.id,{category:'Pagination',before:String(firstPage.nextCursor)});
            assert.equal(secondPage.entries.length,1); assert.equal(secondPage.totals.income,'0.51'); assert.equal(secondPage.nextCursor,null);
            const csv=await archives.exportCsv(reader.id,{category:'Pagination',before:String(firstPage.nextCursor)});
            assert.equal(csv.trim().split('\r\n').length,52);
        });
        await check('archived vaults disappear from search, totals and export immediately', async () => {
            await db.accounts.update({where:{id:vaultA.id},data:{archived:true}});
            const result=await archives.search(reader.id,{}); assert.equal(result.entries.length,2); assert.equal(result.totals.income,'5.00');
            assert.ok(!(await archives.exportCsv(reader.id,{})).includes('Archive A'));
        });
        const sessionService = require('../../src/services/SessionService');
        const bcrypt = require('bcrypt');
        adapter.users.findFirst = args => db.users.findFirst(args);
        adapter.sessions = db.sessions;
        adapter.tokens.findFirst = args => db.tokens.findFirst(args);
        const citizen = await db.users.create({data:{email:'security-citizen@example.test',password:await bcrypt.hash('original-password',10),verified:true}});
        let firstLogin,secondLogin;
        await check('two logins create independent valid sessions with safe session metadata',async()=>{
            firstLogin=await sessionService.login(citizen.email,'original-password',{ip:'127.0.0.1',agent:'Firefox/1 Windows'});
            secondLogin=await sessionService.login(citizen.email,'original-password',{ip:'127.0.0.2',agent:'Chrome/1 Android'});
            const a=await sessionService.authorize(firstLogin.accessToken),b=await sessionService.authorize(secondLogin.accessToken);
            assert.notEqual(a.sid,b.sid);
            const list=await sessionService.sessions(citizen.id,a.sid);assert.equal(list.length,2);assert.equal(list.filter(row=>row.current).length,1);
            assert.ok(!JSON.stringify(list).includes('password'));assert.ok(!JSON.stringify(list).includes(firstLogin.refreshToken));
            assert.equal(await db.notifications.count({where:{user_id:citizen.id,type:'security',email_status:'pending'}}),2);
        });
        await check('revocation blocks both access and refresh for only its target session',async()=>{
            const a=await sessionService.authorize(firstLogin.accessToken),b=await sessionService.authorize(secondLogin.accessToken);
            await sessionService.revoke(citizen.id,b.sid,a.sid);
            await assert.rejects(sessionService.authorize(firstLogin.accessToken),{status:401});
            await assert.rejects(sessionService.refresh(firstLogin.refreshToken),{status:401});
            assert.equal((await sessionService.authorize(secondLogin.accessToken)).sid,b.sid);
            const refreshed=await sessionService.refresh(secondLogin.refreshToken);assert.ok(refreshed.accessToken);
        });
        await check('current-password failures leave active sessions and the password intact',async()=>{
            const b=await sessionService.authorize(secondLogin.accessToken);
            await assert.rejects(sessionService.changePassword(citizen.id,b.sid,{currentPassword:'wrong-password',newPassword:'changed-password'}),{status:400});
            assert.ok(await sessionService.authorize(secondLogin.accessToken));
        });
        await check('password changes revoke all sessions and reject the old password',async()=>{
            const b=await sessionService.authorize(secondLogin.accessToken);
            await sessionService.changePassword(citizen.id,b.sid,{currentPassword:'original-password',newPassword:'changed-password'});
            await assert.rejects(sessionService.authorize(secondLogin.accessToken),{status:401});
            await assert.rejects(sessionService.refresh(secondLogin.refreshToken),{status:401});
            await assert.rejects(sessionService.login(citizen.email,'original-password'),{status:401});
            assert.equal(await db.sessions.count({where:{user_id:citizen.id,valid:true}}),0);
            assert.equal(await db.tokens.count({where:{user_id:citizen.id,valid:true}}),0);
        });
        await check('sign out others preserves the current session and ignores other users sessions',async()=>{
            const current=await sessionService.login(citizen.email,'changed-password');
            const other=await sessionService.login(citizen.email,'changed-password');
            const c=await sessionService.authorize(current.accessToken);
            const foreign=await db.sessions.create({data:{user_id:outsider.id,ip_address:'127.0.0.1',valid:true,expires_at:new Date(Date.now()+60000)}});
            assert.equal((await sessionService.revoke(citizen.id,c.sid,foreign.id)).revoked,0);
            await sessionService.revoke(citizen.id,c.sid,'others');
            assert.ok(await sessionService.authorize(current.accessToken));await assert.rejects(sessionService.authorize(other.accessToken),{status:401});
            assert.equal((await db.sessions.findUnique({where:{id:foreign.id}})).valid,true);
        });
        await check('reset links are single-use and cannot authorize API access',async()=>{
            const resetUser=await db.users.findUnique({where:{id:citizen.id}});
            const token=sessionService.resetToken(resetUser);
            await assert.rejects(sessionService.authorize(token),{status:401});
            await sessionService.resetPassword(token,'reset-password');
            await assert.rejects(sessionService.resetPassword(token,'another-password'),{status:400});
            assert.equal(await db.sessions.count({where:{user_id:citizen.id,valid:true}}),0);
        });
        await check('login rolls back its session and tokens when notification persistence fails',async()=>{
            const beforeSessions=await db.sessions.count(),beforeTokens=await db.tokens.count();
            adapter.runTransaction=(callback,options)=>run(tx=>callback(new Proxy(tx,{get(target,property){
                if(property==='notifications')return {create:()=>{throw new Error('injected security alert failure');}};
                const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
            }})),options);
            try {await assert.rejects(sessionService.login(citizen.email,'reset-password'),/injected security alert failure/);}finally{adapter.runTransaction=run;}
            assert.equal(await db.sessions.count(),beforeSessions);assert.equal(await db.tokens.count(),beforeTokens);
        });
        await check('expired sessions and archived users cannot continue using valid JWTs',async()=>{
            const current=await sessionService.login(citizen.email,'reset-password');const c=await sessionService.authorize(current.accessToken);
            await db.sessions.update({where:{id:c.sid},data:{expires_at:new Date(0)}});
            await assert.rejects(sessionService.authorize(current.accessToken),{status:401});
            await assert.rejects(sessionService.refresh(current.refreshToken),{status:401});
            const last=await sessionService.login(citizen.email,'reset-password');
            await db.users.update({where:{id:citizen.id},data:{archived:true}});
            await assert.rejects(sessionService.authorize(last.accessToken),{status:401});
        });
        const prefs = require('../../src/services/PreferencesService');
        const cases = require('../../src/services/DisputesService');
        const notifications = require('../../src/models/Notifications.model');
        for (const model of ['users', 'accounts', 'transactions', 'user_preferences', 'notifications', 'disputes', 'dispute_events']) adapter[model] = db[model];
        const reporter = await db.users.create({ data: { email: 'reporter@example.test', password: 'test-only', verified: true } });
        const reviewer = await db.users.create({ data: { email: 'reviewer@example.test', password: 'test-only', verified: true, super_user: true } });
        const stranger = await db.users.create({ data: { email: 'stranger@example.test', password: 'test-only', verified: true } });
        const vault = await db.accounts.create({ data: { owner: reporter.id, name: 'Cases vault', balance: '25.00' } });
        await db.account_users.create({ data: { user_id: reporter.id, account_id: vault.id } });
        const disputedEntry = await db.transactions.create({ data: { user_id: reporter.id, account_id: vault.id, description: 'Questioned entry', amount: '25.00', category: 'General' } });
        await check('preference updates preserve the other group and remain user scoped', async () => {
            const initial = await prefs.read(reporter.id); assert.equal(initial.notifications.security.email, true);
            const dashboard = { order: [vault.id], hideBalances: true, defaultAccountId: vault.id, shortcuts: ['disputes', 'transfer'] };
            await prefs.saveDashboard(reporter.id, dashboard);
            const channels = prefs.defaults(); channels.transfer = { inApp: false, email: true };
            await prefs.saveNotifications(reporter.id, channels);
            assert.deepEqual((await prefs.read(reporter.id)).dashboard, dashboard);
            assert.equal((await prefs.read(stranger.id)).dashboard.hideBalances, false);
            await assert.rejects(prefs.saveDashboard(stranger.id, dashboard), e => e.status === 400);
        });
        await check('email-only and disabled alerts never enter the inbox or unread badge', async () => {
            const created = (await notifications.createNotification('Email only', reporter.id, db, 'transfer')).rows[0];
            assert.equal((await db.notifications.findUnique({ where: { id: created.id } })).email_status, 'pending');
            assert.equal((await notifications.getNotificationById(reporter.id, created.id)).rows.length, 0);
            assert.equal(await notifications.getUnreadCount(reporter.id), 0);
            const settings = prefs.defaults(); settings.transfer = { inApp: false, email: false }; await prefs.saveNotifications(reporter.id, settings);
            const disabled = (await notifications.createNotification('Neither channel', reporter.id, db, 'transfer')).rows[0];
            assert.equal((await db.notifications.findUnique({ where: { id: disabled.id } })).email_status, 'disabled');
        });
        await check('disabling email skips already queued alerts at delivery time', async () => {
            await db.notifications.updateMany({ where: { user_id: { not: reporter.id } }, data: { email_status: 'disabled' } });
            let sends = 0;
            await require('../../src/services/NotificationEmailWorker').createDispatcher({ db, send: async () => { sends++; } }).runOnce();
            assert.equal(sends, 0);
            assert.equal(await db.notifications.count({ where: { user_id: reporter.id, email_last_error: 'PREFERENCE_DISABLED' } }), 1);
        });
        let caseRow;
        await check('concurrent duplicate case submissions produce one case, event and alert', async () => {
            const result = await Promise.all([cases.create(reporter.id, disputedEntry.id, { reason: 'Unrecognized entry' }), cases.create(reporter.id, disputedEntry.id, { reason: 'Unrecognized entry' })]);
            caseRow = result[0]; assert.equal(result[0].id, result[1].id);
            assert.equal(await db.dispute_events.count({ where: { dispute_id: caseRow.id } }), 1);
            assert.equal(await db.notifications.count({ where: { user_id: reporter.id, type: 'dispute' } }), 1);
            assert.equal(await balance(vault.id), '25.00');
        });
        await check('outsiders cannot file, read, list for review or resolve cases', async () => {
            await assert.rejects(cases.create(stranger.id, disputedEntry.id, { reason: 'Foreign account' }), e => e.status === 404);
            await assert.rejects(cases.detail(stranger.id, caseRow.id), e => e.status === 404);
            assert.equal((await cases.list(stranger.id)).items.length, 0);
            await assert.rejects(cases.list(stranger.id, { scope: 'review' }), e => e.status === 403);
            await assert.rejects(cases.update(stranger.id, caseRow.id, { expectedStatus: 'Open', status: 'Resolved', note: 'Unauthorized decision' }), e => e.status === 404);
        });
        await check('reporters cannot resolve their own case even when promoted to administrator', async () => {
            await db.users.update({ where: { id: reporter.id }, data: { super_user: true } });
            await assert.rejects(cases.update(reporter.id, caseRow.id, { expectedStatus: 'Open', status: 'Resolved', note: 'Self-approved' }), e => e.status === 403);
            await db.users.update({ where: { id: reporter.id }, data: { super_user: false } });
        });
        await check('administrator review records decisions and rejects stale updates without moving money', async () => {
            await cases.update(reviewer.id, caseRow.id, { expectedStatus: 'Open', status: 'UnderReview', note: 'Review has begun' });
            await assert.rejects(cases.update(reviewer.id, caseRow.id, { expectedStatus: 'Open', status: 'Resolved', note: 'Stale decision' }), e => e.status === 409);
            await cases.update(reviewer.id, caseRow.id, { expectedStatus: 'UnderReview', status: 'Resolved', note: 'Entry verified with reporter' });
            const result = await cases.detail(reporter.id, caseRow.id); assert.equal(result.events.length, 3); assert.equal(result.resolution, 'Entry verified with reporter'); assert.equal(result.canWithdraw, false);
            assert.equal(await balance(vault.id), '25.00');
            await assert.rejects(cases.update(reviewer.id, caseRow.id, { expectedStatus: 'Resolved', status: 'Rejected', note: 'Change a final decision' }), e => e.status === 409);
        });
        await check('reporters can withdraw an active case with retained history', async () => {
            const row = await cases.create(reporter.id, disputedEntry.id, { reason: 'Clarification requested' });
            await cases.update(reporter.id, row.id, { expectedStatus: 'Open', status: 'Withdrawn', note: 'Question answered by owner' });
            assert.equal((await cases.detail(reporter.id, row.id)).events.length, 2);
        });
        await check('notification persistence failure rolls back the case and its history', async () => {
            adapter.runTransaction = (callback, options) => run(tx => callback(new Proxy(tx, { get(target, property) {
                if (property === 'notifications') return { create: async () => { throw new Error('injected case alert failure'); } };
                return target[property];
            } })), options);
            const count = await db.disputes.count();
            try { await assert.rejects(cases.create(reporter.id, disputedEntry.id, { reason: 'Rollback this case' }), /injected case alert failure/); }
            finally { adapter.runTransaction = run; }
            assert.equal(await db.disputes.count(), count);
        });
        await check('revoked vault membership prevents new cases but retains the reporter case history', async () => {
            await db.account_users.updateMany({ where: { user_id: reporter.id, account_id: vault.id }, data: { archived: true } });
            await assert.rejects(cases.create(reporter.id, disputedEntry.id, { reason: 'Access has been revoked' }), e => e.status === 404);
            assert.equal((await cases.detail(reporter.id, caseRow.id)).status, 'Resolved');
        });
        const adminService = require('../../src/services/AdminService');
        adapter.audit_logs = db.audit_logs;
        await check('admin overview and directories exclude credentials and enforce database roles', async () => {
            const overview = await adminService.overview(reviewer.id); assert.ok(overview.users >= 3);
            const directory = await adminService.users(reviewer.id, { q: reporter.email }); assert.equal(directory.items.length, 1); assert.equal(directory.items[0].id, reporter.id); assert.equal('password' in directory.items[0], false);
            await assert.rejects(adminService.overview(reporter.id), e => e.status === 403);
            assert.ok((await adminService.vaults(reviewer.id, { q: 'Cases vault' })).items.some(row => row.id === vault.id));
            assert.equal((await cases.detail(reviewer.id, caseRow.id)).transaction.id, disputedEntry.id);
            assert.equal('transaction' in (await cases.detail(reporter.id, caseRow.id)), false);
        });
        await check('granting an admin role revokes the target sessions and records an audit event', async () => {
            await db.sessions.create({ data: { user_id: stranger.id, ip_address: '127.0.0.1', valid: true, expires_at: new Date(Date.now() + 60000) } });
            await adminService.role(reviewer.id, stranger.id, { expectedRole: false, super_user: true, reason: 'Support coverage' });
            assert.equal((await db.users.findUnique({ where: { id: stranger.id } })).super_user, true);
            assert.equal(await db.sessions.count({ where: { user_id: stranger.id, valid: true } }), 0);
            assert.equal(await db.audit_logs.count({ where: { user_id: reviewer.id, action: 'ADMIN_ROLE_CHANGED' } }), 1);
        });
        await check('admin action audit failure rolls back the role change', async () => {
            adapter.runTransaction = (callback, options) => run(tx => callback(new Proxy(tx, { get(target, property) {
                if (property === 'audit_logs') return { create: async () => { throw new Error('injected admin audit failure'); } }; return target[property];
            } })), options);
            try { await assert.rejects(adminService.role(reviewer.id, reporter.id, { expectedRole: false, super_user: true, reason: 'Rollback role test' }), /injected admin audit failure/); }
            finally { adapter.runTransaction = run; }
            assert.equal((await db.users.findUnique({ where: { id: reporter.id } })).super_user, false);
        });
        await check('self demotion is rejected and concurrent mutual demotions preserve an administrator', async () => {
            await assert.rejects(adminService.role(reviewer.id, reviewer.id, { expectedRole: true, super_user: false, reason: 'Remove myself' }), e => e.status === 409);
            const results = await Promise.allSettled([
                adminService.role(reviewer.id, stranger.id, { expectedRole: true, super_user: false, reason: 'Remove second admin' }),
                adminService.role(stranger.id, reviewer.id, { expectedRole: true, super_user: false, reason: 'Remove first admin' }),
            ]);
            assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
            assert.equal(await db.users.count({ where: { id: { in: [reviewer.id, stranger.id] }, super_user: true } }), 1);
        });
        await check('demoted administrators immediately lose admin service access', async () => {
            const demoted = await db.users.findFirst({ where: { id: { in: [reviewer.id, stranger.id] }, super_user: false } });
            await assert.rejects(adminService.users(demoted.id), e => e.status === 403);
        });
        await check('session revocations and dispute decisions appear in the administrator audit trail', async () => {
            const remaining = await db.users.findFirst({ where: { id: { in: [reviewer.id, stranger.id] }, super_user: true } });
            await adminService.revoke(remaining.id, reporter.id, { reason: 'Reported lost browser session' });
            const trail = await adminService.audit(remaining.id);
            assert.ok(trail.items.some(row => row.action === 'ADMIN_SESSIONS_REVOKED'));
            assert.ok(trail.items.some(row => row.action === 'ADMIN_DISPUTE_UPDATED'));
        });
        const impersonation = require('../../src/services/ImpersonationService');
        adapter.impersonations = db.impersonations;
        const supportAdmin = await db.users.create({ data: { email: 'support-admin@example.test', password: await require('bcrypt').hash('support-password', 10), super_user: true, verified: true } });
        const supportUser = await db.users.create({ data: { email: 'support-user@example.test', password: 'test-only', super_user: false, verified: true } });
        const adminLogin = await sessionService.login(supportAdmin.email, 'support-password');
        const adminIdentity = await sessionService.authorize(adminLogin.accessToken);
        let supportContext;
        await check('support context uses member identity with no new member tokens or sessions', async () => {
            supportContext = await impersonation.start(supportAdmin.id, adminIdentity.sid, supportUser.id, { reason: 'Investigate reported dashboard issue' });
            assert.equal((await impersonation.resolve(adminIdentity, supportContext.id)).user.id, supportUser.id);
            assert.equal(await db.sessions.count({ where: { user_id: supportUser.id } }), 0);
            assert.equal(await db.tokens.count({ where: { user_id: supportUser.id } }), 0);
        });
        await check('impersonation cannot be reused from another session or administrator', async () => {
            await assert.rejects(impersonation.resolve({ ...adminIdentity, sid: adminIdentity.sid + 1 }, supportContext.id), e => e.code === 'IMPERSONATION_INVALID');
            await assert.rejects(impersonation.resolve({ ...adminIdentity, user: { id: supportUser.id, super_user: true } }, supportContext.id), e => e.code === 'IMPERSONATION_INVALID');
            await assert.rejects(impersonation.stop(supportUser.id, adminIdentity.sid, supportContext.id), e => e.status === 404);
        });
        await check('read-only support access blocks financial and credential routes over HTTP', async () => {
            const app = require('express')(); const auth = require('../../src/services/AuthService').authenticateToken;
            app.use(require('../../src/middleware/impersonationReadOnly'));
            app.get('/api/account', auth, (req, res) => res.json({ userId: req.user.user.id }));
            app.post('/api/transaction/transfer', auth, (req, res) => res.json({ error: 'should never execute' }));
            const http = require('supertest');
            const view = await http(app).get('/api/account').set('Authorization', 'Bearer ' + adminLogin.accessToken).set('X-Impersonation-Id', supportContext.id); assert.equal(view.status, 200); assert.equal(view.body.userId, supportUser.id);
            for (const route of ['/api/transaction/transfer', '/api/users/change-password', '/api/auth/reset-password', '/api/users']) {
                const denied = await http(app).post(route).set('Authorization', 'Bearer ' + adminLogin.accessToken).set('X-Impersonation-Id', supportContext.id); assert.equal(denied.status, 403);
            }
        });
        await check('ending impersonation is idempotent and preserves admin login', async () => {
            await impersonation.stop(supportAdmin.id, adminIdentity.sid, supportContext.id);
            await impersonation.stop(supportAdmin.id, adminIdentity.sid, supportContext.id);
            await assert.rejects(impersonation.resolve(adminIdentity, supportContext.id), e => e.code === 'IMPERSONATION_INVALID');
            assert.equal((await sessionService.authorize(adminLogin.accessToken)).user.id, supportAdmin.id);
            assert.equal(await db.audit_logs.count({ where: { user_id: supportAdmin.id, action: 'ADMIN_IMPERSONATION_ENDED' } }), 1);
        });
        await check('expired or promoted target contexts cannot authorize support access', async () => {
            const context = await impersonation.start(supportAdmin.id, adminIdentity.sid, supportUser.id, { reason: 'Check support expiry' });
            await db.impersonations.update({ where: { id: context.id }, data: { expires_at: new Date(Date.now() - 1000) } });
            await assert.rejects(impersonation.resolve(adminIdentity, context.id), e => e.code === 'IMPERSONATION_INVALID');
            const promoted = await impersonation.start(supportAdmin.id, adminIdentity.sid, supportUser.id, { reason: 'Check target role changes' });
            await db.users.update({ where: { id: supportUser.id }, data: { super_user: true } });
            await assert.rejects(impersonation.resolve(adminIdentity, promoted.id), e => e.code === 'IMPERSONATION_INVALID');
            await assert.rejects(impersonation.start(supportAdmin.id, adminIdentity.sid, supportUser.id, { reason: 'Admin target forbidden' }), e => e.status === 400);
        });
        await check('parent session revocation rejects the token needed for support access', async () => {
            await sessionService.revoke(supportAdmin.id, adminIdentity.sid, adminIdentity.sid);
            await assert.rejects(sessionService.authorize(adminLogin.accessToken), e => e.status === 401);
            await assert.rejects(impersonation.start(supportAdmin.id, adminIdentity.sid, reporter.id, { reason: 'Revoked parent rejected' }), e => e.status === 401);
        });
        const labelsService=require('../../src/services/LedgerLabelsService');
        const archivesService=require('../../src/services/LedgerArchivesService');
        const labelOwner=await db.users.create({data:{email:'labels-owner@example.test',password:'fixture',verified:true}});
        const labelMember=await db.users.create({data:{email:'labels-member@example.test',password:'fixture',verified:true}});
        const labeledVault=await db.accounts.create({data:{owner:labelOwner.id,name:'Classification vault',balance:'100.00'}});
        for(const person of [labelOwner,labelMember]) await db.account_users.create({data:{user_id:person.id,account_id:labeledVault.id}});
        const labeledEntries=await Promise.all(['-0.01','-0.02'].map(amount=>db.transactions.create({data:{user_id:labelOwner.id,account_id:labeledVault.id,amount,description:'Classification fixture',category:'Original'}})));
        const categoryLabel=await labelsService.save(labelOwner.id,'category',{name:'Supplies',color:'#ccaa55'});
        const tagLabel=await labelsService.save(labelOwner.id,'tag',{name:'Campaign',color:'#33aa88'});
        const memberLabel=await labelsService.save(labelMember.id,'category',{name:'Private category',color:'#445566'});
        const entryIds=labeledEntries.map(row=>row.id);
        await check('label catalogs are private and reject case-insensitive duplicate names',async()=>{
            assert.equal((await labelsService.list(labelMember.id)).length,1);
            await assert.rejects(labelsService.save(labelOwner.id,'category',{name:' supplies ',color:'#ffffff'}),e=>e.status===409);
            await assert.rejects(labelsService.archive(labelMember.id,'category',categoryLabel.id),e=>e.status===404);
        });
        await check('bulk labels update personal views, exact category totals, tags and CSV without moving money',async()=>{
            await labelsService.assign(labelOwner.id,{transactionIds:entryIds,categoryId:categoryLabel.id,addTagIds:[tagLabel.id]});
            const report=await archivesService.search(labelOwner.id,{categoryId:String(categoryLabel.id),tagId:String(tagLabel.id)});
            assert.equal(report.entries.length,2);assert.equal(report.categories[0].category,'Supplies');assert.equal(report.categories[0].spending,'0.03');assert.equal(report.entries[0].tags[0].name,'Campaign');
            const other=await archivesService.search(labelMember.id,{});assert.equal(other.entries[0].category,'Original');assert.deepEqual(other.entries[0].tags,[]);
            assert.equal((await archivesService.search(labelMember.id,{tagId:String(tagLabel.id)})).entries.length,0);
            assert.ok((await archivesService.exportCsv(labelOwner.id,{})).includes('Campaign'));assert.equal(await balance(labeledVault.id),'100.00');
            const decorated=await labelsService.decorate(labelOwner.id,labeledEntries);assert.equal(decorated[0].category,'Supplies');assert.equal(decorated[0].tags.length,1);
        });
        await check('renaming a label updates historic reports and archived labels retain history',async()=>{
            await labelsService.save(labelOwner.id,'category',{name:'Requisitions',color:'#abcdef'},categoryLabel.id);
            await labelsService.archive(labelOwner.id,'category',categoryLabel.id);await labelsService.archive(labelOwner.id,'tag',tagLabel.id);
            const report=await archivesService.search(labelOwner.id,{categoryId:String(categoryLabel.id)});assert.equal(report.categories[0].category,'Requisitions');assert.equal(report.entries[0].tags[0].archived,true);
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:entryIds,categoryId:categoryLabel.id}),e=>e.status===400);
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:entryIds,addTagIds:[tagLabel.id]}),e=>e.status===400);
            await labelsService.save(labelOwner.id,'category',{name:'Requisitions',color:'#abcdef',archived:false},categoryLabel.id);
            await labelsService.save(labelOwner.id,'tag',{name:'Campaign',color:'#33aa88',archived:false},tagLabel.id);
        });
        await check('foreign labels and mismatched category/tag types cannot be assigned',async()=>{
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:entryIds,categoryId:memberLabel.id}),e=>e.status===400);
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:entryIds,categoryId:tagLabel.id}),e=>e.status===400);
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:entryIds,addTagIds:[categoryLabel.id]}),e=>e.status===400);
        });
        await check('bulk requests containing an inaccessible transaction roll back entirely',async()=>{
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:[entryIds[0],disputedEntry.id],categoryId:null}),e=>e.status===404);
            assert.equal((await archivesService.search(labelOwner.id,{})).entries.find(row=>row.id===entryIds[0]).category,'Requisitions');
        });
        await check('repeated tag assignment is idempotent and archived tags can be removed',async()=>{
            await labelsService.assign(labelOwner.id,{transactionIds:entryIds,addTagIds:[tagLabel.id]});
            assert.equal((await archivesService.search(labelOwner.id,{})).entries[0].tags.length,1);
            await labelsService.archive(labelOwner.id,'tag',tagLabel.id);
            await labelsService.assign(labelOwner.id,{transactionIds:entryIds,categoryId:null,removeTagIds:[tagLabel.id]});
            const rows=(await archivesService.search(labelOwner.id,{})).entries;assert.equal(rows[0].category,'Original');assert.deepEqual(rows[0].tags,[]);
        });
        await check('new transaction custom category assignment commits with its balance update',async()=>{
            adapter.account_users=db.account_users;adapter.accounts=db.accounts;adapter.transactions=db.transactions;
            let httpStatus=200;const response={status(value){httpStatus=value;return this;},json(value){this.body=value;return this;}};
            await require('../../src/controllers/transactions.controller').createTransaction({user:{user:{id:labelOwner.id}},body:{transactionAmount:'-2.00',accountId:labeledVault.id,description:'Custom categorized new entry',category:'Ignored client name',categoryId:categoryLabel.id}},response);
            assert.equal(httpStatus,201);assert.equal(await balance(labeledVault.id),'98.00');
            const report=await archivesService.search(labelOwner.id,{categoryId:String(categoryLabel.id)});assert.equal(report.entries[0].description,'Custom categorized new entry');assert.equal(report.categories[0].spending,'2.00');
            await require('../../src/controllers/transactions.controller').createTransaction({user:{user:{id:labelOwner.id}},body:{transactionAmount:'-2.00',accountId:labeledVault.id,description:'Foreign category attempt',category:'Bad',categoryId:memberLabel.id}},response);
            assert.equal(httpStatus,400);assert.equal(await balance(labeledVault.id),'98.00');
        });
        await check('revoked vault access blocks new label assignments',async()=>{
            await db.account_users.updateMany({where:{user_id:labelOwner.id,account_id:labeledVault.id},data:{archived:true}});
            await assert.rejects(labelsService.assign(labelOwner.id,{transactionIds:entryIds,categoryId:categoryLabel.id}),e=>e.status===404);
        });
        console.log(passed + ' PostgreSQL checks passed. Application records were untouched.');
    } finally {
        if (db) await db.$disconnect();
        if (created) {
            assert.match(schema, /^transfer_test_[0-9]+_[0-9a-f]+$/);
            await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
        }
        await admin.end();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

