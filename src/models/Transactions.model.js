const pool = require('../config/db');

module.exports = {
    begin: () => pool.query('BEGIN'),
    commit: () => pool.query('COMMIT'),
    rollback: () => pool.query('ROLLBACK'),

    checkUserAccountAccess: (userId, accountId) =>
        pool.query('select id from account_users where user_id = $1 and account_id = $2 and archived = false', [userId, accountId]),

    getTransactionsByAccount: (accountId) =>
        pool.query('select id,create_date,account_id,description,user_id,amount from transactions where account_id = $1 and archived = false order by id desc', [accountId]),

    insertTransaction: (amount, userId, accountId, description) =>
        pool.query('insert into transactions (amount,user_id,account_id,description) values ($1, $2, $3, $4);', [amount, userId, accountId, description]),

    getAccountBalanceAndOverdraft: (accountId) =>
        pool.query('select overdraft, balance from accounts where id = $1', [accountId]),

    getBalanceForAccount: (accountId) =>
        pool.query('Select balance from accounts where id = $1', [accountId]),

    updateAccountBalance: (newBalance, accountId) =>
        pool.query('update accounts set balance = $1 where id = $2;', [newBalance, accountId]),
};
