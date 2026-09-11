const { randomUUID } = require('crypto');
const { Prisma } = require('@prisma/client');
const logger = require('../Utilities/logger');
const { inboxUrl } = require('./NotificationEmailTemplate');
const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;

function createDispatcher({ db, send, now = () => new Date() }) {
    let running = false;
    async function runOnce() {
        if (running) return;
        running = true;
        try {
            // A process may die during its final attempt; do not leave it processing forever.
            await db.notifications.updateMany({
                where: { email_status: 'processing', email_attempts: { gte: MAX_ATTEMPTS }, email_locked_until: { lt: now() } },
                data: { email_status: 'failed', email_lease: null, email_locked_until: null, email_last_error: 'LEASE_EXPIRED' },
            });
            for (let index = 0; index < 10; index++) {
                const lease = randomUUID();
                const at = now();
                const until = new Date(at.getTime() + LEASE_MS);
                // SKIP LOCKED and a persisted lease allow multiple application processes
                // to share the queue without claiming the same notification together.
                // Prisma stores these timestamp-without-zone fields as UTC; raw Date
                // parameters must be converted explicitly when PostgreSQL uses a local zone.
                const rows = await db.$queryRaw(Prisma.sql`
                    UPDATE notifications SET email_status = 'processing', email_attempts = email_attempts + 1,
                        email_lease = ${lease}::uuid, email_locked_until = (${until}::timestamptz AT TIME ZONE 'UTC')
                    WHERE id = (
                        SELECT id FROM notifications
                        WHERE email_attempts < ${MAX_ATTEMPTS}
                        AND ((email_status IN ('pending', 'retry') AND email_next_attempt <= (${at}::timestamptz AT TIME ZONE 'UTC'))
                            OR (email_status = 'processing' AND email_locked_until < (${at}::timestamptz AT TIME ZONE 'UTC')))
                        ORDER BY email_next_attempt, id FOR UPDATE SKIP LOCKED LIMIT 1
                    ) RETURNING id, user_id, type, message, email_attempts
                `);
                const notification = rows[0];
                if (!notification) break;
                const finish = data => db.notifications.updateMany({
                    where: { id: notification.id, email_status: 'processing', email_lease: lease },
                    data: { ...data, email_lease: null, email_locked_until: null },
                });
                try {
                    const user = await db.users.findFirst({
                        where: { id: notification.user_id, archived: false, verified: true }, select: { email: true },
                    });
                    if (!user?.email || !['transfer', 'membership', 'security', 'dispute', 'general'].includes(notification.type)) {
                        await finish({ email_status: 'skipped', email_last_error: 'INELIGIBLE_RECIPIENT' });
                        continue;
                    }
                    const channels = await require('./PreferencesService').channels(notification.user_id, notification.type, db);
                    if (!channels.email) {
                        await finish({ email_status: 'skipped', email_last_error: 'PREFERENCE_DISABLED' });
                        continue;
                    }
                    await send(user.email, notification);
                    await finish({ email_status: 'sent', email_sent_at: now(), email_last_error: null });
                } catch (error) {
                    // Retain only a short error code, never SMTP responses or credentials.
                    const code = /^[A-Z0-9_]{1,40}$/.test(error.code || '') ? error.code : 'DELIVERY_ERROR';
                    const permanent = code === 'ERECIPIENT' || (error.responseCode >= 500 && error.responseCode < 600);
                    const exhausted = notification.email_attempts >= MAX_ATTEMPTS;
                    await finish({
                        email_status: permanent || exhausted ? 'failed' : 'retry', email_last_error: code,
                        email_next_attempt: new Date(now().getTime() + 60000 * (2 ** (notification.email_attempts - 1))),
                    });
                    logger.warn('Notification email delivery deferred or failed', { notificationId: notification.id, code });
                }
            }
        } finally { running = false; }
    }
    return { runOnce };
}
function startNotificationEmailWorker() {
    if (process.env.NODE_ENV === 'test' || process.env.NOTIFICATION_EMAIL_ENABLED === 'false') return () => {};
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error('Missing mail credentials');
        inboxUrl(process.env);
    } catch {
        logger.warn('Notification email worker disabled: configure EMAIL_USER, EMAIL_PASS and CLIENT_URL. Pending mail is retained.');
        return () => {};
    }
    const dispatcher = createDispatcher({ db: require('../prisma/client'), send: require('./NodeMailer').sendNotificationEmail });
    const tick = () => dispatcher.runOnce().catch(error => logger.error('Notification email worker failed', { code: error.code || 'QUEUE_ERROR' }));
    tick();
    const timer = setInterval(tick, 10000);
    timer.unref();
    logger.info('Notification email worker started');
    return () => clearInterval(timer);
}
module.exports = { createDispatcher, startNotificationEmailWorker };
