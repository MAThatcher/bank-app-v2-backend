const { randomUUID } = require('crypto');
const { Prisma } = require('@prisma/client');
const db = require('../prisma/client');
const Admin = require('./AdminService');
function fail(status, message, code = 'IMPERSONATION_INVALID') { const error = new Error(message); Object.assign(error, { status, code }); throw error; }
function uuid(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(403, 'Impersonation is unavailable. Return to your admin account.'); return value; }
async function start(adminId, sessionId, targetId, input = {}) {
    if (!/^[1-9]\d*$/.test(String(targetId)) || Number(targetId) > 2147483647) fail(400, 'Choose a valid user.');
    if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500) fail(400, 'Enter a support reason of 5 to 500 characters.');
    const target = Number(targetId);
    return db.runTransaction(async tx => {
        const ids = [...new Set([adminId, target])].sort((a, b) => a - b);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
        await Admin.requireAdmin(adminId, tx);
        const parent = await tx.sessions.findFirst({ where: { id: sessionId, user_id: adminId, valid: true, expires_at: { gt: new Date() } } });
        if (!parent) fail(401, 'Your admin session has ended.', 'SESSION_INVALID');
        const user = await tx.users.findFirst({ where: { id: target, archived: false, verified: true, super_user: false }, select: { id: true, email: true, super_user: true } });
        if (!user || target === adminId) fail(400, 'Choose another active verified member. Administrators cannot be impersonated.');
        const expiresAt = new Date(Math.min(Date.now() + 15 * 60000, parent.expires_at.getTime()));
        const record = await tx.impersonations.create({ data: { id: randomUUID(), admin_id: adminId, target_id: target, session_id: sessionId, reason: input.reason.trim(), expires_at: expiresAt, read_only: true } });
        await tx.audit_logs.create({ data: { user_id: adminId, action: 'ADMIN_IMPERSONATION_STARTED', create_date: new Date(), details: JSON.stringify({ targetUserId: target, impersonationId: record.id, reason: record.reason, readOnly: record.read_only, expiresAt }) } });
        return { id: record.id, user, readOnly: record.read_only, expiresAt };
    });
}
async function resolve(identity, contextId) {
    const context = await db.impersonations.findFirst({ where: { id: uuid(contextId), admin_id: identity.user.id, session_id: identity.sid, active: true, expires_at: { gt: new Date() } } });
    if (!context || !identity.user.super_user) fail(403, 'Impersonation has expired or been revoked. Return to your admin account.');
    const user = await db.users.findFirst({ where: { id: context.target_id, archived: false, verified: true, super_user: false }, select: { id: true, email: true, super_user: true } });
    if (!user) fail(403, 'This user is no longer available for impersonation. Return to your admin account.');
    return { user, context };
}
async function stop(adminId, sessionId, contextId) {
    return db.runTransaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM impersonations WHERE id = ${uuid(contextId)}::uuid FOR UPDATE`);
        const context = await tx.impersonations.findFirst({ where: { id: contextId, admin_id: adminId, session_id: sessionId } });
        if (!context) fail(404, 'Impersonation context not found.');
        if (context.active) {
            await tx.impersonations.update({ where: { id: context.id }, data: { active: false, ended_at: new Date() } });
            await tx.audit_logs.create({ data: { user_id: adminId, action: 'ADMIN_IMPERSONATION_ENDED', create_date: new Date(), details: JSON.stringify({ targetUserId: context.target_id, impersonationId: context.id }) } });
        }
        return { message: 'Returned to your admin account.' };
    });
}
module.exports = { start, resolve, stop };
