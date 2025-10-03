const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'src', 'config', '.env') });

const args = process.argv.slice(2);
const prisma = spawn('npx', ['prisma', ...args], { stdio: 'inherit', shell: true });
prisma.on('exit', (code) => process.exit(code));
