# クイックスタートガイド

Progressive Semantic Fingerprintingを5分で始めるためのガイドです。

## インストール

### ブラウザ環境 (Script Tag)

HTMLファイルに以下を追加します。

```html
<script src="psfdb.js"></script>
<script>
  // グローバル変数として利用可能
  const db = new PsfDB();
</script>
```

### Node.js環境 (CommonJS)

`require` を使用して読み込みます。

```bash
# ファイルをプロジェクトにコピー
cp psfdb.js your-project/
```

```javascript
/* main.js */
const PsfDB = require('./psfdb.js');
const SemanticFingerprint = PsfDB.Fingerprint;

// 使用
const db = new PsfDB();
```

## 30秒でできる基本的な使い方

```javascript
// 1. データベースを作成
const db = new PsfDB();
await db.initialize();

// 2. データを追加
await db.add('機械学習は人工知能の一分野です');
await db.add('JavaScriptはプログラミング言語です');
await db.add('Pythonはデータサイエンスで人気です');

// 3. 検索
const results = await db.search('AI について教えて', {
  limit: 5,
  threshold: 0.3
});

// 4. 結果を表示
results.forEach(result => {
  console.log(`[${result.similarity.toFixed(2)}] ${result.data}`);
});
```

## JSON検索の例

```javascript
// 商品データを追加
await db.add({
  name: 'ワイヤレスマウス',
  price: 2980,
  category: '周辺機器',
  inStock: true
});

await db.add({
  name: 'キーボード',
  price: 8900,
  category: '周辺機器',
  inStock: false
});

// 価格範囲で検索
const results = await db.search({
  numericRange: {
    path: 'price',
    min: 2000,
    max: 5000
  }
});
console.log(results); // ワイヤレスマウスが見つかる

// [v1.3.0+] フィールド値で直接検索
// より直感的に検索できます
const results2 = await db.search({
  category: '周辺機器',
  inStock: true
}); 
console.log(results2); // 両方見つかる（類似度スコア順）
```

## よくある使い方パターン

### パターン1: ドキュメント検索

```javascript
const docDB = new PsfDB('DocumentSearch');
await docDB.initialize();

// ドキュメントを追加
const documents = [
  '第1章: はじめに',
  '第2章: 基本概念',
  '第3章: 実践例'
];

for (const doc of documents) {
  await docDB.add(doc);
}

// キーワード検索
const chapters = await docDB.search('基本', { limit: 3 });
```

### パターン2: ノンブロッキング一括追加

大量データの場合、`addBatchAsync`を使用するとUIがフリーズしません：

```javascript
const db = new PsfDB('LargeData');
await db.initialize();

// ノンブロッキングな一括追加（進捗表示付き）
const ids = await db.addBatchAsync(largeDataArray, {
  chunkSize: 50,
  onProgress: (done, total) => {
    console.log(`進捗: ${done}/${total}`);
  }
});
```

### パターン3: FAQ検索

```javascript
const faqDB = new PsfDB('FAQ');
await faqDB.initialize();

// FAQデータ
await faqDB.add({
  question: '返品はできますか？',
  answer: '購入後30日以内なら可能です'
});

await faqDB.add({
  question: '送料はいくらですか？',
  answer: '全国一律500円です'
});

// ユーザーの質問から類似FAQを検索
const similar = await faqDB.search('商品を返したい', {
  threshold: 0.4
});

console.log(similar[0].data.answer); // 返品の回答が表示される
```

### パターン4: 商品レコメンデーション

```javascript
const productDB = new PsfDB('Products');
await productDB.initialize();

// 商品を登録
await productDB.add({
  id: 'p1',
  name: 'ノートPC',
  tags: ['電子機器', '仕事', '持ち運び'],
  price: 89000
});

await productDB.add({
  id: 'p2',
  name: 'タブレット',
  tags: ['電子機器', '娯楽', '持ち運び'],
  price: 45000
});

// 類似商品を検索
const similar = await productDB.search({
  keyPath: { path: 'tags', value: '持ち運び' },
  numericRange: { path: 'price', min: 40000, max: 100000 }
});
```

## デモを試す

ブラウザで `demo.html` を開くと、インタラクティブなデモが起動します:

```bash
# ブラウザで開く
open demo.html
```

デモでは以下が試せます:
- テキスト検索
- JSON検索（価格範囲、キーパス）
- 統計情報の表示
- データベースの管理

## 次のステップ

詳細な使い方は以下を参照:

1. **README.md** - 完全なドキュメント
2. **examples.js** - 様々な使用例
3. **psfdb.js** - ソースコード（コメント付き）

## トラブルシューティング

### IndexedDBが使えない場合（メモリモード）

`persist: false` オプションでメモリモードが利用可能です：

```javascript
// メモリモード（永続化なし）
const db = new PsfDB('test', 1, { persist: false });
await db.initialize();

// 通常通り使用可能
await db.add('データ1');
await db.add('データ2');
const results = await db.search('データ');

// ページをリロードするとデータは消えます
```

**注意事項:**
- ページをリロードまたは閉じるとデータは消失します
- IndexedDBが使えないService Worker環境などで有効です
- 大量データの場合、メモリ使用量に注意してください

### ブラウザの容量制限

```javascript
// 1週間以上前のデータを削除
const count = await db.deleteOlderThan(7 * 24 * 60 * 60 * 1000);
console.log(`${count}件のレコードを削除しました`);

// 条件に一致するデータを一括削除
await db.deleteWhere(record => record.dataType === 'text');

// 複合条件での削除
const cutoff = new Date(Date.now() - 86400000); // 1日前
await db.deleteWhere(record => 
    new Date(record.createdAt) < cutoff && record.dataType === 'json'
);
```

## サポート

質問や問題があれば、GitHubのIssueまでお願いします。

Happy searching! 🔍
