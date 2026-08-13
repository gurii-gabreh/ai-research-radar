# ai-research-radar

キーワードを与えると、Gemini APIが最新のAI技術情報・活用事例を自動調査して一覧化するアプリ。

## 最重要ルール(このファイルに直接記載。fetch不要で必ず読める)

- このリポジトリは `gurii-gabreh/progress-tracker-dashboard` が進捗・実装ナレッジを一元管理する対象の1つ(共有Routineの直接管理対象**外**。progress-tracker-dashboardのREADME「AI調査(Gemini)の別系統について」参照)
- **manager-room(状況把握・優先度判断・振り分けのみ)とworker-room(実装担当)の役割分担がある。このセッションで実装作業をしているなら、それはworker-room役**
- 実装したタスクの`detail`(実装ナレッジ)・`note`・`checkHistory`を、progress-tracker-dashboardの`data/tasks.json`側で空欄のまま完了させない
- 意味のある実装判断(設計パターン・DB設計・セキュリティ対応・AI/LLM関連・テスト方針など)があれば、progress-tracker-dashboardの`data/concept-log.json`にも記録する

## より詳しいルール(下記URLを実際にWebFetch等で取得すること。リンクを貼るだけでは中身は読み込まれない)

- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/README.md
- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/data/policy.json
- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/data/ai-config.json
