const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 1. 기존 2048 빌드 파일들이 있는 폴더 연결 (예: build/web-desktop)
app.use(express.static(path.join(__dirname, 'web-mobile'))); 

// 최고 점수 저장 파일
const DATA_FILE = path.join(__dirname, 'bestScore.json');

// 역대 최고 점수 (파일에서 로드, 갱신 시 파일에 저장)
let bestScore = 0;

function loadBestScore() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            bestScore = data.bestScore ?? 0;
        }
    } catch (err) {
        console.warn("최고 점수 로드 실패:", err.message);
    }
}

function saveBestScore() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ bestScore }, null, 2), 'utf8');
    } catch (err) {
        console.warn("최고 점수 저장 실패:", err.message);
    }
}

// ========== 방(Room) 관리 ==========
const rooms = {}; // roomId -> { players: Set<socketId>, playerNames: { socketId: name } }
const socketToRoom = {}; // socketId -> roomId
const MAX_PLAYERS_PER_ROOM = 4;

function getRoomMembers(roomId) {
    if (!rooms[roomId]) return [];
    return Array.from(rooms[roomId].players).map(sid => ({
        socketId: sid,
        name: rooms[roomId].playerNames?.[sid] || "플레이어"
    }));
}

function broadcastRoomMembers(roomId) {
    const members = getRoomMembers(roomId);
    io.to(roomId).emit("room_members", { members });
}

function generateRoomId() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let id = "";
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function createRoom(socket, name) {
    let roomId;
    do { roomId = generateRoomId(); } while (rooms[roomId]);
    rooms[roomId] = {
        players: new Set([socket.id]),
        playerNames: { [socket.id]: name || "플레이어" }
    };
    socketToRoom[socket.id] = roomId;
    socket.join(roomId);
    return roomId;
}

function joinRoom(socket, roomId, name) {
    if (!rooms[roomId]) return false;
    if (rooms[roomId].players.size >= MAX_PLAYERS_PER_ROOM) return false;
    rooms[roomId].players.add(socket.id);
    if (!rooms[roomId].playerNames) rooms[roomId].playerNames = {};
    rooms[roomId].playerNames[socket.id] = name || "플레이어";
    socketToRoom[socket.id] = roomId;
    socket.join(roomId);
    return true;
}

function leaveRoom(socket) {
    const roomId = socketToRoom[socket.id];
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].players.delete(socket.id);
    if (rooms[roomId].playerNames) delete rooms[roomId].playerNames[socket.id];
    delete socketToRoom[socket.id];
    socket.leave(roomId);
    if (rooms[roomId].players.size === 0) delete rooms[roomId];
}

// 클라이언트 IP 추출 (프록시/ngrok 환경 고려)
function getClientIp(socket) {
    const forwarded = socket.handshake.headers["x-forwarded-for"];
    if (forwarded) {
        return forwarded.split(",")[0].trim(); // 첫 번째 IP가 실제 클라이언트
    }
    return socket.handshake.address || socket.conn?.remoteAddress || "알 수 없음";
}

// 2. 소켓 로직
io.on("connection", (socket) => {
    const clientIp = getClientIp(socket);
    const accessTime = new Date(socket.handshake.time || Date.now()).toLocaleString("ko-KR");
    const userAgent = socket.handshake.headers["user-agent"] || "알 수 없음";

    console.log("유저 접속:", { 접속시각: accessTime, IP: clientIp, "User-Agent": userAgent });

    // 접속 시 현재 최고 점수 전달
    socket.emit("best_score", bestScore);

    // ========== 방 생성 ==========
    socket.on("create_room", (data) => {
        const name = (data && data.name) || "플레이어";
        const roomId = createRoom(socket, name);
        socket.emit("room_created", { roomId });
        broadcastRoomMembers(roomId);
    });

    // ========== 방 참가 (URL의 room 파라미터로 입장) ==========
    socket.on("join_room", (data) => {
        const { roomId, name } = data || {};
        if (!roomId) {
            socket.emit("join_room_failed", { reason: "room_id_required" });
            return;
        }
        if (joinRoom(socket, roomId, name || "플레이어")) {
            const playerCount = rooms[roomId].players.size;
            socket.emit("room_joined", { roomId, playerCount });
            broadcastRoomMembers(roomId);
        } else {
            socket.emit("join_room_failed", { reason: "room_full_or_invalid" });
        }
    });

    // ========== 방 나가기 ==========
    socket.on("leave_room", () => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            const leftSocketId = socket.id;
            leaveRoom(socket);
            const count = rooms[roomId] ? rooms[roomId].players.size : 0;
            socket.to(roomId).emit("player_left_room", { leftSocketId, playerCount: count });
        }
    });

    // ========== 점수 업데이트 (방 내 다른 플레이어에게만 전송) ==========
    socket.on("score_update", (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const name = rooms[roomId].playerNames?.[socket.id] || "플레이어";
            socket.to(roomId).emit("partner_score", { socketId: socket.id, score: data.score, name });
        }
    });

    // ========== 게임오버 (방 내 전달) ==========
    socket.on("game_over", (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const name = rooms[roomId].playerNames?.[socket.id] || "플레이어";
            socket.to(roomId).emit("partner_game_over", { socketId: socket.id, score: data.score, name });
        }
        console.log("게임오버:", { IP: clientIp, 최종점수: data.score });
        if (data.score > bestScore) {
            bestScore = data.score;
            saveBestScore();
            io.emit("best_score", bestScore);
        }
    });

    socket.on("disconnect", () => {
        const roomId = socketToRoom[socket.id];
        const leftSocketId = socket.id;
        leaveRoom(socket);
        if (roomId && rooms[roomId]) {
            socket.to(roomId).emit("player_left_room", { leftSocketId, playerCount: rooms[roomId].players.size });
        }
    });

    // 클라이언트에서 타일 이동 시 전달되는 데이터 수신 (로깅용)
    socket.on("tile_move", (data) => {
        console.log(`[${clientIp}] 이동:`, data.direction, "| 보드:", JSON.stringify(data.boardState));
    });
});

// 3. 8080 포트 하나만 사용
loadBestScore();
server.listen(8080, () => {
    console.log("게임 & 소켓 서버가 8080에서 실행 중! (최고점수:", bestScore, ")");
});