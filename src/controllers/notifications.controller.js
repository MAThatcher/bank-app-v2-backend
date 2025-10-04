const { log } = require('winston');
const NotificationsModel = require('../models/Notifications.model');
const logger = require('../Utilities/logger');

module.exports = {
    getNotifications: async (req, res) => {
        const rid = req.requestId
        try {
            logger.debug('getNotifications start', { requestId: rid });
            let userId = req.user.user.id;
            logger.debug('getNotifications fetching notifications for user: %o', { userId }, { requestId: rid });
            const result = await NotificationsModel.getNotificationsForUser(userId);
            if (result.rows.length === 0) {
                logger.warn('getNotifications No notifications found for user: %o', { userId }, { requestId: rid });
                return res.status(404).json({ error: 'No notifications found' });
            }
            logger.info('getNotifications Notifications fetched successfully for user: %o', { userId }, { requestId: rid });
            return res.status(200).json(result.rows);
        } catch (err) {
            logger.error('getNotifications error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    getNotification: async (req, res) => {
        const rid = req.requestId
        const { notificationId } = req.params;
            logger.debug('getNotification start', { requestId: rid });
        try {
            let userId = req.user.user.id;
            logger.debug('getNotification fetching notification %o for user: %o', { notificationId, userId }, { requestId: rid });
            const result = await NotificationsModel.getNotificationById(userId, notificationId);
                logger.debug('getNotification Notification fetched successfully: %o', { notificationId, userId }, { requestId: rid });
            if (result.rows.length === 0) {
                    logger.warn('getNotification No notification found: %o', { notificationId, userId }, { requestId: rid });
                return res.status(404).json({ error: 'No notification found' });
            }
            logger.info('getNotification Notification fetched successfully: %o', { notificationId, userId }, { requestId: rid });
            return res.json(result.rows);
        } catch (err) {
            logger.error('getNotification error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    dismissNotification: async (req, res) => {
        const rid = req.requestId
        const { notificationId } = req.params;
            logger.debug('dismissNotification start', { requestId: rid });
        try {
            let userId = req.user.user.id;
            logger.debug('dismissNotification dismissing notification %o for user: %o', { notificationId, userId }, { requestId: rid });
            const result = await NotificationsModel.dismissNotification(userId, notificationId);
            logger.debug('dismissNotification Notification dismissed successfully: %o', { notificationId, userId }, { requestId: rid });
            if (result.rows.length === 0) {
                    logger.warn('dismissNotification No notification found to dismiss: %o', { notificationId, userId }, { requestId: rid });
                return res.status(404).json({ error: 'No notification found' });
            }
            logger.info('dismissNotification Notification dismissed successfully: %o', { notificationId, userId }, { requestId: rid });
            return res.status(200).json(result.rows);
        } catch (err) {
            logger.error('dismissNotification error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    createNotification: async (req, res) => {
        const rid = req.requestId
        try {
            logger.debug('createNotification start', { requestId: rid });
            const { message } = req.body;
            let userId = req.user.user.id;
            logger.debug('createNotification creating notification for user: %o', { userId }, { requestId: rid });
            if (!message) {
                logger.warn('createNotification No message provided', { requestId: rid });
                return res.status(400).json({ error: 'Message is required' });
            }
            logger.debug('createNotification Inserting notification into DB: %o', { userId, message }, { requestId: rid });
            const result = await NotificationsModel.createNotification(message, userId);
            logger.info('createNotification Notification created successfully: %o', { userId }, { requestId: rid });
            return res.status(201).json(result.rows);
        } catch (err) {
            logger.error('createNotification error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },
    //TODO
    dismissAllNotifications: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    },
    getUnreadCount: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    },
    getUnreadNotifications: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    },
    getNotificationsByType: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    },
};
