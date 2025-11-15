const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const NotificationsController = require('../controllers/notifications.controller');

//Get all notifications for user
router.get('/', authenticateToken, NotificationsController.getNotifications);
//Get specific notification by ID
router.get('/:notificationId', authenticateToken, NotificationsController.getNotification);
//Dismiss specific notification by ID
router.patch('/:notificationId', authenticateToken, NotificationsController.dismissNotification);
//Create a new notification
router.post('/', authenticateToken, NotificationsController.createNotification);

//TODO
//Dismiss all notifications
router.patch('/', authenticateToken, NotificationsController.dismissAllNotifications);
//Get unread notifications count
router.get('/unread/count', authenticateToken, NotificationsController.getUnreadCount);
//Get unread notifications
router.get('/unread', authenticateToken, NotificationsController.getUnreadNotifications);
//Get notifications by type
router.get('/type/:type', authenticateToken, NotificationsController.getNotificationsByType);

module.exports = router;
