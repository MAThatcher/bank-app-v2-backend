const TransactionsModel = require('../models/Transactions.model');
const AccountsModel = require('../models/Accounts.model');
const logger = require('../Utilities/logger');
const { Prisma } = require('@prisma/client');

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
            let amount;
            try {
                if (typeof transactionAmount !== 'number' && typeof transactionAmount !== 'string') {
                    throw new Error('Invalid amount type');
                }
                amount = new Prisma.Decimal(transactionAmount);
                if (!amount.isFinite() || amount.isZero() || amount.decimalPlaces() > 2 || amount.abs().gt('99999999999.99')) {
                    throw new Error('Invalid amount');
                }
            } catch {
                return res.status(400).json({ error: 'Amount must be a finite, non-zero number with at most two decimal places, within the supported range' });
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
            await require('../prisma/client').runTransaction(async (tx) => {
                await tx.$queryRaw(Prisma.sql`SELECT id FROM accounts WHERE id = ${Number(accountId)} FOR UPDATE`);
                const currentAccess = await TransactionsModel.checkUserAccountAccess(userId, accountId, tx);
                if (!currentAccess.rows.length) {
                    const error = new Error('Vault access has been removed.');
                    error.status = 404;
                    throw error;
                }
                const updated = await TransactionsModel.applyBalanceChange(amount, accountId, tx);
                if (updated.count !== 1) {
                    const error = new Error('Overdraft not allowed or account is no longer available');
                    error.status = 401;
                    throw error;
                }
                await TransactionsModel.insertTransaction(amount, userId, accountId, description, category, tx);
            });
            return res.status(201).json({ message: 'Transaction Logged successfully' });
        } catch (error) {
            if ([401, 404].includes(error.status)) {
                return res.status(error.status).json({ error: error.message });
            }
            logger.error('createTransaction error: %o', error, { requestId: rid });
            return res.status(500).json({ error: 'Error creating transaction' });
        }
    }
};
