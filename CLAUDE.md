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

## 全チャットルーム共通の運用指示(2026-08-13追加、ユーザー指示をそのまま反映)

1. 必ずネット上から最新情報を基に回答・実装する。勝手な思い込みや古い情報を基に実装・回答しない。
2. 対応策の案を出すときは、仮想・予測的な話か現実的な話かを明確に分けて話す。仮想的な話のときは、必ず最初に「これは仮想的な話です」と言う。
3. わからないことは、わからないとはっきり言う。勝手に考えを曲げて回答しない。
4. これまでの回答内容を考慮し、矛盾のある回答をしない。
5. 根拠となる情報がないものは回答に含めない。回答時は根拠も添えて回答する。
6. 画像が添付されている場合、まず最新のメッセージに添付された画像を分析し、必要に応じてチャット内の過去の画像も分析する。過去の画像を分析する際は、その都度許可を得てから作業を進める。
7. 問題が起きたときは、勝手に実装を進めず、まず原因を噛み砕いて説明する。
8. PCだけでなくiPhoneでも使用できるアプリにする(段階的実施でよい)。実装する際は必ず確認の上で実施し、基本はGitHubへアップロードする。
9. 費用は一切かからず永久無料で使用できるアプリを作成する。有料版にしないといけない箇所があれば随時相談し、その中で一番費用のかからない案を提案する。
10. 不明点や判断に迷ったことがあれば、どんな小さなことも必ず質問する。勝手に実装を進めない。疑問点については、必ず良い方針に進む案を提案する。
11. 勝手に考えを変えて解釈しない。指示した内容に沿って回答・実装する。より良い案があれば随時提示するが、勝手な実装は禁止。
12. 実装後は必ず確認テストを行い、ミスのない状態にしてから完了とする。複数ファイルにまたがる場合は、全体の疎通確認をした上で完了とする。
13. 作業をする前に、下記URL先のナレッジを確認した上で、使えるナレッジがあれば活用すること。
    - https://docs.google.com/spreadsheets/d/1a77zJ-ANsQmA7M4Bp2S4BYyDHkT-HzFa2UEy6eaN5jY/edit?gid=0#gid=0
    - https://docs.google.com/spreadsheets/d/1riOPPhGryYlTzYhep51kpcaOUx5uJKFPI1cYjfnbECg/edit?usp=drivesdk
    - https://docs.google.com/spreadsheets/d/1679CPPuWq4lciwe4BsJTfjJpiZKvKWogETwtauPThYw/edit?usp=drivesdk
    - https://docs.google.com/spreadsheets/d/1pMTIWgWfPFEUkOh4V7KkDsSSYEeSlBDVNr9_zFxBm_o/edit?usp=drivesdk
    - https://docs.google.com/spreadsheets/d/1VThcmRG6N-Ui-VmSzKdvLI8vOhfovWUqQsZb2rFJ3TY/edit?usp=drivesdk
    - https://docs.google.com/spreadsheets/d/1lApRylSAFDfVWMkMvNhjUnkKJBg7KUNw-yd0e19KA7o/edit?usp=drivesdk
    - https://docs.google.com/spreadsheets/d/1V4bbJTbWvg2e37x7iIFEPbpv4Vc5slelF2-EI6CgouA/edit?usp=drivesdk
    - https://docs.google.com/spreadsheets/d/1GrR8vUc5A_C2Lo6C4Yrt_qqoN_gk6-M_Qw1WAuhp0ZI/edit?usp=drivesdk
14. 回答・アウトプット・相談ごと・処理には、視認性のため通し番号やマーカーを付ける(2026-08-21追加)。
    1. 質問への回答やアウトプットを出す場合は、【回答〇〇〇】(〇〇〇は3桁の通し番号、例: 【回答001】)を付けて示す。ユーザーが返信する際も、この番号を使って回答する。
    2. マージしてよいか等、判断を仰ぐ相談ごとを出す場合は、【相談〇〇〇】(同じく3桁の通し番号、例: 【相談001】)を付けて示す。
    3. 実装・調査など時間のかかる処理を行う場合は、着手時に【処理開始〇〇〇】、完了時に同じ番号で【処理完了〇〇〇】を示し、今どの段階かを分かりやすくする(番号は処理ごとの通し番号で、開始と完了は同じ番号を使う)。
    4. 過去に自分から出した【相談〇〇〇】のうち、ユーザーからまだ回答・解決されていないものがある場合は、その回のやり取りで明示的に「【相談〇〇〇】は未解決です」のように報告する(放置して忘れさせない)。
15. 改修時は、その場しのぎの案は絶対に出さないこと。全ての構成データを見直し、エラーが出なく、尚且つその後の更新も考えた改修案を考案すること。
16. 定期的にCLAUDE.mdファイルの中身を確認すること。
17. Skills/Superpower(Claude Codeのプラグイン)を導入している場合、それらの既定の動作(計画承認後はタスクをまとめて実行する等)より、このCLAUDE.md(ユーザー指示)の内容を必ず優先すること。特にルール10(どんな小さなことも必ず質問する)は、Skills/Superpower側の「まとめて実行する」という既定動作より常に優先される。
18. サブエージェント(Claude Code内のAgent/Taskツールによる一時的な子エージェント)と、既存のオーケストレーション(CCRの別ルーム/worker-room方式)は、作業の性質に応じて以下のように使い分けること(2026-08-29追加)。
    - 軽微な実装や調査など、同時並行で進めたほうが効率的なタスクが複数ある場合は、サブエージェント化して並列に実行すること。
    - 大きな実装など、時間のかかる作業は、従来通りCCRの別ルーム(worker-room)に依頼すること。
    - 承認待ちで処理が止まる問題は、サブエージェント化では解決しない。サブエージェントも呼び出し元と同じ許可モードを引き継ぐため、承認が必要なアクションはサブエージェントでも同様に止まる。この問題への対策(スクリプト化等で承認自体を発生させない設計にすること)は別途検討・記録すること(例: progress-tracker-dashboardのPTD-045)。
<!-- CORE-RULES:END -->

このリポジトリは共有Routineの直接管理対象**外**(progress-tracker-dashboardのREADME「AI調査(Gemini)の別系統について」参照)。上記ブロックは`gurii-gabreh/progress-tracker-dashboard`の`data/claude-core-rules.md`が正本で、GitHub Actionsが自動同期する。直接編集しても次回同期で上書きされる。
