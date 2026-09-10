const prisma = require('../prisma/client');

const wrapRows = (data) => {
    if (!data) return { rows: [] };
    if (Array.isArray(data)) return { rows: data };
    return { rows: [data] };
};

module.exports = {

    // The balance check and increment are one database operation. Concurrent
    // withdrawals cannot both spend the same funds, and credits cannot be lost.
    applyBalanceChange: async (amount, accountId, tx = prisma) => {
        const where = { id: Number(accountId), archived: false };
        if (amount.isNegative()) {
            where.OR = [
                { overdraft: true },
                { balance: { gte: amount.abs() } },
            ];
        }
        return tx.accounts.updateMany({
            where,
            data: { balance: { increment: amount }, update_date: new Date() },
        });
    },

    checkUserAccountAccess: async (userId, accountId, tx = prisma) => {
        const rows = await tx.account_users.findMany({ where: { user_id: Number(userId), account_id: Number(accountId), archived: false, accounts: { archived: false }, users: { archived: false } }, select: { id: true } });
        return wrapRows(rows);
    },

    getTransactionsByAccount: async (accountId) => {
        const rows = await prisma.transactions.findMany({ where: { account_id: Number(accountId), archived: false }, orderBy: { id: 'desc' }, select: { id: true, create_date: true, account_id: true, description: true, user_id: true, amount: true, category: true, transfer_id: true } });
        return wrapRows(rows);
    },

    insertTransaction: async (amount, userId, accountId, description, category, tx = prisma) => {
        const rows = await tx.transactions.create({ data: { amount, user_id: Number(userId), account_id: Number(accountId), description, category } });
        return wrapRows(rows);
    },

    getAccountBalanceAndOverdraft: async (accountId, tx = prisma) => {
        const row = await tx.accounts.findUnique({ where: { id: Number(accountId) }, select: { overdraft: true, balance: true } });
        return wrapRows(row);
    },

    getBalanceForAccount: async (accountId, tx = prisma) => {
        const row = await tx.accounts.findUnique({ where: { id: Number(accountId) }, select: { balance: true } });
        return wrapRows(row);
    },

    updateAccountBalance: async (newBalance, accountId, tx = prisma) => {
        const row = await tx.accounts.update({ where: { id: Number(accountId) }, data: { balance: newBalance } });
        return wrapRows(row);
    },
};
