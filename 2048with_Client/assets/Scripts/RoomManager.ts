import { _decorator, Component, Node, Label, UITransform, director, log, BlockInputEvents } from 'cc';

const { ccclass, property } = _decorator;

declare const io: any;

const STORAGE_KEY = "2048_playerName";

@ccclass('RoomManager')
export class RoomManager extends Component {
    private socket: any = null;
    private roomId: string = "";
    private myName: string = "플레이어";
    private playerCount: number = 0;
    private partnerScores: Map<string, number> = new Map();
    private partnerNames: Map<string, string> = new Map();
    private partnerOrder: string[] = [];

    private lobbyPanel: Node = null!;
    private createRoomBtn: Node = null!;
    private inviteSection: Node = null!;
    private inviteLinkLabel: Label = null!;
    private copyBtn: Node = null!;
    private statusLabel: Label = null!;

    onLoad() {
        this.loadPlayerName();
        this.socket = io();
        this.setupRoomListeners();
        this.createLobbyUI();
        this.checkUrlAndJoinRoom();
    }

    private loadPlayerName() {
        if (typeof localStorage === "undefined") return;
        let name = localStorage.getItem(STORAGE_KEY);
        if (!name || !name.trim()) {
            name = prompt("이름을 입력해주세요")?.trim() || "플레이어";
            if (name) localStorage.setItem(STORAGE_KEY, name);
        }
        this.myName = name || "플레이어";
    }

    private setupRoomListeners() {
        this.socket.on("room_created", (data: { roomId: string }) => {
            this.roomId = data.roomId;
            this.playerCount = 1;
            this.showInviteSection();
        });

        this.socket.on("room_joined", (data: { roomId: string; playerCount: number }) => {
            this.roomId = data.roomId;
            this.playerCount = data.playerCount;
            this.hideLobbyPanel();
            log("방 입장 성공:", data.roomId, "인원:", data.playerCount);
        });

        this.socket.on("join_room_failed", (data: { reason: string }) => {
            log("방 입장 실패:", data.reason);
            this.updateStatus("방이 없거나 인원이 가득 찼습니다.");
        });

        this.socket.on("room_members", (data: { members: { socketId: string; name: string }[] }) => {
            this.playerCount = data.members.length;
            this.partnerOrder = data.members.filter(m => m.socketId !== this.socket.id).map(m => m.socketId);
            this.partnerNames.clear();
            for (const m of data.members) {
                if (m.socketId !== this.socket.id) {
                    this.partnerNames.set(m.socketId, m.name);
                }
            }
            this.updateStatus(`플레이어 ${this.playerCount}명 (${this.playerCount}/4)`);
        });

        this.socket.on("player_left_room", (data?: { leftSocketId?: string; playerCount?: number }) => {
            if (data?.leftSocketId) {
                this.partnerScores.delete(data.leftSocketId);
                this.partnerNames.delete(data.leftSocketId);
                this.partnerOrder = this.partnerOrder.filter(id => id !== data!.leftSocketId);
            }
            if (data?.playerCount !== undefined) {
                this.playerCount = data.playerCount;
            } else {
                this.playerCount = Math.max(0, this.playerCount - 1);
            }
            this.updateStatus("플레이어가 나갔습니다.");
        });

        this.socket.on("partner_score", (data: { socketId: string; score: number; name?: string }) => {
            this.partnerScores.set(data.socketId, data.score);
            if (data.name) this.partnerNames.set(data.socketId, data.name);
        });

        this.socket.on("partner_game_over", (data: { socketId: string; score: number; name?: string }) => {
            this.partnerScores.set(data.socketId, data.score);
            if (data.name) this.partnerNames.set(data.socketId, data.name);
        });
    }

