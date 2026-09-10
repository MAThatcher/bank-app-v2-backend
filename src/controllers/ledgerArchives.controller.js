const service = require('../services/LedgerArchivesService');
const logger = require('../Utilities/logger');
const handle = method => async (req,res) => {
    try {
        if (!req.user?.user?.id) return res.status(401).json({error:'Sign in to view the archives.'});
        const result = await service[method](req.user.user.id,req.query);
        res.set('Cache-Control','no-store');
        if (method === 'exportCsv') return res.type('text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="ledger-archives.csv"').send(result);
        return res.json(result);
    } catch(error) {
        if (error.status) return res.status(error.status).json({error:error.message});
        logger.error('Ledger archives request failed',{requestId:req.requestId,code:error.code || 'ARCHIVES_ERROR'});
        return res.status(500).json({error:'The ledger archives are unavailable. Please retry.'});
    }
};
module.exports = { search:handle('search'), summary:handle('summary'), exportCsv:handle('exportCsv') };
