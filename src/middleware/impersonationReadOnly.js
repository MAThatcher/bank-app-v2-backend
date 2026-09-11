module.exports = (req, res, next) => {
    const path = req.path.toLowerCase();
    if (req.headers['x-impersonation-id'] && (!['GET', 'HEAD'].includes(req.method) || path.startsWith('/api/auth') || path.startsWith('/api/users/verify-email'))) {
        return res.status(403).json({ error: 'This action is unavailable during read-only impersonation. Return to your admin account to continue.', code: 'IMPERSONATION_RESTRICTED' });
    }
    next();
};
