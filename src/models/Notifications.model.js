const pool = require('../config/db');

module.exports = {
    getNotificationsForUser: (userId) => pool.query('select * from notifications where user_id = $1 order by create_date', [userId]),
    getNotificationById: (userId, notificationId) => pool.query('select * from notifications where user_id = $1 and id = $2', [userId, notificationId]),
    dismissNotification: (userId, notificationId) => pool.query('update notifications set dismissed = true, update_date = current_timestamp where user_id = $1 and id = $2', [userId, notificationId]),
    createNotification: (message, userId) => pool.query('insert into notifications (message,user_id) values ($1,$2)', [message, userId])
};
