import { _decorator, Component, Node, SpriteFrame, Prefab, instantiate, Vec2, Vec3, v2, v3, input, Input, EventTouch, log, tween, Label, director } from 'cc';
import { Tile } from './Tile';
import { RoomManager } from './RoomManager';

const { ccclass, property } = _decorator;

declare const io: any;

@ccclass('GameManager')
export class GameManager extends Component {
    @property([SpriteFrame])
    public tileImages: SpriteFrame[] = [];

    @property(Prefab)
    public tilePrefab: Prefab = null!;

    @property(Node)
    public boardNode: Node = null!;
	
	@property(Node)
	public gameOverPopup: Node = null!;

	@property(Label)
	public bestScoreLabel: Label = null!;

	@property(Label)
	public scoreLabel: Label = null!;

	@property(Node)
	public scorePanelNode: Node = null!;

	@property([Label])
	public scoreLabels: Label[] = [];

    private board: (Tile | null)[][] = [];
	private roomManager: RoomManager | null = null;
	private score: number = 0;
    private readonly GRID_SIZE = 4;
    private socket: any = null;
    private readonly CELL_SIZE = 110;
    private readonly SPACING = 10;

    onLoad() {
        this.initBoard();
        this.setupInput();
        this.roomManager = director.getScene()!.getComponentInChildren(RoomManager);
        if (!this.roomManager) {
            const canvas = director.getScene()!.getChildByName("Canvas");
            if (canvas) {
                const rmNode = new Node("RoomManager");
                canvas.addChild(rmNode);
                this.roomManager = rmNode.addComponent(RoomManager);
            }
        }
        this.socket = this.roomManager ? this.roomManager.getSocket() : io();
        this.socket.on("best_score", (score: number) => {
            this.updateBestScoreDisplay(score);
        });
    }

    start() {
        this.score = 0;
        this.updateScoreDisplay();
        if (this.scorePanelNode) this.scorePanelNode.active = false;
        this.updatePartnerScoreDisplay();
        this.schedule(this.updatePartnerScoreDisplay.bind(this), 0.2);
        this.spawnTile();
        this.spawnTile();
    }

    initBoard() {
        for (let r = 0; r < this.GRID_SIZE; r++) {
            this.board[r] = [];
            for (let c = 0; c < this.GRID_SIZE; c++) {
                this.board[r][c] = null;
            }
        }
    }
	
    private startPos: Vec2 = v2();

	setupInput() {
		input.on(Input.EventType.TOUCH_START, (event: EventTouch) => {
			this.startPos = event.getLocation();
		}, this);

		input.on(Input.EventType.TOUCH_END, (event: EventTouch) => {
			const endPos = event.getLocation();
			const delta = endPos.subtract(this.startPos);
			if (delta.length() > 50) {
				if (Math.abs(delta.x) > Math.abs(delta.y)) {
					delta.x > 0 ? this.move("RIGHT") : this.move("LEFT");
				} else {
					delta.y > 0 ? this.move("UP") : this.move("DOWN");
				}
			}
		}, this);
	}

    spawnTile() {
		let emptyCells = [];
		for (let r = 0; r < this.GRID_SIZE; r++) {
			for (let c = 0; c < this.GRID_SIZE; c++) {
				if (this.board[r][c] === null) emptyCells.push({ r, c });
			}
		}

		if (emptyCells.length > 0) {
			const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
			const newTileNode = instantiate(this.tilePrefab);
			this.boardNode.addChild(newTileNode);

			const tileComp = newTileNode.getComponent(Tile)!;
			const isFour = Math.random() > 0.8; 
			const newValue = isFour ? 4 : 2;
			const spriteIndex = isFour ? 1 : 0;
			
			tileComp.init(newValue, this.tileImages[spriteIndex]);

			this.board[r][c] = tileComp;
			newTileNode.setPosition(this.getPosByRC(r, c));

			newTileNode.setScale(v3(0, 0, 0));
			tween(newTileNode)
				.to(0.1, { scale: v3(1, 1, 1) })
				.start();
		}
		this.scheduleOnce(() => {
			this.checkGameOver();
		}, 0.2);
	}

    getPosByRC(r: number, c: number): Vec3 {
        const x = (c - 1.5) * (this.CELL_SIZE + this.SPACING);
        const y = (r - 1.5) * (this.CELL_SIZE + this.SPACING);
        return v3(x, y, 0);
    }

    move(direction: string) {
		let hasMoved = false;

		for (let r = 0; r < 4; r++) {
			let row = this.getLine(r, direction); 
			let filtered = row.filter(tile => tile !== null) as Tile[];
			
			for (let i = 0; i < filtered.length - 1; i++) {
				if (filtered[i] && filtered[i + 1] && filtered[i].value === filtered[i + 1].value) {
					const newValue = filtered[i].value * 2;
					this.mergeTiles(filtered[i], filtered[i + 1], newValue);
					filtered.splice(i + 1, 1); 
					hasMoved = true;
				}
			}

			while (filtered.length < 4) {
				filtered.push(null);
			}

			if (this.setLine(r, direction, filtered)) {
				hasMoved = true;
			}
		}

		if (hasMoved) {
			this.sendMoveToServer(direction);
			this.scheduleOnce(() => {
				this.spawnTile();
			}, 0.15);
		}
	}

