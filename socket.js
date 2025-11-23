import { sql } from './db.js';

// Use an object to manage queues for different sizes (e.g., "3": [], "4": [])
const queues = {};
const activeRooms = new Map();
const socketUserMap = new Map(); // Map socket.id -> user.id

function generateScramble(length = 20, size = 3) {
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const scramble = [];
    let lastFace = '';
    for (let i = 0; i < length; i++) {
        let face;
        do {
            face = faces[Math.floor(Math.random() * faces.length)];
        } while (face === lastFace);
        lastFace = face;
        const clockwise = Math.random() > 0.5;
        const maxSlice = Math.floor(size / 2) - 1;
        const sliceIndex = Math.floor(Math.random() * (maxSlice + 1));

        scramble.push({ face, sliceIndex, clockwise });
    }
    return scramble;
}

export default function initSockets(io) {
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);
        // NOTE: We do NOT push to waitingUsers here anymore.
        // We wait for the "join_queue" event.

        // --- JOIN QUEUE ---
        socket.on("join_queue", ({ size, userId }) => {
            const s = size || 3; // Default to 3

            if (userId) {
                socketUserMap.set(socket.id, userId);
            }

            // Remove from ALL queues first to prevent duplicates or multiple queue entries
            Object.keys(queues).forEach(key => {
                const wasInQueue = queues[key].some(s => s.id === socket.id);
                if (wasInQueue) {
                    console.log(`Removing user ${socket.id} from queue ${key}`);
                    queues[key] = queues[key].filter(s => s.id !== socket.id);
                }
            });

            if (!queues[s]) queues[s] = [];

            console.log(`User ${socket.id} (ID: ${userId}) joined ${s}x${s} queue. Queue length: ${queues[s].length + 1}`);
            queues[s].push(socket);

            // Check if we have a match for THIS size
            if (queues[s].length >= 2) {
                const [p1, p2] = queues[s].splice(0, 2);
                const roomId = `${p1.id}-${p2.id}`;

                p1.join(roomId);
                p2.join(roomId);

                activeRooms.set(roomId, { players: [p1.id, p2.id], size: s });

                // Generate scramble (length can depend on size if you want)
                const scrambleLength = s === 2 ? 10 : 20;
                const scramble = generateScramble(scrambleLength, s);



                io.to(roomId).emit("game:start", {
                    roomId,
                    players: [p1.id, p2.id],
                    scramble,
                    cubeSize: s // <--- Send the agreed size back to clients
                });
                console.log(`Game started: ${roomId} (${s}x${s})`);
            }
        });

        socket.on("move", ({ roomId, move }) => {
            // Relay move to the other player in the room
            socket.to(roomId).emit("opponent:move", move);
        });

        socket.on("game:won", async ({ roomId }) => {
            // Atomic check: If room is already gone from activeRooms, it means someone else won already.
            const roomData = activeRooms.get(roomId);
            if (!roomData) {
                console.log(`Ignored game:won from ${socket.id} for room ${roomId} (Room not active)`);
                return;
            }

            // Remove immediately to prevent race conditions
            activeRooms.delete(roomId);

            console.log(`Game won by ${socket.id} in room ${roomId}`);
            io.to(roomId).emit("game:over", { winnerId: socket.id });

            // Save match result
            if (roomData && roomData.players && roomData.players.length === 2) {
                const players = roomData.players;
                const p1SocketId = players[0];
                const p2SocketId = players[1];
                const p1UserId = socketUserMap.get(p1SocketId);
                const p2UserId = socketUserMap.get(p2SocketId);
                const winnerUserId = socketUserMap.get(socket.id);
                const cubeSize = roomData.size || 3;

                // Only save if we have user IDs (authenticated users)
                if (p1UserId && p2UserId && winnerUserId) {
                    try {
                        await sql`
                            INSERT INTO matches (player1_id, player2_id, winner_id, cube_size)
                            VALUES (${p1UserId}, ${p2UserId}, ${winnerUserId}, ${cubeSize})
                        `;
                        console.log(`Match saved: P1(${p1UserId}) vs P2(${p2UserId}) Winner(${winnerUserId}) Size(${cubeSize})`);
                    } catch (err) {
                        console.error("Error saving match:", err);
                    }
                }
            }
        });

        socket.on("disconnect", () => {
            // Remove user from ALL queues
            Object.keys(queues).forEach(size => {
                queues[size] = queues[size].filter(s => s.id !== socket.id);
            });

            // Handle active room disconnects
            let disconnectedRoomId = null;
            for (const [roomId, data] of activeRooms.entries()) {
                const players = data.players || data; // Handle both new and old structure just in case

                if (Array.isArray(players) && players.includes(socket.id)) {
                    disconnectedRoomId = roomId;
                    break;
                }
            }
            if (disconnectedRoomId) {
                io.to(disconnectedRoomId).emit("opponent:left");
                activeRooms.delete(disconnectedRoomId);
            }

            socketUserMap.delete(socket.id);
        });
    });
}