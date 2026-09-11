const service = require('../services/DisputesService');
const handler = fn => async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await fn(req, Number(req.user.user.id))); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'The case request could not be confirmed. Refresh the case list before retrying.' }); }
};
module.exports = {
    list: handler((req, user) => service.list(user, req.query)),
    detail: handler((req, user) => service.detail(user, req.params.disputeId)),
    create: handler((req, user) => service.create(user, req.params.transactionId, req.body)),
    update: handler((req, user) => service.update(user, req.params.disputeId, req.body)),
};
