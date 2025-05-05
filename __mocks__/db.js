// filepath: __mocks__/db.js
const sinon = require("sinon");

const pool = {
  query: sinon.stub(), // Stub for mocking database queries
};

module.exports = pool;