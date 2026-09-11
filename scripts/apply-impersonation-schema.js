
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'src', 'config', '.env') });

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(fs.readFileSync(path.resolve(__dirname, '..', 'prisma', 'sql', 'add-impersonation.sql'), 'utf8'));
        await client.query('COMMIT');
        console.log('Impersonation schema is ready. Existing records are preserved.');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error('Impersonation schema upgrade failed:', error.code || error.message);
    process.exitCode = 1;
});


