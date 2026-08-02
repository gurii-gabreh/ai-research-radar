/**
 * ai-research-radar: Gemini APIでAI最新技術情報・活用事例をキーワード指定で自動収集する
 *
 * このファイルは「AI技術情報・活用事例 収集ログ」スプレッドシートにコンテナバインドしてください
 * (対象シートを開く → 拡張機能 → Apps Script → このコードを貼り付け)
 *
 * スクリプト プロパティ(プロジェクトの設定 > スクリプト プロパティ)に以下を設定してください:
 *   GEMINI_API_KEY : Gemini APIキー
 *   TASK_SHEET_ID  : 「実装進捗管理シート」のスプレッドシートID(依頼タスクタブがある方)
 *
 * 初回セットアップ時に createDailyTrigger() を一度だけ手動実行してください(認可 + 日次トリガー作成)
 */

const TASK_TAB_NAME = '依頼タスク';
const TARGET_REPO_LABEL = 'ai-research-radar';
const GEMINI_MODEL = 'gemini-3.5-flash';

// gemini-monitor(Gemini API通信可能時間調査アプリ)が計測している、時間帯別のGemini API
// 成功率ログ。同じGoogleアカウントが持つ別のスプレッドシートなので、SpreadsheetApp.openById
// で直接読みに行く(GASのURL経由ではないので、ネットワーク制約の影響を受けない)。
const CONGESTION_SHEET_ID = '1riOPPhGryYlTzYhep51kpcaOUx5uJKFPI1cYjfnbECg';
const CONGESTION_DETAIL_GID = 1799393535;

// Geminiがレート制限(429)の時のフォールバック先。専用のClaude調査ルームが、
// 依頼タスクタブの備考に「レート制限」の印が付いた行(=Geminiが処理できなかった行)を見つけて
// 自前でWeb検索調査し、結果をこのJSONファイルへcommit・pushする想定(プル型同期。
// progress-tracker-dashboardのsyncFromGithubと同じ構成で、GAS側からGitHubへ定期的に取りに行く)。
const CLAUDE_RESULTS_URL = 'https://raw.githubusercontent.com/gurii-gabreh/ai-research-radar/main/data/claude-fallback-results.json';

function getResultSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function ensureResultHeader_(sheet) {
  const header = ['日付', 'カテゴリ', 'タイトル', '概要', 'ソースURL', '収集日時', '使うAI'];
  const current = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  const same = header.every((h, i) => current[i] === h);
  if (!same) sheet.getRange(1, 1, 1, header.length).setValues([header]);
}

