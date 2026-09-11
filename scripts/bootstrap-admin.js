const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/config/.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
    const email = process.argv[2];
    if (!email || !email.includes('@')) throw new Error('Supply the existing verified account email: node scripts/bootstrap-admin.js user@example.com');
    await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(41712, 1)::text`);
        if (await tx.users.count({ where: { archived: false, verified: true, super_user: true } })) throw new Error('An administrator already exists. Use the admin panel to manage additional roles.');
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE email = ${email} FOR UPDATE`);
        const user = await tx.users.findUnique({ where: { email } });
        if (!user || user.archived !== false || user.verified !== true) throw new Error('The account must already exist, be active, and have a verified email.');
        await tx.users.update({ where: { id: user.id }, data: { super_user: true, update_date: new Date() } });
        await tx.sessions.updateMany({ where: { user_id: user.id, valid: true }, data: { valid: false } });
        await tx.tokens.updateMany({ where: { user_id: user.id, valid: true }, data: { valid: false } });
        await tx.audit_logs.create({ data: { user_id: user.id, create_date: new Date(), action: 'ADMIN_BOOTSTRAP', details: JSON.stringify({ targetUserId: user.id, source: 'Local bootstrap script' }) } });
    });
    console.log('First administrator enabled. Sign in again to open /admin.');
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
