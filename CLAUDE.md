# ai-research-radar

キーワードを与えると、Gemini APIが最新のAI技術情報・活用事例を自動調査して一覧化するアプリ。

<!-- CORE-RULES:START (auto-synced from progress-tracker-dashboard/data/claude-core-rules.md -- do not edit by hand, edit the source instead) -->
## 最重要ルール(このファイルに直接記載。fetch不要で必ず読める)

- このリポジトリは `gurii-gabreh/progress-tracker-dashboard` が進捗・実装ナレッジを一元管理する対象の1つ
- **manager-room(状況把握・優先度判断・振り分けのみ)とworker-room(実装担当)の役割分担がある。このセッションで実装作業をしているなら、それはworker-room役**
- 実装したタスクの`detail`(実装ナレッジ)・`note`・`checkHistory`を、progress-tracker-dashboardの`data/tasks.json`側で空欄のまま完了させない
- 意味のある実装判断(設計パターン・DB設計・セキュリティ対応・AI/LLM関連・テスト方針など)があれば、progress-tracker-dashboardの`data/concept-log.json`にも記録する(2026-08-13、自動同期の書き込み権限確認のための軽微な更新)

## より詳しいルール(下記URLを実際にWebFetch等で取得すること。リンクを貼るだけでは中身は読み込まれない)

- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/README.md
- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/data/policy.json
- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/data/ai-config.json
<!-- CORE-RULES:END -->

このリポジトリは共有Routineの直接管理対象**外**(progress-tracker-dashboardのREADME「AI調査(Gemini)の別系統について」参照)。上記ブロックは`gurii-gabreh/progress-tracker-dashboard`の`data/claude-core-rules.md`が正本で、GitHub Actionsが自動同期する。直接編集しても次回同期で上書きされる。
