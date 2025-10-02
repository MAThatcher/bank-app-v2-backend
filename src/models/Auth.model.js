const pool = require('../config/db');

module.exports = {
    findRefreshToken: (refreshToken) =>
        pool.query("select valid from tokens where value = $1 and valid = true and type = 'RefreshToken';", [refreshToken]),

    findUserByEmailVerified: (email) =>
        pool.query("Select * from users where email = $1 and archived = false and verified = true", [email]),

    findUserByIdVerified: (id) =>
        pool.query('select * from users where id = $1 and verified = true and archived = false;', [id]),

    updateUserPassword: (hashedPassword, id) =>
        pool.query('update users set password = $1 where id = $2', [hashedPassword, id]),
};
