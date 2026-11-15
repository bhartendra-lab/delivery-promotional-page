import { test } from "node:test";
import assert from "node:assert/strict";
import { UPLOAD_SPEC, UPLOAD_SPEC_VERSION } from "./spec.ts";

/**
 * A snapshot of the whole spec. The studio app's engine constants and golden
 * vectors are generated from this object, so any change here is a change to
 * BOTH uploaders: update this snapshot on purpose, bump UPLOAD_SPEC_VERSION,
 * and say why in the commit.
 */
test("UPLOAD_SPEC snapshot", () => {
  assert.equal(UPLOAD_SPEC_VERSION, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(UPLOAD_SPEC)), {
    "image": {
      "viewMaxDim": 2560,
      "viewQuality": 0.8,
      "archiveMaxDim": 4096,
      "archiveQuality": 0.8,
      "thumbMaxDim": 480,
      "thumbQuality": 0.72,
      "watermarkReencodeQuality": 0.85,
      "watermarkEdgeMarginRatio": 0.025,
      "exifHeadBytes": 262144,
      "outputType": "image/jpeg",
      "sizeGuardQualityFactor": 0.95,
      "sizeGuardMaxIterations": 10,
      "rounding": {
        "view": "library-trunc",
        "archive": "library-trunc",
        "viewFromArchive": "round-min-1",
        "thumb": "round-min-1"
      }
    },
    "presign": {
      "batchSize": 50,
      "concurrency": 3,
      "serverMaxPerRequest": 100,
      "ttlMs": 900000,
      "refreshMarginMs": 240000,
      "maxExpiryRequeues": 2
    },
    "pipeline": {
      "maxOutstandingBlobs": 128,
      "backpressurePollMs": 60,
      "presignIdlePollMs": 60,
      "presignRacePollMs": 50,
      "metadataFlushPollMs": 250,
      "idbFlushMs": 500,
      "progressEmitMs": 200,
      "pausePollMs": 120,
      "cancelGraceMs": 180000
    },
    "aimd": {
      "start": 2,
      "max": 8,
      "min": 1,
      "stepUpAfter": 8
    },
    "retry": {
      "maxAttempts": 5,
      "baseDelayMs": 500,
      "maxDelayMs": 15000,
      "jitter": 0.3,
      "retryableStatuses": [
        408,
        425,
        429
      ],
      "retryAll5xx": true
    },
    "metadata": {
      "chunkSize": 200,
      "saveAttempts": 5,
      "flushPolicy": {
        "2560": {
          "size": 200,
          "maxAgeMs": 60000
        },
        "4096": {
          "size": 100,
          "maxAgeMs": 120000
        },
        "original": {
          "size": 25,
          "maxAgeMs": 180000
        }
      },
      "embedDeferDefaults": {
        "2560": 0,
        "4096": 0.6,
        "original": 0.7
      }
    },
    "archive": {
      "partConcurrency": 4,
      "signWindow": 16,
      "urlTtlMs": 900000,
      "urlRefreshMs": 180000,
      "checksumSliceBytes": 8388608,
      "checksumPrefix": "sha256-tree-8MiB-v1:"
    },
    "http": {
      "uploadCacheControl": "public, max-age=31536000, immutable"
    },
    "files": {
      "rawExtensionPattern": "\\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$",
      "junk": {
        "basePrefixes": [
          "._",
          "."
        ],
        "baseNames": [
          ".DS_Store"
        ]
      },
      "acceptedMimePrefix": "image/",
      "acceptedExtensionPattern": "\\.(heic|heif|jpe?g|png|gif|webp)$"
    },
    "variants": [
      "2560",
      "4096",
      "original"
    ]
  });
});

test("the file patterns are the exact expressions the upload dialog used", () => {
  assert.equal(
    new RegExp(UPLOAD_SPEC.files.rawExtensionPattern, "i").source,
    /\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$/i.source,
  );
  assert.equal(
    new RegExp(UPLOAD_SPEC.files.acceptedExtensionPattern, "i").source,
    /\.(heic|heif|jpe?g|png|gif|webp)$/i.source,
  );
});

test("derived values the web relied on are exact in doubles", () => {
  // retry.ts computes the jitter span as 2 * jitter; it was the literal 0.6.
  assert.equal(2 * UPLOAD_SPEC.retry.jitter, 0.6);
  // engine.ts read the defer thresholds as percent / 100.
  assert.equal(60 / 100, UPLOAD_SPEC.metadata.embedDeferDefaults["4096"]);
  assert.equal(70 / 100, UPLOAD_SPEC.metadata.embedDeferDefaults.original);
  assert.equal(UPLOAD_SPEC.image.exifHeadBytes, 256 * 1024);
  assert.equal(UPLOAD_SPEC.archive.checksumSliceBytes, 8 * 1024 * 1024);
  assert.equal(UPLOAD_SPEC.pipeline.cancelGraceMs, 3 * 60_000);
});

test("every per-variant table covers exactly the spec's variants", () => {
  const variants = [...UPLOAD_SPEC.variants].sort();
  assert.deepEqual(Object.keys(UPLOAD_SPEC.metadata.flushPolicy).sort(), variants);
  assert.deepEqual(Object.keys(UPLOAD_SPEC.metadata.embedDeferDefaults).sort(), variants);
});
