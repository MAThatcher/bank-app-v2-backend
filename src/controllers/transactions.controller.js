const TransactionsModel = require('../models/Transactions.model');
const AccountsModel = require('../models/Accounts.model');

module.exports = {
    getTransactions: async (req, res) => {
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
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    createTransaction: async (req, res) => {
        const { transactionAmount, accountId, description } = req.body;
        try {
            const userId = req.user.user.id;

            const validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }

            const check = await TransactionsModel.getAccountBalanceAndOverdraft(accountId);
            const overdraft = check.rows[0].overdraft;
            const balance = parseInt(check.rows[0].balance);
            if (!overdraft && balance + parseInt(transactionAmount) < 0) {
                return res.status(401).json({ error: 'Overdraft not allowed on this account. Balance cannot be less than 0' });
            }

            await require('../prisma/client').runTransaction(async (tx) => {
                await TransactionsModel.insertTransaction(transactionAmount, userId, accountId, description, tx);
                let newAmount = await TransactionsModel.getBalanceForAccount(accountId, tx);
                newAmount = parseInt(newAmount.rows[0].balance) + parseInt(transactionAmount);
                await TransactionsModel.updateAccountBalance(newAmount, accountId, tx);
            });
            return res.status(201).json({ message: 'Transaction Logged successfully' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error creating transaction' });
        }
    }
};
