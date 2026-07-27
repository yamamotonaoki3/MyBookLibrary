-- 著者ベースのおすすめ機能（Jaccard係数の集計クエリ）が author_id 単体で
-- GROUP BY / 絞り込みを行うため、既存の (user_id, author_id) 複合ユニーク制約
-- だけでは効率的に使われない。author_id 単体のインデックスを追加する。
CREATE INDEX `favorite_authors_author_id_idx` ON `favorite_authors`(`author_id`);
