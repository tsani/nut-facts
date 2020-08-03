from flask import Flask, render_template, url_for, request, redirect, flash, session, abort
import sqlite3
import datetime
import json

app = Flask(__name__)
db = sqlite3.connect('../usda-data/usda.sql3')

class Food_nut_fact:
    def __init__(self, nut_facts):
        self.nut_fact = nut_facts

    def __add__(self, other):
        total = self.nut_fact.copy()
        for key in other.nut_fact:
            if key in self.nut_fact:
                total[key][0] = other[key][0] + self[key][0]
            else:
                total[key] = other[key]
        return Food_nut_fact(total)
    def __getitem__(self, key):
        return self.nut_fact[key]
    def __setitem__(self, key, value):
        self.nut_fact[key] = value
    def __str__(self):
        return str(self.nut_fact)
    def __repr__(self):
        return repr(self.nut_fact)

def main():
    return
@app.route('/')
def index():
    return render_template("index.html")

@app.route('/hello')
def hello():
    return "ayyyyyyyy"

# adds nutrients to someone's daily tally
def add_macro_traco(consumer, python_nutrients):
    db = sqlite3.connect('../usda-data/usda.sql3')
    print("inserting into marco_traco table")
    db.execute("INSERT INTO macro_traco (consumer, nutrients_json) VALUES (?, ?)", (consumer, json.dumps(python_nutrients)))
    db.commit()
    db.close()

#this function will sum all the nutrients recorded on a certain day
# paramaters: consumer, year, month, day
def sum_day_macro(consumer, year, month, day):
    date_start = datetime.datetime(year, month, day, 8, 0, 0)
    date_end = date_start + datetime.timedelta(days=1)
    db = sqlite3.connect('../usda-data/usda.sql3')
    c = db.cursor()
    c.execute("""
    SELECT
    nutrients_json
    FROM
    macro_traco
    WHERE
    timestamp
    BETWEEN
    (?) AND (?)
    AND
    consumer=(?)
    """, (date_start, date_end, consumer))
    print(c)
    # structure of vals: dict of string, tuple (float, string) pairs
    # vals = {'nutrient' : (float amt, 'unit')}
    total_day_nut_fact = Food_nut_fact({})

    for row in c:
        print(json.loads(row[0]))
        days_nut_facts = Food_nut_fact(json.loads(row[0]))
        total_day_nut_fact += days_nut_facts
    return total_day_nut_fact

def get_weights(food_id):
    db = sqlite3.connect('../usda-data/usda.sql3')
    c = db.cursor()
    c.execute("""
    SELECT
    sequence_num, gm_weight, description
    FROM
    weight
    WHERE
    food_id = (?)""", (food_id,))
    print(c)
    total = []
    for row in c:
        unit_data = {}
        unit_data["name"] = row[2]
        unit_data["seq_num"] = row[0]
        unit_data["grams"] = row[1]
        total.append(unit_data)
    return {"weights":total}


# returns the nutrient info of a food
# takes the food id, food seq num, and factor
def calculate_nutrients(food_id, seq_num, factor):
    c = db.cursor()
    c.execute("""
    SELECT
    name, units, amount
    FROM
    nutrition JOIN nutrient JOIN common_nutrient
    ON
    nutrition.food_id = ?
    AND nutrition.nutrient_id = nutrient.id
    AND nutrient.id = common_nutrient.id
    """, (food_id,))
    print(c)
    c.close();
    vals = {}
    # structure of vals: dict of string, tuple (float, string) pairs
    # vals = {'nutrient' : (float amt, 'unit')}
    for row in c:
        vals[row[0]] = ((row[2]*factor), row[1])
    return vals

# test recipe for the function following
test_recipe = {
    "name":"food1",
    "ingredients":[
        {"food_id":10001,
         "amount":1,
         "seq_num":3,
         "display_unit":"cup"
         },
        {"food_id":10002,
         "amount":3,
         "seq_num":8,
         "display_unit":"cup"
         }]
    }
# inserts a new json recipe into the DB, including ingredients
def insert_to_db(json_recipe):
    recipe_name = json_recipe["name"]
    db.execute("INSERT INTO recipe (name) VALUES (?)", (recipe_name,))
    for x in db.execute("SELECT id FROM recipe WHERE name=(?)", (recipe_name,)):
        recipe_id = x[0]
    for ingredient in json_recipe["ingredients"]:
        db.execute(
            "INSERT INTO ingredient (recipe_id, food_id, amount, seq_num, display_unit) VALUES (?,?,?,?,?)",
            (recipe_id, ingredient["food_id"], ingredient["amount"], ingredient["seq_num"], ingredient["display_unit"],))
    db.commit()
    db.close()


def list_foods_recipes(query):
    query = query[12:]
    search_terms = query.split("%20")

    condition_usda = []
    condition_recipe = []
    for word in search_terms:
        word = word.lower()
        if not all('a' <= c <= 'z' for c in word):
            raise RuntimeError('search terms must be letters')
        condition_usda.append("long_desc LIKE '%" + word + "%'")
        condition_recipe.append("name LIKE '%" + word + "%'")
    condition_usda = " AND ".join(condition_usda)
    condition_recipe = " AND ".join(condition_recipe)

    conn = sqlite3.connect('../usda-data/usda.sql3')
    c = conn.cursor()
    c.execute('SELECT id, name FROM recipe WHERE ' + condition_recipe)
    results = {"results":[]}
    for row in c:
        results["results"].append({"recipe_id": row[0], "name":row[1]})
    c.execute('SELECT id, long_desc FROM food WHERE ' + condition_usda)
    for row in c:
        results["results"].append({"food_id": row[0], "name":row[1]})
    return results




if __name__ == '__main__':
    main()
    #app.run(host="0.0.0.0")
