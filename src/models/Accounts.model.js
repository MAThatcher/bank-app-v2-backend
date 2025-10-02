const pool = require('../config/db');

module.exports = {
    begin: () => pool.query('BEGIN'),
    commit: () => pool.query('COMMIT'),
    rollback: () => pool.query('ROLLBACK'),

    getAccountsForUser: (email) =>
        pool.query(
            `select a.id, a.name,a.balance from users u join account_users au on au.user_id = u.id join accounts a on a.id = au.account_id where u.email = $1 and a.archived = false;`,
            [email]
        ),

    getAccountUsersByAccountId: (accountId) =>
        pool.query('select * from account_users where account_id = $1 and archived = false', [accountId]),

    getAccountById: (accountId) => pool.query('select * from accounts where id = $1', [accountId]),

    insertAccount: (accountName, ownerId) =>
        pool.query('insert into accounts (name,owner) values ($1,$2) returning id;', [accountName, ownerId]),

    insertAccountUser: (accountId, userId) =>
        pool.query('INSERT INTO account_users (account_id, user_id) VALUES ($1, $2);', [accountId, userId]),

    getAccountOwnerAndBalance: (userId, accountId) =>
        pool.query('select a.balance,a.owner from accounts a where a.owner = $1 and a.id = $2;', [userId, accountId]),

    archiveAccountUsers: (accountId) =>
        pool.query('update account_users set archived = true, update_date = current_timestamp where account_id = $1', [accountId]),

    archiveAccount: (accountId) =>
        pool.query('update accounts set archived = true, update_date = current_timestamp where id = $1', [accountId]),

    archiveTransactionsByAccount: (accountId) =>
        pool.query('update transactions set archived = true, update_date = current_timestamp where account_id = $1', [accountId]),

    getAccountByOwnerAndId: (userId, accountId) =>
        pool.query('select * from accounts where owner = $1 and archived = false and id = $2', [userId, accountId]),

    findUserByEmail: (email) => pool.query('Select * from users where email = $1 and archived = false', [email]),

    checkUserHasAccess: (accountId, userId) =>
        pool.query('Select * from account_users where account_id = $1 and user_id = $2 and archived = false', [accountId, userId]),

    findAccountUserIdByEmail: (accountId, email) =>
        pool.query('Select u.id from account_users au join users u on u.id = au.user_id where au.account_id = $1 and u.email = $2 and u.archived = false', [accountId, email]),

    updateOwner: (newOwnerId, accountId) =>
        pool.query('update accounts set owner = $1 where id = $2;', [newOwnerId, accountId]),

    updateOverdraft: (overdraft, accountId) =>
        pool.query('update accounts set overdraft = $1 where id = $2;', [overdraft, accountId]),
};