    private createLobbyUI() {
        const canvas = this.node.parent || director.getScene()!.getChildByName("Canvas");
        if (!canvas) return;

        this.lobbyPanel = new Node("LobbyPanel");
        canvas.addChild(this.lobbyPanel);
        const panelTransform = this.lobbyPanel.addComponent(UITransform);
        panelTransform.setContentSize(720, 400);
        this.lobbyPanel.setPosition(0, 200, 0);

        this.createRoomBtn = new Node("CreateRoomBtn");
        this.lobbyPanel.addChild(this.createRoomBtn);
        const btnTransform = this.createRoomBtn.addComponent(UITransform);
        btnTransform.setContentSize(200, 60);
        this.createRoomBtn.setPosition(0, 80, 0);
        this.createRoomBtn.addComponent(BlockInputEvents);
        const btnLabelNode = new Node("Label");
        this.createRoomBtn.addChild(btnLabelNode);
        const btnLabel = btnLabelNode.addComponent(Label);
        btnLabel.string = "방 만들기";
        btnLabel.fontSize = 28;
        btnLabelNode.addComponent(UITransform).setContentSize(200, 60);
        this.createRoomBtn.on(Node.EventType.TOUCH_END, this.onCreateRoom, this);

        this.inviteSection = new Node("InviteSection");
        this.lobbyPanel.addChild(this.inviteSection);
        this.inviteSection.setPosition(0, -20, 0);
        this.inviteSection.active = false;

        const linkLabelNode = new Node("InviteLink");
        this.inviteSection.addChild(linkLabelNode);
        this.inviteLinkLabel = linkLabelNode.addComponent(Label);
        this.inviteLinkLabel.string = "";
        this.inviteLinkLabel.fontSize = 18;
        this.inviteLinkLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        linkLabelNode.addComponent(UITransform).setContentSize(400, 40);
        linkLabelNode.setPosition(0, 30, 0);

        this.copyBtn = new Node("CopyBtn");
        this.inviteSection.addChild(this.copyBtn);
        this.copyBtn.addComponent(UITransform).setContentSize(120, 40);
        this.copyBtn.setPosition(0, -30, 0);
        this.copyBtn.addComponent(BlockInputEvents);
        const copyLabelNode = new Node("Label");
        this.copyBtn.addChild(copyLabelNode);
        const copyLabel = copyLabelNode.addComponent(Label);
        copyLabel.string = "링크 복사";
        copyLabel.fontSize = 20;
        copyLabelNode.addComponent(UITransform).setContentSize(120, 40);
        this.copyBtn.on(Node.EventType.TOUCH_END, this.onCopyLink, this);

        const statusNode = new Node("Status");
        this.inviteSection.addChild(statusNode);
        this.statusLabel = statusNode.addComponent(Label);
        this.statusLabel.string = "친구를 초대해보세요!";
        this.statusLabel.fontSize = 22;
        statusNode.addComponent(UITransform).setContentSize(400, 30);
        statusNode.setPosition(0, -80, 0);
    }

    private showInviteSection() {
        this.createRoomBtn.active = false;
        this.inviteSection.active = true;
        this.inviteLinkLabel.string = this.getInviteLink();
        this.updateStatus("친구를 초대해보세요! (1/4)");
    }

    private getInviteLink(): string {
        if (typeof window === "undefined") return `?room=${this.roomId}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", this.roomId);
        return url.toString();
    }

    private updateStatus(text: string) {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private hideLobbyPanel() {
        this.lobbyPanel.active = false;
    }

    private checkUrlAndJoinRoom() {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const room = params.get("room");
        if (room) {
            this.createRoomBtn.active = false;
            this.inviteSection.active = true;
            this.inviteLinkLabel.string = "";
            this.updateStatus("방 입장 중...");
            this.joinRoom(room);
        }
    }

    onCreateRoom() {
        this.socket.emit("create_room", { name: this.myName });
    }

    private onCopyLink() {
        const link = this.getInviteLink();
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(link).then(() => {
                this.updateStatus("링크가 복사되었습니다!");
            });
        }
    }

    joinRoom(roomId: string) {
        this.socket.emit("join_room", { roomId, name: this.myName });
        this.updateStatus("방 입장 중...");
    }

    getSocket() { return this.socket; }
    isInRoom() { return !!this.roomId; }
    shouldShowScorePanel() { return this.roomId && this.playerCount >= 2; }
    getPlayerCount() { return this.playerCount; }
    getRoomId() { return this.roomId; }
    getMyName() { return this.myName; }
    getPartnerScoreList(): { name: string; score: number }[] {
        return this.partnerOrder.map(socketId => ({
            name: this.partnerNames.get(socketId) || "플레이어",
            score: this.partnerScores.get(socketId) ?? 0
        }));
    }
}
