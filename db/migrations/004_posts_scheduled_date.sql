ALTER TABLE posts ADD COLUMN scheduled_date TEXT;
ALTER TABLE posts ADD COLUMN scheduled_time TEXT;

-- Populate scheduled_date from post ID for posts following YYYY-MM-DD_ pattern
UPDATE posts
SET scheduled_date = substr(id, 1, 10)
WHERE id LIKE '____-__-__%'
  AND scheduled_date IS NULL;
