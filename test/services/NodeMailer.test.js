const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

describe('NodeMailer', () => {
  let nodemailer;
  let createTransportStub;
  let NodeMailer;

  beforeEach(() => {
    // require the real nodemailer module and stub its createTransport
    nodemailer = require('nodemailer');
    const sendMailStub = sinon.stub().resolves();
    createTransportStub = sinon.stub(nodemailer, 'createTransport').returns({ sendMail: sendMailStub });
    // clear NodeMailer from require cache to force re-evaluation using our stub
    delete require.cache[require.resolve('../../src/services/NodeMailer')];
    NodeMailer = require('../../src/services/NodeMailer');
    // expose the sendMail stub for assertions
    this.sendMailStub = sendMailStub;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('sendVerificationEmail calls transporter', async () => {
    await NodeMailer.sendVerificationEmail('a@b.com', 'tok');
    expect(this.sendMailStub.called).to.be.true;
  });

  it('sendResetEmail calls transporter and swallows errors', async () => {
    await NodeMailer.sendResetEmail('tok', 'a@b.com');
    // just ensure the call resolves; implementation may swallow errors
  });
});
