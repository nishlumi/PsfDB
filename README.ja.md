# PsfDB (Progressive Semantic Fingerprinting Database)

## 概要

PsfDBは、Progressive Semantic Fingerprinting（段階的意味指紋法）を採用した、外部APIやモデルに依存しない、完全にクライアントサイドで動作する軽量な検索システムです。

### 主な特徴

- **モデル非依存**: 外部のAI APIを一切使用しない
- **完全無料**: API呼び出しコストが発生しない
- **高速処理**: 段階的フィルタリングで効率的に検索
- **オフライン動作**: ネットワーク接続不要
- **プライバシー保護**: データが外部に送信されない
- **テキスト・JSON両対応**: 構造化・非構造化データの両方に対応

## アーキテクチャ

### レイヤー構造

本システムは、複数のレイヤーで段階的に検索精度を上げる構造になっています。

```
┌─────────────────────────────────────────┐
│ レイヤー0: 文字レベルハッシュ           │
│ - ローリングハッシュ + MinHash           │
│ - 計算: <1ms                             │
│ - 絞り込み: 100万件 → 5万件             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤー1: n-gram + SimHash              │
│ - 3-gramベースの意味的特徴               │
│ - 計算: 5-10ms                           │
│ - 絞り込み: 5万件 → 3千件               │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤー2: トピック署名                  │
│ - 軽量LDA風のトピックモデル              │
│ - 計算: 10-20ms                          │
│ - 絞り込み: 3千件 → 200件               │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤー3: 構文パターン                  │
│ - 文構造の類似性                         │
│ - 計算: 20-30ms                          │
│ - 絞り込み: 200件 → 50件                │
└─────────────────────────────────────────┘
```

### JSON専用レイヤー

JSON検索では、追加のレイヤーを使用します。

```
┌─────────────────────────────────────────┐
│ レイヤーJ0: 構造ハッシュ                 │
│ - JSON構造の高速比較                     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤーJ1: キーパスインデックス         │
│ - 特定フィールドの検索                   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤーJ2: 値の型マップ                 │
│ - データ型による絞り込み                 │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤーJ3: スキーマ指紋                 │
│ - スキーマ構造の類似性                   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤーJ4: 数値範囲インデックス         │
│ - 数値フィールドの範囲検索               │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ レイヤーJ5: フィールド値インデックス     │
│ - 特定フィールドの値による直接マッチ     │
└─────────────────────────────────────────┘
```

## 技術詳細

### 1. MinHash

複数の値から代表的な値を抽出する手法です。

**アルゴリズム**:
```javascript
1. 複数のハッシュ関数を用意 (h1, h2, ..., hn)
2. 各値に対してすべてのハッシュ関数を適用
3. 各ハッシュ関数ごとに最小値を記録
4. n個の最小値が署名となる
```

**特性**:
- Jaccard類似度を近似的に計算可能
- 計算量: O(n) where n = 値の数
- メモリ効率が高い

### 2. SimHash

テキストを固定長のビット列に変換する手法です。

**アルゴリズム**:
```javascript
1. テキストをn-gramに分割
2. 各n-gramをハッシュ化
3. 各次元で重み付き投票
4. 正負で二値化
```

**特性**:
- 類似したテキストは類似したハッシュ値を持つ
- ハミング距離で高速比較可能
- 128-256ビットで十分な精度

### 3. Bloom Filter

集合のメンバーシップを省メモリで管理する手法です。

**アルゴリズム**:
```javascript
1. ビット配列を初期化
2. 複数のハッシュ関数で各要素をハッシュ化
3. 該当ビットを立てる
4. 検索時は全ビットが立っているかチェック
```

**特性**:
- 偽陽性あり、偽陰性なし
- メモリ効率が極めて高い
- 高速な検索

### 4. 数値範囲インデックス

数値フィールドの範囲検索を高速化します。

**構造**:
```javascript
{
  path: "price",
  min: 1000,
  max: 5000,
  histogram: [5, 12, 23, 18, 7, ...]  // 10分割のヒストグラム
}
```

**利点**:
- 範囲クエリを高速に処理

### 5. データ構造

IndexedDBには以下の構造でデータが格納されます。

