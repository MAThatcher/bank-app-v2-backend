const { expect } = require('chai');

const load = () => {
  delete require.cache[require.resolve('../../src/controllers/dashboard.controller')];
  return require('../../src/controllers/dashboard.controller');
};

describe('Dashboard Controller', () => {
  it('returns dashboard JSON', () => {
    const controller = load();
    const req = { user: { user: { id: 1 } } };
    const res = { json: (payload) => { res.payload = payload; return res; } };
    controller.getDashboard(req, res);
    expect(res.payload).to.have.property('stats');
    expect(res.payload).to.have.property('notifications');
  });
});
