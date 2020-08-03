DROP TABLE IF EXISTS `marco_traco`;
CREATE TABLE `macro_traco` (
  date INTEGER NOT NULL,
  consumer text NOT NULL,
  nutrients_json text NOT NULL,
  PRIMARY KEY(date, consumer)
);
