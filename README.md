# ai-research-radar

キーワードを与えると、Gemini APIが最新のAI技術情報・活用事例を自動調査して一覧化するアプリ。

## アーキテクチャ

- **キーワードの入力**: `progress-tracker-dashboard`が使う「実装進捗管理シート」の**依頼タスクタブ**に
  `Repo=ai-research-radar`, `Task=<キーワード>` を追加する(既存の依頼タスク運用と同じ入力方法)
- **調査の実行**: `gas/Code.gs`をスプレッドシートにバインドしたGoogle Apps Scriptが、
  1日1回・指定時刻に依頼タスクタブを確認し、未処理のキーワードごとに**Gemini API(Google検索グラウンディング付き)**
  を呼び出して調査する
- **結果の保存**: 「AI技術情報・活用事例 収集ログ」スプレッドシートに追記する
  (列: `日付, カテゴリ, タイトル, 概要, ソースURL, 収集日時, 使うAI`)
- **表示**: `index.html`(このリポジトリ、GitHub Pagesで公開)がGASのWebアプリAPI(`doGet`)経由で
  収集ログを取得し、検索・カテゴリ絞り込み付きの一覧として表示する
- **JSONミラー(2026-08-21追加)**: 収集ログシートの内容は、`collectAIResearch`実行のたびに
  `exportResearchLogToGithub_`が`data/research-log.json`へも自動でコミットする(シートが正本、
  JSONは自動ミラー。将来RAG等でこの収集結果を再利用しやすくする目的)
- 処理が終わった依頼タスクは、GASが依頼タスクタブの該当行のステータスを「完了」に更新する
  (Claude Codeの既存Routineは`Repo`が既知のリポジトリ名でも`ai-research-radar`でもない場合のみ処理するため、
  `ai-research-radar`向けのタスクはこのGAS経由の仕組みだけが処理する)
- **Geminiがレート制限の場合**: 専用のClaude調査ルームが代わりにWeb検索で調査し、結果を
  `data/claude-fallback-results.json`へcommit・push、GASがそれをプル型で取り込む(詳細は下記)

```
依頼タスクタブに Task 追加
      │
      ▼ (1日1回、指定時刻)
GAS (gas/Code.gs) ──▶ Gemini API (Google検索グラウンディング)
      │
      ▼
収集ログ シートに追記 + 依頼タスクのステータスを更新
      │
      ▼ (doGet)
index.html (GitHub Pages) が表示
```

## セットアップ手順

1. 「AI技術情報・活用事例 収集ログ」スプレッドシートを開く → 拡張機能 → Apps Script
2. `gas/Code.gs`の内容をそのまま貼り付けて保存
3. プロジェクトの設定 → スクリプト プロパティ に以下を追加
   - `GEMINI_API_KEY`: Gemini APIキー
   - `TASK_SHEET_ID`: 「実装進捗管理シート」のスプレッドシートID
   - `GITHUB_TOKEN`: `data/research-log.json`への書き込み権限(Contents API、repoスコープ)を持つ
     GitHub Personal Access Token(2026-08-21追加。未設定でも収集自体は動くが、JSONミラーの更新のみ
     スキップされログに記録される)
4. エディタで`createDailyTrigger`を選択して一度だけ手動実行(権限の認可 + 日次トリガー作成。
   デフォルトは毎日7:00 JST。時刻を変えたい場合は`createDailyTrigger(9)`のように引数で時を指定)
5. エディタで`rescheduleToLeastCongestedHour`を一度手動実行(下記「実行時刻の自動最適化」参照。
   その後`createWeeklyRescheduleTrigger`も一度だけ手動実行しておくと、以降は毎週自動で見直される)
6. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」→ 実行するユーザー: 自分 / アクセス: 全員 → デプロイ
7. 発行された`/exec`で終わるURLをコピーし、`index.html`(GitHub Pages公開後のページ)を開いて
   右上の⚙アイコンから貼り付けて保存する

## 実行時刻の自動最適化(Gemini APIの空いている時間帯を狙う)

`gemini-monitor`(Gemini API通信可能時間調査アプリ)が別のスプレッドシートで、時間帯(JST)ごとの
Gemini API成功率を継続的に計測している。`rescheduleToLeastCongestedHour()`はそのログを直接読み、
このアプリが使うモデル(`gemini-3.5-flash`)の成功率が最も高い時間帯を集計して、日次トリガーの
実行時刻をその時間に自動で付け替える(サンプル数が5件未満の時間帯は判断材料としては使わない)。

