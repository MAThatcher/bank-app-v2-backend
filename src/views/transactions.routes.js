const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const TransactionsController = require('../controllers/transactions.controller');
const Labels = require('../controllers/ledgerLabels.controller');
for (const [path, type] of [['categories','category'],['tags','tag']]) {
    router.get('/' + path, authenticateToken, Labels.list(type));
    router.post('/' + path, authenticateToken, Labels.save(type));
    router.patch('/' + path + '/:labelId', authenticateToken, Labels.save(type));
    router.delete('/' + path + '/:labelId', authenticateToken, Labels.archive(type));
}
router.patch('/bulk/labels', authenticateToken, Labels.assign);
const DisputesController = require('../controllers/disputes.controller');
router.get('/disputes', authenticateToken, DisputesController.list);
router.get('/disputes/:disputeId', authenticateToken, DisputesController.detail);
router.patch('/disputes/:disputeId', authenticateToken, DisputesController.update);
router.post('/dispute/:transactionId', authenticateToken, DisputesController.create);
const TransfersController = require('../controllers/transfers.controller');
const ArchivesController = require('../controllers/ledgerArchives.controller');
router.get('/search', authenticateToken, ArchivesController.search);
router.get('/summary', authenticateToken, ArchivesController.summary);
router.get('/export', authenticateToken, ArchivesController.exportCsv);

router.get('/transfer-accounts', authenticateToken, TransfersController.getTransferAccounts);
router.post('/transfer', authenticateToken, TransfersController.createTransfer);

router.get('/account/:accountId', authenticateToken, TransactionsController.getTransactions);
router.post('/', authenticateToken, TransactionsController.createTransaction);
//TODO
// router.get('/:transactionId', authenticateToken, TransactionsController.getTransactionById);
// router.delete('/:transactionId', authenticateToken, TransactionsController.deleteTransaction);
// router.patch('/:transactionId', authenticateToken, TransactionsController.updateTransaction);
// router.get('/user/:userId', authenticateToken, TransactionsController.getTransactionsByUser);
// router.get('/date-range', authenticateToken, TransactionsController.getTransactionsByDateRange);
// router.get('/recent', authenticateToken, TransactionsController.getRecentTransactions);
// router.get('/monthly-report', authenticateToken, TransactionsController.getMonthlyReport);
// router.get('/yearly-report', authenticateToken, TransactionsController.getYearlyReport);
// router.post('/import', authenticateToken, TransactionsController.importTransactions);
// router.get('/statistics', authenticateToken, TransactionsController.getTransactionStatistics);
// router.get('/tags/:tagId/transactions', authenticateToken, TransactionsController.getTransactionsByTag);
// router.post('/bulk', authenticateToken, TransactionsController.bulkCreateTransactions);
// router.delete('/bulk', authenticateToken, TransactionsController.bulkDeleteTransactions);
// router.patch('/bulk', authenticateToken, TransactionsController.bulkUpdateTransactions);
// router.get('/recurring', authenticateToken, TransactionsController.getRecurringTransactions);
// router.post('/recurring', authenticateToken, TransactionsController.createRecurringTransaction);
// router.delete('/recurring/:recurringId', authenticateToken, TransactionsController.deleteRecurringTransaction);
// router.patch('/recurring/:recurringId', authenticateToken, TransactionsController.updateRecurringTransaction);
// router.get('/recurring/:recurringId', authenticateToken, TransactionsController.getRecurringTransactionById);
// router.post('/recurring/:recurringId/execute', authenticateToken, TransactionsController.executeRecurringTransaction);
// Dispute creation, detail, list and status updates are registered above.
// router.delete('/disputes/:disputeId', authenticateToken, TransactionsController.deleteDispute);
// router.post('/tags/:tagId/assign', authenticateToken, TransactionsController.assignTagToTransaction);
// router.post('/tags/:tagId/remove', authenticateToken, TransactionsController.removeTagFromTransaction);

module.exports = router;