/** 依頼タスクタブを見て、未処理のキーワードをGeminiで調査し収集ログへ追記する */
function collectAIResearch() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  const taskSheetId = props.getProperty('TASK_SHEET_ID');
  if (!apiKey || !taskSheetId) {
    throw new Error('スクリプトプロパティ GEMINI_API_KEY / TASK_SHEET_ID を設定してください');
  }

  const taskSheet = SpreadsheetApp.openById(taskSheetId).getSheetByName(TASK_TAB_NAME);
  if (!taskSheet) throw new Error(`タブ「${TASK_TAB_NAME}」が見つかりません`);

  const values = taskSheet.getDataRange().getValues();
  const header = values[0];
  const colRepo = header.indexOf('Repo');
  const colTask = header.indexOf('Task');
  const colStatus = header.indexOf('ステータス');
  const colNote = header.indexOf('備考');
  if ([colRepo, colTask, colStatus].some(c => c < 0)) {
    throw new Error('依頼タスクタブの列名(Repo/Task/ステータス)が想定と異なります');
  }

  const resultSheet = getResultSheet_();
  ensureResultHeader_(resultSheet);

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[colRepo] !== TARGET_REPO_LABEL) continue;
    if (row[colStatus] === '完了' || row[colStatus] === 'スキップ') continue;
    const keyword = row[colTask];
    if (!keyword) continue;

    const repeatConfig = parseRepeatConfig_(colNote >= 0 ? row[colNote] : '');

    try {
      const items = researchWithGemini_(keyword, apiKey);
      appendResults_(resultSheet, items);
      const now = formatDateTime_(new Date());

      if (repeatConfig.mode === 'daily') {
        // 完了にはせず、翌日以降も繰り返し対象として残す(収集ログには毎回追記されていく)
        if (colNote >= 0) {
          taskSheet.getRange(r + 1, colNote + 1).setValue(`【毎日】最終実施: ${now}(${items.length}件取得)`);
        }
      } else if (repeatConfig.mode === 'limited') {
        const doneCount = repeatConfig.done + 1;
        if (doneCount >= repeatConfig.limit) {
          taskSheet.getRange(r + 1, colStatus + 1).setValue('完了');
          if (colNote >= 0) {
            taskSheet.getRange(r + 1, colNote + 1).setValue(
              `【${repeatConfig.limit}回】${doneCount}/${repeatConfig.limit}回実施(最終: ${now}) → 完了`);
          }
        } else if (colNote >= 0) {
          taskSheet.getRange(r + 1, colNote + 1).setValue(
            `【${repeatConfig.limit}回】${doneCount}/${repeatConfig.limit}回実施(最終: ${now})`);
        }
      } else {
        taskSheet.getRange(r + 1, colStatus + 1).setValue('完了');
        if (colNote >= 0) {
          taskSheet.getRange(r + 1, colNote + 1).setValue(`Gemini自動調査完了(${items.length}件) ${now}`);
        }
      }
    } catch (e) {
      // 繰り返し設定(【毎日】【N回】)が備考に入っている場合、それを失うと次回以降
      // 繰り返しではなく単発扱いに戻ってしまう。エラー時もマーカー+進捗を残す。
      const marker = repeatMarkerText_(repeatConfig);
      if (e.isRateLimit) {
        // レート制限/利用上限は一時的な問題である可能性が高いため、ステータスは変更せず
        // (未着手のまま残す)次回の日次トリガーで自動的に再試行されるようにする。
        // 備考に分かりやすく明記して、何が起きたか一覧上ですぐ分かるようにする。
        if (colNote >= 0) {
          taskSheet.getRange(r + 1, colNote + 1).setValue(
            `${marker}⚠ レート制限/利用上限に達したため今回は見送り、次回の自動実行時に再試行します (${formatDateTime_(new Date())})`);
        }
        // 一度レート制限に当たったら、同じ実行内で残りのキーワードを試しても
        // ほぼ確実に同じ結果になるため、無駄なAPI呼び出しをせず処理を打ち切る。
        break;
      }
      taskSheet.getRange(r + 1, colStatus + 1).setValue('スキップ');
      if (colNote >= 0) {
        taskSheet.getRange(r + 1, colNote + 1).setValue(`${marker}Geminiエラー: ${e.message}`);
      }
    }
  }

  // Geminiのレート制限で今回処理できなかった行を、Claude調査ルーム(専用ルーム)が
  // 既に代わりに調査済みならここで反映する。ファイルが無い/読めない場合は何もしない。
  syncClaudeResearchFromGithub_(taskSheet, colRepo, colTask, colStatus, colNote, resultSheet);
}

/**
 * 備考欄の先頭にある繰り返し設定マーカーを解釈する。
 *   【毎日】      … 毎回実行し、完了にしない(収集ログに毎日追記され続ける)
 *   【N回】       … 通算N回実行したら完了にする(N/N回実施を備考に記録して回数を追跡)
 *   マーカーなし  … 従来通り、1回実行したら完了にする
 */
function parseRepeatConfig_(note) {
  if (!note) return { mode: 'once' };
  if (note.indexOf('【毎日】') !== -1) return { mode: 'daily' };
  const m = note.match(/【(\d+)回】/);
  if (m) {
    const limit = Number(m[1]);
    const progress = note.match(/(\d+)\/\d+回実施/);
    return { mode: 'limited', limit: limit, done: progress ? Number(progress[1]) : 0 };
  }
  return { mode: 'once' };
}

/** parseRepeatConfig_で解釈した設定を、備考に書き戻す際の先頭マーカー文字列に変換する */
function repeatMarkerText_(config) {
  if (config.mode === 'daily') return '【毎日】';
  if (config.mode === 'limited') return `【${config.limit}回】${config.done}/${config.limit}回実施 `;
  return '';
}

