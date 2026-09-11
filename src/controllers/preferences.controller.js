const service = require('../services/PreferencesService');
const handler = fn => async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await fn(Number(req.user.user.id), req.body)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Preferences could not be saved or loaded. Please retry.' }); }
};
module.exports = { get: handler(user => service.read(user)), notifications: handler(service.saveNotifications), dashboard: handler(service.saveDashboard) };
