const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const NotificationsController = require('../controllers/notifications.controller');

router.get('/', authenticateToken, NotificationsController.getNotifications);
router.get('/:notificationId', authenticateToken, NotificationsController.getNotification);
router.patch('/:notificationId', authenticateToken, NotificationsController.dismissNotification);
router.post('/', authenticateToken, NotificationsController.createNotification);
//TODO
router.patch('/', authenticateToken, NotificationsController.dismissAllNotifications); //TODO
router.get('/unread/count', authenticateToken, NotificationsController.getUnreadCount); //TODO
router.get('/unread', authenticateToken, NotificationsController.getUnreadNotifications); //TODO
router.get('/type/:type', authenticateToken, NotificationsController.getNotificationsByType); //TODO

module.exports = router;
