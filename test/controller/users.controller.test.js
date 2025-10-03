const chai = require('chai');
const sinon = require('sinon');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { expect } = chai;

const UsersModel = require('../../src/models/Users.model');
let NodeMailer;
let AuthService;

function loadController() {
  delete require.cache[require.resolve('../../src/controllers/users.controller')];
  return require('../../src/controllers/users.controller');
}

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  return res;
}

describe('Users Controller', () => {
  let usersController;

  beforeEach(() => {
    NodeMailer = require('../../src/services/NodeMailer');
    AuthService = require('../../src/services/AuthService');

    sinon.stub(NodeMailer, 'sendVerificationEmail').resolves();
    sinon.stub(AuthService, 'generateAccessToken').returns('access-token');
    sinon.stub(AuthService, 'generateRefreshToken').returns('refresh-token');

    usersController = loadController();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('deleteUser', () => {
    it('deletes the user when authorized', async () => {
      const req = { params: { email: 'a@b.com' }, user: { user: { email: 'a@b.com' } } };
      const res = mockRes();
      const prisma = require('../../src/prisma/client');
      sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
      sinon.stub(UsersModel, 'softDeleteUserByEmail').resolves();

      await usersController.deleteUser(req, res);

      expect(prisma.runTransaction.calledOnce).to.be.true;
      expect(UsersModel.softDeleteUserByEmail.calledWith('a@b.com')).to.be.true;
      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'User Deleted Successfully' });
    });

    it('rolls back and returns 500 on error', async () => {
      const req = { params: { email: 'a@b.com' }, user: { user: { email: 'a@b.com' } } };
      const res = mockRes();
      const prisma = require('../../src/prisma/client');
      sinon.stub(prisma, 'runTransaction').rejects(new Error('db'));
      sinon.stub(UsersModel, 'softDeleteUserByEmail').throws(new Error('db'));

      await usersController.deleteUser(req, res);

      expect(prisma.runTransaction.calledOnce).to.be.true;
      expect(res.status.calledOnceWith(500)).to.be.true;
    });
  });

  describe('getUserDetails', () => {
    it('returns user details when found', async () => {
      const req = { user: { user: { email: 'a@b.com' } } };
      const res = mockRes();
      sinon.stub(UsersModel, 'getUserDetailsByEmail').resolves({ rows: [{ id: 1, email: 'a@b.com' }] });

      await usersController.getUserDetails(req, res);

      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ id: 1, email: 'a@b.com' });
    });

    it('returns 404 when not found', async () => {
      const req = { user: { user: { email: 'a@b.com' } } };
      const res = mockRes();
      sinon.stub(UsersModel, 'getUserDetailsByEmail').resolves({ rows: [] });

      await usersController.getUserDetails(req, res);

      expect(res.status.calledOnceWith(404)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'User not found' });
    });

    it('returns 500 on error', async () => {
      const req = { user: { user: { email: 'a@b.com' } } };
      const res = mockRes();
      sinon.stub(UsersModel, 'getUserDetailsByEmail').throws(new Error('db'));

      await usersController.getUserDetails(req, res);

      expect(res.status.calledOnceWith(500)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'Server Error' });
    });
  });

  describe('login', () => {
    it('returns 401 if email not found', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();
      sinon.stub(UsersModel, 'findUserByEmailVerified').resolves({ rows: [] });

      await usersController.login(req, res);

      expect(res.status.calledOnceWith(401)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'Email not found' });
    });

    it('returns 401 if password invalid', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();
      sinon.stub(UsersModel, 'findUserByEmailVerified').resolves({ rows: [{ password: 'hash' }] });
      sinon.stub(bcrypt, 'compare').resolves(false);

      await usersController.login(req, res);

      expect(res.status.calledOnceWith(401)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'Invalid password' });
    });

    it('returns tokens when successful', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();
      const mockUser = { id: 1, email: 'a@b.com', password: 'hash' };
      sinon.stub(UsersModel, 'findUserByEmailVerified').resolves({ rows: [mockUser] });
      sinon.stub(bcrypt, 'compare').resolves(true);

      await usersController.login(req, res);

      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.have.property('accessToken', 'access-token');
      expect(res.json.firstCall.args[0]).to.have.property('refreshToken', 'refresh-token');
    });

    it('returns 500 on error', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();
      sinon.stub(UsersModel, 'findUserByEmailVerified').throws(new Error('db'));

      await usersController.login(req, res);

      expect(res.status.calledOnceWith(500)).to.be.true;
      expect(res.send.calledOnceWith('Server Error')).to.be.true;
    });
  });

  describe('register', () => {
    it('returns 400 if email already registered', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();
      sinon.stub(UsersModel, 'findUserByEmail').resolves({ rows: [{ id: 1 }] });

      await usersController.register(req, res);

      expect(res.status.calledOnceWith(400)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'Email is already registered' });
    });

    it('registers and sends verification email', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();

      sinon.stub(UsersModel, 'findUserByEmail').resolves({ rows: [] });
      sinon.stub(jwt, 'sign').returns('tok');
      sinon.stub(bcrypt, 'hash').resolves('hashed');
      const prisma = require('../../src/prisma/client');
      sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
      sinon.stub(UsersModel, 'insertUser').resolves({ rows: [{ id: 10 }] });
      sinon.stub(UsersModel, 'insertUserDetails').resolves();

      await usersController.register(req, res);

      expect(UsersModel.insertUser.calledOnce).to.be.true;
      expect(prisma.runTransaction.calledOnce).to.be.true;
      expect(res.status.calledOnceWith(201)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Verification email sent. Please check your inbox.' });
    });

    it('rolls back and returns 500 on error', async () => {
      const req = { body: { email: 'a@b.com', password: 'pw' } };
      const res = mockRes();

      sinon.stub(UsersModel, 'findUserByEmail').resolves({ rows: [] });
      sinon.stub(jwt, 'sign').returns('tok');
      sinon.stub(bcrypt, 'hash').resolves('hashed');
      const prisma = require('../../src/prisma/client');
      sinon.stub(prisma, 'runTransaction').rejects(new Error('db'));
      sinon.stub(UsersModel, 'insertUser').throws(new Error('db'));

      await usersController.register(req, res);

      expect(prisma.runTransaction.calledOnce).to.be.true;
      expect(res.status.calledOnceWith(500)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'Server Error' });
    });
  });

  describe('verifyEmail', () => {
    it('verifies the email and returns 200', async () => {
      const req = { params: { token: 'tok' } };
      const res = mockRes();

      sinon.stub(jwt, 'verify').returns({ email: 'a@b.com' });
      const prisma = require('../../src/prisma/client');
      sinon.stub(prisma, 'runTransaction').callsFake(async (cb) => await cb(prisma));
      sinon.stub(UsersModel, 'setVerifiedByEmail').resolves();

      await usersController.verifyEmail(req, res);

      expect(prisma.runTransaction.calledOnce).to.be.true;
      expect(UsersModel.setVerifiedByEmail.calledOnce).to.be.true;
      expect(res.status.calledOnceWith(200)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Email successfully verified.' });
    });

    it('rolls back and returns 500 on error', async () => {
      const req = { params: { token: 'bad' } };
      const res = mockRes();

      sinon.stub(jwt, 'verify').throws(new Error('invalid'));

      await usersController.verifyEmail(req, res);

      expect(res.status.calledOnceWith(500)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({ error: 'Server Error' });
    });
  });
});
