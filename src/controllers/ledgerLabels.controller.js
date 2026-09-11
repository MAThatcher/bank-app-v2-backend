const service = require('../services/LedgerLabelsService');
const handle = fn => async (req,res) => {
    try { res.set('Cache-Control','no-store'); res.json(await fn(Number(req.user.user.id),req)); }
    catch(error) { res.status(error.status || 500).json({error:error.status ? error.message : 'The label request could not be confirmed. Refresh and retry.'}); }
};
module.exports = {
    list: type => handle(user => service.list(user,type)),
    save: type => handle((user,req) => service.save(user,type,req.body,req.params.labelId)),
    archive: type => handle((user,req) => service.archive(user,type,req.params.labelId)),
    assign: handle((user,req) => service.assign(user,req.body)),
};
