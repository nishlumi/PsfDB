/**
 * Semantic Fingerprint - Usage Examples
 * 
 * This file contains various usage examples
 */

// ============================================================================
// Environment Setup (Node.js and Browser compatibility)
// ============================================================================

let SemanticFingerprint, PsfDB;

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  // Node.js
  PsfDB = require('./psfdb.js');
  SemanticFingerprint = PsfDB.Fingerprint;
} else if (typeof window !== 'undefined') {
  // Browser (Global variables from script tags)
  PsfDB = window.PsfDB;
  SemanticFingerprint = PsfDB.Fingerprint;
}

// ============================================================================
// Example 1: Basic Text Search
// ============================================================================

async function example1_basicTextSearch() {
  console.log('=== Example 1: Basic Text Search ===\n');

  const db = new PsfDB('Example1DB');
  await db.initialize();

  // Add data
  const documents = [
    'Machine learning is a field of artificial intelligence.',
    'Deep learning is also called deep neural networks.',
    'JavaScript is a popular programming language.',
    'Python is widely used in data science.',
    'Machine learning has various algorithms.'
  ];

  console.log('Adding data...');
  for (const doc of documents) {
    await db.add(doc);
  }

  // Search
  console.log('\nSearch: "about machine learning"');
  const results = await db.search('about machine learning', {
    limit: 3,
    threshold: 0.3
  });

  console.log(`\nResults: ${results.length} items\n`);
  results.forEach((result, i) => {
    console.log(`${i + 1}. [Similarity: ${result.similarity.toFixed(3)}]`);
    console.log(`   ${result.data}\n`);
  });

  await db.close();
}

// ============================================================================
// Example 2: JSON Search
// ============================================================================

async function example2_jsonSearch() {
  console.log('=== Example 2: JSON Search ===\n');

  const db = new PsfDB('Example2DB');
  await db.initialize();

  // Product data
  const products = [
    {
      id: 1,
      name: 'Introduction to Machine Learning',
      category: 'Tech Books',
      price: 3500,
      tags: ['AI', 'Python', 'Beginner'],
      specs: {
        pages: 450,
        publisher: 'Tech Publishing'
      }
    },
    {
      id: 2,
      name: 'Deep Learning Practical Guide',
      category: 'Tech Books',
      price: 4800,
      tags: ['AI', 'Deep Learning', 'Advanced'],
      specs: {
        pages: 680,
        publisher: 'AI Books'
      }
    },
    {
      id: 3,
      name: 'JavaScript Complete Guide',
      category: 'Tech Books',
      price: 3200,
      tags: ['JavaScript', 'Web Development'],
      specs: {
        pages: 520,
        publisher: 'Web Publishing'
      }
    },
    {
      id: 4,
      name: 'Python Data Analysis Introduction',
      category: 'Tech Books',
      price: 3800,
      tags: ['Python', 'Data Analysis', 'Beginner'],
      specs: {
        pages: 400,
        publisher: 'Data Press'
      }
    }
  ];

  console.log('Adding product data...');
  for (const product of products) {
    await db.add(product);
  }

  // Search 1: Text search
  console.log('\nSearch 1: "machine learning"');
  const results1 = await db.search('machine learning', {
    limit: 2,
    threshold: 0.3,
    dataType: 'json'
  });

  console.log(`Results: ${results1.length} items\n`);
  results1.forEach((result, i) => {
    console.log(`${i + 1}. [Similarity: ${result.similarity.toFixed(3)}]`);
    console.log(`   ${result.data.name} - ¥${result.data.price}`);
    console.log(`   Tags: ${result.data.tags.join(', ')}\n`);
  });

  // Search 2: Price range search
  console.log('\nSearch 2: Books priced 3000-4000 yen');
  const results2 = await db.search({
    numericRange: {
      path: 'price',
      min: 3000,
      max: 4000
    }
  }, {
    limit: 5,
    threshold: 0.5
  });

  console.log(`Results: ${results2.length} items\n`);
  results2.forEach((result, i) => {
    console.log(`${i + 1}. ${result.data.name} - ¥${result.data.price}`);
  });

  // Search 3: Combined conditions
  console.log('\n\nSearch 3: Beginner books with "Python" tag');
  const results3 = await db.search({
    text: 'Python beginner',
    keyPath: {
      path: 'tags',
      value: 'Beginner'
    }
  }, {
    limit: 3,
    threshold: 0.3
  });

  console.log(`Results: ${results3.length} items\n`);
  results3.forEach((result, i) => {
    console.log(`${i + 1}. [Similarity: ${result.similarity.toFixed(3)}]`);
    console.log(`   ${result.data.name}`);
    console.log(`   Tags: ${result.data.tags.join(', ')}\n`);
  });

  await db.close();
}

