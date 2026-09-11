const { Prisma } = require('@prisma/client');
const db = require('../prisma/client');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function id(value) { if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) fail(400, 'Invalid reference.'); return Number(value); }
async function requireAdmin(userId, tx = db) {
    const user = await tx.users.findFirst({ where: { id: id(userId), archived: false, verified: true, super_user: true }, select: { id: true } });
    if (!user) fail(403, 'Administrator access is required.');
    return user;
}
function filters(query = {}) {
    if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 100)) fail(400, 'Search must be at most 100 characters.');
    return { q: query.q?.trim() || '', before: query.before ? id(query.before) : null };
}
const page = rows => ({ items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].id : null });
const userFields = { id: true, email: true, archived: true, verified: true, super_user: true, create_date: true, update_date: true };
async function overview(userId) {
    await requireAdmin(userId);
    const [users, pendingUsers, admins, vaults, openDisputes, reviewDisputes, sessions, failedEmail] = await Promise.all([
        db.users.count({ where: { archived: false } }), db.users.count({ where: { archived: false, verified: false } }),
        db.users.count({ where: { archived: false, verified: true, super_user: true } }), db.accounts.count({ where: { archived: false } }),
        db.disputes.count({ where: { status: 'Open' } }), db.disputes.count({ where: { status: 'UnderReview' } }),
        db.sessions.count({ where: { valid: true, expires_at: { gt: new Date() }, users: { archived: false, verified: true } } }),
        db.notifications.count({ where: { email_status: 'failed' } }),
    ]);
    return { users, pendingUsers, admins, vaults, openDisputes, reviewDisputes, sessions, failedEmail, checkedAt: new Date() };
}
async function users(userId, query = {}) {
    await requireAdmin(userId); const { q, before } = filters(query), where = {};
    if (query.status && !['active', 'pending', 'archived', 'admins'].includes(query.status)) fail(400, 'Invalid user filter.');
    if (query.status === 'archived') where.archived = true;
    if (['active', 'pending', 'admins'].includes(query.status)) { where.archived = false; where.verified = query.status !== 'pending'; }
    if (query.status === 'admins') where.super_user = true;
    if (q) where.OR = [{ email: { contains: q, mode: 'insensitive' } }, ...(/^[1-9]\d*$/.test(q) && Number(q) <= 2147483647 ? [{ id: Number(q) }] : [])];
    if (before) where.id = { lt: before };
    return page(await db.users.findMany({ where, select: userFields, orderBy: { id: 'desc' }, take: 31 }));
}
async function vaults(userId, query = {}) {
    await requireAdmin(userId); const { q, before } = filters(query), where = {};
    if (query.status && !['active', 'archived'].includes(query.status)) fail(400, 'Invalid vault filter.');
    if (query.status) where.archived = query.status === 'archived';
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, ...(/^[1-9]\d*$/.test(q) && Number(q) <= 2147483647 ? [{ id: Number(q) }] : [])];
    if (before) where.id = { lt: before };
    return page(await db.accounts.findMany({ where, select: { id: true, name: true, owner: true, balance: true, archived: true, overdraft: true, type: true, users: { select: { email: true } } }, orderBy: { id: 'desc' }, take: 31 }));
}
async function audit(userId, query = {}) {
    await requireAdmin(userId); const { before } = filters(query);
    return page(await db.audit_logs.findMany({ where: { action: { startsWith: 'ADMIN_' }, ...(before ? { id: { lt: before } } : {}) }, select: { id: true, action: true, user_id: true, details: true, create_date: true }, orderBy: { id: 'desc' }, take: 31 }));
}
async function mutate(userId, targetId, input, action) {
    const actorId = id(userId), target = id(targetId);
    if (typeof input?.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500) fail(400, 'Enter an administrative reason of 5 to 500 characters.');
    if (action === 'role' && (typeof input.super_user !== 'boolean' || typeof input.expectedRole !== 'boolean')) fail(400, 'Specify the current and requested roles.');
    return db.runTransaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(41712, 1)::text`);
        const ids = [...new Set([actorId, target])].sort((a, b) => a - b);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
        await requireAdmin(actorId, tx);
        if (actorId === target) fail(409, 'Use Security Sanctum for your sessions. Another administrator must change your role.');
        const user = await tx.users.findFirst({ where: { id: target, archived: false, verified: true }, select: userFields });
        if (!user) fail(404, 'An active verified user is required.');
        if (action === 'role') {
            if (Boolean(user.super_user) !== input.expectedRole) fail(409, 'This role changed. Refresh the directory before continuing.');
            if (Boolean(user.super_user) === input.super_user) return { message: 'The user already has this role.' };
            await tx.users.update({ where: { id: target }, data: { super_user: input.super_user, update_date: new Date() } });
        }
        const result = await tx.sessions.updateMany({ where: { user_id: target, valid: true }, data: { valid: false, update_date: new Date() } });
        await tx.tokens.updateMany({ where: { user_id: target, valid: true }, data: { valid: false } });
        await tx.audit_logs.create({ data: { user_id: actorId, create_date: new Date(), action: action === 'role' ? 'ADMIN_ROLE_CHANGED' : 'ADMIN_SESSIONS_REVOKED', details: JSON.stringify({ targetUserId: target, reason: input.reason.trim(), ...(action === 'role' ? { previousRole: Boolean(user.super_user), admin: input.super_user } : {}), revokedSessions: result.count }) } });
        return { message: action === 'role' ? 'Role updated. The user must sign in again.' : 'All sessions for this user have been revoked.', revokedSessions: result.count };
    });
}
module.exports = { requireAdmin, overview, users, vaults, audit, role: (user, target, input) => mutate(user, target, input, 'role'), revoke: (user, target, input) => mutate(user, target, input, 'sessions') };
