const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { expect } = chai;

const AuthModel = require('../../src/models/Auth.model');
const AuthController = require('../../src/controllers/auth.controller');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.sendStatus = sinon.stub().returns(res);
  return res;
}

describe('Auth Controller - refresh', () => {
  afterEach(() => sinon.restore());

  it('returns 400 when no token', async () => {
    const res = mockRes();
    await AuthController.refresh({ body: {} }, res);
    expect(res.status.calledOnceWith(400)).to.be.true;
  });

  it('returns 403 when token invalid during verify', async () => {
    sinon.stub(AuthModel, 'findRefreshToken').resolves({ rows: [{ valid: true }] });
    sinon.stub(jwt, 'verify').callsFake((t, s, cb) => cb(new Error('invalid')));
    const res = mockRes();
    await AuthController.refresh({ body: { refreshToken: 'x' } }, res);
    expect(res.sendStatus.called).to.be.true;
  });
});
