const { createDispatcher, startNotificationEmailWorker } = require('../../src/services/NotificationEmailWorker');
const { notificationMail } = require('../../src/services/NotificationEmailTemplate');
let db, send, dispatcher;
const at = new Date('2026-09-10T12:00:00Z');
const item = { id: 19, user_id: 7, type: 'transfer', message: 'Transfer completed.', email_attempts: 1 };
beforeEach(() => {
    db = { $queryRaw: jest.fn().mockResolvedValueOnce([item]).mockResolvedValue([]),
        user_preferences: { findUnique: jest.fn().mockResolvedValue(null) }, notifications: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        users: { findFirst: jest.fn().mockResolvedValue({ email: 'recipient@example.test' }) } };
    send = jest.fn().mockResolvedValue({ accepted: ['recipient@example.test'] });
    dispatcher = createDispatcher({ db, send, now: () => at });
});
function lastWrite() { return db.notifications.updateMany.mock.calls.at(-1)[0]; }
test('sends only to the active verified recipient and records successful delivery', async () => {
    await dispatcher.runOnce();
    expect(db.users.findFirst).toHaveBeenCalledWith({ where: { id: 7, archived: false, verified: true }, select: { email: true } });
    expect(send).toHaveBeenCalledWith('recipient@example.test', item);
    expect(lastWrite()).toMatchObject({ where: { id: 19, email_status: 'processing', email_lease: expect.any(String) }, data: { email_status: 'sent', email_sent_at: at, email_lease: null } });
});
test('temporary SMTP errors schedule a retry without throwing to the caller', async () => {
    send.mockRejectedValue({ code: 'ETIMEDOUT', message: 'credentials should never be stored' });
    await dispatcher.runOnce();
    expect(lastWrite().data).toMatchObject({ email_status: 'retry', email_last_error: 'ETIMEDOUT', email_next_attempt: new Date(at.getTime() + 60000) });
    expect(JSON.stringify(lastWrite())).not.toContain('credentials');
});
test('fifth unsuccessful attempt stops retrying', async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([{ ...item, email_attempts: 5 }]).mockResolvedValue([]);
    send.mockRejectedValue({ code: 'ECONNECTION' });
    await dispatcher.runOnce();
    expect(lastWrite().data.email_status).toBe('failed');
});
test('SMTP permanent rejection does not keep retrying', async () => {
    send.mockRejectedValue({ code: 'EENVELOPE', responseCode: 550 });
    await dispatcher.runOnce(); expect(lastWrite().data.email_status).toBe('failed');
});
test.each([null, { email: null }])('ineligible recipients are skipped', async user => {
    db.users.findFirst.mockResolvedValue(user);
    await dispatcher.runOnce(); expect(send).not.toHaveBeenCalled(); expect(lastWrite().data.email_status).toBe('skipped');
});
test('general notes cannot impersonate automatic email alerts', async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([{ ...item, type: 'general' }]).mockResolvedValue([]);
    await dispatcher.runOnce(); expect(send).not.toHaveBeenCalled(); expect(lastWrite().data.email_status).toBe('skipped');
});
test('overlapping ticks do not process a batch concurrently in one worker', async () => {
    let release;
    send.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = dispatcher.runOnce();
    while (!release) await Promise.resolve();
    await dispatcher.runOnce(); expect(send).toHaveBeenCalledTimes(1);
    release(); await pending;
});
test('database errors release the local running guard so a later tick can recover', async () => {
    db.$queryRaw.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    await expect(dispatcher.runOnce()).rejects.toThrow('offline');
    await dispatcher.runOnce();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
});
test('abandoned final attempts are marked failed before claiming more work', async () => {
    await dispatcher.runOnce();
    expect(db.notifications.updateMany.mock.calls[0][0]).toMatchObject({ where: { email_status: 'processing', email_attempts: { gte: 5 }, email_locked_until: { lt: at } }, data: { email_status: 'failed' } });
});
test('email templates escape content and include plain text and a stable message ID', () => {
    const mail = notificationMail('recipient@example.test', { ...item, message: '<script>alert("x")</script> & vault' }, { EMAIL_USER: 'sender@example.test', CLIENT_URL: 'https://bank.example.test/' });
    expect(mail.html).not.toContain('<script>'); expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('<script>');
    expect(mail.html).toContain('https://bank.example.test/notifications');
    expect(mail.to).toEqual({ address: 'recipient@example.test' });
    expect(mail.messageId).toBe('<notification-19@imperial-bank.local>');
});
test.each(['javascript:alert(1)', 'ftp://example.test', 'https://user:password@example.test'])('invalid app URL %s is rejected', url => {
    expect(() => notificationMail('a@example.test', item, { CLIENT_URL: url })).toThrow();
});
test('worker startup is disabled in unit tests', () => { expect(typeof startNotificationEmailWorker()).toBe('function'); });
test('a recently disabled channel skips queued mail', async () => {
    db.user_preferences.findUnique.mockResolvedValue({ notifications: { transfer: { email: false, inApp: true } } });
    await dispatcher.runOnce(); expect(send).not.toHaveBeenCalled(); expect(lastWrite().data).toMatchObject({ email_status: 'skipped', email_last_error: 'PREFERENCE_DISABLED' });
});
