
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