// ============================================================================
// Example 3: Streaming Search
// ============================================================================

async function example3_streamingSearch() {
  console.log('=== Example 3: Streaming Search ===\n');

  const db = new PsfDB('Example3DB');
  await db.initialize();

  // Add large amount of data
  console.log('Generating 1000 documents...');
  const documents = [];
  const topics = ['AI', 'Machine Learning', 'Web Development', 'Database', 'Security'];

  for (let i = 0; i < 1000; i++) {
    const topic = topics[i % topics.length];
    documents.push(`Document ${i + 1} about ${topic}`);
  }

  console.log('Adding data...');
  await db.addBatch(documents);

  console.log('\nStreaming search: "Machine Learning"');
  console.log('(Exit after finding top 5)n');

  let count = 0;
  const maxResults = 5;

  for await (const result of db.searchStream('Machine Learning', {
    threshold: 0.4
  })) {
    console.log(`${count + 1}. [Similarity: ${result.similarity.toFixed(3)}] ${result.data}`);
    count++;

    if (count >= maxResults) {
      console.log('\nExiting after retrieving top 5 results');
      break;
    }
  }

  await db.close();
}

// ============================================================================
// Example 4: Performance Test
// ============================================================================

async function example4_performanceTest() {
  console.log('=== Example 4: Performance Test ===\n');

  const db = new PsfDB('Example4DB');
  await db.initialize();

  const sizes = [100, 500, 1000];

  for (const size of sizes) {
    console.log(`\n--- Testing with ${size} records ---`);

    // Generate data
    const documents = [];
    for (let i = 0; i < size; i++) {
      documents.push(`This is test document number ${i}.`);
    }

    // Measure add time
    await db.clear();
    const addStart = performance.now();
    await db.addBatch(documents);
    const addTime = performance.now() - addStart;

    console.log(`Add time: ${addTime.toFixed(2)}ms (${(addTime / size).toFixed(2)}ms/item)`);

    // Measure search time
    const searchStart = performance.now();
    const results = await db.search('test document', {
      limit: 10,
      threshold: 0.3
    });
    const searchTime = performance.now() - searchStart;

    console.log(`Search time: ${searchTime.toFixed(2)}ms`);
    console.log(`Results: ${results.length} items`);
  }

  await db.close();
}

// ============================================================================
// Example 5: Direct Fingerprint Manipulation
// ============================================================================

