import { sql } from '../db.js';

export const getDashboardData = async (req, res) => {
  const userId = req.user.id;

  try {
    console.log(`Fetching dashboard data for user ID: ${userId}`);

    // 1. Get user stats (total wins)
    const winsResult = await sql`
      SELECT COUNT(*) as count FROM matches WHERE winner_id = ${userId}
    `;
    const totalWins = parseInt(winsResult[0].count, 10);

    const matchesResult = await sql`
      SELECT COUNT(*) as count FROM matches WHERE player1_id = ${userId} OR player2_id = ${userId}
    `;
    const totalMatches = parseInt(matchesResult[0].count, 10);

    // 2. Get recent matches
    const recentMatches = await sql`
      SELECT 
        m.id,
        m.cube_size,
        m.created_at,
        CASE 
          WHEN m.player1_id = ${userId} THEN u2.username 
          ELSE u1.username 
        END as opponent_name,
        CASE 
          WHEN m.winner_id = ${userId} THEN 'WON'
          ELSE 'LOST'
        END as result
      FROM matches m
      JOIN users u1 ON m.player1_id = u1.id
      JOIN users u2 ON m.player2_id = u2.id
      WHERE m.player1_id = ${userId} OR m.player2_id = ${userId}
      ORDER BY m.created_at DESC
      LIMIT 5
    `;
    console.log(`Found ${recentMatches.length} recent matches for user ${userId}`);

    // 3. Get Leaderboard (Top 5 by wins)
    const leaderboard = await sql`
      SELECT u.username, COUNT(m.winner_id) as wins
      FROM users u
      LEFT JOIN matches m ON u.id = m.winner_id
      GROUP BY u.id
      ORDER BY wins DESC
      LIMIT 5
    `;

    // Calculate rank (simple count of people with more wins)
    const rankResult = await sql`
      WITH UserWins AS (
        SELECT winner_id, COUNT(*) as wins FROM matches GROUP BY winner_id
      )
      SELECT COUNT(*) + 1 as rank 
      FROM UserWins 
      WHERE wins > ${totalWins}
    `;
    const rank = rankResult[0]?.rank || 1;

    res.json({
      stats: {
        rank,
        solves: totalWins, // Using wins as solves for now
        totalMatches,
        bestTime: "N/A", // Not tracking time yet
        avgTime: "N/A"
      },
      recentMatches: recentMatches.map(m => ({
        opponent: m.opponent_name,
        result: m.result,
        time: "N/A", // Not tracking time yet
        opponentTime: "N/A",
        date: m.created_at
      })),
      leaderboard: leaderboard.map((p, index) => ({
        rank: index + 1,
        name: p.username,
        time: `${p.wins} Wins`, // Display wins instead of time
        you: p.username === req.user.username
      }))
    });

  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