function researchWithGemini_(keyword, apiKey) {
  const prompt = [
    'あなたはAI技術専門のリサーチャーです。',
    `キーワード「${keyword}」に関連する、直近1週間程度の最新のAI技術情報・活用事例を`,
    'Google検索で調査してください。信頼できる情報源(公式ブログ、ニュースサイト、技術記事等)から',
    '3〜5件選び、次のJSON配列の形式のみを出力してください(説明文・コードブロック記号は不要):',
    '[{"category":"カテゴリ名","title":"タイトル","summary":"80字程度の日本語要約","sourceUrl":"元記事のURL"}]'
  ].join('');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }]
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 429) {
    // レート制限(1分あたりの上限)・日次/月次クォータ超過のどちらも429で返ってくるため、
    // ここでは区別せず「利用上限に達した」として扱う(呼び出し側が自動リトライを判断する)。
    const err = new Error(`Gemini APIのリクエスト上限(429)に達しました: ${res.getContentText()}`);
    err.isRateLimit = true;
    throw err;
  }
  if (res.getResponseCode() !== 200) {
    throw new Error(`Gemini API error ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  const json = JSON.parse(res.getContentText());
  const content = json.candidates && json.candidates[0] && json.candidates[0].content;
  const parts = content ? content.parts : [];
  const text = (parts || []).map(p => p.text || '').join('');
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const items = JSON.parse(cleaned);
  if (!Array.isArray(items)) throw new Error('Geminiの応答をJSON配列として解釈できませんでした');
  return items;
}

function appendResults_(sheet, items, aiName) {
  const today = formatDate_(new Date());
  const now = formatDateTime_(new Date());
  const rows = items.map(it => [
    today, it.category || '', it.title || '', it.summary || '', it.sourceUrl || '', now, aiName || 'Gemini'
  ]);
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  }
}

/** Claudeフォールバックの反映だけを日次トリガーを待たず今すぐ試したい時に、エディタから手動実行する用 */
function syncClaudeResearchOnly() {
  const props = PropertiesService.getScriptProperties();
  const taskSheetId = props.getProperty('TASK_SHEET_ID');
  if (!taskSheetId) throw new Error('スクリプトプロパティ TASK_SHEET_ID を設定してください');
  const taskSheet = SpreadsheetApp.openById(taskSheetId).getSheetByName(TASK_TAB_NAME);
  if (!taskSheet) throw new Error(`タブ「${TASK_TAB_NAME}」が見つかりません`);
  const header = taskSheet.getDataRange().getValues()[0];
  const colRepo = header.indexOf('Repo');
  const colTask = header.indexOf('Task');
  const colStatus = header.indexOf('ステータス');
  const colNote = header.indexOf('備考');
  const resultSheet = getResultSheet_();
  ensureResultHeader_(resultSheet);
  return syncClaudeResearchFromGithub_(taskSheet, colRepo, colTask, colStatus, colNote, resultSheet);
}

/**
 * Claude調査ルーム(専用ルーム)がGitHubへpushしたdata/claude-fallback-results.jsonを取りに行き、
 * Geminiがレート制限で処理できなかったキーワードの調査結果を収集ログへ反映する。
 * ファイルが無い/読めない場合や、対応する依頼タスク行が既に完了・スキップ済みの場合は何もしない。
 * 同じ記事(ソースURL)を重複追記しないよう、既存の収集ログと突き合わせてから追記する。
 */
function syncClaudeResearchFromGithub_(taskSheet, colRepo, colTask, colStatus, colNote, resultSheet) {
  const res = UrlFetchApp.fetch(CLAUDE_RESULTS_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { synced: 0 };
  let data;
  try {
    data = JSON.parse(res.getContentText());
  } catch (e) {
    return { synced: 0 };
  }
  const results = (data && data.results) || [];
  if (!results.length) return { synced: 0 };

  const existing = resultSheet.getDataRange().getValues();
  const existingHeader = existing[0] || [];
  const colSrc = existingHeader.indexOf('ソースURL');
  const existingUrls = new Set();
  if (colSrc >= 0) {
    for (let i = 1; i < existing.length; i++) {
      if (existing[i][colSrc]) existingUrls.add(existing[i][colSrc]);
    }
  }

  const taskValues = taskSheet.getDataRange().getValues();
  let synced = 0;

  results.forEach(entry => {
    const keyword = entry.keyword;
    const items = entry.items || [];
    if (!keyword || !items.length) return;

    let rowIndex = -1;
    for (let i = 1; i < taskValues.length; i++) {
      if (taskValues[i][colRepo] === TARGET_REPO_LABEL && taskValues[i][colTask] === keyword) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) return; // タスク行が見つからない(手動削除等)場合はスキップ

    const currentStatus = taskValues[rowIndex][colStatus];
    if (currentStatus === '完了' || currentStatus === 'スキップ') return; // 既に決着済みなら触らない

    const newItems = items.filter(it => !it.sourceUrl || !existingUrls.has(it.sourceUrl));
    if (newItems.length) {
      appendResults_(resultSheet, newItems, 'Claude');
      newItems.forEach(it => { if (it.sourceUrl) existingUrls.add(it.sourceUrl); });
    }

    const repeatConfig = parseRepeatConfig_(colNote >= 0 ? taskValues[rowIndex][colNote] : '');
    const now = formatDateTime_(new Date());
    if (repeatConfig.mode === 'daily') {
      if (colNote >= 0) {
        taskSheet.getRange(rowIndex + 1, colNote + 1).setValue(
          `【毎日】最終実施(Claudeフォールバック): ${now}(${items.length}件)`);
      }
    } else if (repeatConfig.mode === 'limited') {
      const doneCount = repeatConfig.done + 1;
      if (doneCount >= repeatConfig.limit) {
        taskSheet.getRange(rowIndex + 1, colStatus + 1).setValue('完了');
        if (colNote >= 0) {
          taskSheet.getRange(rowIndex + 1, colNote + 1).setValue(
            `【${repeatConfig.limit}回】${doneCount}/${repeatConfig.limit}回実施(Claudeフォールバック, 最終: ${now}) → 完了`);
        }
      } else if (colNote >= 0) {
        taskSheet.getRange(rowIndex + 1, colNote + 1).setValue(
          `【${repeatConfig.limit}回】${doneCount}/${repeatConfig.limit}回実施(Claudeフォールバック, 最終: ${now})`);
      }
    } else {
      taskSheet.getRange(rowIndex + 1, colStatus + 1).setValue('完了');
      if (colNote >= 0) {
        taskSheet.getRange(rowIndex + 1, colNote + 1).setValue(
          `Claude自動調査完了(${items.length}件, Geminiレート制限フォールバック) ${now}`);
      }
    }
    synced++;
  });

  return { synced: synced };
}

function formatDate_(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}
function formatDateTime_(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
}

/** 初回セットアップ時に一度だけ手動実行してください(既存の同名トリガーは削除して作り直します) */
function createDailyTrigger(hour) {
  const h = hour || 7;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'collectAIResearch') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('collectAIResearch')
    .timeBased()
    .atHour(h)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();
}

/**
 * gemini-monitorの計測ログ(CONGESTION_SHEET_ID)から、GEMINI_MODELの時間帯(JST 0〜23)別の
 * 成功率を集計し、最も成功率が高い時間を返す。サンプル数が少なすぎる時間帯(5件未満)は
 * ノイズが大きいため候補から除外する。シートが読めない・対象モデルの記録が無い場合はnullを返す
 * (呼び出し側は現在のトリガー時刻を維持する)。
 */
function computeBestHour_() {
  try {
    const ss = SpreadsheetApp.openById(CONGESTION_SHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId() === CONGESTION_DETAIL_GID);
    if (!sheet) return null;

    const values = sheet.getDataRange().getValues();
    const header = values[0];
    const colModel = header.indexOf('model');
    const colStatus = header.indexOf('status');
    const colHour = header.indexOf('jst_hour');
    if ([colModel, colStatus, colHour].some(c => c < 0)) return null;

    const totals = {}; // jst_hour -> {success, total}
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      if (row[colModel] !== GEMINI_MODEL) continue;
      const hour = Number(row[colHour]);
      if (isNaN(hour)) continue;
      if (!totals[hour]) totals[hour] = { success: 0, total: 0 };
      totals[hour].total++;
      if (row[colStatus] === 'success') totals[hour].success++;
    }

    let bestHour = null;
    let bestRate = -1;
    Object.keys(totals).forEach(h => {
      const t = totals[h];
      if (t.total < 5) return;
      const rate = t.success / t.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestHour = Number(h);
      }
    });
    return bestHour;
  } catch (e) {
    return null;
  }
}

/**
 * gemini-monitorの計測データを見て、GEMINI_MODELの成功率が最も高い時間帯に日次トリガーを
 * 再設定する。手動実行、または下記の週次トリガーから定期的に呼ばれる想定。データが取得できない
 * 場合は何もしない(既存のトリガー時刻を維持する)。
 */
function rescheduleToLeastCongestedHour() {
  const hour = computeBestHour_();
  if (hour === null) {
    return { ok: false, message: '混雑データを取得できなかったため、時刻は変更していません' };
  }
  createDailyTrigger(hour);
  return { ok: true, hour: hour };
}

/**
 * 混雑データに基づく実行時刻の見直しを週1回自動で行うトリガーを設定する
 * (初回セットアップ時、createDailyTriggerと合わせて一度だけ手動実行してください)。
 * gemini-monitor側の計測が日々蓄積されていくため、時間が経つほど判断材料が増えて精度が上がる。
 */
function createWeeklyRescheduleTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'rescheduleToLeastCongestedHour') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rescheduleToLeastCongestedHour')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .inTimezone('Asia/Tokyo')
    .create();
}

/**
 * Webアプリ(index.html)向けのJSON API。
 * デプロイ: エディタ右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *   実行するユーザー: 自分 / アクセスできるユーザー: 全員
 * 発行されたURLをindex.htmlの設定(歯車アイコン)に貼り付けてください。
 */
function doGet(e) {
  const values = getResultSheet_().getDataRange().getValues();
  const header = values[0];
  const rows = values.slice(1).map(row => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  }).reverse();
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}
