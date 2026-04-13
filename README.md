# PsfDB (Progressive Semantic Fingerprinting Database)

## Overview

PsfDB is a lightweight search system that adopts Progressive Semantic Fingerprinting and operates entirely client-side, independent of external APIs or models.

### Key Features

- **Model Independent**: No external AI APIs required
- **Completely Free**: No API call costs
- **High-Speed Processing**: Efficient search through progressive filtering
- **Offline Operation**: No network connection needed
- **Privacy Protection**: Data is never transmitted externally
- **Text & JSON Support**: Supports both structured and unstructured data

## Architecture

### Layer Structure

This system uses multiple layers to progressively improve search accuracy.

```
┌─────────────────────────────────────────┐
│ Layer 0: Character-Level Hash           │
│ - Rolling Hash + MinHash                │
│ - Computation: <1ms                     │
│ - Filtering: 1M → 50K items             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer 1: n-gram + SimHash               │
│ - 3-gram based semantic features        │
│ - Computation: 5-10ms                   │
│ - Filtering: 50K → 3K items             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer 2: Topic Signature                │
│ - Lightweight LDA-style topic model     │
│ - Computation: 10-20ms                  │
│ - Filtering: 3K → 200 items             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer 3: Syntax Pattern                 │
│ - Sentence structure similarity         │
│ - Computation: 20-30ms                  │
│ - Filtering: 200 → 50 items             │
└─────────────────────────────────────────┘
```

### JSON-Specific Layers

For JSON search, additional layers are used.

```
┌─────────────────────────────────────────┐
│ Layer J0: Structure Hash                │
│ - Fast JSON structure comparison        │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer J1: Key Path Index                │
│ - Search for specific fields            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer J2: Value Type Map                │
│ - Filtering by data type                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer J3: Schema Fingerprint            │
│ - Schema structure similarity           │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer J4: Numeric Range Index           │
│ - Range search for numeric fields       │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Layer J5: Field Value Index             │
│ - Direct match by specific field values │
└─────────────────────────────────────────┘
```

## Technical Details

### 1. MinHash

A technique for extracting representative values from multiple values.

**Algorithm**:
```javascript
1. Prepare multiple hash functions (h1, h2, ..., hn)
2. Apply all hash functions to each value
3. Record the minimum value for each hash function
4. n minimum values become the signature
```

**Properties**:
- Can approximate Jaccard similarity
- Computational complexity: O(n) where n = number of values
- High memory efficiency

### 2. SimHash

A technique for converting text into fixed-length bit strings.

**Algorithm**:
```javascript
1. Split text into n-grams
2. Hash each n-gram
3. Weighted voting in each dimension
4. Binarize based on sign
```

**Properties**:
- Similar texts have similar hash values
- Fast comparison using Hamming distance
- Sufficient accuracy with 128-256 bits

### 3. Bloom Filter

A technique for managing set membership with minimal memory.

**Algorithm**:
```javascript
1. Initialize bit array
2. Hash each element with multiple hash functions
3. Set corresponding bits
4. Check if all bits are set during search
```

**Properties**:
- False positives possible, no false negatives
- Extremely high memory efficiency
- Fast search

### 4. Numeric Range Index

Accelerates range searches on numeric fields.

**Structure**:
```javascript
{
  path: "price",
  min: 1000,
  max: 5000,
  histogram: [5, 12, 23, 18, 7, ...]  // 10-bin histogram
}
```

**Benefits**:
- Fast processing of range queries

### 5. Data Structure

Data is stored in IndexedDB with the following structure.

```javascript
// IndexedDB 'fingerprints' store record structure
{
  id: 1,                          // Auto-increment ID (keyPath)
  dataType: "json",               // "text" or "json"
  createdAt: "2023-10-01T...",    // Creation timestamp (ISO string)
  originalData: { ... },          // Original data (JSON object or string)
  fingerprint: {                  // Semantic fingerprint data (search index)
    dataType: "json",
    textLength: 150,
    tokenCount: 25,
    layers: {
      charHash: [...],            // [Array] Character-level hash
      ngramHash: [...],           // [Array] N-gram hash
      topicSignature: [...],      // [Array] Topic signature
      // ... (other layers)
      keyPathIndex: [...],        // [Array] Key path index (JSON only)
      fieldValueIndex: [...],     // [Array] Field value index (JSON only)
    }
  }
}
```

