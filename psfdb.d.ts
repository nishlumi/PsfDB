
/**
 * Progressive Semantic Fingerprinting
 * Model-independent lightweight semantic search system for both text and JSON
 */
declare namespace PsfDB {

    /**
     * Semantic Fingerprint class
     */
    class SemanticFingerprint {
        constructor(data: any, options?: SemanticFingerprintOptions);

        /** Data type ('text' or 'json') */
        dataType: 'text' | 'json';

        /** Raw data */
        rawData: any;

        /** Generated layer information */
        layers: FingerprintLayers;

        /** Calculate similarity (0.0 - 1.0) */
        similarity(other: SemanticFingerprint): number;

        /** Calculate JSON similarity (including field matching) */
        similarityJSON(other: SemanticFingerprint, queryRawObj?: any): number;

        /** Output serializable object */
        serialize(): SerializedFingerprint;

        /** Restore from serialized data */
        static deserialize(data: SerializedFingerprint): SemanticFingerprint;

        /** Stop words set */
        static STOP_WORDS: Set<string>;
    }

    interface SemanticFingerprintOptions {
        /** Dimensions (default: 128) */
        dimensions?: number;
        [key: string]: any;
    }

    interface FingerprintLayers {
        charHash?: number[];
        ngramHash?: number[];
        topicSignature?: number[];
        syntaxPattern?: number[];
        substringBloom?: number[];
        tokenSet?: string[];
        structureHash?: number[];
        keyPathIndex?: KeyPathEntry[];
        valueTypeMap?: Record<string, number>;
        schemaSignature?: number[];
        numericRanges?: NumericRange[];
        fieldValueIndex?: FieldValueEntry[];
    }

    interface KeyPathEntry {
        path: string;
        type: string;
        hash: number;
    }

    interface NumericRange {
        path: string;
        min: number;
        max: number;
        count: number;
    }

    interface FieldValueEntry {
        key: string;
        path: string;
        value: any;
        normalizedValue: string;
        type: string;
    }

    interface SerializedFingerprint {
        dataType: 'text' | 'json';
        textLength: number;
        tokenCount: number;
        layers: FingerprintLayers;
    }

    /**
     * Search result object
     */
    interface SearchResult<T = any> {
        /** Database ID */
        id: number;
        /** Similarity (0.0 - 1.0) */
        similarity: number;
        /** Original data */
        data: T;
        /** Creation timestamp (ISO string) */
        createdAt: string;
    }

    interface SearchOptions {
        /** Maximum number of results (default: 10) */
        limit?: number;
        /** Similarity threshold (default: 0.5) */
        threshold?: number;
        /** Data type specification ('text' or 'json') */
        dataType?: 'text' | 'json';
    }

    interface PsfDBOptions {
        /** Set false for memory-only mode (default: true) */
        persist?: boolean;
    }

    interface AddBatchAsyncOptions {
        /** Number of items per chunk (default: 50) */
        chunkSize?: number;
        /** Progress callback (processed, total) => void */
        onProgress?: (processed: number, total: number) => void;
    }
}

/**
 * PsfDB (Progressive Semantic Fingerprinting Database)
 * Persistence with IndexedDB + async iterator support
 */
declare class PsfDB {
    /**
     * @param dbName Database name (default: 'SemanticDB')
     * @param version Version (default: 1)
     * @param options Options (persist: false for memory-only mode)
     */
    constructor(dbName?: string, version?: number, options?: PsfDB.PsfDBOptions);

    /**
     * Initialize (open) database
     */
    initialize(): Promise<void>;

    /**
     * Add data
     * @param data Data to add (string or object)
     * @param originalData Original data to return in search results (defaults to data itself)
     * @returns Added ID
     */
    add<T = any>(data: T | PsfDB.SemanticFingerprint, originalData?: T): Promise<number>;

    /**
     * Batch add multiple data
     * @returns Array of added IDs
     */
    addBatch<T = any>(dataArray: T[]): Promise<number[]>;

    /**
     * Non-blocking batch add with chunked processing
     * Yields control to event loop between chunks to keep UI responsive
     * @param dataArray Array of data to add
     * @param options Chunk size and progress callback options
     * @returns Array of added IDs
     */
    addBatchAsync<T = any>(dataArray: T[], options?: PsfDB.AddBatchAsyncOptions): Promise<number[]>;

    /**
     * Execute search
     * @param query Search query (string or object)
     * @param options Search options
     */
    search<T = any>(query: string | object, options?: PsfDB.SearchOptions): Promise<PsfDB.SearchResult<T>[]>;

    /**
     * Stream search (async iterator)
     * Process one by one with for-await-of
     */
    searchStream<T = any>(query: string | object, options?: PsfDB.SearchOptions): AsyncGenerator<PsfDB.SearchResult<T>>;

    /** Get data by ID */
    getById<T = any>(id: number): Promise<T | null>;

    /** Get all data */
    getAll<T = any>(): Promise<T[]>;

    /** Delete data */
    delete(id: number): Promise<void>;

    /** Delete all data */
    clear(): Promise<void>;

    /**
     * Delete data older than specified age
     * @param maxAgeMs Maximum age in milliseconds
     * @returns Number of deleted records
     */
    deleteOlderThan(maxAgeMs: number): Promise<number>;

    /**
     * Delete data matching a condition
     * @param predicate Condition function
     * @returns Number of deleted records
     */
    deleteWhere(predicate: (record: any) => boolean): Promise<number>;

    /** Get statistics */
    getStats(): Promise<{
        total: number;
        byType: Record<string, number>;
        oldestEntry: string | null;
        newestEntry: string | null;
    }>;

    /** Close database */
    close(): void;

    /** Static property: Access to SemanticFingerprint class */
    static Fingerprint: typeof PsfDB.SemanticFingerprint;
    static SemanticFingerprint: typeof PsfDB.SemanticFingerprint;
}

export = PsfDB;
export as namespace PsfDB;

