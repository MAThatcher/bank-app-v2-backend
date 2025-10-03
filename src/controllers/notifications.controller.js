const NotificationsModel = require('../models/Notifications.model');

module.exports = {
    getNotifications: async (req, res) => {
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getNotificationsForUser(userId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No notifications found' });
            }
            return res.status(200).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    getNotification: async (req, res) => {
        const { notificationId } = req.params;
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getNotificationById(userId, notificationId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No notification found' });
            }
            return res.json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    dismissNotification: async (req, res) => {
        const { notificationId } = req.params;
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.dismissNotification(userId, notificationId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No notification found' });
            }
            return res.status(200).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    createNotification: async (req, res) => {
        try {
            const { message } = req.body;
            let userId = req.user.user.id;
            const result = await NotificationsModel.createNotification(message, userId);
            return res.status(201).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },
    //TODO
    dismissAllNotifications: async (req, res) => {
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.dismissAllNotifications(userId);        
    } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },
    getUnreadCount: async (req, res) => {
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getUnreadCount(userId);
            return res.status(200).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },
    getUnreadNotifications: async (req, res) => {
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getUnreadNotifications(userId);
            return res.status(200).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },
    getNotificationsByType: async (req, res) => {
        const { type } = req.params;
        try {
            let userId = req.user.user.id;
            const result = await NotificationsModel.getNotificationsByType(userId, type);
            return res.status(200).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },
};
