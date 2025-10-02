const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { expect } = chai;

const AuthModel = require('../../src/models/Auth.model');
const NodeMailer = require('../../src/services/NodeMailer');
const AuthService = require('../../src/services/AuthService');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.sendStatus = sinon.stub().returns(res);
  return res;
}

const load = () => {
  delete require.cache[require.resolve('../../src/controllers/auth.controller')];
  return require('../../src/controllers/auth.controller');
};

describe('Auth Controller', () => {
  let controller;
  beforeEach(() => controller = load());
  afterEach(() => sinon.restore());

  it('refresh returns 400 when no token', async () => {
    const res = mockRes();
    await controller.refresh({ body: {} }, res);
    expect(res.status.calledOnceWith(400)).to.be.true;
  });

  it('forgotPassword returns 400 when user not found', async () => {
    const res = mockRes();
    sinon.stub(AuthModel, 'findUserByEmailVerified').resolves({ rows: [] });
    await controller.forgotPassword({ body: { email: 'x@y.com' } }, res);
    expect(res.status.calledOnceWith(400)).to.be.true;
  });

  it('forgotPassword success', async () => {
    const res = mockRes();
    sinon.stub(AuthModel, 'findUserByEmailVerified').resolves({ rows: [{ id: 1 }] });
    sinon.stub(jwt, 'sign').returns('token');
    sinon.stub(NodeMailer, 'sendResetEmail').resolves();
    await controller.forgotPassword({ body: { email: 'a@b.com' } }, res);
    expect(res.status.calledOnceWith(200)).to.be.true;
  });

  it('resetPassword success', async () => {
    const res = mockRes();
    sinon.stub(jwt, 'verify').returns({ id: 1 });
    sinon.stub(AuthModel, 'findUserByIdVerified').resolves(true);
    sinon.stub(bcrypt, 'hash').resolves('h');
    sinon.stub(AuthModel, 'updateUserPassword').resolves();
    await controller.resetPassword({ body: { password: 'p', token: 't' } }, res);
    expect(res.status.calledOnceWith(200)).to.be.true;
  });

  it('resetPassword handles invalid token', async () => {
    const res = mockRes();
    sinon.stub(jwt, 'verify').throws(new Error('bad'));
    await controller.resetPassword({ body: { password: 'p', token: 't' } }, res);
    expect(res.status.calledOnceWith(500)).to.be.true;
  });
});
