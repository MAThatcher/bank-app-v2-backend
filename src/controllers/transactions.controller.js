const TransactionsModel = require('../models/Transactions.model');
const AccountsModel = require('../models/Accounts.model');
const logger = require('../Utilities/logger');
const { log } = require('winston');

module.exports = {
    getTransactions: async (req, res) => {
        const rid = req.requestId
        const { accountId } = req.params;
        try {
            const accountExists = await AccountsModel.getAccountById(accountId);
            if (accountExists.rows.length === 0) {
                return res.status(404).json({ error: 'Account not found' });
            }
            const userId = req.user.user.id;
            const validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }
            const result = await TransactionsModel.getTransactionsByAccount(accountId);
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
            if (!transactionAmount || !accountId || !description || !category) {
                return res.status(400).json({ error: 'transactionAmount, accountId, description, and category are required' });
            }
            const userId = req.user.user.id;
            const accountExists = await AccountsModel.getAccountById(accountId);
            if (accountExists.rows.length === 0) {
                console.log('Get account by id: Account does not exist');
                return res.status(404).json({ error: 'Account not found' });
            }
            const validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                console.log('check user account access. No access to account');
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }
            const check = await TransactionsModel.getAccountBalanceAndOverdraft(accountId);
            const overdraft = check.rows[0].overdraft;
            const balance = parseInt(check.rows[0].balance);
            if (!overdraft && balance + parseInt(transactionAmount) < 0) {
                return res.status(401).json({ error: 'Overdraft not allowed on this account. Balance cannot be less than 0' });
            }

            await require('../prisma/client').runTransaction(async (tx) => {
                await TransactionsModel.insertTransaction(transactionAmount, userId, accountId, description, category, tx);
                let newAmount = await TransactionsModel.getBalanceForAccount(accountId, tx);
                newAmount = parseInt(newAmount.rows[0].balance) + parseInt(transactionAmount);
                await TransactionsModel.updateAccountBalance(newAmount, accountId, tx);
            });
            return res.status(201).json({ message: 'Transaction Logged successfully' });
        } catch (error) {
            logger.error('createTransaction error: %o', error, { requestId: rid });
            return res.status(500).json({ error: 'Error creating transaction' });
        }
    }
};
