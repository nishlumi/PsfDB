# Quick Start Guide

Get started with Progressive Semantic Fingerprinting in 5 minutes.

## Installation

### Browser Environment (Script Tag)

Add the following to your HTML file. Note that `psfdb-sf.js` must be loaded **first**.

```html
<script src="psfdb.js"></script>
<script>
  // Available as a global variable
  const db = new PsfDB();
</script>
```

### Node.js Environment (CommonJS)

Load using `require`.

```bash
# Copy file to your project
cp psfdb.js your-project/
```

```javascript
/* main.js */
const PsfDB = require('./psfdb.js');
const SemanticFingerprint = PsfDB.Fingerprint;

// Usage
const db = new PsfDB();
```

## Basic Usage in 30 Seconds

```javascript
// 1. Create database
const db = new PsfDB();
await db.initialize();

// 2. Add data
await db.add('Machine learning is a branch of artificial intelligence');
await db.add('JavaScript is a programming language');
await db.add('Python is popular for data science');

// 3. Search
const results = await db.search('tell me about AI', {
  limit: 5,
  threshold: 0.3
});

// 4. Display results
results.forEach(result => {
  console.log(`[${result.similarity.toFixed(2)}] ${result.data}`);
});
```

## JSON Search Example

```javascript
// Add product data
await db.add({
  name: 'Wireless Mouse',
  price: 2980,
  category: 'Peripherals',
  inStock: true
});

await db.add({
  name: 'Keyboard',
  price: 8900,
  category: 'Peripherals',
  inStock: false
});

// Search by price range
const results = await db.search({
  numericRange: {
    path: 'price',
    min: 2000,
    max: 5000
  }
});
console.log(results); // Wireless Mouse found

// [v1.3.0+] Direct field value search
// More intuitive search
const results2 = await db.search({
  category: 'Peripherals',
  inStock: true
}); 
console.log(results2); // Both found (sorted by similarity score)
```

## Common Usage Patterns

### Pattern 1: Document Search

```javascript
const docDB = new PsfDB('DocumentSearch');
await docDB.initialize();

// Add documents
const documents = [
  'Chapter 1: Introduction',
  'Chapter 2: Basic Concepts',
  'Chapter 3: Practical Examples'
];

for (const doc of documents) {
  await docDB.add(doc);
}

// Keyword search
const chapters = await docDB.search('basics', { limit: 3 });
```

### Pattern 2: FAQ Search

```javascript
const faqDB = new PsfDB('FAQ');
await faqDB.initialize();

// FAQ data
await faqDB.add({
  question: 'Can I return items?',
  answer: 'Returns are possible within 30 days of purchase'
});

await faqDB.add({
  question: 'How much is shipping?',
  answer: 'Nationwide flat rate of 500 yen'
});

// Search for similar FAQs based on user question
const similar = await faqDB.search('I want to return a product', {
  threshold: 0.4
});

console.log(similar[0].data.answer); // Return policy answer displayed
```

### Pattern 3: Product Recommendation

```javascript
const productDB = new PsfDB('Products');
await productDB.initialize();

// Register products
await productDB.add({
  id: 'p1',
  name: 'Laptop',
  tags: ['electronics', 'work', 'portable'],
  price: 89000
});

await productDB.add({
  id: 'p2',
  name: 'Tablet',
  tags: ['electronics', 'entertainment', 'portable'],
  price: 45000
});

// Search for similar products
const similar = await productDB.search({
  keyPath: { path: 'tags', value: 'portable' },
  numericRange: { path: 'price', min: 40000, max: 100000 }
});
```

## Try the Demo

Open `demo.html` in a browser to launch an interactive demo:

```bash
# Open in browser
open demo.html
```

The demo allows you to try:
- Text search
- JSON search (price range, key path)
- Display statistics
- Database management

## Next Steps

For detailed usage, refer to:

1. **README.md** - Complete documentation
2. **examples.js** - Various usage examples
3. **psfdb.js** - Source code (with comments)

## Troubleshooting

### If IndexedDB is unavailable

```javascript
// Operate in memory only (no persistence)
const fingerprints = [];

async function search(query) {
  const queryFp = new SemanticFingerprint(query);
  
  return fingerprints
    .map(fp => ({
      similarity: queryFp.similarity(fp.fingerprint),
      data: fp.data
    }))
    .filter(r => r.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);
}
```

### Browser storage limit

```javascript
// Automatically delete old data
async function cleanupOldData(db, maxAge) {
  const cutoff = Date.now() - maxAge;
  const all = await db.getAll();
  
  for (const record of all) {
    if (new Date(record.createdAt) < cutoff) {
      await db.delete(record.id);
    }
  }
}

// Delete data older than 1 week
await cleanupOldData(db, 7 * 24 * 60 * 60 * 1000);
```

## Support

For questions or issues, please submit to GitHub Issues.

Happy searching! 🔍
