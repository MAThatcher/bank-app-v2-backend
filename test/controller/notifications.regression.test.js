const express = require('express');
const request = require('supertest');
const prisma = require('../../src/prisma/client');
jest.mock('../../src/services/AuthService', () => ({ authenticateToken(req, res, next) {
    const user = req.get('x-test-user');
    if (!user) return res.status(401).json({ error: 'Sign in' });
    req.user = { user: { id: Number(user) } }; next();
} }));
const app = express();
app.use(express.json());
app.use('/api/notification', require('../../src/views/notifications.routes'));
const call = (method, path = '') => request(app)[method]('/api/notification' + path).set('x-test-user', '7');
afterEach(() => jest.restoreAllMocks());

test('unread route reaches the list handler, scoped to its recipient and newest first', async () => {
    const find = jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([{ id: 10 }]);
    const result = await call('get', '/unread');
    expect(result.status).toBe(200);
    expect(result.body).toEqual([{ id: 10 }]);
    expect(find.mock.calls[0][0]).toMatchObject({ where: { user_id: 7, OR: [{ dismissed: false }, { dismissed: null }] }, orderBy: { id: 'desc' }, take: 50 });
});
test('empty inbox returns an empty list', async () => {
    jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([]);
    expect((await call('get')).body).toEqual([]);
});
test('unread badge uses a database count, independent of page size', async () => {
    const count = jest.spyOn(prisma.notifications, 'count').mockResolvedValue(123);
    const result = await call('get', '/unread/count');
    expect(result.status).toBe(200); expect(result.body).toEqual({ count: 123 });
    expect(count.mock.calls[0][0].where.user_id).toBe(7);
});
test('pagination, unread and type filters remain recipient scoped', async () => {
    const find = jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([]);
    await call('get', '?before=80&limit=30&unread=true&type=transfer');
    expect(find.mock.calls[0][0]).toMatchObject({ where: { user_id: 7, id: { lt: 80 }, type: 'transfer', OR: [{ dismissed: false }, { dismissed: null }] }, take: 30 });
});
test('type endpoint is reachable', async () => {
    const find = jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([]);
    expect((await call('get', '/type/membership')).status).toBe(200);
    expect(find.mock.calls[0][0].where).toMatchObject({ user_id: 7, type: 'membership' });
});
test.each(['/garbage', '/0', '/-1', '/999999999999999999999', '?limit=101', '?before=-1', '?type[x]=transfer', '?unread=maybe'])('invalid input %s is rejected', async path => {
    expect((await call('get', path)).status).toBe(400);
});
test('another user cannot read a notification', async () => {
    const find = jest.spyOn(prisma.notifications, 'findFirst').mockResolvedValue(null);
    expect((await call('get', '/19')).status).toBe(404);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 7, id: 19 } }));
});
test('a zero-row dismissal is a 404 rather than a false success', async () => {
    const update = jest.spyOn(prisma.notifications, 'updateMany').mockResolvedValue({ count: 0 });
    expect((await call('patch', '/19')).status).toBe(404);
    expect(update.mock.calls[0][0].where).toEqual({ user_id: 7, id: 19 });
});
test('dismissing an owned notification succeeds, including repeated requests', async () => {
    jest.spyOn(prisma.notifications, 'updateMany').mockResolvedValue({ count: 1 });
    expect((await call('patch', '/19')).body).toEqual([{ id: 19, dismissed: true }]);
    expect((await call('patch', '/19')).status).toBe(200);
});
test('dismiss all ends the response and scopes writes to this user', async () => {
    const update = jest.spyOn(prisma.notifications, 'updateMany').mockResolvedValue({ count: 4 });
    const result = await call('patch');
    expect(result.status).toBe(200); expect(result.body).toEqual({ dismissed: 4 });
    expect(update.mock.calls[0][0].where).toMatchObject({ user_id: 7, OR: [{ dismissed: false }, { dismissed: null }] });
});
test('public creation cannot impersonate a system event or choose another recipient', async () => {
    const create = jest.spyOn(prisma.notifications, 'create').mockResolvedValue({ id: 3 });
    const result = await call('post').send({ message: ' My note ', user_id: 99, type: 'transfer' });
    expect(result.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: { message: 'My note', user_id: 7, type: 'general', dismissed: false } }));
});
test.each(['', '   ', {}, 'a'.repeat(1021)])('invalid messages are rejected', async message => {
    expect((await call('post').send({ message })).status).toBe(400);
});
test('authentication is required', async () => { expect((await request(app).get('/api/notification')).status).toBe(401); });
test('database errors return an actionable response without internal details', async () => {
    jest.spyOn(prisma.notifications, 'findMany').mockRejectedValue(new Error('secret database detail'));
    const result = await call('get');
    expect(result.status).toBe(500); expect(result.text).not.toContain('secret');
});
