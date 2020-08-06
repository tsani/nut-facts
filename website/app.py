from flask import (
    Flask, send_from_directory, render_template, url_for, request,
    redirect, flash, session, abort, jsonify, g
)
import requests
import sqlite3
from datetime import datetime, timedelta
import json
import sys
from os import environ

DATABASE_PATH = '../usda-data/usda.sql3'

IS_DEV = environ.get("FLASK_ENV") == "dev"
WEBPACK_DEV_SERVER_HOST = "http://localhost:3000"

app = Flask(__name__, static_folder=None if IS_DEV else '/static')

def get_db():
    """Opens a connection to the database for this request."""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE_PATH)
    return db

@app.teardown_appcontext
def close_connection(exc):
    """Closes any database connection opened in this request."""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

class Food_nut_fact:
    def __init__(self, nut_facts):
        self.nut_fact = nut_facts

    def to_dict(self):
        return self.nut_fact.copy()

    def __add__(self, other):
        total = self.nut_fact.copy()
        for key in other.nut_fact:
            if key in self.nut_fact:
                assert self[key][1] == other[key][1]
                total[key] = (other[key][0] + self[key][0], other[key][1])
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
    def __mul__(self, multiplicand):
        new_dic = self.nut_fact.copy()
        for key in self.nut_fact:
            value, unit = self.nut_fact[key]
            new_dic[key] = value * multiplicand, unit
        return Food_nut_fact(new_dic)

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
    """Adds a Food_nut_fact to a consumer's eaten foods for today."""
    db = get_db()
    print("inserting into marco_traco table")
    db.execute(
        "INSERT INTO macro_traco "
        "(consumer, nutrients_json) VALUES (?, ?)",
        ( consumer,
          json.dumps(python_nutrients.nut_fact),
        )
    )
    db.commit()

# this function will sum all the nutrients recorded on a certain day
# paramaters: consumer, year, month, day
def sum_day_macro(consumer, date_start):
    date_start = date_start.replace(hour=0, minute=0, second=0)
    date_end = date_start + timedelta(days=1)
    db = sqlite3.connect('../usda-data/usda.sql3')
    c = db.cursor()
    c.execute("""
    SELECT nutrients_json
    FROM macro_traco
    WHERE timestamp BETWEEN (?) AND (?) AND consumer=(?)
    """, (date_start, date_end, consumer))

    # structure of vals: dict of string, tuple (float, string) pairs
    # vals = {'nutrient' : (float amt, 'unit')}
    total_day_nut_fact = Food_nut_fact({})

    for row in c:
        days_nut_facts = Food_nut_fact(json.loads(row[0]))
        total_day_nut_fact += days_nut_facts

    return total_day_nut_fact

def get_weights(food_id):
    db = get_db()
    c = db.cursor()
    c.execute("""
    SELECT
    sequence_num, gm_weight, description
    FROM
    weight
    WHERE
    food_id = (?)""", (food_id,))
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
    db = get_db()
    c = db.cursor()
    # (food_id, seq_num) identifies a specific number of some unit in the DB.
    # Note the weight table has an 'amount' column, so when looking
    # up, divide the gm_weight by the amount to get the true per unit
    # gram equivalent weight.
    # That gives the weight of the food consumed, in grams.
    if (seq_num > 0):
        scaled_gm_w = seq_weight_in_g(food_id, seq_num)

    elif(seq_num == 0):
        scaled_gm_w = 1

    else:
        raise None

    # Next, look up the nutrient values for the food.
    # Nutrient values are stored per 100g, so to get the nutrient
    # value for the consumed amount, divide the stored nutrient value
    # by 100 (to get nutrient value/g) and then multiply by the
    # consumed food weight to get the consumed nutrient value.

    c.execute("""
    SELECT name, units, (amount/100 * (?))
    FROM nutrition JOIN nutrient JOIN common_nutrient
    ON nutrition.food_id = ? AND nutrition.nutrient_id = nutrient.id AND nutrient.id = common_nutrient.id
    """, (scaled_gm_w, food_id))

    vals = {}
    for row in c:
        vals[ row[0] ] = (factor * row[2], row[1])
    # vals = {
    #     row[0]: eff(lambda: print(row), lambda: ((factor * row[2]), row[1]))
    #     for row in c
    # }

    c.close();
    return Food_nut_fact(vals)

def seq_weight_in_g(food_id, seq_num):
    #gets food id and its seq num
    #calculates what is the weight of that seq number?
    #ex 3 crackers = 30g will return 10g because that's the weight of a single item
    if seq_num == 0:
        return 1
    c = get_db().cursor()
    c.execute("""
    SELECT gm_weight/amount
    FROM weight
    WHERE food_id = (?) AND sequence_num = (?)""", (food_id, seq_num))

    for row in c:
        return row[0]