```javascript
// IndexedDB 'fingerprints' ストアのレコード構造
{
  id: 1,                          // 自動採番ID (keyPath)
  dataType: "json",               // "text" または "json"
  createdAt: "2023-10-01T...",    // 作成日時 (ISO文字列)
  originalData: { ... },          // 元データ (JSONオブジェクトまたは文字列)
  fingerprint: {                  // 意味指紋データ (検索用インデックス)
    dataType: "json",
    textLength: 150,
    tokenCount: 25,
    layers: {
      charHash: [...],            // [Array] 文字レベルハッシュ
      ngramHash: [...],           // [Array] N-gramハッシュ
      topicSignature: [...],      // [Array] トピック署名
      // ... (その他のレイヤー)
      keyPathIndex: [...],        // [Array] キーパスインデックス (JSONのみ)
      fieldValueIndex: [...],     // [Array] フィールド値インデックス (JSONのみ)
    }
  }
}
```

**ポイント**:
- `originalData`: 検索結果として返される元のデータです。
- `fingerprint`: 検索計算に使用される内部データです。メモリ効率のため、多くは数値配列（TypedArray等）として処理されますが、IndexedDB保存時はJSONシリアライズ可能な形式（通常の配列など）に変換されています。

## パフォーマンス

### 処理速度

| データ件数 | 追加時間 | 検索時間 |
|-----------|---------|---------|
| 100件     | 50ms    | 15ms    |
| 1,000件   | 450ms   | 40ms    |
| 10,000件  | 4.5s    | 120ms   |
| 100,000件 | 45s     | 350ms   |

※ブラウザ環境、一般的なPCでの測定値

### メモリ使用量

**テキスト（1KB）あたり**:
- レイヤー0: 128バイト
- レイヤー1: 16バイト
- レイヤー2: 16バイト
- レイヤー3: 8バイト
- 合計: 約168バイト

**JSON（1KB）あたり**:
- テキストレイヤー: 168バイト
- JSONレイヤー: 約200バイト
- 合計: 約368バイト

### メモリ効率と検索メソッドの使い分け

大量のデータを扱う場合、メソッドの選択によってメモリ使用量が大きく異なります。

| メソッド | メモリ効率 | 特徴 | 推奨シーン |
|----------|------------|------|------------|
| `getAll()` / `getStats()` | ❌ 低 | 全データをメモリに展開します。数万件以上のデータがある場合、クラッシュの原因になります。 | データバックアップ、デバッグ、小規模データ |
| `search()` | ⚠️ 中 | `threshold` (閾値) で絞り込まれた結果のみを保持します。通常は問題ありませんが、閾値を低く設定しすぎると `getAll` と同様のリスクがあります。 | 一般的な検索用途 (Web UI等) |
| `searchStream()` | ✅ 高 | 非同期イテレータを使い、1件ずつ処理します。大量データでもメモリを圧迫しません。 | バッチ処理、全件エクスポート、複雑なフィルタリング |

### 従来手法との比較

| 項目 | 本手法 | OpenAI Embeddings | ローカルモデル |
|------|--------|------------------|---------------|
| API費用 | $0 | $0.0001/1K tokens | $0 |
| 初期コスト | なし | なし | モデルダウンロード |
| 処理速度 | 40-150ms | 100-300ms | 50-200ms |
| オフライン | ○ | × | ○ |
| メモリ | 少 | なし（サーバー側） | 大（数GB） |
| 精度 | 中 | 高 | 高 |
| カスタマイズ | 容易 | 困難 | 可能 |

## 使用方法

### インストール

```bash
# ファイルをダウンロードして配置
# psfdb.js をプロジェクトに含めてください
```

### ブラウザでの使用

```html
<script src="psfdb.js"></script>
<script>
  // PsfDBクラスが利用可能になります
  const db = new PsfDB('MyDatabase');
</script>
```

### Node.jsでの使用

```javascript
const PsfDB = require('./psfdb.js');
const db = new PsfDB('MyDatabase');
```

#### ES Modules (import)

モダンなバンドラ（Webpack、Rollup等）またはブラウザでの直接importの場合：

```javascript
import PsfDB from './psfdb.js';

// 使用例
const db = new PsfDB('MyDatabase');
await db.initialize();
```

**注意**: `psfdb.js`はUMD形式で、SemanticFingerprintクラスも内包しています。個別にimportする必要はありません。

