const request = require('supertest');
const express = require('express');
const accountRoutes = require('../../routes/Account');
const pool = require('../../db.js');
const AuthService = require('../../services/AuthService');

jest.mock('../../db.js');
jest.mock('../../services/AuthService');

const app = express();
app.use(express.json());
app.use('/', accountRoutes);

beforeAll(() => {
  AuthService.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { user: { id: 1, email: 'test@test.com' } };
    next();
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Account Routes', () => {
  test('GET / should return user accounts', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Test Account', balance: 100 }],
    });

    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.any(Array));
  });

  test('GET /:accountId should return single account', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ account_id: 1, user_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Account' }] });
    const res = await request(app).get('/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.any(Array));
  });

  test('POST / should create a bank account', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ userId: 123 }] })
      .mockResolvedValueOnce()
      .mockResolvedValueOnce();

    const res = await request(app)
      .post('/')
      .send({ accountName: 'New Account' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('accountId');
  });

  test('DELETE / should delete an account', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ balance: 0, owner: 1 }] })
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockResolvedValueOnce();

    const res = await request(app)
      .delete('/')
      .send({ accountId: 1 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Account Deleted Successfully');
  });

  test('POST /addUser should add a user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce()
      .mockResolvedValueOnce();

    const res = await request(app)
      .post('/addUser')
      .send({ accountId: 1, email: 'other@example.com' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  test('POST /transferOwnership should transfer ownership', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce()
      .mockResolvedValueOnce();

    const res = await request(app)
      .post('/transferOwnership')
      .send({ accountId: 1, email: 'newowner@example.com' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message');
  });
});