def calculate_recipe_nutrients(recipe_id, seq_num, factor):
    #Calculate the nutrients in a recipe.
    db = get_db()
    c = db.cursor()
    c.execute("""
    SELECT food_id, amount, seq_num, display_unit
    FROM ingredient
    WHERE recipe_id = (?)""", (recipe_id,))

    total_recipe_nut_fact = Food_nut_fact({})
    total_recipe_weight = 0

    for row in c:
        scaled_gm_w = seq_weight_in_g(row[0], row[2])*row[1]
        ingredient_nut_fact = \
            calculate_nutrients(
                row[0], row[2], row[1])
        if ingredient_nut_fact is None:
            return None # invalid food was given

        total_recipe_weight += scaled_gm_w
        total_recipe_nut_fact += ingredient_nut_fact

    if seq_num == 0: #looking to calculate macros as weight of recipe
        ratio = factor/total_recipe_weight
        return total_recipe_nut_fact * ratio
    else:
        return total_recipe_nut_fact * factor
    # To calculate the nutrients for a recipe, you crucially need to
    # know the total weight of the recipe.
    # You can adjust `calculate_nutrients` so it returns the
    # total consumed weight of the food as a by-product.
    # This will make calculating the total weight of the recipe easier
    # in here.

# test recipe for the function following
test_recipe = {
    "name":"chicken dinner",
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
def add_recipe(recipe):
    recipe_name = recipe["name"]
    db = get_db()
    c = db.cursor()
    c.execute("BEGIN")
    c.execute("INSERT INTO recipe (name) VALUES (?)", (recipe_name,))
    recipe_id = c.lastrowid

    for ingredient in recipe["ingredients"]:
        assert ingredient['edible']['type'] == 'food'
        c.execute(
            "INSERT INTO ingredient "
            "(recipe_id, food_id, amount, seq_num, display_unit) "
            "VALUES (?, ?, ?, ?, ?)",
            ( recipe_id,
              ingredient['edible']["id"],
              ingredient['weight']["amount"],
              ingredient['weight']["seq_num"],
              ''
            )
        )

    db.commit()
    c.close()

def list_foods_recipes(search_terms, restrict_to=None):
    """Accepts a list of words that must appear in the long
    description of the generated results."""
    if restrict_to is None:
        restrict_to = ['food', 'recipe']
    else:
        restrict_to = [restrict_to]

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
    results = []
    if 'recipe' in restrict_to:
        c.execute('SELECT id, name FROM recipe WHERE ' + condition_recipe + ' LIMIT 100')
        results.extend(
            {"id": row[0], "type": "recipe", "name":row[1]} for row in c
        )
    if 'food' in restrict_to:
        c.execute('SELECT id, long_desc FROM food WHERE ' + condition_usda + ' LIMIT 100')
        results.extend(
            {"id": row[0], "type": "food", "name":row[1]} for row in c
        )
    return {'results': results}

@app.route('/search')
def search():
    search_for = request.args.get('for')
    if search_for is None:
        return jsonify({'message': 'missing query string parameter "for"'}), 400

    results = list_foods_recipes(
        search_for.split(' '),
        restrict_to=request.args.get('restrict_to')
    )

    return jsonify(results)

@app.route('/food/<food_id>/weights')
def weights(food_id):
    return jsonify(get_weights(int(food_id)))

def calculate_edible_nutrients(edible, weight):
    """Calculates nutrients for a given quantity of an edible (either
    a recipe or a food).
    Returns a Foot_nut_fact.
    """
    f = None
    if(edible['type'] == 'food'):
        f = calculate_nutrients
    else:
        assert edible['type'] == 'recipe'
        f = calculate_recipe_nutrients

    d = f(
        int(edible['id']),
        int(weight['seq_num']),
        float(weight['amount'])
    )
    assert type(d) == Food_nut_fact
    return d

@app.route('/eat', methods=['GET', 'POST'])
def eat():
    if request.method == 'POST':
        return eat_post()
    else:
        assert request.method == 'GET'
        return eat_get()

def eat_get():
    consumer = request.args['consumer']
    date_string = request.args['date'] # YYYY-MM-DD
    date = datetime.strptime(date_string, '%Y-%m-%d')
    return jsonify(sum_day_macro(consumer, date).to_dict())

def eat_post():
    # keys: edible, weight, consumer (string)
    # edible keys: type ('food' or 'recipe'), id
    # weight keys: seq_num, amount
    eaten = request.json
    assert eaten is not None

    nut = calculate_edible_nutrients(
        eaten['edible'],
        eaten['weight']
    )
    if nut is None:
        return jsonify({'message': 'invalid edible'}), 400

    for consumer in eaten['consumer'].lower().split(' '):
        add_macro_traco(consumer, nut)
    return jsonify({})

@app.route('/macros')
def macros():
    """Calculates the macros for a given quantity of an edible.
    """
    edible = {
        'id': request.args.get('id'),
        'type': request.args.get('type'),
    }
    weight = {
        'seq_num': request.args.get('seq_num'),
        'amount': request.args.get('amount'),
    }
    return jsonify(
        calculate_edible_nutrients(
            edible,
            weight,
        ).nut_fact
    )

@app.route('/recipes', methods=['POST'])
def recipes():
    recipe = request.json
    assert recipe is not None
    add_recipe(recipe)
    return jsonify({})

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        pass
    else:
        app.run(host="0.0.0.0")
