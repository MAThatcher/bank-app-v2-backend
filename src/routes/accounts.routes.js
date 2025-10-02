const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const AccountsController = require('../controllers/accounts.controller');

router.get('/', authenticateToken, AccountsController.getAccounts);
router.get('/:accountId', authenticateToken, AccountsController.getAccountById);
router.post('/', authenticateToken, AccountsController.createAccount);
router.delete('/', authenticateToken, AccountsController.deleteAccount);
router.post('/addUser', authenticateToken, AccountsController.addUserToAccount);
router.post('/transferOwnership', authenticateToken, AccountsController.transferOwnership);
router.post('/overdraft', authenticateToken, AccountsController.changeOverdraft);

module.exports = router;
