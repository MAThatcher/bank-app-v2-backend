const model = require('../models/Notifications.model');
const logger = require('../Utilities/logger');
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function id(value) {
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) invalid('Invalid notification ID.');
    return Number(value);
}
function options(query = {}) {
    const result = {};
    if (query.before !== undefined) result.before = id(query.before);
    if (query.limit !== undefined) {
        result.limit = id(query.limit);
        if (result.limit > 100) invalid('Limit must be between 1 and 100.');
    }
    if (query.unread !== undefined) {
        if (!['true', 'false'].includes(query.unread)) invalid('Invalid unread filter.');
        result.unread = query.unread === 'true';
    }
    if (query.type !== undefined) {
        if (typeof query.type !== 'string' || !/^[a-z][a-z_-]{0,31}$/.test(query.type)) invalid('Invalid notification type.');
        result.type = query.type;
    }
    return result;
}
const handler = fn => async (req, res) => {
    try {
        const userId = Number(req.user?.user?.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ error: 'Sign in to view notifications.' });
        return await fn(req, res, userId);
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ error: error.message });
        logger.error('Notification request failed', { requestId: req.requestId, error: error.message });
        return res.status(500).json({ error: 'Notifications are unavailable. Please try again.' });
    }
};
module.exports = {
    getNotifications: handler(async (req, res, user) => res.status(200).json((await model.getNotificationsForUser(user, options(req.query))).rows)),
    getNotification: handler(async (req, res, user) => {
        const result = await model.getNotificationById(user, id(req.params.notificationId));
        return result.rows.length ? res.status(200).json(result.rows) : res.status(404).json({ error: 'Notification not found.' });
    }),
    dismissNotification: handler(async (req, res, user) => {
        const result = await model.dismissNotification(user, id(req.params.notificationId));
        return result.rows.length ? res.status(200).json(result.rows) : res.status(404).json({ error: 'Notification not found.' });
    }),
    // This legacy endpoint creates only a general note for the authenticated user.
    // Trusted event types and other recipients are assigned internally.
    createNotification: handler(async (req, res, user) => {
        const message = req.body?.message;
        if (typeof message !== 'string' || !message.trim() || message.trim().length > 1020) invalid('Message must contain 1 to 1020 characters.');
        return res.status(201).json((await model.createNotification(message.trim(), user)).rows);
    }),
    dismissAllNotifications: handler(async (req, res, user) => {
        const result = await model.dismissAllNotifications(user);
        return res.status(200).json({ dismissed: result.rows[0].count });
    }),
    getUnreadCount: handler(async (req, res, user) => res.status(200).json({ count: await model.getUnreadCount(user) })),
    getUnreadNotifications: handler(async (req, res, user) => res.status(200).json((await model.getUnreadNotifications(user, options(req.query))).rows)),
    getNotificationsByType: handler(async (req, res, user) => {
        const filter = options({ ...req.query, type: req.params.type });
        return res.status(200).json((await model.getNotificationsByType(user, filter.type, filter)).rows);
    }),
};
