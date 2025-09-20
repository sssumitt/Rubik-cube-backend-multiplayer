let waitingUsers = [];
const activeRooms = new Map(); // Keep track of rooms

export default function initSockets(io) {
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        // Add user to the waiting queue
        waitingUsers.push(socket);

        // If there are enough players, start a new game
        if (waitingUsers.length >= 2) {
            const [p1, p2] = waitingUsers.splice(0, 2); // Pull the first two users
            const roomId = `${p1.id}-${p2.id}`;

            // Both players join the room
            p1.join(roomId);
            p2.join(roomId);

            // Store room info
            activeRooms.set(roomId, [p1.id, p2.id]);

            // Emit the game start event to both players
            io.to(roomId).emit("game:start", {
                roomId,
                players: [p1.id, p2.id],
            });

            console.log(`Game started in room ${roomId}`);
        }

        // Listen for moves from a player
        socket.on("move", ({ roomId, move }) => {
            // Check if the room actually exists before broadcasting
            if (activeRooms.has(roomId)) {
                // Send the move to the other player in the room
                socket.to(roomId).emit("opponent:move", move);
            }
        });

        // Handle user disconnection
        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);

            // First, remove the user from the waiting queue if they are in it
            waitingUsers = waitingUsers.filter(s => s.id !== socket.id);

            // --- NEW: Handle in-game disconnect ---
            // Find which room, if any, the disconnected user was in
            let disconnectedRoomId = null;
            for (const [roomId, players] of activeRooms.entries()) {
                if (players.includes(socket.id)) {
                    disconnectedRoomId = roomId;
                    break;
                }
            }
            
            if (disconnectedRoomId) {
                // Notify the remaining player that their opponent has left
                io.to(disconnectedRoomId).emit("opponent:left");
                
                // Clean up the room since the game is over
                activeRooms.delete(disconnectedRoomId);
                console.log(`Cleaned up room ${disconnectedRoomId} after disconnect.`);
            }
        });
    });
}
