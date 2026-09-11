const db = require('../prisma/client');
const TYPES = ['transfer', 'membership', 'security', 'dispute', 'general'];
const SHORTCUTS = ['transfer', 'archives', 'notifications', 'disputes', 'security', 'create'];
const defaults = () => Object.fromEntries(TYPES.map(type => [type, { inApp: true, email: type !== 'general' }]));
const dashboardDefaults = () => ({ order: [], hideBalances: false, defaultAccountId: null, shortcuts: ['transfer', 'archives', 'disputes'] });
function bad(message) { const error = new Error(message); error.status = 400; throw error; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function notificationValues(value) {
    const result = defaults();
    for (const type of TYPES) for (const channel of ['inApp', 'email']) {
        if (typeof value?.[type]?.[channel] === 'boolean') result[type][channel] = value[type][channel];
    }
    return result;
}
async function channels(userId, type, tx = db) {
    const row = await tx.user_preferences.findUnique({ where: { user_id: Number(userId) } });
    return notificationValues(row?.notifications)[type] || { inApp: true, email: false };
}
async function read(userId, tx = db) {
    const row = await tx.user_preferences.findUnique({ where: { user_id: Number(userId) } });
    return { notifications: notificationValues(row?.notifications), dashboard: { ...dashboardDefaults(), ...row?.dashboard } };
}
async function saveNotifications(userId, input) {
    if (!object(input) || Object.keys(input).some(key => !TYPES.includes(key))) bad('Choose valid notification types.');
    for (const type of TYPES) {
        if (!object(input[type]) || Object.keys(input[type]).length !== 2 || typeof input[type].inApp !== 'boolean' || typeof input[type].email !== 'boolean') bad('Set both channels for every notification type.');
    }
    const notifications = notificationValues(input);
    await db.user_preferences.upsert({ where: { user_id: userId }, create: { user_id: userId, notifications }, update: { notifications } });
    return notifications;
}
async function saveDashboard(userId, input) {
    if (!object(input) || Object.keys(input).some(key => !Object.keys(dashboardDefaults()).includes(key))) bad('Invalid dashboard settings.');
    const { order, hideBalances, defaultAccountId, shortcuts } = input;
    const validId = id => Number.isInteger(id) && id > 0 && id <= 2147483647;
    if (!Array.isArray(order) || order.length > 500 || !order.every(validId) || new Set(order).size !== order.length) bad('Use a unique list of vault IDs.');
    if (typeof hideBalances !== 'boolean' || (defaultAccountId !== null && !validId(defaultAccountId))) bad('Invalid balance visibility or default vault.');
    if (!Array.isArray(shortcuts) || shortcuts.length > SHORTCUTS.length || !shortcuts.every(key => SHORTCUTS.includes(key)) || new Set(shortcuts).size !== shortcuts.length) bad('Choose valid, unique shortcuts.');
    const accessible = await db.accounts.findMany({ where: { archived: false, account_users: { some: { user_id: userId, archived: false } } }, select: { id: true } });
    const ids = new Set(accessible.map(row => row.id));
    if (order.some(id => !ids.has(id)) || (defaultAccountId !== null && !ids.has(defaultAccountId))) bad('A selected vault is no longer available. Refresh your vault list.');
    const dashboard = { order, hideBalances, defaultAccountId, shortcuts };
    await db.user_preferences.upsert({ where: { user_id: userId }, create: { user_id: userId, dashboard }, update: { dashboard } });
    return dashboard;
}
module.exports = { read, channels, saveNotifications, saveDashboard, defaults, dashboardDefaults };
