const controller = require('../../src/controllers/accounts.controller');
const settings = require('../../src/controllers/vaultSettings.controller');
const service = require('../../src/services/VaultSettingsService');
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
afterEach(() => jest.restoreAllMocks());
test.each([
 ['deleteAccount', 'close', 200], ['addUserToAccount', 'add', 201], ['transferOwnership', 'transfer', 200],
 ['changeOverdraft', 'overdraft', 200], ['removeUserFromAccount', 'remove', 200], ['updateAccountDetails', 'rename', 200],
])('%s passes the authenticated actor and body to the settings service', async (method, operation, status) => {
 const call = jest.spyOn(service, operation).mockResolvedValue({ message: 'Complete' });
 const response = res();
 await controller[method]({ user: { user: { id: 7 } }, params: { accountId: '12' }, body: { confirm: true } }, response);
 expect(call).toHaveBeenCalledWith(7, '12', { confirm: true }); expect(response.status).toHaveBeenCalledWith(status);
});
test.each([400, 404, 409])('settings preserves domain status %s', async status => {
 jest.spyOn(service, 'settings').mockRejectedValue({ status, message: 'Denied' });
 const response = res(); await settings.settings({ user: { user: { id: 7 } }, params: { accountId: '12' } }, response);
 expect(response.status).toHaveBeenCalledWith(status); expect(response.json).toHaveBeenCalledWith({ error: 'Denied' });
});
test('settings refuses a missing identity', async () => { const response = res(); await settings.settings({}, response); expect(response.status).toHaveBeenCalledWith(401); });
test('unexpected failures tell the client to refresh before retrying', async () => {
 jest.spyOn(service, 'rename').mockRejectedValue(new Error('internal database detail'));
 const response = res(); await settings.rename({ user: { user: { id: 7 } }, params: { accountId: 12 } }, response);
 expect(response.status).toHaveBeenCalledWith(500); expect(response.json.mock.calls[0][0].error).toContain('Refresh');
});