### 基本的な使い方

```javascript
// データベース初期化
const db = new PsfDB('MyDB');
await db.initialize();

// データ追加
await db.add('機械学習は人工知能の一分野です');

// 検索
const results = await db.search('AI について', {
  limit: 10,
  threshold: 0.5
});

// 結果表示
results.forEach(result => {
  console.log(`類似度: ${result.similarity}`);
  console.log(`データ: ${result.data}`);
});
```

### メモリモード（永続化なし）

v1.4.0以降では、`persist: false` オプションでIndexedDBを使用せずメモリ上のみで動作させることができます。

```javascript
// メモリモード（永続化なし）
const db = new PsfDB('test', 1, { persist: false });
await db.initialize();

// 通常通り使用可能
await db.add('データ1');
await db.add('データ2');
const results = await db.search('データ');
```

**注意事項:**
- ページをリロードまたは閉じるとデータは消失します
- IndexedDBが使えないService Worker環境などで有効です
- 大量データの場合はメモリ使用量に注意してください

### JSON検索

```javascript
// JSONデータ追加
await db.add({
  name: '商品A',
  price: 3500,
  category: '技術書'
});

// テキスト検索
const results1 = await db.search('技術書', {
  dataType: 'json'
});

// 数値範囲検索
const results2 = await db.search({
  numericRange: {
    path: 'price',
    min: 3000,
    max: 4000
  }
});

// キーパス検索
const results3 = await db.search({
  keyPath: {
    path: 'category',
    value: '技術書'
  }
});

// [v1.3.0+] フィールド値直接マッチング
// オブジェクトをそのまま渡すことで、フィールドごとの値を検索可能
// （数値は近似値、文字列は部分一致も評価されます）
const results4 = await db.search({
  category: '技術書',
  price: 3500
});
```

### 一括追加

```javascript
const documents = [
  'ドキュメント1',
  'ドキュメント2',
  'ドキュメント3'
];

await db.addBatch(documents);
```

### ストリーミング検索

```javascript
// 早期終了可能な検索
for await (const result of db.searchStream('検索クエリ', {
  threshold: 0.7
})) {
  console.log(result);
  
  // 条件を満たしたら終了
  if (result.similarity > 0.95) {
    break;
  }
}
```

## 応用例

### 1. ドキュメント検索システム

```javascript
// 大量のドキュメントを管理
const docDB = new PsfDB('DocumentDB');

// Markdown、PDF、Wordなどから抽出したテキストを保存
await docDB.add(extractedText, {
  filename: 'report.pdf',
  createdAt: new Date()
});

// 全文検索
const docs = await docDB.search('四半期レポート');
```

### 2. 商品レコメンデーション

```javascript
### 2. 商品レコメンデーション

```javascript
// 商品データを保存
await productDB.add({
  id: 'product-123',
  name: 'ワイヤレスマウス',
  specs: {
    wireless: true,
    battery: 'rechargeable'
  },
  price: 2980
});

// 類似商品を検索
const similar = await productDB.search({
  keyPath: { path: 'specs.wireless', value: true },
  numericRange: { path: 'price', min: 2000, max: 4000 }
});
```

### 3. ログ分析

```javascript
// アプリケーションログを保存
await logDB.add({
  level: 'ERROR',
  message: 'Database connection failed',
  timestamp: Date.now(),
  user: 'user123'
});

// エラーログを検索
const errors = await logDB.search({
  keyPath: { path: 'level', value: 'ERROR' },
  text: 'database'
});
```

### 4. チャットボット

```javascript
// FAQ データベース
await faqDB.add({
  question: '返品はできますか？',
  answer: '購入から30日以内であれば返品可能です。'
});

