const service = require('../services/VaultSettingsService');
const logger = require('../Utilities/logger');
const handle = (method, status = 200) => async (req, res) => {
    try {
        if (!req.user?.user?.id) return res.status(401).json({ error: 'Sign in to manage a vault.' });
        return res.status(status).json(await service[method](req.user.user.id, req.params.accountId, req.body || {}));
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        logger.error('Vault settings request failed', { requestId: req.requestId, code: error.code || 'SETTINGS_ERROR' });
        return res.status(500).json({ error: 'The change could not be confirmed. Refresh the vault before trying again.' });
    }
};
module.exports = { settings: handle('settings'), rename: handle('rename'), overdraft: handle('overdraft'), add: handle('add', 201), remove: handle('remove'), transfer: handle('transfer'), close: handle('close') };
