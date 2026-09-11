const router = require('express').Router();
const { authenticateToken } = require('../services/AuthService');
// Exiting uses the original administrator token, with no impersonation header.
router.delete('/:id', authenticateToken, async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await require('../services/ImpersonationService').stop(req.user.user.id, req.sessionId, req.params.id)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to end impersonation. Please retry.' }); }
});
module.exports = router;