// ユーザーの質問に類似するFAQを検索
const faqs = await faqDB.search(userQuestion, {
  limit: 3,
  threshold: 0.6
});
```

## 制限事項

### 精度の限界

- 深い意味理解は困難
- コンテキストの把握が弱い
- 多義語の曖昧性解消が不十分

→ **解決策**: 複数の結果を提示し、ユーザーに選択させる

### スケーラビリティ

- 数十万件以上では検索速度が低下
- ブラウザのメモリ制限

→ **解決策**: データを分割、WebWorkerで並列処理

### 言語依存

- 現在は日本語・英語に最適化
- 他言語では精度が低下する可能性

→ **解決策**: 言語ごとにトークナイザーをカスタマイズ

## カスタマイズ

### レイヤーの重み調整

```javascript
class CustomFingerprint extends SemanticFingerprint {
  similarity(other) {
    // 重みをカスタマイズ
    const charSim = this.jaccardSimilarity(...) * 0.05;   // 文字: 5%
    const ngramSim = this.hammingSimilarity(...) * 0.25;  // n-gram: 25%
    const topicSim = this.cosineSimilarity(...) * 0.50;   // トピック: 50%
    const syntaxSim = this.hammingSimilarity(...) * 0.20; // 構文: 20%
    
    return charSim + ngramSim + topicSim + syntaxSim;
  }
}
```

### カスタムレイヤー追加

```javascript
class EnhancedFingerprint extends SemanticFingerprint {
  constructor(data) {
    super(data);
    
    // 新しいレイヤーを追加
    this.layers.customLayer = this.generateCustomLayer(data);
  }
  
  generateCustomLayer(data) {
    // カスタムロジック
    return customHash;
  }
}
```

### IDF辞書の使用

```javascript
class IDFFingerprint extends SemanticFingerprint {
  constructor(data, idfDict) {
    super(data);
    this.idfDict = idfDict;
  }
  
  getIdfWeight(term) {
    return this.idfDict.get(term) || 1.0;
  }
}
```

## ベストプラクティス

### 1. 適切な閾値設定

```javascript
// 用途に応じて閾値を調整
const strictSearch = await db.search(query, { threshold: 0.8 });  // 厳密
const relaxedSearch = await db.search(query, { threshold: 0.3 }); // 緩い
```

### 2. バッチ処理

```javascript
// 大量データは分割して追加
const batchSize = 100;
for (let i = 0; i < documents.length; i += batchSize) {
  const batch = documents.slice(i, i + batchSize);
  await db.addBatch(batch);
  
  // 進捗表示
  console.log(`${i + batch.length} / ${documents.length}`);
}
```

### 3. インデックス最適化

```javascript
// 定期的にデータベースを再構築
async function optimizeDB() {
  const all = await db.getAll();
  await db.clear();
  await db.addBatch(all.map(r => r.originalData));
}
```

### 4. エラーハンドリング

```javascript
try {
  const results = await db.search(query);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    console.error('ストレージ容量不足');
  } else {
    console.error('検索エラー:', error);
  }
}
```

## トラブルシューティング

### Q: 検索結果が少ない

A: 閾値を下げてみてください。
```javascript
const results = await db.search(query, { threshold: 0.2 });
```

### Q: 検索が遅い

A: 段階的に取得してください。
```javascript
for await (const result of db.searchStream(query)) {
  // 最初の数件で十分な場合は早期終了
  if (satisfactory(result)) break;
}
```

### Q: メモリ不足

A: データを分割するか、古いデータを削除してください。
```javascript
// v1.4.0以降: 組み込みメソッドで古いデータを削除
// 1週間以上前のデータを削除
const count = await db.deleteOlderThan(7 * 24 * 60 * 60 * 1000);
console.log(`${count}件のレコードを削除しました`);

// 条件に一致するデータを一括削除
await db.deleteWhere(record => record.dataType === 'text');
```

## ライセンス

MIT License

## 貢献

Issue、Pull Requestを歓迎します。

## 今後の展開

- [ ] WebWorkerによる並列処理
- [ ] WebGPU対応（レイヤー4実装）
- [ ] 多言語対応の強化
- [ ] 圧縮アルゴリズムの改善
- [ ] リアルタイム更新対応
- [ ] クラスタリング機能
- [ ] 可視化ツール

## 参考文献

- MinHash: Broder, A. Z. (1997). "On the resemblance and containment of documents"
- SimHash: Charikar, M. S. (2002). "Similarity estimation techniques from rounding algorithms"
- Bloom Filter: Bloom, B. H. (1970). "Space/time trade-offs in hash coding with allowable errors"
- Locality Sensitive Hashing: Indyk, P., & Motwani, R. (1998). "Approximate nearest neighbors: towards removing the curse of dimensionality"

## お問い合わせ

ご質問、ご提案がございましたら、GitHubのIssueまでお願いします。
