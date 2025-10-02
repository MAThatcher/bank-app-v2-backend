const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const NotificationsController = require('../controllers/notifications.controller');

router.get('/', authenticateToken, NotificationsController.getNotifications);
router.get('/:notificationId', authenticateToken, NotificationsController.getNotification);
router.patch('/:notificationId', authenticateToken, NotificationsController.dismissNotification);
router.post('/', authenticateToken, NotificationsController.createNotification);

module.exports = router;
