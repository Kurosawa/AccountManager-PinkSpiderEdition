-- Dev Spec 17 章。パスキーで管理画面を開くための値(フェーズ 2 の 4。discussion38)。
-- パスキーの PRF の値から作った鍵で包んだ金庫の鍵と、合言葉の HMAC だけを置く(中身は読めない)
CREATE TABLE passkeys (
  id          TEXT PRIMARY KEY,            -- パスキーの credential ID(base64url)
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,               -- 利用者が付けた名前(例「iPhone」)
  prf_salt    BLOB NOT NULL,               -- PRF に渡す値(パスキーごとにランダム)
  auth_hash   BLOB NOT NULL,               -- HMAC(AUTH_PEPPER, パスキーの合言葉)
  wrapped_key BLOB NOT NULL,               -- パスキーの包む鍵で包んだ金庫の鍵(IV を含む)
  created_at  INTEGER NOT NULL
);
CREATE INDEX passkeys_user ON passkeys(user_id);
