# 4명 점수 표시 UI 설정 가이드

방에 입장했을 때 **나 포함 총 4명**의 점수가 보이도록 Cocos Creator에서 UI를 설정하는 방법입니다.

---

## 1. 부모 노드 + Label 4개 만들기

1. **계층 구조**에서 Canvas 선택
2. **우클릭** → **빈 노드 생성** → 이름을 `ScorePanel`로 변경
3. **ScorePanel** 선택 후 우클릭 → **생성** → **2D 객체** → **Label** (4번 반복)
4. Label 노드 이름 변경:
   - `Score_나` (또는 플레이어1)
   - `Score_플레이어2`
   - `Score_플레이어3`
   - `Score_플레이어4`

**구조 예시:**
```
Canvas
└── ScorePanel
    ├── Score_나
    ├── Score_플레이어2
    ├── Score_플레이어3
    └── Score_플레이어4
```

---

## 2. Label 배치

4개 Label을 ScorePanel 내부에서 원하는 위치에 배치합니다.

---

## 3. GameManager에 연결

1. **GameManager** 노드 선택
2. **Score Panel Node** 슬롯에 **ScorePanel** 노드를 드래그
3. **Score Labels** 배열 **Size**를 `4`로 설정
4. **Element 0~3**에 Label을 순서대로 드래그:
   - **Element 0**: Score_나 (내 점수)
   - **Element 1**: Score_플레이어2
   - **Element 2**: Score_플레이어3
   - **Element 3**: Score_플레이어4

---

## 4. 동작 방식

- **솔로 플레이** 시: `ScorePanel`이 **비활성화**되어 점수 UI가 보이지 않음
- **방 입장 시**: `ScorePanel`이 **활성화**되어 4명 점수 표시

---

## 5. (선택) 기존 Score Label

멀티플레이에서 4명 점수 UI가 보일 때, 기존 **Score Label**이 중복되면:

- GameManager의 **Score Label** 슬롯을 비우거나
- 해당 Label 노드를 비활성화해 두세요.

---

## 요약

1. **ScorePanel** 부모 노드 생성
2. 그 안에 Label 4개 생성
3. GameManager **Score Panel Node**에 ScorePanel 연결
4. **Score Labels** 배열에 순서대로 연결 (0=나, 1~3=상대)
