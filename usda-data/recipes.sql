DROP TABLE IF EXISTS `recipe`;
CREATE TABLE `recipe` (
  id INTEGER PRIMARY KEY,
  name text NOT NULL
);

DROP TABLE IF EXISTS `ingredient`;
CREATE TABLE `ingredient` (
  recipe_id int REFERENCES recipe(id) NOT NULL,
  food_id int REFERENCES food(id) NOT NULL,
  amount int NOT NULL,
  seq_num int NOT NULL,
  display_unit text NOT NULL,
  PRIMARY KEY(recipe_id, food_id)
);
