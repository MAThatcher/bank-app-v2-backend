
const TransferService = require('../services/TransferService');
const logger = require('../Utilities/logger');

module.exports = {
    getTransferAccounts: async (req, res) => {
        try {
            const userId = req.user?.user?.id;
            if (!Number.isInteger(userId) || userId <= 0) return res.status(401).json({ error: 'Sign in to transfer funds.' });
            return res.json(await TransferService.listAccounts(userId));
        } catch (error) {
            logger.error('getTransferAccounts error: %o', { requestId: req.requestId, error });
            return res.status(500).json({ error: 'Unable to retrieve transfer vaults.' });
        }
    },
    createTransfer: async (req, res) => {
        try {
            const result = await TransferService.createTransfer(req.user?.user?.id, req.body || {});
            return res.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
            if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
            logger.error('createTransfer error: %o', { requestId: req.requestId, error });
            return res.status(500).json({
                error: 'The transfer could not be confirmed. Retry this same request to check its result safely.',
                code: 'TRANSFER_UNCONFIRMED',
            });
        }
    },
};

