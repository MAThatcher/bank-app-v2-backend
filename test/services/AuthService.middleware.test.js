const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { expect } = chai;

const AuthService = require('../../src/services/AuthService');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res;
}

describe('AuthService.authenticateToken', () => {
  afterEach(() => sinon.restore());

  it('returns 401 when no token', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = sinon.stub();
    AuthService.authenticateToken(req, res, next);
    expect(res.status.calledOnceWith(401)).to.be.true;
  });

  it('returns 403 when token invalid', () => {
    const req = { headers: { authorization: 'Bearer bad' } };
    const res = mockRes();
    const next = sinon.stub();
    sinon.stub(jwt, 'verify').callsFake((t, s, cb) => cb(new Error('no')));
    AuthService.authenticateToken(req, res, next);
    expect(res.status.calledOnceWith(403)).to.be.true;
  });

  it('calls next when token valid', () => {
    const req = { headers: { authorization: 'Bearer ok' } };
    const res = mockRes();
    const next = sinon.stub();
    sinon.stub(jwt, 'verify').callsFake((t, s, cb) => cb(null, { user: { id: 1 } }));
    AuthService.authenticateToken(req, res, next);
    expect(next.calledOnce).to.be.true;
    expect(req.user).to.deep.equal({ user: { id: 1 } });
  });
});
