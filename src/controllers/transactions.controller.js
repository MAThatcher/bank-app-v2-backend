const TransactionsModel = require('../models/Transactions.model');
const AccountsModel = require('../models/Accounts.model');
const logger = require('../Utilities/logger');
const { log } = require('winston');

module.exports = {
    getTransactions: async (req, res) => {
        const rid = req.requestId
        const { accountId } = req.params;
        logger.debug('getTransactions start', { accountId }, { requestId: rid });
        try {
            logger.debug('getTransactions validating account: %o', { accountId }, { requestId: rid });
            const accountExists = await AccountsModel.getAccountById(accountId);
            if (accountExists.rows.length === 0) {
                logger.warn('getTransactions Account not found: %o', { accountId }, { requestId: rid });
                return res.status(404).json({ error: 'Account not found' });
            }
            logger.debug('getTransactions Account found, checking user access: %o', { accountId }, { requestId: rid });
            logger.debug('getTransactions checking user access for account: %o', { accountId }, { requestId: rid });
            const userId = req.user.user.id;
            const validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                logger.warn('getTransactions No Authorized Accounts for this User: %o', { userId, accountId }, { requestId: rid });
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }

            logger.debug('getTransactions User authorized, fetching transactions: %o', { userId, accountId }, { requestId: rid });
            const result = await TransactionsModel.getTransactionsByAccount(accountId);
            logger.info('getTransactions Transactions fetched successfully: %o', { userId, accountId }, { requestId: rid });
            return res.status(200).json(result.rows);
        } catch (err) {
            logger.error('getTransactions error: %o', err, { requestId: rid });
            return res.status(500).send('Server Error');
        }
    },

    createTransaction: async (req, res) => {
        const rid = req.requestId
        const { transactionAmount, accountId, description, category } = req.body;
        try {
            logger.debug('createTransaction start', { accountId, transactionAmount }, { requestId: rid });
            if (!transactionAmount || !accountId || !description || !category) {
                logger.warn('createTransaction Missing required fields', { requestId: rid });
                return res.status(400).json({ error: 'transactionAmount, accountId, description, and category are required' });
            }
            const userId = req.user.user.id;
            logger.debug('createTransaction validating account: %o', { accountId }, { requestId: rid });
            const accountExists = await AccountsModel.getAccountById(accountId);
            if (accountExists.rows.length === 0) {
                logger.warn('createTransaction Account not found: %o', { accountId }, { requestId: rid });
                return res.status(404).json({ error: 'Account not found' });
            }
            logger.debug('createTransaction Account found, checking user access: %o', { accountId, userId }, { requestId: rid });
            const validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                logger.warn('createTransaction No Authorized Accounts for this User: %o', { userId, accountId }, { requestId: rid });
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }
            logger.debug('createTransaction User authorized, checking overdraft and balance: %o', { userId, accountId }, { requestId: rid });
            const check = await TransactionsModel.getAccountBalanceAndOverdraft(accountId);
            const overdraft = check.rows[0].overdraft;
            const balance = parseInt(check.rows[0].balance);
            if (!overdraft && balance + parseInt(transactionAmount) < 0) {
                logger.warn('createTransaction Overdraft not allowed on this account. Balance cannot be less than 0: %o', { userId, accountId }, { requestId: rid });
                return res.status(401).json({ error: 'Overdraft not allowed on this account. Balance cannot be less than 0' });
            }
            logger.debug('createTransaction Creating transaction and updating balance: %o', { userId, accountId, transactionAmount }, { requestId: rid });

            await require('../prisma/client').runTransaction(async (tx) => {
                logger.debug('createTransaction Inserting transaction into DB: %o', { userId, accountId, transactionAmount }, { requestId: rid });
                await TransactionsModel.insertTransaction(transactionAmount, userId, accountId, description, category, tx);
                logger.debug('createTransaction Fetching new balance for account: %o', { accountId }, { requestId: rid });
                let newAmount = await TransactionsModel.getBalanceForAccount(accountId, tx);
                logger.debug('createTransaction New balance fetched, updating account balance: %o', { accountId, newAmount }, { requestId: rid });
                newAmount = parseInt(newAmount.rows[0].balance) + parseInt(transactionAmount);
                logger.debug('createTransaction Updating account balance to: %o', { accountId, newAmount }, { requestId: rid });
                await TransactionsModel.updateAccountBalance(newAmount, accountId, tx);
                logger.info('createTransaction Transaction created and balance updated successfully: %o', { userId, accountId, transactionAmount }, { requestId: rid });
            });
            return res.status(201).json({ message: 'Transaction Logged successfully' });
        } catch (error) {
            logger.error('createTransaction error: %o', error, { requestId: rid });
            return res.status(500).json({ error: 'Error creating transaction' });
        }
    }
};
