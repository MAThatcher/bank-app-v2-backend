const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const TransactionsController = require('../controllers/transactions.controller');

router.get('/:accountId', authenticateToken, TransactionsController.getTransactions);
router.post('/', authenticateToken, TransactionsController.createTransaction);

module.exports = router;
