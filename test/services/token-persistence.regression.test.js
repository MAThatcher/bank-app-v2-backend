
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const prisma = require('../../src/prisma/client');
const AuthService = require('../../src/services/AuthService');
const AuthController = require('../../src/controllers/auth.controller');
const AuthModel = require('../../src/models/Auth.model');
const UsersModel = require('../../src/models/Users.model');

const keys = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ACCESS_TOKEN_EXPIRES_IN', 'REFRESH_TOKEN_EXPIRES_IN'];
let originalEnv;
beforeEach(() => {
    originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    process.env.JWT_SECRET = 'regression-access-secret';
    process.env.JWT_REFRESH_SECRET = 'regression-refresh-secret';
    delete process.env.ACCESS_TOKEN_EXPIRES_IN;
    delete process.env.REFRESH_TOKEN_EXPIRES_IN;
});
afterEach(() => {
    jest.restoreAllMocks();
    for (const key of keys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const response = () => {
    const res = {};
    for (const method of ['status', 'json', 'send', 'cookie']) res[method] = jest.fn().mockReturnValue(res);
    return res;
};

describe('Persisted token validity and expiry', () => {
    test.each([
        ['generateAccessToken', 'AccessToken', 'JWT_SECRET', 'ACCESS_TOKEN_EXPIRES_IN', '23m', 1380],
        ['generateRefreshToken', 'RefreshToken', 'JWT_REFRESH_SECRET', 'REFRESH_TOKEN_EXPIRES_IN', '3d', 259200],
    ])('%s persists a valid token with its exact JWT expiry', async (method, type, secret, expiryKey, ttl, seconds) => {
        process.env[expiryKey] = ttl;
        const invalidate = jest.spyOn(prisma.tokens, 'updateMany').mockResolvedValue({ count: 1 });
        const create = jest.spyOn(prisma.tokens, 'create').mockResolvedValue({});
        const token = await AuthService[method]({ user: { id: 7, email: 'citizen@example.test' } });
        const decoded = jwt.verify(token, process.env[secret]);
        expect(decoded.exp - decoded.iat).toBe(seconds);
        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].data).toEqual({
            value: token, user_id: 7, type, valid: true, expire_date: new Date(decoded.exp * 1000),
        });
        expect(invalidate).toHaveBeenCalledWith({
            where: { user_id: 7, type, valid: true }, data: { valid: false },
        });
    });

    test.each(['generateAccessToken', 'generateRefreshToken'])('%s waits for commit before returning', async method => {
        const commit = deferred();
        jest.spyOn(prisma, 'runTransaction').mockReturnValue(commit.promise);
        let settled = false;
        const pending = AuthService[method]({ user: { id: 7 } }).then(token => { settled = true; return token; });
        await Promise.resolve();
        expect(settled).toBe(false);
        commit.resolve();
        expect(typeof await pending).toBe('string');
        expect(settled).toBe(true);
    });

    test.each(['generateAccessToken', 'generateRefreshToken'])('%s propagates an asynchronous persistence failure', async method => {
        jest.spyOn(prisma.tokens, 'create').mockRejectedValue(new Error('database unavailable'));
        await expect(AuthService[method]({ user: { id: 7 } })).rejects.toThrow('database unavailable');
    });

    test('a new refresh token is immediately discoverable by the refresh model', async () => {
        let stored;
        jest.spyOn(prisma.tokens, 'create').mockImplementation(async ({ data }) => { stored = data; return data; });
        jest.spyOn(prisma.tokens, 'findFirst').mockImplementation(async ({ where }) =>
            stored.value === where.value && stored.valid === where.valid && stored.type === where.type
                ? { valid: stored.valid } : null
        );
        const token = await AuthService.generateRefreshToken({ user: { id: 7 } });
        expect(await AuthModel.findRefreshToken(token)).toEqual({ rows: [{ valid: true }] });
    });
});

describe('Authentication waits for persistence', () => {
    const credentials = { body: { email: 'citizen@example.test', password: 'test-password' } };
    const stubCredentials = () => {
        jest.spyOn(UsersModel, 'findUserByEmailVerified').mockResolvedValue({ rows: [{ id: 7, email: credentials.body.email, password: 'hash' }] });
        jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    };

    test('login does not send a cookie or success until both tokens are saved', async () => {
        stubCredentials();
        const access = deferred(), refresh = deferred(), refreshStarted = deferred();
        jest.spyOn(AuthService, 'generateAccessToken').mockReturnValue(access.promise);
        jest.spyOn(AuthService, 'generateRefreshToken').mockImplementation(() => { refreshStarted.resolve(); return refresh.promise; });
        const res = response();
        const pending = AuthController.login(credentials, res);
        await Promise.resolve();
        expect(res.cookie).not.toHaveBeenCalled();
        access.resolve('access-token');
        await refreshStarted.promise;
        expect(res.json).not.toHaveBeenCalled();
        expect(res.cookie).not.toHaveBeenCalled();
        const refreshToken = jwt.sign({ user: { id: 7 } }, process.env.JWT_REFRESH_SECRET, { expiresIn: '2h' });
        refresh.resolve(refreshToken);
        await pending;
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ accessToken: 'access-token', message: 'Login Successful' });
        expect(res.cookie).toHaveBeenCalledWith('refreshToken', refreshToken, expect.objectContaining({
            httpOnly: true, sameSite: 'strict', expires: new Date(jwt.decode(refreshToken).exp * 1000),
        }));
    });

    test.each(['generateAccessToken', 'generateRefreshToken'])('login returns 500 when %s fails to save', async method => {
        stubCredentials();
        jest.spyOn(AuthService, 'generateAccessToken').mockResolvedValue('access');
        jest.spyOn(AuthService, 'generateRefreshToken').mockResolvedValue('refresh');
        AuthService[method].mockRejectedValue(new Error('save failed'));
        const res = response();
        await AuthController.login(credentials, res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.cookie).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    test('refresh waits for the access-token commit', async () => {
        jest.spyOn(AuthModel, 'findRefreshToken').mockResolvedValue({ rows: [{ valid: true }] });
        jest.spyOn(jwt, 'verify').mockReturnValue({ user: { id: 7 } });
        const commit = deferred(), started = deferred();
        jest.spyOn(AuthService, 'generateAccessToken').mockImplementation(() => { started.resolve(); return commit.promise; });
        const res = response();
        const pending = AuthController.refresh({ cookies: { refreshToken: 'valid' } }, res);
        await started.promise;
        expect(res.json).not.toHaveBeenCalled();
        commit.resolve('new-access');
        await pending;
        expect(res.json).toHaveBeenCalledWith({ accessToken: 'new-access' });
    });

    test('a refresh database failure is a server error, not an invalid-token response', async () => {
        jest.spyOn(AuthModel, 'findRefreshToken').mockResolvedValue({ rows: [{ valid: true }] });
        jest.spyOn(jwt, 'verify').mockReturnValue({ user: { id: 7 } });
        jest.spyOn(AuthService, 'generateAccessToken').mockRejectedValue(new Error('save failed'));
        const res = response();
        await AuthController.refresh({ cookies: { refreshToken: 'valid' } }, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

