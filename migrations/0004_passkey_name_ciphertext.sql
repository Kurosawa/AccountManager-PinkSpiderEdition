-- Dev Spec 17.1。パスキーの名前を、ブラウザの中で金庫の鍵で暗号にしてから置く(discussion47 の 1。PRD 3.2)。
-- 新しく登録したものは name を空にし、name_ct に暗号を入れる。前からあるものは、利用者が設定の一覧を開いたときに
-- ブラウザが暗号にして置き直す(そのとき name を空にする)
ALTER TABLE passkeys ADD COLUMN name_ct BLOB; -- 金庫の鍵で暗号にした名前(IV を含む)。前からあるものは NULL
