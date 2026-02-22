# 2048with 프로젝트 구조 도식화

## 1. 프로젝트 폴더 구조

```
2048with/
├── 2048with_Client/              # Cocos Creator 3.8.8 클라이언트
│   ├── assets/
│   │   ├── Scripts/
│   │   │   ├── GameManager.ts    # 게임 핵심 로직
│   │   │   ├── RoomManager.ts    # 멀티플레이 방 관리
│   │   │   └── Tile.ts           # 타일 컴포넌트
│   │   ├── Scenes/
│   │   │   └── Main.scene
│   │   └── Prefabs/
│   │       └── Tile.prefab
│   └── build/web-mobile/
│
└── 2048with_Server/              # Node.js 서버
    ├── index.js                  # Express + Socket.IO
    ├── bestScore.json            # 최고 점수 저장
    └── web-mobile/               # 정적 빌드 파일 서빙
```

---

## 2. 컴포넌트 의존성 다이어그램

```mermaid
graph TB
    subgraph Client["클라이언트 (Cocos Creator)"]
        GM[GameManager]
        RM[RoomManager]
        Tile[Tile]
        
        GM --> Tile
        GM --> RM
    end
    
    subgraph Server["서버 (Node.js)"]
        Express[Express]
        SocketIO[Socket.IO]
        BestScore[bestScore.json]
        
        Express --> SocketIO
        SocketIO --> BestScore
    end
    
    GM <-->|Socket.IO| SocketIO
    RM <-->|Socket.IO| SocketIO
```

---

## 3. 클래스별 함수 구조

### 3.1 GameManager 함수 맵

```mermaid
graph TD
    subgraph Lifecycle["생명주기"]
        onLoad[onLoad]
        start[start]
    end
    
    subgraph Init["초기화"]
        initBoard[initBoard]
        setupInput[setupInput]
    end
    
    subgraph Input["입력 처리"]
        setupInput --> TOUCH_START[TOUCH_START]
        setupInput --> TOUCH_END[TOUCH_END]
        TOUCH_END --> move[move]
    end
    
    subgraph Move["이동 로직"]
        move --> getLine[getLine]
        move --> setLine[setLine]
        move --> mergeTiles[mergeTiles]
        move --> spawnTile[spawnTile]
    end
    
    subgraph Score["점수"]
        addScore[addScore]
        updateScoreDisplay[updateScoreDisplay]
        updateBestScoreDisplay[updateBestScoreDisplay]
        updatePartnerScoreDisplay[updatePartnerScoreDisplay]
        updateAllScoresDisplay[updateAllScoresDisplay]
    end
    
    subgraph ServerCom["서버 통신"]
        sendScoreToServer[sendScoreToServer]
        sendMoveToServer[sendMoveToServer]
        sendGameOverToServer[sendGameOverToServer]
    end
    
    subgraph GameState["게임 상태"]
        checkGameOver[checkGameOver]
        showGameOverPopup[showGameOverPopup]
        restartGame[restartGame]
    end
    
    onLoad --> initBoard
    onLoad --> setupInput
    start --> spawnTile
    mergeTiles --> addScore
    addScore --> updateScoreDisplay
    addScore --> sendScoreToServer
```

### 3.2 RoomManager 함수 맵

```mermaid
graph TD
    subgraph Lifecycle["생명주기"]
        onLoad[onLoad]
    end
    
    subgraph Init["초기화"]
        loadPlayerName[loadPlayerName]
        setupRoomListeners[setupRoomListeners]
        createLobbyUI[createLobbyUI]
        checkUrlAndJoinRoom[checkUrlAndJoinRoom]
    end
    
    subgraph RoomActions["방 액션"]
        onCreateRoom[onCreateRoom]
        joinRoom[joinRoom]
    end
    
    subgraph Listeners["소켓 리스너"]
        room_created[room_created]
        room_joined[room_joined]
        join_room_failed[join_room_failed]
        room_members[room_members]
        player_left_room[player_left_room]
        partner_score[partner_score]
        partner_game_over[partner_game_over]
    end
    
    subgraph UI["UI 제어"]
        showInviteSection[showInviteSection]
        hideLobbyPanel[hideLobbyPanel]
        updateStatus[updateStatus]
    end
    
    onLoad --> loadPlayerName
    onLoad --> setupRoomListeners
    onLoad --> createLobbyUI
    onLoad --> checkUrlAndJoinRoom
```

### 3.3 Tile 함수 맵

```mermaid
graph LR
    init[init]
    init --> value[value 설정]
    init --> sprite[sprite 설정]
```

---

## 4. 유저 동작별 입출력 플로우

### 4.1 스와이프 → 타일 이동 (핵심 게임 플로우)

```mermaid
sequenceDiagram
    participant User as 유저
    participant Input as setupInput
    participant GM as GameManager.move
    participant Board as getLine/setLine
    participant Merge as mergeTiles
    participant Spawn as spawnTile
    participant Server as Socket.IO
    participant UI as Label/Node

    User->>Input: 터치 시작 (TOUCH_START)
    Input->>Input: startPos 저장
    
    User->>Input: 터치 끝 (TOUCH_END)
    Input->>Input: delta 계산 (50px 이상)
    Input->>GM: move("LEFT"|"RIGHT"|"UP"|"DOWN")
    
    loop 각 행/열 (r=0~3)
        GM->>Board: getLine(r, direction)
        Board-->>GM: [Tile|null, ...]
        GM->>GM: filter null, merge 인접 동일값
        GM->>Merge: mergeTiles(target, source, newValue)
        Merge->>UI: addScore → updateScoreDisplay
        Merge->>Server: sendScoreToServer
        GM->>Board: setLine(r, direction, filtered)
    end
    
    GM->>Server: sendMoveToServer(direction, boardState)
    GM->>Spawn: scheduleOnce(spawnTile, 0.15s)
    Spawn->>UI: 새 타일 생성 + tween
    Spawn->>GM: checkGameOver
```