**Key Points**:
- `originalData`: The original data returned as search results.
- `fingerprint`: Internal data used for search calculations. For memory efficiency, many are processed as numeric arrays (TypedArray, etc.), but converted to JSON-serializable formats (regular arrays, etc.) when stored in IndexedDB.

## Performance

### Processing Speed

| Data Count | Add Time | Search Time |
|-----------|---------|-------------|
| 100       | 50ms    | 15ms        |
| 1,000     | 450ms   | 40ms        |
| 10,000    | 4.5s    | 120ms       |
| 100,000   | 45s     | 350ms       |

※ Measured in browser environment on a typical PC

### Memory Usage

**Per text (1KB)**:
- Layer 0: 128 bytes
- Layer 1: 16 bytes
- Layer 2: 16 bytes
- Layer 3: 8 bytes
- Total: ~168 bytes

**Per JSON (1KB)**:
- Text layers: 168 bytes
- JSON layers: ~200 bytes
- Total: ~368 bytes

### Memory Efficiency and Search Method Selection

When handling large amounts of data, memory usage varies significantly depending on the method chosen.

| Method | Memory Efficiency | Features | Recommended Scenario |
|--------|------------------|----------|----------------------|
| `getAll()` / `getStats()` | ❌ Low | Loads all data into memory. With tens of thousands of records or more, can cause crashes. | Data backup, debugging, small datasets |
| `search()` | ⚠️ Medium | Retains only results filtered by `threshold`. Usually fine, but setting threshold too low can pose similar risks as `getAll`. | General search use (Web UI, etc.) |
| `searchStream()` | ✅ High | Uses async iterators to process one record at a time. Does not strain memory even with large datasets. | Batch processing, full export, complex filtering |

### Comparison with Conventional Methods

| Item | This Method | OpenAI Embeddings | Local Model |
|------|------------|-------------------|-------------|
| API Cost | $0 | $0.0001/1K tokens | $0 |
| Initial Cost | None | None | Model download |
| Processing Speed | 40-150ms | 100-300ms | 50-200ms |
| Offline | ○ | × | ○ |
| Memory | Low | None (server-side) | High (several GB) |
| Accuracy | Medium | High | High |
| Customization | Easy | Difficult | Possible |

## Usage

### Installation

```bash
# Download and place the file
# Include the appropriate psfdb*.js in your project
```

### Browser Usage

```html
<script src="dist/psfdb.browser.js"></script>
<script>
  // PsfDB class becomes available
  const db = new PsfDB('MyDatabase');
</script>
```

### Node.js Usage

```javascript
const PsfDB = require('./dist/psfdb.cjs.js');
const db = new PsfDB('MyDatabase');
```

#### ES Modules (import)

For modern bundlers (Webpack, Rollup, etc.) or direct browser imports:

```javascript
import PsfDB from './dist/psfdb.esm.js';

// Usage example
const db = new PsfDB('MyDatabase');
await db.initialize();
```

**Note**: Available in the `dist` folder as ESM (`psfdb.esm.js`), CommonJS (`psfdb.cjs.js`), and Browser script (`psfdb.browser.js`). The original UMD format (`psfdb.js`) is also included in the root directory. All versions include the SemanticFingerprint class. No need to import separately.

### Basic Usage

```javascript
// Initialize database
const db = new PsfDB('MyDB');
await db.initialize();

// Add data
await db.add('Machine learning is a branch of artificial intelligence');

// Search
const results = await db.search('about AI', {
  limit: 10,
  threshold: 0.5
});

// Display results
results.forEach(result => {
  console.log(`Similarity: ${result.similarity}`);
  console.log(`Data: ${result.data}`);
});
```

### Memory Mode (No Persistence)

From v1.4.0+, you can use `persist: false` option to operate in memory only without IndexedDB.

