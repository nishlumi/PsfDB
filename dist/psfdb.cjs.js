/**
 * PsfDB (Progressive Semantic Fingerprinting Database)
 *
 * Model-independent lightweight semantic search system
 * Supports both text (Japanese/English) and JSON
 * Persistence with IndexedDB + async iterator support
 *
 * @version 1.0.0
 * @license MIT
 */

// ============================================================================
    // Part 1: SemanticFingerprint (Core Logic)
    // ============================================================================

    /**
     * Progressive Semantic Fingerprinting
     *
     * @version 1.0.0
     * @license MIT
     */
    class SemanticFingerprint {
        constructor(data, options = {}) {
            this.dataType = typeof data === 'string' ? 'text' : 'json';
            this.rawData = data;
            this.options = {
                dimensions: options.dimensions || 128,
                ...options,
            };

            this.layers = {
                charHash: null,
                ngramHash: null,
                topicSignature: null,
                syntaxPattern: null,
                substringBloom: null,
                tokenSet: null,

                structureHash: null,
                keyPathIndex: null,
                valueTypeMap: null,
                schemaSignature: null,
                numericRanges: null,
                // NEW: JSONフィールド値のインデックス
                fieldValueIndex: null,
            };

            this._textLength = 0;
            this._tokenCount = 0;

            this._initialize();
        }

        _initialize() {
            if (this.dataType === 'json') {
                this._generateJSONLayers(this.rawData);
                const allText = this._extractAllText(this.rawData);
                this._generateTextLayers(allText);
            } else {
                this._generateTextLayers(this.rawData);
            }
        }

        // ==========================================================================
        // Text Layer Generation (unchanged since v1.2.0)
        // ==========================================================================

        _generateTextLayers(text) {
            this._textLength = text.length;
            const tokens = this.tokenize(text);
            this._tokenCount = tokens.length;

            this.layers.charHash = this._generateCharHash(text);
            this.layers.ngramHash = this._generateNgramHash(text);
            this.layers.topicSignature = this._generateTopicSignature(text);
            this.layers.syntaxPattern = this._generateSyntaxPattern(text);
            this.layers.substringBloom = this._generateSubstringBloom(text);
            this.layers.tokenSet = this._generateTokenSet(tokens);
        }

        _generateCharHash(text) {
            const prime = 31;
            const windowSize = 3;
            const values = [];

            const normalized = text.toLowerCase();
            for (let i = 0; i <= normalized.length - windowSize; i++) {
                let hash = 0;
                for (let j = 0; j < windowSize; j++) {
                    hash = Math.imul(hash, prime) + normalized.charCodeAt(i + j);
                    hash |= 0;
                }
                values.push((hash >>> 0) % 100003);
            }

            if (values.length === 0) values.push(0);
            return this._minHash(values, 32);
        }

        _minHash(values, numHashes) {
            const signatures = new Uint32Array(numHashes);

            for (let i = 0; i < numHashes; i++) {
                let minVal = 0xFFFFFFFF;
                const seed = Math.imul(i + 1, 16777619) >>> 0;

                for (const v of values) {
                    const h = this._fnvHash(String(v), seed);
                    if (h < minVal) minVal = h;
                }

                signatures[i] = minVal;
            }

            return signatures;
        }

        _generateNgramHash(text) {
            const ngrams = this._extractNgrams(text, 2);
            const dims = this.options.dimensions;
            const vector = new Int32Array(dims);

            for (const ngram of ngrams) {
                const hash = this._fnvHash(ngram);
                const weight = this._getIdfWeight(ngram);

                for (let i = 0; i < dims; i++) {
                    const block = Math.floor(i / 32);
                    const bit = i % 32;
                    const h = block === 0 ? hash : this._fnvHash(ngram, hash + block);
                    vector[i] += ((h >>> bit) & 1) ? weight : -weight;
                }
            }

            const binary = new Uint8Array(Math.ceil(dims / 8));
            for (let i = 0; i < dims; i++) {
                if (vector[i] > 0) {
                    binary[i >>> 3] |= 1 << (i & 7);
                }
            }

            return binary;
        }

        _extractNgrams(text, n) {
            const ngrams = new Set();
            const normalized = text.toLowerCase().replace(/\s+/g, ' ');

            for (let i = 0; i <= normalized.length - n; i++) {
                ngrams.add(normalized.slice(i, i + n));
            }

            const tokens = this.tokenize(text);
            for (let i = 0; i < tokens.length - 1; i++) {
                ngrams.add(`W:${tokens[i]}|${tokens[i + 1]}`);
            }

            return Array.from(ngrams);
        }

        _generateTopicSignature(text) {
            const words = this.tokenize(text).filter((w) => !this._isStopWord(w));
            const numTopics = 16;
            const topicScores = new Float32Array(numTopics);

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const context = i + 1 < words.length ? words[i + 1] : words[0];

                const soloTopic = this._fnvHash(word) % numTopics;
                const pairTopic = this._fnvHash(word + ':' + context) % numTopics;
                const weight = this._getIdfWeight(word);

                topicScores[soloTopic] += weight;
                topicScores[pairTopic] += weight * 0.5;
            }

            let norm = 0;
            for (let i = 0; i < numTopics; i++) norm += topicScores[i] ** 2;
            norm = Math.sqrt(norm);
            if (norm > 0) {
                for (let i = 0; i < numTopics; i++) topicScores[i] /= norm;
            }

            return new Uint8Array(
                Array.from(topicScores).map((s) => Math.min(Math.floor(s * 15), 15))
            );
        }

        _generateSyntaxPattern(text) {
            const sentences = text.split(/[.!?。！？\n]/);
            const patterns = [];

            for (const sent of sentences) {
                const trimmed = sent.trim();
                if (trimmed.length === 0) continue;

                const words = this.tokenize(trimmed);
                if (words.length === 0) continue;

                const lengthPattern = words
                    .map((w) => (w.length <= 2 ? 'S' : w.length <= 5 ? 'M' : 'L'))
                    .join('');
                patterns.push('LEN:' + lengthPattern);
                patterns.push('WCOUNT:' + Math.floor(words.length / 3));
                patterns.push('HEAD:' + words[0]);
                patterns.push('TAIL:' + words[words.length - 1]);
            }

            return this._bloomFilter(patterns, 64);
        }

        _generateSubstringBloom(text) {
            const normalized = text.toLowerCase().replace(/\s+/g, '');
            const items = [];

            for (let len = 2; len <= Math.min(6, normalized.length); len++) {
                for (let i = 0; i <= normalized.length - len; i++) {
                    items.push(normalized.slice(i, i + len));
                }
            }

            const tokens = this.tokenize(text);
            for (const token of tokens) {
                items.push('T:' + token);
            }

            return this._bloomFilter(items, 256);
        }

        _generateTokenSet(tokens) {
            return [...new Set(tokens.map((t) => t.toLowerCase()))];
        }

        // ==========================================================================
        // JSON Layer Generation (fieldValueIndex added)
        // ==========================================================================

        _generateJSONLayers(jsonData) {
            this.layers.structureHash = this._generateStructureHash(jsonData);
            this.layers.keyPathIndex = this._generateKeyPathIndex(jsonData);
            this.layers.valueTypeMap = this._generateValueTypeMap(jsonData);
            this.layers.schemaSignature = this._generateSchemaSignature(jsonData);
            this.layers.numericRanges = this._generateNumericRanges(jsonData);
            this.layers.fieldValueIndex = this._generateFieldValueIndex(jsonData); // NEW
        }

        /**
         * NEW: Field Value Index
         *
         * For each field in JSON, normalize and store key-value pairs.
         * Allows direct matching with query fields during search.
         */
        _generateFieldValueIndex(data) {
            const entries = [];
            this._collectFieldValues(data, [], entries);
            return entries;
        }

        _collectFieldValues(obj, path, out) {
            if (Array.isArray(obj)) {
                obj.forEach((item, i) => {
                    this._collectFieldValues(item, [...path, `[${i}]`], out);
                });
            } else if (typeof obj === 'object' && obj !== null) {
                for (const [key, value] of Object.entries(obj)) {
                    const currentPath = [...path, key].join('.');

                    if (value !== null && typeof value !== 'object') {
                        // Add primitive value to index
                        out.push({
                            key: key.toLowerCase(),
                            path: currentPath.toLowerCase(),
                            value: value,
                            normalizedValue: String(value).toLowerCase(),
                            type: typeof value,
                        });
                    }

                    // Recurse into nested objects
                    if (typeof value === 'object' && value !== null) {
                        this._collectFieldValues(value, [...path, key], out);
                    }
                }
            }
        }

        _generateStructureHash(data, path = '') {
            const structure = [];
            this._collectStructure(data, path, structure);
            return this._bloomFilter(structure, 128);
        }

        _collectStructure(data, path, out) {
            if (Array.isArray(data)) {
                out.push(`${path}[]`);
                if (data.length > 0) this._collectStructure(data[0], `${path}[0]`, out);
            } else if (typeof data === 'object' && data !== null) {
                for (const key of Object.keys(data).sort()) {
                    const newPath = path ? `${path}.${key}` : key;
                    out.push(newPath);
                    this._collectStructure(data[key], newPath, out);
                }
            } else {
                out.push(`${path}:${typeof data}`);
            }
        }

        _generateKeyPathIndex(data) {
            const index = [];
            this._traverseKeyPaths(data, [], index);
            return index;
        }

        _traverseKeyPaths(obj, path, out) {
            if (Array.isArray(obj)) {
                if (obj.length > 0) this._traverseKeyPaths(obj[0], [...path, '[n]'], out);
            } else if (typeof obj === 'object' && obj !== null) {
                for (const [key, value] of Object.entries(obj)) {
                    const currentPath = [...path, key].join('.');
                    out.push({
                        path: currentPath,
                        type: typeof value,
                        hash: this._hashValue(value),
                    });
                    this._traverseKeyPaths(value, [...path, key], out);
                }
            }
        }

        _generateValueTypeMap(data) {
            const m = { string: 0, number: 0, boolean: 0, null: 0, object: 0, array: 0 };
            this._countTypes(data, m);
            return m;
        }

        _countTypes(obj, m) {
            if (Array.isArray(obj)) {
                m.array++;
                obj.forEach((v) => this._countTypes(v, m));
            } else if (obj === null) {
                m.null++;
            } else if (typeof obj === 'object') {
                m.object++;
                Object.values(obj).forEach((v) => this._countTypes(v, m));
            } else {
                const t = typeof obj;
                if (t in m) m[t]++;
            }
        }

        _generateSchemaSignature(data) {
            const schema = this._inferSchema(data);
            const schemaStr = JSON.stringify(schema);

            const signature = new Uint32Array(8);
            for (let i = 0; i < 8; i++) {
                signature[i] = this._fnvHash(schemaStr, 2166136261 + Math.imul(i, 16777619));
            }
            return signature;
        }

        _inferSchema(data, depth = 0, maxDepth = 3) {
            if (depth > maxDepth) return 'deep';
            if (Array.isArray(data)) {
                return data.length === 0 ? [] : [this._inferSchema(data[0], depth + 1, maxDepth)];
            }
            if (typeof data === 'object' && data !== null) {
                const schema = {};
                for (const [key, value] of Object.entries(data)) {
                    schema[key] = this._inferSchema(value, depth + 1, maxDepth);
                }
                return schema;
            }
            return typeof data;
        }

        _generateNumericRanges(data) {
            const ranges = new Map();
            this._collectNumericRanges(data, [], ranges);
            return Array.from(ranges.entries()).map(([path, r]) => ({
                path, min: r.min, max: r.max, count: r.count,
            }));
        }

        _collectNumericRanges(obj, path, ranges) {
            if (Array.isArray(obj)) {
                obj.forEach((item) => this._collectNumericRanges(item, [...path, '[n]'], ranges));
            } else if (typeof obj === 'object' && obj !== null) {
                for (const [key, value] of Object.entries(obj)) {
                    const currentPath = [...path, key].join('.');
                    if (typeof value === 'number') {
                        if (!ranges.has(currentPath)) {
                            ranges.set(currentPath, { min: value, max: value, count: 0 });
                        }
                        const r = ranges.get(currentPath);
                        r.min = Math.min(r.min, value);
                        r.max = Math.max(r.max, value);
                        r.count++;
                    }
                    this._collectNumericRanges(value, [...path, key], ranges);
                }
            }
        }

        _extractAllText(data) {
            const parts = [];
            this._collectText(data, parts);
            return parts.join(' ');
        }

        _collectText(obj, out) {
            if (Array.isArray(obj)) {
                obj.forEach((v) => this._collectText(v, out));
            } else if (typeof obj === 'object' && obj !== null) {
                for (const [key, value] of Object.entries(obj)) {
                    out.push(key);
                    this._collectText(value, out);
                }
            } else if (typeof obj === 'string') {
                out.push(obj);
            }
        }

        // ==========================================================================
        // Similarity Calculation
        // ==========================================================================

        similarity(other) {
            const isShortQuery = this._textLength < 10 || this._tokenCount <= 3;

            if (isShortQuery) {
                return this._shortQuerySimilarity(other);
            }

            return this._fullSimilarity(other);
        }

        _shortQuerySimilarity(other) {
            let totalScore = 0;
            let totalWeight = 0;

            const substringScore = this._bloomContainment(
                this.layers.substringBloom,
                other.layers.substringBloom
            );
            totalScore += substringScore * 0.35;
            totalWeight += 0.35;

            const tokenScore = this._tokenContainment(
                this.layers.tokenSet,
                other.layers.tokenSet
            );
            totalScore += tokenScore * 0.35;
            totalWeight += 0.35;

            const charSim = this._containmentSimilarity(
                this.layers.charHash,
                other.layers.charHash
            );
            totalScore += charSim * 0.15;
            totalWeight += 0.15;

            const topicSim = this._cosineSimilarity(
                this.layers.topicSignature,
                other.layers.topicSignature
            );
            totalScore += topicSim * 0.15;
            totalWeight += 0.15;

            return totalWeight > 0 ? totalScore / totalWeight : 0;
        }

        _fullSimilarity(other) {
            const W = { char: 0.05, ngram: 0.2, topic: 0.3, syntax: 0.1, substring: 0.2, token: 0.15 };
            let totalScore = 0;
            let totalWeight = 0;

            const charSim = this._jaccardSimilarity(this.layers.charHash, other.layers.charHash);
            totalScore += charSim * W.char;
            totalWeight += W.char;

            const ngramSim = this._hammingSimilarity(this.layers.ngramHash, other.layers.ngramHash);
            totalScore += ngramSim * W.ngram;
            totalWeight += W.ngram;

            const topicSim = this._cosineSimilarity(this.layers.topicSignature, other.layers.topicSignature);
            totalScore += topicSim * W.topic;
            totalWeight += W.topic;

            const syntaxSim = this._hammingSimilarity(this.layers.syntaxPattern, other.layers.syntaxPattern);
            totalScore += syntaxSim * W.syntax;
            totalWeight += W.syntax;

            const substringScore = this._bloomContainment(this.layers.substringBloom, other.layers.substringBloom);
            totalScore += substringScore * W.substring;
            totalWeight += W.substring;

            const tokenScore = this._tokenContainment(this.layers.tokenSet, other.layers.tokenSet);
            totalScore += tokenScore * W.token;
            totalWeight += W.token;

            return totalWeight > 0 ? totalScore / totalWeight : 0;
        }

        /**
         * JSON Similarity (v1.3.0: Field matching support)
         *
         * queryRawObj: Raw query object (passed from DB class)
         * If this object is regular JSON ({name: "Yoga Mat"}, etc.),
         * field matching is automatically executed
         */
        similarityJSON(other, queryRawObj = {}) {
            let totalScore = 0;
            let totalWeight = 0;

            // Field value matching (highest priority)
            const fieldScore = this._fieldValueMatch(queryRawObj, other);
            if (fieldScore > 0) {
                totalScore += fieldScore * 0.45;
                totalWeight += 0.45;
            }

            // Structure similarity
            if (this.layers.structureHash && other.layers.structureHash) {
                const structSim = Math.max(0, Math.min(1,
                    this._hammingSimilarity(this.layers.structureHash, other.layers.structureHash)
                ));
                totalScore += structSim * 0.1;
                totalWeight += 0.1;
            }

            // Schema similarity
            if (this.layers.schemaSignature && other.layers.schemaSignature) {
                const schemaSim = Math.max(0, Math.min(1,
                    this._cosineSimilarityTyped(this.layers.schemaSignature, other.layers.schemaSignature)
                ));
                totalScore += schemaSim * 0.1;
                totalWeight += 0.1;
            }

            // Meta query: keyPath
            if (queryRawObj.keyPath && other.layers.keyPathIndex) {
                const kpScore = this._keyPathMatch(queryRawObj.keyPath, other.layers.keyPathIndex);
                totalScore += kpScore * 0.2;
                totalWeight += 0.2;
            }

            // Meta query: numericRange
            if (queryRawObj.numericRange && other.layers.numericRanges) {
                const rangeScore = this._numericRangeMatch(queryRawObj.numericRange, other.layers.numericRanges);
                totalScore += rangeScore * 0.15;
                totalWeight += 0.15;
            }

            // Text similarity
            const textSim = Math.max(0, Math.min(1, this.similarity(other)));
            totalScore += textSim * 0.2;
            totalWeight += 0.2;

            return totalWeight > 0 ? totalScore / totalWeight : 0;
        }



        /**
         * NEW: Field Value Matching
         *
         * Match each field of query JSON against target's fieldValueIndex.
         * Score exact matches, partial matches, and numeric approximations.
         */
        _fieldValueMatch(queryObj, targetFp) {
            if (!queryObj || typeof queryObj !== 'object' || Array.isArray(queryObj)) return 0;
            // Exclude meta query format (keyPath/numericRange only)
            const queryKeys = Object.keys(queryObj).filter(
                (k) => k !== 'keyPath' && k !== 'numericRange' && k !== 'text'
            );
            if (queryKeys.length === 0) return 0;

            const targetIndex = targetFp.layers.fieldValueIndex;
            if (!targetIndex || targetIndex.length === 0) return 0;

            let matchedScore = 0;
            let totalFields = 0;

            for (const key of queryKeys) {
                const queryValue = queryObj[key];
                if (queryValue === undefined) continue;

                totalFields++;
                const queryKey = key.toLowerCase();
                const queryValStr = String(queryValue).toLowerCase();

                // Find entries with the same key from target
                const candidates = targetIndex.filter((e) => e.key === queryKey);

                if (candidates.length === 0) {
                    // Key does not exist → 0 points
                    continue;
                }

                let bestScore = 0;

                for (const candidate of candidates) {
                    // Exact match
                    if (candidate.normalizedValue === queryValStr) {
                        bestScore = Math.max(bestScore, 1.0);
                        continue;
                    }

                    // Numeric proximity match
                    if (typeof queryValue === 'number' && candidate.type === 'number') {
                        const diff = Math.abs(queryValue - candidate.value);
                        const scale = Math.max(Math.abs(queryValue), Math.abs(candidate.value), 1);
                        const proximity = Math.max(0, 1 - diff / scale);
                        bestScore = Math.max(bestScore, proximity * 0.9);
                        continue;
                    }

                    // String partial match
                    if (typeof queryValue === 'string' && candidate.type === 'string') {
                        if (candidate.normalizedValue.includes(queryValStr)) {
                            // Query is contained in target
                            const ratio = queryValStr.length / candidate.normalizedValue.length;
                            bestScore = Math.max(bestScore, 0.6 + ratio * 0.3);
                        } else if (queryValStr.includes(candidate.normalizedValue)) {
                            // Target is contained in query
                            const ratio = candidate.normalizedValue.length / queryValStr.length;
                            bestScore = Math.max(bestScore, 0.5 + ratio * 0.3);
                        }
                    }
                }

                matchedScore += bestScore;
            }

            return totalFields > 0 ? matchedScore / totalFields : 0;
        }

        _keyPathMatch(queryPath, targetIndex) {
            const matches = targetIndex.filter((item) =>
                queryPath.exact ? item.path === queryPath.path : item.path.includes(queryPath.path)
            );
            if (matches.length === 0) return 0;

            if (queryPath.value !== undefined) {
                const valueHash = this._hashValue(queryPath.value);
                return matches.some((m) => m.hash === valueHash) ? 1.0 : 0.5;
            }
            return 0.8;
        }

        _numericRangeMatch(queryRange, targetRanges) {
            const match = targetRanges.find((r) => r.path === queryRange.path);
            if (!match) return 0;

            const overlapMin = Math.max(queryRange.min, match.min);
            const overlapMax = Math.min(queryRange.max, match.max);
            if (overlapMin > overlapMax) return 0;

            const querySize = queryRange.max - queryRange.min;
            return querySize > 0 ? (overlapMax - overlapMin) / querySize : 1.0;
        }

        // ==========================================================================
        // Similarity Helpers (unchanged since v1.2.0)
        // ==========================================================================

        _containmentSimilarity(queryArr, targetArr) {
            if (!queryArr || !targetArr || queryArr.length === 0) return 0;
            const targetSet = new Set(targetArr);
            let contained = 0;
            const querySet = new Set(queryArr);
            for (const v of querySet) {
                if (targetSet.has(v)) contained++;
            }
            return querySet.size > 0 ? contained / querySet.size : 0;
        }

        _tokenContainment(queryTokens, targetTokens) {
            if (!queryTokens || !targetTokens || queryTokens.length === 0) return 0;

            const targetSet = new Set(targetTokens);
            let contained = 0;

            for (const token of queryTokens) {
                if (targetSet.has(token)) {
                    contained++;
                    continue;
                }
                let partialMatch = false;
                for (const t of targetTokens) {
                    if (t.includes(token) || token.includes(t)) {
                        partialMatch = true;
                        break;
                    }
                }
                if (partialMatch) contained += 0.7;
            }

            return contained / queryTokens.length;
        }

        _bloomContainment(queryBloom, targetBloom) {
            if (!queryBloom || !targetBloom || queryBloom.length !== targetBloom.length) return 0;

            let queryBits = 0;
            let containedBits = 0;

            for (let i = 0; i < queryBloom.length; i++) {
                queryBits += this._popCount(queryBloom[i]);
                containedBits += this._popCount(queryBloom[i] & targetBloom[i]);
            }

            return queryBits > 0 ? containedBits / queryBits : 0;
        }

        _jaccardSimilarity(a, b) {
            if (!a || !b || a.length === 0 || b.length === 0) return 0;
            const setA = new Set(a);
            const setB = new Set(b);
            let intersection = 0;
            for (const v of setA) {
                if (setB.has(v)) intersection++;
            }
            return intersection / (setA.size + setB.size - intersection);
        }

        _hammingSimilarity(a, b) {
            if (!a || !b || a.length !== b.length) return 0;
            let same = 0;
            const totalBits = a.length * 8;
            for (let i = 0; i < a.length; i++) {
                same += 8 - this._popCount(a[i] ^ b[i]);
            }
            return same / totalBits;
        }

        _popCount(n) {
            n = n & 0xFF;
            let count = 0;
            while (n) {
                n &= n - 1;
                count++;
            }
            return count;
        }

        _cosineSimilarity(a, b) {
            if (!a || !b || a.length !== b.length) return 0;
            let dot = 0, n1 = 0, n2 = 0;
            for (let i = 0; i < a.length; i++) {
                dot += a[i] * b[i];
                n1 += a[i] * a[i];
                n2 += b[i] * b[i];
            }
            const denom = Math.sqrt(n1) * Math.sqrt(n2);
            return denom > 0 ? dot / denom : 0;
        }

        _cosineSimilarityTyped(a, b) {
            if (!a || !b || a.length !== b.length) return 0;
            let dot = 0, n1 = 0, n2 = 0;
            for (let i = 0; i < a.length; i++) {
                const va = a[i] | 0;
                const vb = b[i] | 0;
                dot += Math.imul(va, vb);
                n1 += Math.imul(va, va);
                n2 += Math.imul(vb, vb);
            }
            const denom = Math.sqrt(Math.abs(n1)) * Math.sqrt(Math.abs(n2));
            return denom > 0 ? dot / denom : 0;
        }

        // ==========================================================================
        // Utilities (unchanged since v1.2.0)
        // ==========================================================================

        tokenize(text) {
            if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
                try {
                    if (!SemanticFingerprint._segmenter) {
                        SemanticFingerprint._segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
                    }
                    return [...SemanticFingerprint._segmenter.segment(text)]
                        .filter((s) => s.isWordLike)
                        .map((s) => s.segment.toLowerCase());
                } catch {
                    // fallback
                }
            }

            const tokens = [];
            const ascii = text.replace(/[^\x20-\x7E]/g, '');
            if (ascii.length > 0) {
                tokens.push(
                    ...ascii
                        .toLowerCase()
                        .split(/\s+/)
                        .filter((w) => w.length > 0)
                );
            }

            const nonAscii = text.replace(/[\x00-\x7E]/g, '').replace(/\s+/g, '');
            for (let i = 0; i < nonAscii.length - 1; i++) {
                tokens.push(nonAscii.slice(i, i + 2));
            }
            if (nonAscii.length === 1) tokens.push(nonAscii);

            return tokens;
        }

        _fnvHash(str, seed = 2166136261) {
            let hash = seed >>> 0;
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                hash = Math.imul(hash, 16777619) >>> 0;
            }
            return hash >>> 0;
        }

        _hashValue(value) {
            if (typeof value === 'object' && value !== null) {
                return this._fnvHash(JSON.stringify(value));
            }
            return this._fnvHash(String(value));
        }

        _bloomFilter(items, sizeBits) {
            const bytes = Math.ceil(sizeBits / 8);
            const filter = new Uint8Array(bytes);
            const numHashes = 3;

            for (const item of items) {
                for (let i = 0; i < numHashes; i++) {
                    const h = this._fnvHash(String(item), Math.imul(i + 1, 16777619));
                    const bitIndex = h % sizeBits;
                    filter[bitIndex >>> 3] |= 1 << (bitIndex & 7);
                }
            }

            return filter;
        }

        _isStopWord(term) {
            return SemanticFingerprint.STOP_WORDS.has(term.toLowerCase());
        }

        _getIdfWeight(term) {
            if (this._isStopWord(term)) return 0.1;
            if (term.length <= 1) return 0.3;
            if (term.length <= 2) return 0.6;
            return 1.0;
        }

        // ==========================================================================
        // Serialize / Deserialize (fieldValueIndex added)
        // ==========================================================================

        serialize() {
            return {
                dataType: this.dataType,
                textLength: this._textLength,
                tokenCount: this._tokenCount,
                layers: {
                    charHash: this.layers.charHash ? Array.from(this.layers.charHash) : null,
                    ngramHash: this.layers.ngramHash ? Array.from(this.layers.ngramHash) : null,
                    topicSignature: this.layers.topicSignature
                        ? Array.from(this.layers.topicSignature) : null,
                    syntaxPattern: this.layers.syntaxPattern
                        ? Array.from(this.layers.syntaxPattern) : null,
                    substringBloom: this.layers.substringBloom
                        ? Array.from(this.layers.substringBloom) : null,
                    tokenSet: this.layers.tokenSet || null,
                    structureHash: this.layers.structureHash
                        ? Array.from(this.layers.structureHash) : null,
                    keyPathIndex: this.layers.keyPathIndex,
                    valueTypeMap: this.layers.valueTypeMap,
                    schemaSignature: this.layers.schemaSignature
                        ? Array.from(this.layers.schemaSignature) : null,
                    numericRanges: this.layers.numericRanges,
                    fieldValueIndex: this.layers.fieldValueIndex, // NEW
                },
            };
        }

        static deserialize(data) {
            const fp = Object.create(SemanticFingerprint.prototype);
            fp.dataType = data.dataType;
            fp._textLength = data.textLength || 0;
            fp._tokenCount = data.tokenCount || 0;
            fp.options = { dimensions: 128 };
            fp.rawData = null;
            fp.layers = {
                charHash: data.layers.charHash ? new Uint32Array(data.layers.charHash) : null,
                ngramHash: data.layers.ngramHash ? new Uint8Array(data.layers.ngramHash) : null,
                topicSignature: data.layers.topicSignature
                    ? new Uint8Array(data.layers.topicSignature) : null,
                syntaxPattern: data.layers.syntaxPattern
                    ? new Uint8Array(data.layers.syntaxPattern) : null,
                substringBloom: data.layers.substringBloom
                    ? new Uint8Array(data.layers.substringBloom) : null,
                tokenSet: data.layers.tokenSet || null,
                structureHash: data.layers.structureHash
                    ? new Uint8Array(data.layers.structureHash) : null,
                keyPathIndex: data.layers.keyPathIndex || null,
                valueTypeMap: data.layers.valueTypeMap || null,
                schemaSignature: data.layers.schemaSignature
                    ? new Uint32Array(data.layers.schemaSignature) : null,
                numericRanges: data.layers.numericRanges || null,
                fieldValueIndex: data.layers.fieldValueIndex || null, // NEW
            };
            return fp;
        }
    }

    SemanticFingerprint.STOP_WORDS = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
        'is', 'it', 'this', 'that', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
        'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'up', 'out',
        'は', 'が', 'を', 'に', 'で', 'と', 'の', 'も', 'へ', 'や', 'か', 'ね', 'よ', 'わ',
        'から', 'まで', 'より', 'だけ', 'しか', 'ばかり', 'など', 'こと', 'もの', 'ため',
    ]);

    // ============================================================================
    // Part 2: PsfDB (Database Wrapper)
    // ============================================================================

    /**
     * PsfDB (Progressive Semantic Fingerprinting Database)
     *
     * Search DB with IndexedDB persistence + async iterator support
     *
     * @version 1.0.0
     * @license MIT
     */

    class PsfDB {
        /**
         * @param {string} dbName
         * @param {number} version
         * @param {object} [options]
         * @param {boolean} [options.persist=true] - Set false for memory-only mode
         */
        constructor(dbName = 'SemanticDB', version = 1, options = {}) {
            this.dbName = dbName;
            this.version = version;
            this.db = null;
            this.persistent = options.persist !== false;
            this._memoryStore = [];
            this._memoryId = 0;
        }

        // ==========================================================================
        // Initialization
        // ==========================================================================

        async initialize() {
            // Memory-only mode: skip IndexedDB
            if (!this.persistent) return;

            if (this.db) return;

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    if (!db.objectStoreNames.contains('fingerprints')) {
                        const store = db.createObjectStore('fingerprints', {
                            keyPath: 'id',
                            autoIncrement: true,
                        });
                        store.createIndex('dataType', 'dataType', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('metadata')) {
                        db.createObjectStore('metadata', { keyPath: 'key' });
                    }
                };
            });
        }

        async _ensureDB() {
            if (!this.persistent) return;
            if (!this.db) await this.initialize();
        }

        // ==========================================================================
        // Write
        // ==========================================================================

        /**
         * Add single data
         * @param {string|object|SemanticFingerprint} data
         * @param {*} [originalData] Original data to return in search results
         * @returns {Promise<number>} Inserted ID
         */
        async add(data, originalData = null) {
            await this._ensureDB();

            const fingerprint =
                data instanceof SemanticFingerprint ? data : new SemanticFingerprint(data);

            const record = {
                dataType: fingerprint.dataType,
                fingerprint: fingerprint.serialize(),
                originalData: originalData ?? (data instanceof SemanticFingerprint ? null : data),
                createdAt: new Date().toISOString(),
            };

            // Memory-only mode
            if (!this.persistent) {
                record.id = ++this._memoryId;
                this._memoryStore.push(record);
                return record.id;
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readwrite');
                const store = tx.objectStore('fingerprints');

                const req = store.add(record);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        /**
         * Batch add multiple data
         * @param {Array} dataArray
         * @returns {Promise<number[]>}
         */
        async addBatch(dataArray) {
            await this._ensureDB();

            // Memory-only mode
            if (!this.persistent) {
                const ids = [];
                for (const data of dataArray) {
                    const fp =
                        data instanceof SemanticFingerprint ? data : new SemanticFingerprint(data);
                    const record = {
                        id: ++this._memoryId,
                        dataType: fp.dataType,
                        fingerprint: fp.serialize(),
                        originalData: data instanceof SemanticFingerprint ? null : data,
                        createdAt: new Date().toISOString(),
                    };
                    this._memoryStore.push(record);
                    ids.push(record.id);
                }
                return ids;
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readwrite');
                const store = tx.objectStore('fingerprints');
                const ids = [];

                tx.oncomplete = () => resolve(ids);
                tx.onerror = () => reject(tx.error);

                for (const data of dataArray) {
                    const fp =
                        data instanceof SemanticFingerprint ? data : new SemanticFingerprint(data);

                    const record = {
                        dataType: fp.dataType,
                        fingerprint: fp.serialize(),
                        originalData: data instanceof SemanticFingerprint ? null : data,
                        createdAt: new Date().toISOString(),
                    };

                    const req = store.add(record);
                    req.onsuccess = () => ids.push(req.result);
                }
            });
        }

        /**
         * Non-blocking batch add with chunked processing
         * Yields control to event loop between chunks to keep UI responsive
         * @param {Array} dataArray - Array of data to add
         * @param {object} [options]
         * @param {number} [options.chunkSize=50] - Number of items per chunk
         * @param {Function} [options.onProgress] - Progress callback (processed, total) => void
         * @returns {Promise<number[]>} - Array of inserted IDs
         */
        async addBatchAsync(dataArray, options = {}) {
            const { chunkSize = 50, onProgress = null } = options;
            await this._ensureDB();

            const ids = [];
            const total = dataArray.length;

            for (let i = 0; i < total; i += chunkSize) {
                const chunk = dataArray.slice(i, i + chunkSize);

                // Memory-only mode
                if (!this.persistent) {
                    for (const data of chunk) {
                        const fp =
                            data instanceof SemanticFingerprint
                                ? data
                                : new SemanticFingerprint(data);
                        const record = {
                            id: ++this._memoryId,
                            dataType: fp.dataType,
                            fingerprint: fp.serialize(),
                            originalData: data instanceof SemanticFingerprint ? null : data,
                            createdAt: new Date().toISOString(),
                        };
                        this._memoryStore.push(record);
                        ids.push(record.id);
                    }
                } else {
                    // IndexedDB mode - process chunk in single transaction
                    await new Promise((resolve, reject) => {
                        const tx = this.db.transaction(['fingerprints'], 'readwrite');
                        const store = tx.objectStore('fingerprints');

                        tx.oncomplete = () => resolve();
                        tx.onerror = () => reject(tx.error);

                        for (const data of chunk) {
                            const fp =
                                data instanceof SemanticFingerprint
                                    ? data
                                    : new SemanticFingerprint(data);

                            const record = {
                                dataType: fp.dataType,
                                fingerprint: fp.serialize(),
                                originalData: data instanceof SemanticFingerprint ? null : data,
                                createdAt: new Date().toISOString(),
                            };

                            const req = store.add(record);
                            req.onsuccess = () => ids.push(req.result);
                        }
                    });
                }

                // Report progress
                if (onProgress) {
                    onProgress(Math.min(i + chunkSize, total), total);
                }

                // Yield to event loop - keeps UI responsive
                await new Promise((r) => setTimeout(r, 0));
            }

            return ids;
        }

        // ==========================================================================
        // Search
        // ==========================================================================

        /**
         * 全件スキャン検索（スコア順上位N件）
         */
        async search(query, options = {}) {
            await this._ensureDB();

            const { limit = 10, threshold = 0.5, dataType = null } = options;

            const queryFp = this._buildQueryFP(query);

            // Memory-only mode
            if (!this.persistent) {
                const results = [];
                const records = dataType
                    ? this._memoryStore.filter(r => r.dataType === dataType)
                    : this._memoryStore;

                for (const record of records) {
                    try {
                        const targetFp = SemanticFingerprint.deserialize(record.fingerprint);
                        const sim = this._calcSimilarity(queryFp, targetFp, query, record);

                        if (sim >= threshold) {
                            results.push({
                                id: record.id,
                                similarity: sim,
                                data: record.originalData,
                                createdAt: record.createdAt,
                            });
                        }
                    } catch {
                        // Skip corrupted records
                    }
                }

                results.sort((a, b) => b.similarity - a.similarity);
                return results.slice(0, limit);
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readonly');
                const store = tx.objectStore('fingerprints');

                const source = dataType ? store.index('dataType') : store;
                const cursorReq = dataType
                    ? source.openCursor(IDBKeyRange.only(dataType))
                    : source.openCursor();

                const results = [];

                cursorReq.onerror = () => reject(cursorReq.error);
                cursorReq.onsuccess = (event) => {
                    const cursor = event.target.result;

                    if (cursor) {
                        const record = cursor.value;

                        try {
                            const targetFp = SemanticFingerprint.deserialize(record.fingerprint);
                            const sim = this._calcSimilarity(queryFp, targetFp, query, record);

                            if (sim >= threshold) {
                                results.push({
                                    id: record.id,
                                    similarity: sim,
                                    data: record.originalData,
                                    createdAt: record.createdAt,
                                });
                            }
                        } catch {
                            // Skip corrupted records
                        }

                        cursor.continue();
                    } else {
                        results.sort((a, b) => b.similarity - a.similarity);
                        resolve(results.slice(0, limit));
                    }
                };
            });
        }

        /**
         * Stream search with async iterator
         * (early termination possible)
         */
        async *searchStream(query, options = {}) {
            await this._ensureDB();

            const { threshold = 0.5, dataType = null } = options;

            const queryFp = this._buildQueryFP(query);

            // Memory-only mode
            if (!this.persistent) {
                const records = dataType
                    ? this._memoryStore.filter(r => r.dataType === dataType)
                    : this._memoryStore;

                for (const record of records) {
                    try {
                        const targetFp = SemanticFingerprint.deserialize(record.fingerprint);
                        const sim = this._calcSimilarity(queryFp, targetFp, query, record);

                        if (sim >= threshold) {
                            yield {
                                id: record.id,
                                similarity: sim,
                                data: record.originalData,
                                createdAt: record.createdAt,
                            };
                        }
                    } catch {
                        // skip
                    }
                }
                return;
            }

            const tx = this.db.transaction(['fingerprints'], 'readonly');
            const store = tx.objectStore('fingerprints');
            const source = dataType ? store.index('dataType') : store;
            const cursorReq = dataType
                ? source.openCursor(IDBKeyRange.only(dataType))
                : source.openCursor();

            // Replace resolve/reject each turn
            let resolveCursor, rejectCursor;
            let done = false;

            cursorReq.onsuccess = (e) => {
                if (resolveCursor) resolveCursor(e.target.result);
            };
            cursorReq.onerror = (e) => {
                if (rejectCursor) rejectCursor(e.target.error);
            };

            // Detect transaction completion
            tx.oncomplete = () => {
                done = true;
                if (resolveCursor) resolveCursor(null);
            };

            // Wait for first cursor
            let cursor = await new Promise((res, rej) => {
                resolveCursor = res;
                rejectCursor = rej;
            });

            while (cursor && !done) {
                const record = cursor.value;

                try {
                    const targetFp = SemanticFingerprint.deserialize(record.fingerprint);
                    const sim = this._calcSimilarity(queryFp, targetFp, query, record);

                    if (sim >= threshold) {
                        yield {
                            id: record.id,
                            similarity: sim,
                            data: record.originalData,
                            createdAt: record.createdAt,
                        };
                    }
                } catch {
                    // skip
                }

                // Request and wait for next cursor
                cursor.continue();
                cursor = await new Promise((res, rej) => {
                    resolveCursor = res;
                    rejectCursor = rej;
                });
            }
        }

        // ==========================================================================
        // Search Helpers
        // ==========================================================================

        /**
         * Build fingerprint from query
         */
        _buildQueryFP(query) {
            if (query instanceof SemanticFingerprint) return query;

            if (typeof query === 'string') return new SemanticFingerprint(query);

            if (typeof query === 'object' && query !== null) {
                // Create fingerprint from "data part" only, excluding keyPath/numericRange
                if (query.text) return new SemanticFingerprint(query.text);
                return new SemanticFingerprint(query);
            }

            return null;
        }

        /**
         * Calculate similarity between query and target
         */
        _calcSimilarity(queryFp, targetFp, rawQuery, record) {
            if (!queryFp) return 0;

            if (
                record.dataType === 'json' &&
                typeof rawQuery === 'object' &&
                !Array.isArray(rawQuery)
            ) {
                return queryFp.similarityJSON(targetFp, rawQuery);
            }

            return queryFp.similarity(targetFp);
        }

        // ==========================================================================
        // CRUD
        // ==========================================================================

        async getById(id) {
            await this._ensureDB();

            // Memory-only mode
            if (!this.persistent) {
                return this._memoryStore.find(r => r.id === id) ?? null;
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readonly');
                const req = tx.objectStore('fingerprints').get(id);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => reject(req.error);
            });
        }

        async getAll() {
            await this._ensureDB();

            // Memory-only mode
            if (!this.persistent) {
                return [...this._memoryStore];
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readonly');
                const req = tx.objectStore('fingerprints').getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async delete(id) {
            await this._ensureDB();

            // Memory-only mode
            if (!this.persistent) {
                const idx = this._memoryStore.findIndex(r => r.id === id);
                if (idx >= 0) this._memoryStore.splice(idx, 1);
                return;
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readwrite');
                const req = tx.objectStore('fingerprints').delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }

        async clear() {
            await this._ensureDB();

            // Memory-only mode
            if (!this.persistent) {
                this._memoryStore = [];
                return;
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['fingerprints'], 'readwrite');
                const req = tx.objectStore('fingerprints').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }

        /**
         * Delete data older than specified age
         * @param {number} maxAgeMs - Maximum age in milliseconds
         * @returns {Promise<number>} - Number of deleted records
         */
        async deleteOlderThan(maxAgeMs) {
            const cutoff = new Date(Date.now() - maxAgeMs);
            const all = await this.getAll();
            let deleted = 0;

            for (const record of all) {
                if (new Date(record.createdAt) < cutoff) {
                    await this.delete(record.id);
                    deleted++;
                }
            }
            return deleted;
        }

        /**
         * Delete data matching a condition
         * @param {Function} predicate - Condition function (record => boolean)
         * @returns {Promise<number>} - Number of deleted records
         */
        async deleteWhere(predicate) {
            const all = await this.getAll();
            let deleted = 0;

            for (const record of all) {
                if (predicate(record)) {
                    await this.delete(record.id);
                    deleted++;
                }
            }
            return deleted;
        }

        // ==========================================================================
        // 統計
        // ==========================================================================

        async getStats() {
            await this._ensureDB();
            const all = await this.getAll();

            const stats = {
                total: all.length,
                byType: {},
                oldestEntry: null,
                newestEntry: null,
            };

            for (const record of all) {
                const type = record.dataType;
                stats.byType[type] = (stats.byType[type] || 0) + 1;

                if (!stats.oldestEntry || record.createdAt < stats.oldestEntry) {
                    stats.oldestEntry = record.createdAt;
                }
                if (!stats.newestEntry || record.createdAt > stats.newestEntry) {
                    stats.newestEntry = record.createdAt;
                }
            }

            return stats;
        }

        // ==========================================================================
        // Lifecycle
        // ==========================================================================

        close() {
            if (this.db) {
                this.db.close();
                this.db = null;
            }
        }
    }

    // Attach SemanticFingerprint to PsfDB for external access
    PsfDB.Fingerprint = SemanticFingerprint;
    PsfDB.SemanticFingerprint = SemanticFingerprint;

module.exports = PsfDB;