### 4.2 방 생성/참가 플로우

```mermaid
sequenceDiagram
    participant User as 유저
    participant RM as RoomManager
    participant Socket as Socket.IO
    participant Server as index.js

    alt 방 생성
        User->>RM: "방 만들기" 클릭
        RM->>Socket: emit("create_room", {name})
        Socket->>Server: create_room
        Server->>Server: createRoom() → roomId 생성
        Server->>Socket: emit("room_created", {roomId})
        Socket->>RM: room_created
        RM->>RM: showInviteSection() (초대 링크 표시)
    end
    
    alt 방 참가 (URL 파라미터)
        User->>RM: ?room=abc123 접속
        RM->>RM: checkUrlAndJoinRoom()
        RM->>Socket: emit("join_room", {roomId, name})
        Socket->>Server: join_room
        alt 성공
            Server->>Socket: emit("room_joined", {roomId, playerCount})
            Socket->>RM: room_joined
            RM->>RM: hideLobbyPanel()
        else 실패 (방 없음/만석)
            Server->>Socket: emit("join_room_failed", {reason})
            Socket->>RM: join_room_failed
            RM->>RM: updateStatus("방이 없거나...")
        end
    end
```

### 4.3 점수 동기화 플로우 (멀티플레이)

```mermaid
sequenceDiagram
    participant P1 as 플레이어1
    participant GM1 as GameManager(P1)
    participant Socket as Socket.IO
    participant Server as index.js
    participant GM2 as GameManager(P2)

    P1->>GM1: 타일 합치기 (mergeTiles)
    GM1->>GM1: addScore(points)
    GM1->>GM1: updateScoreDisplay()
    GM1->>Socket: emit("score_update", {score})
    Socket->>Server: score_update
    
    Server->>Server: roomId 확인
    Server->>Socket: socket.to(roomId).emit("partner_score", {...})
    Socket->>GM2: partner_score 이벤트
    GM2->>GM2: updatePartnerScoreDisplay() (0.2초마다 스케줄)
    GM2->>GM2: updateAllScoresDisplay()
```

### 4.4 게임 오버 플로우

```mermaid
flowchart TD
    A[spawnTile 호출] --> B[scheduleOnce checkGameOver 0.2초]
    B --> C{빈 칸 있음?}
    C -->|Yes| D[계속 진행]
    C -->|No| E{합칠 수 있는 쌍 있음?}
    E -->|Yes| D
    E -->|No| F[showGameOverPopup]
    F --> G[팝업 표시]
    F --> H[sendGameOverToServer]
    H --> I[서버: bestScore 갱신?]
    I -->|Yes| J[io.emit best_score]
    I -->|No| K[종료]
    H --> L[partner_game_over 전달]
    L --> M[상대방 UI에 게임오버 표시]
```

---

## 5. 서버 이벤트 입출력 매트릭스

| 클라이언트 → 서버 | 서버 처리 | 서버 → 클라이언트 |
|------------------|----------|-------------------|
| `create_room` {name} | createRoom(), broadcastRoomMembers | `room_created` {roomId} |
| `join_room` {roomId, name} | joinRoom() | `room_joined` {roomId, playerCount} / `join_room_failed` {reason} |
| `leave_room` | leaveRoom() | `player_left_room` {leftSocketId, playerCount} |
| `score_update` {score} | roomId 확인 | `partner_score` {socketId, score, name} (같은 방에만) |
| `game_over` {score} | bestScore 갱신, saveBestScore | `partner_game_over` {socketId, score, name} / `best_score` (전체) |
| `tile_move` {direction, boardState} | 로깅만 | - |
| (connection) | loadBestScore() | `best_score` {score} |

---

## 6. 전체 게임 라이프사이클

```mermaid
stateDiagram-v2
    [*] --> 로딩: 앱 시작
    로딩 --> 로비: onLoad 완료
    로비 --> 방생성: 방 만들기
    로비 --> 방참가: URL로 입장
    방생성 --> 게임중: room_created
    방참가 --> 게임중: room_joined
    
    게임중 --> 스와이프대기: start() → spawnTile x2
    스와이프대기 --> 이동처리: move(direction)
    이동처리 --> 머지: mergeTiles
    이동처리 --> 스폰: spawnTile
    머지 --> 스폰: addScore, spawnTile
    스폰 --> 체크: checkGameOver
    체크 --> 스와이프대기: 계속 가능
    체크 --> 게임오버: 불가능
    
    게임오버 --> 게임중: 재시작
    게임오버 --> [*]: 종료
```

---

## 7. 데이터 흐름 요약

```
[유저 입력]
    │
    ├─ 터치 스와이프 ──→ setupInput ──→ move() ──→ getLine/setLine/mergeTiles
    │                                              │
    │                                              ├─→ addScore ──→ UI 갱신
    │                                              ├─→ sendMoveToServer
    │                                              └─→ spawnTile ──→ checkGameOver
    │
    └─ 방 만들기/참가 ──→ RoomManager ──→ Socket.IO ──→ Server
                                                          │
                                                          └─→ partner_score, room_members 등
```

---

*이 문서는 프로젝트 코드 분석을 바탕으로 자동 생성되었습니다.*
