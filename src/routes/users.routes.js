const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const UsersController = require('../controllers/users.controller');

router.delete('/me', authenticateToken, UsersController.deleteUser);
router.get('/me', authenticateToken, UsersController.getUserDetails);
router.post('/login', UsersController.login);
router.post('/', UsersController.register);
router.get('/verify-email/:token', UsersController.verifyEmail);

module.exports = router;
