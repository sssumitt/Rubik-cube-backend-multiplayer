import { sql } from './db.js';

const checkDB = async () => {
    try {
        const matches = await sql`SELECT * FROM matches ORDER BY created_at DESC LIMIT 10`;
        console.log("Matches in DB:", matches);

        const users = await sql`SELECT id, username FROM users`;
        console.log("Users:", users);
        process.exit(0);
    } catch (err) {
        console.error("DB Error:", err);
        process.exit(1);
    }
};

checkDB();