	private getBoardState(): number[][] {
		const state: number[][] = [];
		for (let r = 0; r < this.GRID_SIZE; r++) {
			state[r] = [];
			for (let c = 0; c < this.GRID_SIZE; c++) {
				state[r][c] = this.board[r][c] ? this.board[r][c]!.value : 0;
			}
		}
		return state;
	}

	private addScore(points: number) {
		this.score += points;
		this.updateScoreDisplay();
		this.sendScoreToServer();
	}

	private updateScoreDisplay() {
		if (this.scoreLabel) {
			this.scoreLabel.string = this.score.toString();
		}
		this.updateAllScoresDisplay();
	}

	private updateBestScoreDisplay(score: number) {
		if (this.bestScoreLabel) {
			this.bestScoreLabel.string = score.toString();
		}
	}

	private updatePartnerScoreDisplay() {
		this.updateAllScoresDisplay();
	}

	private updateAllScoresDisplay() {
		const showPanel = this.roomManager?.shouldShowScorePanel();
		const playerCount = this.roomManager?.getPlayerCount() ?? 0;
		if (this.scorePanelNode) {
			this.scorePanelNode.active = !!showPanel;
		}
		if (!showPanel || this.scoreLabels.length < 4) return;
		const myName = this.roomManager!.getMyName();
		const partnerList = this.roomManager!.getPartnerScoreList();
		for (let i = 0; i < 4; i++) {
			const label = this.scoreLabels[i];
			if (!label?.node) continue;
			if (i < playerCount) {
				label.node.active = true;
				label.string = i === 0 ? `${myName}: ${this.score}` : `${partnerList[i - 1]?.name ?? "플레이어"}: ${partnerList[i - 1]?.score ?? 0}`;
			} else {
				label.node.active = false;
			}
		}
	}

	private sendScoreToServer() {
		if (!this.socket?.connected || !this.roomManager?.isInRoom()) return;
		this.socket.emit("score_update", { score: this.score });
	}

	private sendMoveToServer(direction: string) {
		if (!this.socket?.connected) return;
		this.socket.emit("tile_move", {
			direction,
			boardState: this.getBoardState(),
		});
	}
	
	getLine(idx: number, direction: string): (Tile | null)[] {
		let line: (Tile | null)[] = [];
		for (let i = 0; i < 4; i++) {
			if (direction === "LEFT") line.push(this.board[idx][i]);
			else if (direction === "RIGHT") line.push(this.board[idx][3 - i]);
			else if (direction === "UP") line.push(this.board[3 - i][idx]);
			else line.push(this.board[i][idx]);
		}
		return line;
	}

	setLine(idx: number, direction: string, newLine: (Tile | null)[]): boolean {
		let changed = false;
		for (let i = 0; i < 4; i++) {
			let r, c;
			if (direction === "LEFT") { r = idx; c = i; }
			else if (direction === "RIGHT") { r = idx; c = 3 - i; }
			else if (direction === "UP") { r = 3 - i; c = idx; }
			else { r = i; c = idx; }

			if (this.board[r][c] !== newLine[i]) {
				this.board[r][c] = newLine[i];
				if (this.board[r][c]) {
					tween(this.board[r][c].node)
						.to(0.1, { position: this.getPosByRC(r, c) })
						.start();
				}
				changed = true;
			}
		}
		return changed;
	}
	
	
	mergeTiles(target: Tile, source: Tile, newValue: number) {
		if (!source || !source.node) {
			log("병합할 소스 타일이 없습니다.");
			return;
		}

		this.addScore(newValue);

		tween(source.node)
			.to(0.1, { position: target.node.position })
			.call(() => {
				if (source.node && source.node.isValid) {
					source.node.destroy();
				}
			})
			.start();
		
		const spriteIndex = Math.round(Math.log2(newValue)) - 1;
		if (this.tileImages[spriteIndex]) {
			target.init(newValue, this.tileImages[spriteIndex]);
		}
		
		tween(target.node)
			.to(0.05, { scale: v3(1.2, 1.2, 1) })
			.to(0.05, { scale: v3(1, 1, 1) })
			.start();
	}
	
	checkGameOver() {
		for (let r = 0; r < this.GRID_SIZE; r++) {
			for (let c = 0; c < this.GRID_SIZE; c++) {
				if (this.board[r][c] === null) return;
			}
		}

		for (let r = 0; r < this.GRID_SIZE; r++) {
			for (let c = 0; c < this.GRID_SIZE; c++) {
				const current = this.board[r][c]!.value;
				if (c + 1 < this.GRID_SIZE && current === this.board[r][c + 1]!.value) return;
				if (r + 1 < this.GRID_SIZE && current === this.board[r + 1][c]!.value) return;
			}
		}

		this.showGameOverPopup();
	}
	
	showGameOverPopup() {
		this.sendGameOverToServer();
		this.gameOverPopup.active = true;
	}

	private sendGameOverToServer() {
		if (!this.socket?.connected) return;
		this.socket.emit("game_over", { score: this.score });
		this.sendScoreToServer();
	}

	restartGame() {
		this.gameOverPopup.active = false;

		this.score = 0;
		this.updateScoreDisplay();

		for (let r = 0; r < this.GRID_SIZE; r++) {
			for (let c = 0; c < this.GRID_SIZE; c++) {
				if (this.board[r][c]) {
					this.board[r][c]!.node.destroy();
					this.board[r][c] = null;
				}
			}
		}

		this.spawnTile();
		this.spawnTile();
	}
}
