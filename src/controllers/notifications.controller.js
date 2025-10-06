const { log } = require('winston');
const NotificationsModel = require('../models/Notifications.model');
const logger = require('../Utilities/logger');

module.exports = {
    getNotifications: async (req, res) => {
        const rid = req.requestId
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getNotificationsForUser(userId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No notifications found' });
            }
            return res.status(200).json(result.rows);
        } catch (err) {
            logger.error('getNotifications error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    getNotification: async (req, res) => {
        const rid = req.requestId
        const { notificationId } = req.params;
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getNotificationById(userId, notificationId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No notification found' });
            }
            return res.json(result.rows);
        } catch (err) {
            logger.error('getNotification error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    dismissNotification: async (req, res) => {
        const rid = req.requestId
        const { notificationId } = req.params;
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.dismissNotification(userId, notificationId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No notification found' });
            }
            return res.status(200).json(result.rows);
        } catch (err) {
            logger.error('dismissNotification error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    createNotification: async (req, res) => {
        const rid = req.requestId
        try {
            const { message } = req.body;
            let userId = req.user.user.id;
            if (!message) {
                return res.status(400).json({ error: 'Message is required' });
            }
            const result = await NotificationsModel.createNotification(message, userId);
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