`createWeeklyRescheduleTrigger()`を一度実行しておくと、毎週日曜3:00 JSTにこの見直しが自動で走る。
gemini-monitor側の計測は日々蓄積されていくため、時間が経つほど精度が上がっていく想定。
混雑データが読めなかった場合は何もせず、現在のトリガー時刻をそのまま維持する(安全側に倒す設計)。

Gemini APIのレート制限(429)に当たった場合は、依頼タスクタブの備考に
「⚠ レート制限/利用上限に達したため今回は見送り、次回の自動実行時に再試行します」と明記され、
ステータスは変更されない(=完了/スキップにはならない)。翌日の自動実行時に自動で再試行される。

## Geminiレート制限時のClaude調査フォールバック

Geminiがレート制限で調査できなかったキーワードは、専用のClaude調査ルーム(別のClaude Codeセッション)が
代わりにWeb検索で調査できる。progress-tracker-dashboardの`syncFromGithub`と同じ「プル型同期」構成。

```
Gemini調査失敗(429) → 依頼タスクタブの備考に「レート制限」の印
      │
      ▼ (Claude調査ルームが備考を見て検知、自前でWeb検索調査)
Claude調査ルームが data/claude-fallback-results.json に結果を追記してcommit・push
      │
      ▼ (毎日のcollectAIResearch実行時、GASがGitHubへ取りに行く)
GAS (syncClaudeResearchFromGithub_) が収集ログへ追記 + 依頼タスクの ステータス/備考 を更新
```

Claude調査ルーム側で実装してほしいこと:

1. 実装進捗管理シートの依頼タスクタブを確認し、`Repo=ai-research-radar`かつステータスが
   `完了`/`スキップ`ではなく、備考に「レート制限」という文字列を含む行を探す
2. 該当するキーワードごとに、直近1週間程度の最新AI技術情報・活用事例をWeb検索で3〜5件調査する
   (信頼できる情報源から。gas/Code.gsの`researchWithGemini_`が使っているプロンプトと同じ方針)
3. このリポジトリの`data/claude-fallback-results.json`を読み、`results`配列の**末尾に追記**する形で
   以下のオブジェクトを追加する(既存のエントリは消さない):
   ```json
   {
     "keyword": "依頼タスクタブのTask列と完全に一致する文字列",
     "items": [
       { "category": "カテゴリ名", "title": "タイトル", "summary": "80字程度の日本語要約", "sourceUrl": "元記事のURL" }
     ],
     "researchedAt": "YYYY-MM-DD HH:mm"
   }
   ```
4. commit・push する
5. GAS側は毎日の`collectAIResearch`実行時に自動でこのファイルを取りに行き、収集ログへの追記
   (使うAI列は`Claude`になる)・依頼タスクの完了処理(【毎日】【N回】マーカーがあればそれに従う)・
   ソースURLが既に収集済みの記事の重複排除を行う。**すぐに反映結果を確認したい場合**は、
   GAS側のApps Scriptエディタで`syncClaudeResearchOnly`を手動実行すれば、日次トリガーを待たずに
   その場で反映できる
6. `data/claude-fallback-results.json`のエントリは消さなくてよい(GAS側はソースURLで重複排除するため、
   同じ内容を残しておいても再度取り込まれることはない)

## 依頼タスクの追加方法

「実装進捗管理シート」の依頼タスクタブに以下の形式で行を追加する。

| Repo | Task | 優先度 | ステータス | 依頼日 | 備考 |
|---|---|---|---|---|---|
| ai-research-radar | 生成AI エージェント | 中 | 未着手 | 2026-07-29 | |

### 繰り返し調査(毎日/回数指定)

備考欄の先頭に以下のマーカーを付けると、1回で完了にせず繰り返し調査させることができる。

| 備考の書き方 | 動作 |
|---|---|
| (何も書かない) | 従来通り、1回調査したら完了になる |
| `【毎日】` | 完了にせず、日次トリガーが動くたびに毎回調査を繰り返す(収集ログに調査結果が積み上がっていく) |
| `【3回】`のように`【N回】` | 通算N回調査したら完了になる。実行のたびに備考が`【3回】1/3回実施(最終: ...)`のように更新され、進捗が分かる |

例:

| Repo | Task | 優先度 | ステータス | 依頼日 | 備考 |
|---|---|---|---|---|---|
| ai-research-radar | 生成AIエージェント最新動向 | 中 | 未着手 | 2026-08-02 | 【毎日】 |
| ai-research-radar | マルチモーダルAIの活用事例 | 中 | 未着手 | 2026-08-02 | 【5回】 |

翌日の実行時刻になると、GASがこの行を検知してGeminiで調査し、結果を収集ログへ追記、ステータスを「完了」に更新する。
