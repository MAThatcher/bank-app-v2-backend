const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const UsersController = require('../controllers/users.controller');

router.delete('/me', authenticateToken, UsersController.deleteUser);
router.get('/me', authenticateToken, UsersController.getUserDetails);
router.post('/login', UsersController.login);
router.post('/', UsersController.register);
router.get('/verify-email/:token', UsersController.verifyEmail);
//TODO
router.post('/logout', authenticateToken, UsersController.logout);
router.post('/me/change-password', authenticateToken, UsersController.changePassword);
// router.get('/me/sessions', authenticateToken, UsersController.getActiveSessions);
// router.delete('/me/sessions/:sessionId', authenticateToken, UsersController.revokeSessionById);
// router.post('/me/2fa/setup', authenticateToken, UsersController.setupTwoFactorAuth);
// router.post('/me/2fa/verify', authenticateToken, UsersController.verifyTwoFactorAuth);
// router.post('/me/2fa/disable', authenticateToken, UsersController.disableTwoFactorAuth);

module.exports = router;
