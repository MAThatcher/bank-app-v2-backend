const db = require('../../src/prisma/client');
const admin = require('../../src/services/AdminService');
let tx;
beforeEach(() => {
    jest.spyOn(db.users, 'findFirst').mockResolvedValue({ id: 7 });
    jest.spyOn(db.users, 'findMany').mockResolvedValue([]);
    tx = { $queryRaw: jest.fn().mockResolvedValue([]), users: { findFirst: jest.fn().mockResolvedValueOnce({ id: 7 }).mockResolvedValue({ id: 8, super_user: false }), update: jest.fn().mockResolvedValue({}) }, sessions: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) }, tokens: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) }, audit_logs: { create: jest.fn().mockResolvedValue({}) } };
    jest.spyOn(db, 'runTransaction').mockImplementation(cb => cb(tx));
});
afterEach(() => jest.restoreAllMocks());
test('admin authority is fetched from current verified active database state', async () => { await admin.requireAdmin(7); expect(db.users.findFirst.mock.calls[0][0].where).toEqual({ id: 7, archived: false, verified: true, super_user: true }); });
test.each(['overview', 'users', 'vaults', 'audit'])('nonadmins cannot read %s', async method => { db.users.findFirst.mockResolvedValue(null); await expect(admin[method](7)).rejects.toMatchObject({ status: 403 }); });
test('user directory selects public administrative fields only', async () => { await admin.users(7, { q: 'person', status: 'pending' }); const query = db.users.findMany.mock.calls[0][0]; expect(query.select).not.toHaveProperty('password'); expect(query.select).not.toHaveProperty('tokens'); expect(query.where).toMatchObject({ archived: false, verified: false }); expect(query.take).toBe(31); });
test.each([{ q: {} }, { q: 'a'.repeat(101) }, { status: 'unknown' }, { before: '-1' }])('invalid directory filters fail: %p', async query => { await expect(admin.users(7, query)).rejects.toMatchObject({ status: 400 }); });
test('self role changes cannot remove the last administrator', async () => { await expect(admin.role(7, 7, { reason: 'Remove myself', super_user: false, expectedRole: true })).rejects.toMatchObject({ status: 409 }); expect(tx.users.update).not.toHaveBeenCalled(); });
test('demoted actors fail the transaction permission check', async () => { tx.users.findFirst.mockReset().mockResolvedValue(null); await expect(admin.role(7, 8, { reason: 'Grant admin', super_user: true, expectedRole: false })).rejects.toMatchObject({ status: 403 }); expect(tx.users.update).not.toHaveBeenCalled(); });
test('role changes invalidate sessions and tokens and record the reason', async () => { await admin.role(7, 8, { reason: ' Support coverage ', super_user: true, expectedRole: false }); expect(tx.users.update.mock.calls[0][0].data.super_user).toBe(true); expect(tx.sessions.updateMany.mock.calls[0][0].where).toEqual({ user_id: 8, valid: true }); expect(tx.tokens.updateMany).toHaveBeenCalled(); const audit = tx.audit_logs.create.mock.calls[0][0].data; expect(audit.action).toBe('ADMIN_ROLE_CHANGED'); expect(JSON.parse(audit.details)).toMatchObject({ targetUserId: 8, reason: 'Support coverage', admin: true }); });
test('stale role reviews cannot overwrite newer roles', async () => { await expect(admin.role(7, 8, { reason: 'Remove admin', super_user: false, expectedRole: true })).rejects.toMatchObject({ status: 409 }); expect(tx.users.update).not.toHaveBeenCalled(); });
test('session revocation preserves roles and is audited', async () => { await admin.revoke(7, 8, { reason: 'Reported lost device' }); expect(tx.users.update).not.toHaveBeenCalled(); expect(tx.audit_logs.create.mock.calls[0][0].data.action).toBe('ADMIN_SESSIONS_REVOKED'); });
test.each([{}, { reason: 'bad' }, { reason: 'Valid reason', super_user: 'true', expectedRole: false }])('malformed mutations are rejected: %p', async input => { await expect(admin.role(7, 8, input)).rejects.toMatchObject({ status: 400 }); expect(tx.users.update).not.toHaveBeenCalled(); });
test('administrators cannot bypass role safeguards by deleting their own account', async () => {
    tx.users.findFirst.mockReset().mockResolvedValue({ super_user: true });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await require('../../src/controllers/users.controller').deleteUser({ user: { user: { email: 'admin@example.test' } } }, res);
    expect(res.status).toHaveBeenCalledWith(409); expect(tx.users.update).not.toHaveBeenCalled();
});
