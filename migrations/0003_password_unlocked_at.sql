-- Dev Spec 17 章。最後にマスターパスワードで開いた時刻(2 週間に 1 回マスターパスワードを求める。discussion38 の 3)。
-- 空なら、まだ記録が無い(パスキーで開く前に、マスターパスワードで 1 回開く)
ALTER TABLE users ADD COLUMN password_unlocked_at INTEGER;
