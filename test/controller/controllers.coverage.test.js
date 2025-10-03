const sinon = require('sinon');
const { expect } = require('chai');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const AccountsController = require('../../src/controllers/accounts.controller');
const AuthController = require('../../src/controllers/auth.controller');
const TransactionsController = require('../../src/controllers/transactions.controller');
const NotificationsController = require('../../src/controllers/notifications.controller');
const DashboardController = require('../../src/controllers/dashboard.controller');
const UsersController = require('../../src/controllers/users.controller');

const AccountsModel = require('../../src/models/Accounts.model');
const TransactionsModel = require('../../src/models/Transactions.model');
const NotificationsModel = require('../../src/models/Notifications.model');
const AuthModel = require('../../src/models/Auth.model');
const UsersModel = require('../../src/models/Users.model');

const prisma = require('../../src/prisma/client');
const NodeMailer = require('../../src/services/NodeMailer');
const AuthService = require('../../src/services/AuthService');

function mockRes() {
    const res = {};
    res.status = sinon.stub().returns(res);
    res.json = sinon.stub().returns(res);
    res.send = sinon.stub().returns(res);
    res.sendStatus = sinon.stub().returns(res);
    return res;
}

describe('Controller coverage - exercise branches', () => {
    afterEach(() => sinon.restore());

    it('accounts.getAccounts success and error', async () => {
        const req = { user: { user: { email: 'a@b.com' } } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'getAccountsForUser').resolves({ rows: [{ id: 1 }] });
        await AccountsController.getAccounts(req, res);
        expect(res.status.calledWith(200)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountsForUser').throws(new Error('boom'));
        const res2 = mockRes();
        await AccountsController.getAccounts(req, res2);
        expect(res2.status.calledWith(500)).to.be.true;
    });

    it('accounts.getAccountById unauthorized and success', async () => {
        const req = { params: { accountId: 5 } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'getAccountUsersByAccountId').resolves({ rows: [] });
        await AccountsController.getAccountById(req, res);
        expect(res.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountUsersByAccountId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'getAccountById').resolves({ rows: [{ id: 5 }] });
        const res2 = mockRes();
        await AccountsController.getAccountById(req, res2);
        expect(res2.status.calledWith(200)).to.be.true;
    });

    it('accounts.createAccount success and error', async () => {
        const req = { body: { accountName: 'X' }, user: { user: { id: 2 } } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'insertAccount').resolves({ rows: [{ id: 7 }] });
        sinon.stub(AccountsModel, 'insertAccountUser').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        await AccountsController.createAccount(req, res);
        expect(res.status.calledWith(201)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'insertAccount').throws(new Error('db'));
        sinon.stub(prisma, 'runTransaction').rejects(new Error('db'));
        const res2 = mockRes();
        await AccountsController.createAccount(req, res2);
        expect(res2.status.calledWith(500)).to.be.true;
    });

    it('accounts.deleteAccount not found, non-zero, and success', async () => {
        const req = { params: { accountId: 9 }, user: { user: { id: 3 } } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'getAccountOwnerAndBalance').resolves({ rows: [] });
        await AccountsController.deleteAccount(req, res);
        expect(res.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountOwnerAndBalance').resolves({ rows: [{ balance: 10 }] });
        const res2 = mockRes();
        await AccountsController.deleteAccount(req, res2);
        expect(res2.status.calledWith(403)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountOwnerAndBalance').resolves({ rows: [{ balance: 0 }] });
        sinon.stub(AccountsModel, 'archiveAccountUsers').resolves();
        sinon.stub(AccountsModel, 'archiveAccount').resolves();
        sinon.stub(AccountsModel, 'archiveTransactionsByAccount').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        const res3 = mockRes();
        await AccountsController.deleteAccount(req, res3);
        expect(res3.status.calledWith(200)).to.be.true;
    });

    it('accounts.addUserToAccount various branches', async () => {
        const req = { params: { accountId: 11 }, body: { email: 'x@y.com' }, user: { user: { id: 4 } } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [] });
        await AccountsController.addUserToAccount(req, res);
        expect(res.status.calledWith(401)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'findUserByEmail').resolves({ rows: [] });
        const res2 = mockRes();
        await AccountsController.addUserToAccount(req, res2);
        expect(res2.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'findUserByEmail').resolves({ rows: [{ id: 8 }] });
        sinon.stub(AccountsModel, 'checkUserHasAccess').resolves({ rows: [1] });
        const res3 = mockRes();
        await AccountsController.addUserToAccount(req, res3);
        expect(res3.status.calledWith(403)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'findUserByEmail').resolves({ rows: [{ id: 8 }] });
        sinon.stub(AccountsModel, 'checkUserHasAccess').resolves({ rows: [] });
        sinon.stub(AccountsModel, 'insertAccountUser').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        const res4 = mockRes();
        await AccountsController.addUserToAccount(req, res4);
        expect(res4.status.calledWith(201)).to.be.true;
    });

    it('accounts.transferOwnership and changeOverdraft branches', async () => {
        const req = { params: { accountId: 21 }, body: { email: 'a@b.com' }, user: { user: { id: 5 } } };
        const res = mockRes();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [] });
        await AccountsController.transferOwnership(req, res);
        expect(res.status.calledWith(401)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'findAccountUserIdByEmail').resolves({ rows: [] });
        const res2 = mockRes();
        await AccountsController.transferOwnership(req, res2);
        expect(res2.status.calledWith(403)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'findAccountUserIdByEmail').resolves({ rows: [{ id: 99 }] });
        sinon.stub(AccountsModel, 'updateOwner').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        const res3 = mockRes();
        await AccountsController.transferOwnership(req, res3);
        expect(res3.status.calledWith(200)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [] });
        const res4 = mockRes();
        await AccountsController.changeOverdraft(req, res4);
        expect(res4.status.calledWith(401)).to.be.true;

        sinon.restore();
        sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [1] });
        sinon.stub(AccountsModel, 'updateOverdraft').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        const res5 = mockRes();
        await AccountsController.changeOverdraft(req, res5);
        expect(res5.status.calledWith(200)).to.be.true;
    });

    it('transactions.getTransactions unauthorized and success', async () => {
        const req = { params: { accountId: 55 }, user: { user: { id: 6 } } };
        const res = mockRes();
        sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [] });
        await TransactionsController.getTransactions(req, res);
        expect(res.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [1] });
        sinon.stub(TransactionsModel, 'getTransactionsByAccount').resolves({ rows: [{ id: 1 }] });
        const res2 = mockRes();
        await TransactionsController.getTransactions(req, res2);
        expect(res2.status.calledWith(200)).to.be.true;
    });

    it('transactions.createTransaction covers overdraft and success', async () => {
        const req = { body: { transactionAmount: -200, accountId: 66, description: 'x' }, user: { user: { id: 7 } } };
        const res = mockRes();
        sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [] });
        await TransactionsController.createTransaction(req, res);
        expect(res.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [1] });
        sinon.stub(TransactionsModel, 'getAccountBalanceAndOverdraft').resolves({ rows: [{ overdraft: false, balance: -100 }] });
        const res2 = mockRes();
        await TransactionsController.createTransaction(req, res2);
        expect(res2.status.calledWith(401)).to.be.true;

        sinon.restore();
        sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [1] });
        sinon.stub(TransactionsModel, 'getAccountBalanceAndOverdraft').resolves({ rows: [{ overdraft: true, balance: 50 }] });
        sinon.stub(TransactionsModel, 'insertTransaction').resolves();
        sinon.stub(TransactionsModel, 'getBalanceForAccount').resolves({ rows: [{ balance: 50 }] });
        sinon.stub(TransactionsModel, 'updateAccountBalance').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        const res3 = mockRes();
        await TransactionsController.createTransaction(req, res3);
        expect(res3.status.calledWith(201)).to.be.true;
    });

    it('notifications get/dismiss/create', async () => {
        const req = { user: { user: { id: 8 } }, params: { notificationId: 5 }, body: { message: 'hi' } };
        const res = mockRes();
        sinon.stub(NotificationsModel, 'getNotificationsForUser').resolves({ rows: [] });
        await NotificationsController.getNotifications(req, res);
        expect(res.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(NotificationsModel, 'getNotificationsForUser').resolves({ rows: [{ id: 1 }] });
        const res2 = mockRes();
        await NotificationsController.getNotifications(req, res2);
        expect(res2.status.calledWith(200)).to.be.true;

        sinon.restore();
        sinon.stub(NotificationsModel, 'getNotificationById').resolves({ rows: [] });
        const res3 = mockRes();
        await NotificationsController.getNotification(req, res3);
        expect(res3.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(NotificationsModel, 'getNotificationById').resolves({ rows: [{ id: 1 }] });
        const res4 = mockRes();
        await NotificationsController.getNotification(req, res4);
        expect(res4.json.called).to.be.true;

        sinon.restore();
        sinon.stub(NotificationsModel, 'dismissNotification').resolves({ rows: [] });
        const res5 = mockRes();
        await NotificationsController.dismissNotification(req, res5);
        expect(res5.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(NotificationsModel, 'dismissNotification').resolves({ rows: [{ id: 2 }] });
        const res6 = mockRes();
        await NotificationsController.dismissNotification(req, res6);
        expect(res6.status.calledWith(200)).to.be.true;

        sinon.restore();
        sinon.stub(NotificationsModel, 'createNotification').resolves({ rows: [{ id: 3 }] });
        const res7 = mockRes();
        await NotificationsController.createNotification(req, res7);
        expect(res7.status.calledWith(201)).to.be.true;
    });

    it('dashboard returns JSON', () => {
        const req = { user: { user: { id: 9 } } };
        const res = mockRes();
        DashboardController.getDashboard(req, res);
        expect(res.json.called).to.be.true;
    });

    it('users.deleteUser success and error', async () => {
        const req = { user: { user: { email: 'u@v.com' } } };
        const res = mockRes();
        sinon.stub(UsersModel, 'softDeleteUserByEmail').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        await UsersController.deleteUser(req, res);
        expect(res.json.called).to.be.true;

        sinon.restore();
        sinon.stub(UsersModel, 'softDeleteUserByEmail').throws(new Error('db'));
        sinon.stub(prisma, 'runTransaction').rejects(new Error('db'));
        const res2 = mockRes();
        await UsersController.deleteUser(req, res2);
        expect(res2.status.calledWith(500)).to.be.true;
    });

    it('users.getUserDetails not found and found', async () => {
        const req = { user: { user: { email: 'z@z.com' } } };
        const res = mockRes();
        sinon.stub(UsersModel, 'getUserDetailsByEmail').resolves({ rows: [] });
        await UsersController.getUserDetails(req, res);
        expect(res.status.calledWith(404)).to.be.true;

        sinon.restore();
        sinon.stub(UsersModel, 'getUserDetailsByEmail').resolves({ rows: [{ id: 1 }] });
        const res2 = mockRes();
        await UsersController.getUserDetails(req, res2);
        expect(res2.status.calledWith(200)).to.be.true;
    });

    it('users.login flows (not found, invalid password, success)', async () => {
        const req = { body: { email: 'e@f.com', password: 'pw' } };
        const res = mockRes();
        sinon.stub(UsersModel, 'findUserByEmailVerified').resolves({ rows: [] });
        await UsersController.login(req, res);
        expect(res.status.calledWith(401)).to.be.true;

        sinon.restore();
        sinon.stub(UsersModel, 'findUserByEmailVerified').resolves({ rows: [{ id: 1, password: 'hash' }] });
        sinon.stub(bcrypt, 'compare').resolves(false);
        const res2 = mockRes();
        await UsersController.login(req, res2);
        expect(res2.status.calledWith(401)).to.be.true;

        sinon.restore();
        sinon.stub(UsersModel, 'findUserByEmailVerified').resolves({ rows: [{ id: 1, password: 'hash' }] });
        sinon.stub(bcrypt, 'compare').resolves(true);
        sinon.stub(AuthService, 'generateAccessToken').returns('at');
        sinon.stub(AuthService, 'generateRefreshToken').returns('rt');
        const res3 = mockRes();
        await UsersController.login(req, res3);
        expect(res3.status.calledWith(200)).to.be.true;
    });

    it('users.register and verifyEmail flows', async () => {
        const req = { body: { email: 'new@u.com', password: 'pw' } };
        const res = mockRes();
        sinon.stub(UsersModel, 'findUserByEmail').resolves({ rows: [1] });
        await UsersController.register(req, res);
        expect(res.status.calledWith(400)).to.be.true;

        sinon.restore();
        sinon.stub(UsersModel, 'findUserByEmail').resolves({ rows: [] });
        sinon.stub(NodeMailer, 'sendVerificationEmail').resolves();
        sinon.stub(UsersModel, 'insertUser').resolves({ rows: [{ id: 12 }] });
        sinon.stub(UsersModel, 'insertUserDetails').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        sinon.stub(jwt, 'sign').returns('sometoken');
        const res2 = mockRes();
        await UsersController.register(req, res2);
        expect(res2.status.calledWith(201)).to.be.true;

        sinon.restore();
        const reqVerify = { params: { token: 't' } };
        sinon.stub(jwt, 'verify').returns({ email: 'new@u.com' });
        sinon.stub(UsersModel, 'setVerifiedByEmail').resolves();
        sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
        const res3 = mockRes();
        await UsersController.verifyEmail(reqVerify, res3);
        expect(res3.status.calledWith(200)).to.be.true;

        sinon.restore();
        const res4 = mockRes();
        sinon.stub(jwt, 'verify').throws(new Error('invalid'));
        await UsersController.verifyEmail(reqVerify, res4);
        expect(res4.status.calledWith(500)).to.be.true;
    });

});
