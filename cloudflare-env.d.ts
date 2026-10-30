declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    QUOTE_DB?: D1Database;
    BUCKET?: R2Bucket;
    QUOTE_BUCKET?: R2Bucket;
    CRM_BACKEND_ORIGIN?: string;
  }
}
