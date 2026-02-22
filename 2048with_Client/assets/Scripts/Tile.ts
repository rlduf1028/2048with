import { _decorator, Component, Sprite, SpriteFrame, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Tile')
export class Tile extends Component {
    @property(Sprite)
    tileSprite: Sprite = null!;
    
    public value: number = 0;

    // GameManager에서 호출하여 이미지와 숫자를 업데이트
    init(value: number, spriteFrame: SpriteFrame) {
        this.value = value;
        this.tileSprite.spriteFrame = spriteFrame;
    }
}