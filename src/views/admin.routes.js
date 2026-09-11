const router = require('express').Router();
const { authenticateToken } = require('../services/AuthService');
const admin = require('../services/AdminService');
router.use(authenticateToken);
router.use(async (req, res, next) => {
    try { await admin.requireAdmin(req.user.user.id); res.set('Cache-Control', 'no-store'); next(); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Admin access could not be verified.' }); }
});
const handle = fn => async (req, res) => {
    try { res.json(await fn(Number(req.user.user.id), req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'The admin request could not be confirmed. Refresh before retrying.' }); }
};
router.get('/overview', handle(user => admin.overview(user)));
router.get('/users', handle((user, req) => admin.users(user, req.query)));
router.get('/vaults', handle((user, req) => admin.vaults(user, req.query)));
router.get('/audit', handle((user, req) => admin.audit(user, req.query)));
router.patch('/users/:userId/role', handle((user, req) => admin.role(user, req.params.userId, req.body)));
router.post('/users/:userId/revoke-sessions', handle((user, req) => admin.revoke(user, req.params.userId, req.body)));
router.post('/users/:userId/impersonate', handle((user, req) => require('../services/ImpersonationService').start(user, req.sessionId, req.params.userId, req.body)));
module.exports = router;
