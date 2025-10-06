const sinon = require('sinon');
const { expect } = require('chai');
const jwt = require('jsonwebtoken');

const AuthController = require('../../src/controllers/auth.controller');
const TransactionsController = require('../../src/controllers/transactions.controller');
const NotificationsController = require('../../src/controllers/notifications.controller');
const AccountsController = require('../../src/controllers/accounts.controller');

const AuthModel = require('../../src/models/Auth.model');
const TransactionsModel = require('../../src/models/Transactions.model');
const NotificationsModel = require('../../src/models/Notifications.model');
const AccountsModel = require('../../src/models/Accounts.model');
const AuthService = require('../../src/services/AuthService');

function mockRes() {
    const res = {};
    res.status = sinon.stub().returns(res);
    res.json = sinon.stub().returns(res);
    res.send = sinon.stub().returns(res);
    res.sendStatus = sinon.stub().returns(res);
    return res;
}

describe('Controller extra branches', () => {
    afterEach(() => sinon.restore());

    it('auth.refresh success path returns access token', async () => {
        const req = { body: { refreshToken: 'rt' } };
        const res = mockRes();
        sinon.stub(AuthModel, 'findRefreshToken').resolves({ rows: [{ valid: true }] });
        sinon.stub(jwt, 'verify').callsArgWith(2, null, { id: 1 });
        sinon.stub(jwt, 'sign').returns('access-token');

        await AuthController.refresh(req, res);
        expect(res.status.calledWith(200)).to.be.true;
        expect(res.json.calledWith(sinon.match({ accessToken: 'access-token' }))).to.be.true;
    });

    it('notifications.createNotification error path returns 500', async () => {
        const req = { user: { user: { id: 10 } }, body: { message: 'hi' } };
        const res = mockRes();
        sinon.stub(NotificationsModel, 'createNotification').throws(new Error('boom'));
        await NotificationsController.createNotification(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

    it('transactions.getTransactions model error -> 500', async () => {
        const req = { params: { accountId: 99 }, user: { user: { id: 11 } } };
        const res = mockRes();
        sinon.stub(TransactionsModel, 'checkUserAccountAccess').throws(new Error('boom'));
        await TransactionsController.getTransactions(req, res);
        expect(res.status.calledWith(404)).to.be.true;
    });

    it('accounts.getAccountById when getAccountById throws -> 500', async () => {
        const req = { params: { accountId: 123 } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'getAccountUsersByAccountId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'getAccountById').throws(new Error('nope'));
        await AccountsController.getAccountById(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

});