function example5_directFingerprint() {
  console.log('=== Example 5: Direct Fingerprint Manipulation ===\n');

  // Text fingerprints
  const text1 = 'Machine learning is a field of artificial intelligence';
  const text2 = 'Machine learning is a field of AI';
  const text3 = 'JavaScript is a programming language';

  const fp1 = new SemanticFingerprint(text1);
  const fp2 = new SemanticFingerprint(text2);
  const fp3 = new SemanticFingerprint(text3);

  console.log('Text 1:', text1);
  console.log('Text 2:', text2);
  console.log('Text 3:', text3);
  console.log();

  console.log('Similarity:');
  console.log(`  text1 vs text2: ${fp1.similarity(fp2).toFixed(3)}`);
  console.log(`  text1 vs text3: ${fp1.similarity(fp3).toFixed(3)}`);
  console.log(`  text2 vs text3: ${fp2.similarity(fp3).toFixed(3)}`);

  console.log('\n--- JSON Fingerprints ---\n');

  const json1 = {
    name: 'Taro',
    age: 25,
    skills: ['JavaScript', 'Python']
  };

  const json2 = {
    name: 'Hanako',
    age: 28,
    skills: ['JavaScript', 'Ruby']
  };

  const json3 = {
    title: 'Engineer',
    salary: 500000
  };

  const jfp1 = new SemanticFingerprint(json1);
  const jfp2 = new SemanticFingerprint(json2);
  const jfp3 = new SemanticFingerprint(json3);

  console.log('JSON1:', JSON.stringify(json1));
  console.log('JSON2:', JSON.stringify(json2));
  console.log('JSON3:', JSON.stringify(json3));
  console.log();

  console.log('Structure similarity:');
  console.log(`  json1 vs json2: ${jfp1.similarityJSON(jfp2).toFixed(3)}`);
  console.log(`  json1 vs json3: ${jfp1.similarityJSON(jfp3).toFixed(3)}`);
  console.log(`  json2 vs json3: ${jfp2.similarityJSON(jfp3).toFixed(3)}`);
}

// ============================================================================
// Example 6: Serialization / Deserialization
// ============================================================================

function example6_serialization() {
  console.log('=== Example 6: Serialization / Deserialization ===\n');

  const original = new SemanticFingerprint('This is a test');

  console.log('Original fingerprint generated');

  // Serialize
  const serialized = original.serialize();
  console.log('\nSerialized (JSON string):');
  console.log(JSON.stringify(serialized).substring(0, 100) + '...');

  // Deserialize
  const restored = SemanticFingerprint.deserialize(serialized);
  console.log('\nDeserialization complete');

  // Verify
  const testFp = new SemanticFingerprint('This is a test');
  const sim1 = original.similarity(testFp);
  const sim2 = restored.similarity(testFp);

  console.log('\nVerification:');
  console.log(`  Original FP vs Test: ${sim1.toFixed(6)}`);
  console.log(`  Restored FP vs Test: ${sim2.toFixed(6)}`);
  console.log(`  Match: ${sim1 === sim2 ? 'Yes' : 'No'}`);
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Progressive Semantic Fingerprinting - Examples       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    await example1_basicTextSearch();
    console.log('\n' + '='.repeat(60) + '\n');

    await example2_jsonSearch();
    console.log('\n' + '='.repeat(60) + '\n');

    // Streaming search and performance tests are commented out
    // due to large data volumes - uncomment as needed

    // await example3_streamingSearch();
    // console.log('\n' + '='.repeat(60) + '\n');

    // await example4_performanceTest();
    // console.log('\n' + '='.repeat(60) + '\n');

    example5_directFingerprint();
    console.log('\n' + '='.repeat(60) + '\n');

    example6_serialization();

    console.log('\n\nAll examples completed successfully!');

  } catch (error) {
    console.error('Error occurred:', error);
  }
}

// Browser environment execution
if (typeof window !== 'undefined') {
  window.runAllExamples = runAllExamples;
  window.example1_basicTextSearch = example1_basicTextSearch;
  window.example2_jsonSearch = example2_jsonSearch;
  window.example3_streamingSearch = example3_streamingSearch;
  window.example4_performanceTest = example4_performanceTest;
  window.example5_directFingerprint = example5_directFingerprint;
  window.example6_serialization = example6_serialization;
}

// Node.js environment execution
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllExamples,
    example1_basicTextSearch,
    example2_jsonSearch,
    example3_streamingSearch,
    example4_performanceTest,
    example5_directFingerprint,
    example6_serialization
  };
}
