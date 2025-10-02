const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const NotificationsModel = require('../../src/models/Notifications.model');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  return res;
}

const load = () => {
  delete require.cache[require.resolve('../../src/controllers/notifications.controller')];
  return require('../../src/controllers/notifications.controller');
};

describe('Notifications Controller', () => {
  let controller;
  beforeEach(() => controller = load());
  afterEach(() => sinon.restore());

  it('getNotifications returns 404 when none', async () => {
    const req = { user: { user: { id: 1 } } };
    const res = mockRes();
    sinon.stub(NotificationsModel, 'getNotificationsForUser').resolves({ rows: [] });
    await controller.getNotifications(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });

  it('getNotifications returns rows', async () => {
    const req = { user: { user: { id: 1 } } };
    const res = mockRes();
    sinon.stub(NotificationsModel, 'getNotificationsForUser').resolves({ rows: [{ id: 1 }] });
    await controller.getNotifications(req, res);
    expect(res.status.calledOnceWith(200)).to.be.true;
    expect(res.json.firstCall.args[0]).to.deep.equal([{ id: 1 }]);
  });

  it('getNotification returns 404 when not found', async () => {
    const req = { params: { notificationId: 1 }, user: { user: { id: 1 } } };
    const res = mockRes();
    sinon.stub(NotificationsModel, 'getNotificationById').resolves({ rows: [] });
    await controller.getNotification(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });

  it('createNotification success', async () => {
    const req = { body: { message: 'hi' }, user: { user: { id: 1 } } };
    const res = mockRes();
    sinon.stub(NotificationsModel, 'createNotification').resolves({ rows: [{ id: 10 }] });
    await controller.createNotification(req, res);
    expect(res.json.calledOnce).to.be.true;
  });
});
