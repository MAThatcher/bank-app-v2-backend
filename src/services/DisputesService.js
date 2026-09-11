const { Prisma } = require('@prisma/client');
const db = require('../prisma/client');
const Notifications = require('../models/Notifications.model');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function id(value) { if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) fail(400, 'Invalid case or transaction reference.'); return Number(value); }
function text(value, name, max, min = 1) { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${name} must contain ${min} to ${max} characters.`); return value.trim(); }
const statuses = ['Open', 'UnderReview', 'Resolved', 'Rejected', 'Withdrawn'];
const active = ['Open', 'UnderReview'];
const select = { id: true, user_id: true, transaction_id: true, status: true, reason: true, details: true, resolution: true, create_date: true, update_date: true };
async function actor(userId, tx = db) {
    const user = await tx.users.findFirst({ where: { id: id(userId), archived: false, verified: true }, select: { id: true, super_user: true } });
    if (!user) fail(401, 'Sign in to manage disputes.');
    return user;
}
async function scoped(userId, query = {}, tx = db) {
    const user = await actor(userId, tx);
    if (query.scope && !['mine', 'review'].includes(query.scope)) fail(400, 'Invalid dispute scope.');
    if (query.scope === 'review' && !user.super_user) fail(403, 'Administrator access is required for case review.');
    return query.scope === 'review' ? {} : { user_id: user.id };
}
async function list(userId, query = {}) {
    const where = await scoped(userId, query);
    if (query.status) { if (!statuses.includes(query.status)) fail(400, 'Invalid case status.'); where.status = query.status; }
    if (query.before) where.id = { lt: id(query.before) };
    const rows = await db.disputes.findMany({ where, select, orderBy: { id: 'desc' }, take: 51 });
    return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
}
async function detail(userId, disputeId) {
    const user = await actor(userId);
    const dispute = await db.disputes.findFirst({ where: { id: id(disputeId), ...(!user.super_user ? { user_id: user.id } : {}) }, select });
    if (!dispute) fail(404, 'Case not found.');
    const events = await db.dispute_events.findMany({ where: { dispute_id: dispute.id }, orderBy: { id: 'asc' }, select: { id: true, actor_id: true, status: true, note: true, created_at: true } });
    const transaction = user.super_user ? await db.transactions.findUnique({ where: { id: dispute.transaction_id }, select: { id: true, account_id: true, description: true, amount: true, category: true, transfer_id: true, create_date: true, archived: true } }) : undefined;
    return { ...dispute, events, ...(transaction ? { transaction } : {}), canReview: Boolean(user.super_user && dispute.user_id !== user.id), canWithdraw: dispute.user_id === user.id && active.includes(dispute.status) };
}
async function create(userId, transactionId, input = {}) {
    const transaction = id(transactionId), reason = text(input.reason, 'Reason', 1020, 5), details = input.details == null || input.details === '' ? null : text(input.details, 'Details', 2048);
    return db.runTransaction(async tx => {
        const user = await actor(userId, tx);
        const entry = await tx.transactions.findFirst({ where: { id: transaction, archived: false }, select: { account_id: true } });
        if (!entry) fail(404, 'Transaction unavailable.');
        // Share the vault lock used by membership revocation and ledger changes.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM accounts WHERE id = ${entry.account_id} FOR UPDATE`);
        const available = await tx.transactions.findFirst({ where: { id: transaction, archived: false, accounts: { archived: false, account_users: { some: { user_id: user.id, archived: false } } } }, select: { id: true } });
        if (!available) fail(404, 'Transaction unavailable.');
        const existing = await tx.disputes.findFirst({ where: { user_id: user.id, transaction_id: transaction, status: { in: active } }, select });
        if (existing) {
            if (existing.reason === reason && existing.details === details) return existing;
            fail(409, `You already have an active case for this transaction: #${existing.id}.`);
        }
        const row = await tx.disputes.create({ data: { user_id: user.id, transaction_id: transaction, reason, details, status: 'Open' }, select });
        await tx.dispute_events.create({ data: { dispute_id: row.id, actor_id: user.id, status: 'Open', note: reason } });
        await Notifications.createNotification(`Dispute #${row.id} for transaction #${transaction} has been submitted. Follow its progress in Disputes.`, user.id, tx, 'dispute');
        return row;
    });
}
async function update(userId, disputeId, input = {}) {
    const caseId = id(disputeId);
    if (!statuses.includes(input.expectedStatus) || !['UnderReview', 'Resolved', 'Rejected', 'Withdrawn'].includes(input.status)) fail(400, 'Choose a valid case transition.');
    const note = text(input.note, 'Decision or withdrawal note', 2048, 5);
    return db.runTransaction(async tx => {
        const user = await actor(userId, tx);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM disputes WHERE id = ${caseId} FOR UPDATE`);
        const row = await tx.disputes.findFirst({ where: { id: caseId }, select });
        if (!row || (!user.super_user && row.user_id !== user.id)) fail(404, 'Case not found.');
        if (input.status === 'Withdrawn') {
            if (row.user_id !== user.id) fail(403, 'Only the reporter can withdraw this case.');
        } else if (!user.super_user || row.user_id === user.id) fail(403, 'An independent administrator must review this case.');
        if (row.status !== input.expectedStatus) fail(409, 'This case changed. Refresh it before submitting a decision.');
        if (!active.includes(row.status) || (input.status === 'UnderReview' && row.status !== 'Open')) fail(409, 'This case transition is no longer available.');
        const result = await tx.disputes.update({ where: { id: caseId }, data: { status: input.status, update_date: new Date(), ...(['Resolved', 'Rejected'].includes(input.status) ? { resolution: note } : {}) }, select });
        await tx.dispute_events.create({ data: { dispute_id: caseId, actor_id: user.id, status: input.status, note } });
        if (input.status !== 'Withdrawn') await tx.audit_logs.create({ data: { user_id: user.id, create_date: new Date(), action: 'ADMIN_DISPUTE_UPDATED', details: JSON.stringify({ caseId, status: input.status }) } });
        await Notifications.createNotification(`Dispute #${caseId} is now ${input.status === 'UnderReview' ? 'under review' : input.status.toLowerCase()}. View the case for the decision and history.`, row.user_id, tx, 'dispute');
        return result;
    });
}
module.exports = { list, detail, create, update };