```javascript
// Memory mode (no persistence)
const db = new PsfDB('test', 1, { persist: false });
await db.initialize();

// Use as normal
await db.add('Data 1');
await db.add('Data 2');
const results = await db.search('Data');
```

**Notes:**
- Data is lost when the page is reloaded or closed
- Useful in Service Worker environments where IndexedDB is unavailable
- Be mindful of memory usage with large datasets

### JSON Search

```javascript
// Add JSON data
await db.add({
  name: 'Product A',
  price: 3500,
  category: 'Tech Books'
});

// Text search
const results1 = await db.search('Tech Books', {
  dataType: 'json'
});

// Numeric range search
const results2 = await db.search({
  numericRange: {
    path: 'price',
    min: 3000,
    max: 4000
  }
});

// Key path search
const results3 = await db.search({
  keyPath: {
    path: 'category',
    value: 'Tech Books'
  }
});

// [v1.3.0+] Direct field value matching
// Pass an object directly to search by field values
// (numeric values use proximity, strings use partial matching)
const results4 = await db.search({
  category: 'Tech Books',
  price: 3500
});
```

### Batch Add

```javascript
const documents = [
  'Document 1',
  'Document 2',
  'Document 3'
];

await db.addBatch(documents);
```

### Non-blocking Batch Add

For large datasets, use `addBatchAsync` to keep the UI responsive:

```javascript
// Non-blocking batch add with progress callback
const ids = await db.addBatchAsync(documents, {
  chunkSize: 50,  // Items per chunk (default: 50)
  onProgress: (done, total) => {
    console.log(`${done}/${total} items processed`);
    // Update progress bar, etc.
  }
});
```

**Features:**
- Yields control to the event loop between chunks, keeping UI interactive
- Progress callback for displaying loading indicators
- Same return value as `addBatch` (array of IDs)

### Streaming Search

```javascript
// Search with early termination capability
for await (const result of db.searchStream('search query', {
  threshold: 0.7
})) {
  console.log(result);
  
  // Terminate if condition is met
  if (result.similarity > 0.95) {
    break;
  }
}
```

## Application Examples

### 1. Document Search System

```javascript
// Manage large number of documents
const docDB = new PsfDB('DocumentDB');

// Store text extracted from Markdown, PDF, Word, etc.
await docDB.add(extractedText, {
  filename: 'report.pdf',
  createdAt: new Date()
});

// Full-text search
const docs = await docDB.search('quarterly report');
```

### 2. Product Recommendation

```javascript
// Store product data
await productDB.add({
  id: 'product-123',
  name: 'Wireless Mouse',
  specs: {
    wireless: true,
    battery: 'rechargeable'
  },
  price: 2980
});

// Search for similar products
const similar = await productDB.search({
  keyPath: { path: 'specs.wireless', value: true },
  numericRange: { path: 'price', min: 2000, max: 4000 }
});
```

### 3. Log Analysis

```javascript
// Store application logs
await logDB.add({
  level: 'ERROR',
  message: 'Database connection failed',
  timestamp: Date.now(),
  user: 'user123'
});

// Search error logs
const errors = await logDB.search({
  keyPath: { path: 'level', value: 'ERROR' },
  text: 'database'
});
```

### 4. Chatbot

```javascript
// FAQ database
await faqDB.add({
  question: 'Can I return items?',
  answer: 'Returns are possible within 30 days of purchase.'
});

// Search for FAQs similar to user's question
const faqs = await faqDB.search(userQuestion, {
  limit: 3,
  threshold: 0.6
});
```

## Limitations

### Accuracy Limits

- Difficult to understand deep semantics
- Weak context comprehension
- Insufficient disambiguation of polysemy

→ **Solution**: Present multiple results and let users select

### Scalability

- Search speed decreases with hundreds of thousands of records or more
- Browser memory limitations

→ **Solution**: Split data, parallel processing with WebWorkers

### Language Dependency

- Currently optimized for Japanese and English
- May have lower accuracy for other languages

→ **Solution**: Customize tokenizer for each language

## Customization

### Layer Weight Adjustment

