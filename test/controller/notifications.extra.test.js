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

describe('Notifications Controller - extra', () => {
  let controller;
  beforeEach(() => controller = load());
  afterEach(() => sinon.restore());

  it('getNotification returns 404 when not found', async () => {
    const req = { params: { notificationId: 1 }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(NotificationsModel, 'getNotificationById').resolves({ rows: [] });
    await controller.getNotification(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });

  it('dismissNotification returns 404 when not found', async () => {
    const req = { params: { notificationId: 1 }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(NotificationsModel, 'dismissNotification').resolves({ rows: [] });
    await controller.dismissNotification(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });
});
