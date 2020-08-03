DROP TABLE IF EXISTS `macro_traco`;
CREATE TABLE `macro_traco` (
  id int PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  consumer text NOT NULL,
  nutrients_json text NOT NULL
);
