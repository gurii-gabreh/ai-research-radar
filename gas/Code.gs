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
const GEMINI_MODEL = 'gemini-2.5-flash';

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

    try {
      const items = researchWithGemini_(keyword, apiKey);
      appendResults_(resultSheet, items);
      taskSheet.getRange(r + 1, colStatus + 1).setValue('完了');
      if (colNote >= 0) {
        taskSheet.getRange(r + 1, colNote + 1).setValue(
          `Gemini自動調査完了(${items.length}件) ${formatDateTime_(new Date())}`);
      }
    } catch (e) {
      taskSheet.getRange(r + 1, colStatus + 1).setValue('スキップ');
      if (colNote >= 0) {
        taskSheet.getRange(r + 1, colNote + 1).setValue(`Geminiエラー: ${e.message}`);
      }
    }
  }
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

function appendResults_(sheet, items) {
  const today = formatDate_(new Date());
  const now = formatDateTime_(new Date());
  const rows = items.map(it => [
    today, it.category || '', it.title || '', it.summary || '', it.sourceUrl || '', now, 'Gemini'
  ]);
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  }
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