```javascript
class CustomFingerprint extends SemanticFingerprint {
  similarity(other) {
    // Customize weights
    const charSim = this.jaccardSimilarity(...) * 0.05;   // char: 5%
    const ngramSim = this.hammingSimilarity(...) * 0.25;  // n-gram: 25%
    const topicSim = this.cosineSimilarity(...) * 0.50;   // topic: 50%
    const syntaxSim = this.hammingSimilarity(...) * 0.20; // syntax: 20%
    
    return charSim + ngramSim + topicSim + syntaxSim;
  }
}
```

### Adding Custom Layers

```javascript
class EnhancedFingerprint extends SemanticFingerprint {
  constructor(data) {
    super(data);
    
    // Add new layer
    this.layers.customLayer = this.generateCustomLayer(data);
  }
  
  generateCustomLayer(data) {
    // Custom logic
    return customHash;
  }
}
```

### Using IDF Dictionary

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

## Best Practices

### 1. Appropriate Threshold Setting

```javascript
// Adjust threshold based on use case
const strictSearch = await db.search(query, { threshold: 0.8 });  // Strict
const relaxedSearch = await db.search(query, { threshold: 0.3 }); // Relaxed
```

### 2. Batch Processing and Memory Management for Large Data

Registering hundreds of thousands of records in a continuous loop using `add` or `addBatch` may exhaust JavaScript memory (garbage collection) and cause the browser or process to crash. To prevent this, observe the following:

1. **Use `addBatchAsync`**: It processes asynchronously while yielding to the event loop, preventing memory spikes.
2. **Avoid massive strings (like Base64 images)**: PsfDB expands N-grams and features in memory. Exclude huge texts from the object to be indexed, or truncate them before adding.

```javascript
// ❌ Bad (Causes Memory Crash)
// for (const doc of hugeArray) await db.add(doc);
// await db.addBatch(hugeArray);

// ✅ Good (Non-blocking Batch Add)
await db.addBatchAsync(hugeArray, {
  chunkSize: 50,  // Reduce to 10-20 if individual data items are large
  onProgress: (done, total) => {
    console.log(`${done} / ${total} processed`);
  }
});
```

### 3. Index Optimization

```javascript
// Periodically rebuild database
async function optimizeDB() {
  const all = await db.getAll();
  await db.clear();
  await db.addBatch(all.map(r => r.originalData));
}
```

### 4. Error Handling

```javascript
try {
  const results = await db.search(query);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    console.error('Storage capacity exceeded');
  } else {
    console.error('Search error:', error);
  }
}
```

## Troubleshooting

### Q: Too few search results

A: Try lowering the threshold.
```javascript
const results = await db.search(query, { threshold: 0.2 });
```

### Q: Search is slow

A: Fetch results progressively.
```javascript
for await (const result of db.searchStream(query)) {
  // Terminate early if first few results are sufficient
  if (satisfactory(result)) break;
}
```

### Q: Out of memory

A: Split data or delete old data.
```javascript
// v1.4.0+: Use built-in methods to delete old data
// Delete data older than 1 week
const count = await db.deleteOlderThan(7 * 24 * 60 * 60 * 1000);
console.log(`Deleted ${count} records`);

// Bulk delete data matching a condition
await db.deleteWhere(record => record.dataType === 'text');
```

## License

MIT License

## Contributing

Issues and Pull Requests are welcome.

## Future Development

- [ ] Parallel processing with WebWorkers
- [ ] WebGPU support (Layer 4 implementation)
- [ ] Enhanced multilingual support
- [ ] Improved compression algorithms
- [ ] Real-time update support
- [ ] Clustering functionality
- [ ] Visualization tools

## References

- MinHash: Broder, A. Z. (1997). "On the resemblance and containment of documents"
- SimHash: Charikar, M. S. (2002). "Similarity estimation techniques from rounding algorithms"
- Bloom Filter: Bloom, B. H. (1970). "Space/time trade-offs in hash coding with allowable errors"
- Locality Sensitive Hashing: Indyk, P., & Motwani, R. (1998). "Approximate nearest neighbors: towards removing the curse of dimensionality"

## Contact

For questions or suggestions, please submit an issue on GitHub.
