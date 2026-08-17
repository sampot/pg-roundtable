# 圓桌協議 (`pg-roundtable`)

多勢力**同時密封出價**與**條約外交**談判；人機為主，約 5–8 分鐘一局。

## 玩法

- 六輪圓桌，每輪一項議程（貿易、通行、防禦…）。
- **談判階段**：拖曳滑桿或點籌碼分配影響力；點選 AI 勢力提案（貿易／互不競標／勝利分潤）；可接受或拒絕對方條約。
- **封印出價**：與三股 AI 同步揭曉，最高者得主要聲望。
- **勝利**：六輪後聲望 ≥ 38 且領先圓桌；落後或聲望過低則落敗。

## 執行

純 HTML／CSS／JavaScript（無 build）。經 Playgrounds 畫布或 go 純玩 iframe 載入；存檔走 `PG.kv`。

## 開發

```bash
npx vitest run
```

## 署名

見 [ATTRIBUTION.md](./ATTRIBUTION.md)。Agent 契約見 Playgrounds [`docs/PG-GAME-AGENT-GUIDE.md`](https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md)。
