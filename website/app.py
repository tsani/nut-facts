from flask import (
    Flask, send_from_directory, render_template, url_for, request,
    redirect, flash, session, abort, jsonify
)
import requests
import sqlite3
import datetime
import json
from os import environ

IS_DEV = environ["FLASK_ENV"] == "dev"
WEBPACK_DEV_SERVER_HOST = "http://localhost:3000"

app = Flask(__name__, static_folder=None if IS_DEV else '/static')
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

def proxy(host, path):
    """ Used to proxy a request for a resource to another server. """
    response = requests.get(f"{host}{path}")
    excluded_headers = [
        "content-encoding",
        "content-length",
        "transfer-encoding",
        "connection",
    ]
    headers = {
        name: value
        for name, value in response.raw.headers.items()
        if name.lower() not in excluded_headers
    }
    return (response.content, response.status_code, headers)

# When running in development mode, we set up a reverse proxy into the
# webpack development server.
if IS_DEV:
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def catch_all(path):
        return proxy(WEBPACK_DEV_SERVER_HOST, request.path)

# adds nutrients to someone's daily tally
def add_macro_traco(consumer, python_nutrients):
    db = sqlite3.connect('../usda-data/usda.sql3')
    print("inserting into marco_traco table")
    db.execute("INSERT INTO macro_traco (consumer, nutrients_json) VALUES (?, ?)", (consumer, json.dumps(python_nutrients)))
    db.commit()
    db.close()

# this function will sum all the nutrients recorded on a certain day
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
    # (food_id, seq_num) identifies a specific number of some unit in the DB.
    # Note the weight table has an 'amount' column, so when looking
    # up, divide the gm_weight by the amount to get the true per unit
    # gram equivalent weight.
    # That gives the weight of the food consumed, in grams.

    # Next, look up the nutrient values for the food.
    # Nutrient values are stored per 100g, so to get the nutrient
    # value for the consumed amount, divide the stored nutrient value
    # by 100 (to get nutrient value/g) and then multiply by the
    # consumed food weight to get the consumed nutrient value.

    # Try to use the DB where possible to do the calculation for you.

    # call it scaled_gm_weight
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
        # If all calculated were done in the DB, then no math should
        # be needed in this loop to build the dict.
        # Btw look up a tutorial on python dictionary
        # comprehension. It's like list comprehension but for building
        # a dictionary. You can probably build the dict in a 1-liner
        # that way.
        vals[row[0]] = ((row[2]*factor), row[1])
    return vals

def calculate_recipe_nutrients(recipe_id, seq_num, factor):
    """Calculate the nutrients in a recipe.
    The quantity of the recipe consumed is expressed using a number of
    grams or a total recipe fraction. This is indicated with the
    virtual weight sequence numbers 0 and -1 respectively.
    In other words, if seq_num == 0, then factor is a number of grams;
    else if seq_num == -1, then factor is a fraction of the total
    recipe that was eaten.

    The calculation proceeds by computing the total nutrients in the
    whole recipe by adding (scaled) nutrient values for all the
    recipes constituent foods. The total nutrients are then scaled.
    """

    # Calculate the total nutrients in the recipe.
    # To do this, look up the recipes constituent foods (and their
    # amounts) and then use `calculate_nutrients` to get the nutrients
    # in that amount of the food.

    # To calculate the nutrients for a recipe, you crucially need to
    # know the total weight of the recipe.
    # You can adjust `calculate_nutrients` so it returns the
    # total consumed weight of the food as a by-product.
    # This will make calculating the total weight of the recipe easier
    # in here.
    pass

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

def list_foods_recipes(search_terms):
    """Accepts a list of words that must appear in the long
    description of the generated results."""

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
    c.execute('SELECT id, name FROM recipe WHERE ' + condition_recipe + ' LIMIT 100')
    results = {"results":[]}
    for row in c:
        results["results"].append({"recipe_id": row[0], "name":row[1]})
    c.execute('SELECT id, long_desc FROM food WHERE ' + condition_usda + ' LIMIT 100')
    for row in c:
        results["results"].append({"food_id": row[0], "name":row[1]})
    return results

@app.route('/search')
def search():
    terms = request.args.get('for').split(' ')
    return jsonify(list_foods_recipes(terms))

@app.route('/food/<food_id>/weights')
def weights(food_id):
    return jsonify(get_weights(int(food_id)))

if __name__ == '__main__':
    app.run(host="0.0.0.0")
