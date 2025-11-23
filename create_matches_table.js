import { sql } from './db.js';

async function createTable() {
    try {
        await sql`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        player1_id INTEGER REFERENCES users(id),
        player2_id INTEGER REFERENCES users(id),
        winner_id INTEGER REFERENCES users(id),
        cube_size INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
        console.log('Matches table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error creating table:', err);
        process.exit(1);
    }
}

createTable();
