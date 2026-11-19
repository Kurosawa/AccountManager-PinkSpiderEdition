-- Dev Spec 7 章。暗号のデータと、確かめに使う値だけを置く(中身は読めない)
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,   -- HMAC(USER_ID_PEPPER, メールアドレス)
  kdf_params           TEXT NOT NULL,      -- {"alg":"argon2id","m":65536,"t":3,"p":1}
  salt                 BLOB NOT NULL,
  auth_hash            BLOB NOT NULL,      -- HMAC(AUTH_PEPPER, 合言葉)
  wrapped_key          BLOB NOT NULL,      -- 包む鍵で包んだ金庫の鍵(IV を含む)
  recovery_salt        BLOB NOT NULL,
  recovery_auth_hash   BLOB NOT NULL,
  recovery_wrapped_key BLOB NOT NULL,
  settings_ct          BLOB NOT NULL,      -- 暗号にした設定(IV を含む)
  settings_version     INTEGER NOT NULL DEFAULT 1,
  failed_count         INTEGER NOT NULL DEFAULT 0,
  locked_until         INTEGER,            -- UNIX 時刻(ミリ秒)
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE entries (
  id         TEXT PRIMARY KEY,             -- ブラウザで作る UUID
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  ciphertext BLOB NOT NULL,                -- IV + 暗号
  updated_at INTEGER NOT NULL
);
CREATE INDEX entries_user ON entries(user_id);

CREATE TABLE sessions (
  token_hash   BLOB PRIMARY KEY,           -- SHA-256(トークン)
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL,              -- 'vault' か 'recover'
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
