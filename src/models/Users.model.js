const pool = require('../config/db');

module.exports = {
    begin: () => pool.query('BEGIN'),
    commit: () => pool.query('COMMIT'),
    rollback: () => pool.query('ROLLBACK'),

    softDeleteUserByEmail: (email) =>
        pool.query(
            "UPDATE users SET email = NULL,archived = true,archived_email = $1,super_user = false, password = 'DELETED', update_date = current_timestamp where email = $2;",
            [email, email]
        ),

    getUserDetailsByEmail: (email) =>
        pool.query(
            'SELECT id,email,create_date,update_date,super_user FROM users WHERE email = $1 and archived = false;',
            [email]
        ),

    findUserByEmailVerified: (email) =>
        pool.query(
            'SELECT id, email, password, super_user FROM users WHERE email = $1 and verified = true;',
            [email]
        ),

    findUserByEmail: (email) =>
        pool.query('SELECT * FROM users WHERE email = $1;', [email]),

    insertUser: (email, hashedPassword) =>
        pool.query('INSERT INTO users (email, password ) VALUES ($1, $2) returning id;', [email, hashedPassword]),

    insertUserDetails: (userId) =>
        pool.query('insert into user_details (user_id) values ($1)', [userId]),

    setVerifiedByEmail: (email) =>
        pool.query('update users set verified = true where email = $1;', [email]),
};

