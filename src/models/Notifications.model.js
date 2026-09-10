const prisma = require('../prisma/client');
const wrapRows = data => ({ rows: data == null ? [] : Array.isArray(data) ? data : [data] });
const unread = { OR: [{ dismissed: false }, { dismissed: null }] };
const publicFields = { id: true, message: true, user_id: true, type: true, dismissed: true, create_date: true, update_date: true };
function list(userId, options = {}, extra = {}) {
    return prisma.notifications.findMany({
        where: { user_id: Number(userId), ...extra,
            ...(options.unread ? unread : {}),
            ...(options.type ? { type: options.type } : {}),
            ...(options.before ? { id: { lt: options.before } } : {}),
        },
        orderBy: { id: 'desc' }, take: options.limit || 50, select: publicFields,
    }).then(wrapRows);
}
module.exports = {
    getNotificationsForUser: (userId, options) => list(userId, options),
    getNotificationById: async (userId, notificationId) => wrapRows(await prisma.notifications.findFirst({
        where: { user_id: Number(userId), id: Number(notificationId) },
        select: publicFields,
    })),
    dismissNotification: async (userId, notificationId) => {
        const result = await prisma.notifications.updateMany({
            where: { user_id: Number(userId), id: Number(notificationId) },
            data: { dismissed: true, update_date: new Date() },
        });
        return { rows: result.count ? [{ id: Number(notificationId), dismissed: true }] : [] };
    },
    createNotification: async (message, userId, tx = prisma, type = 'general') => wrapRows(await tx.notifications.create({
        data: { message, user_id: Number(userId), type, dismissed: false,
            ...(['transfer', 'membership'].includes(type) ? { email_status: 'pending' } : {}),
        }, select: publicFields,
    })),
    dismissAllNotifications: async userId => wrapRows(await prisma.notifications.updateMany({
        where: { user_id: Number(userId), ...unread }, data: { dismissed: true, update_date: new Date() },
    })),
    getUnreadNotifications: (userId, options) => list(userId, options, unread),
    getUnreadCount: userId => prisma.notifications.count({ where: { user_id: Number(userId), ...unread } }),
    getNotificationsByType: (userId, type, options) => list(userId, options, { type }),
};
