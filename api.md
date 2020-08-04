Nut API
=======

`/food/:id/weights`
----------

### GET -- retrieves available weights for a food
# done, check `get_weights`

The `food_id` is specified as part of the URL.

Example return object:
```
{ "weights": [ <list of weight objects> ] }
```

and each weight object is
```
{ "name": <string>, "seq_num": <int>, "grams": <int> }
```
`grams` indicates how many grams are in one unit of `seq_num` (ex 1 cup = 244g)
The `seq_num` uniquely identifies this quantity type for the `food_id`.

`/search`
---------

### GET -- lists foods and recipes
# done (create recipe ONLY) see `list_foods_recipes`


Uses a query string parameter to specify search terms, e.g.

`/search?for=beef%20raw%20lean`

Search terms are separated by spaces (`%20` in the URL).

Should return a JSON object like

```
{ "results": [ <list of result objects> ] }
```

and each 'result object' is either

```
{ "recipe_id": 1, "name": "full name of recipe" }
```
in case of a recipe, or
```
{ "food_id": 10017, "name": "full name of the food" }
```
in case of a food.

`/recipes`
----------

### POST -- creates (or modifies) a recipe
# done (create ONLY) see `insert_to_db`

Example request

```
{
  "name": "protein shake",
  "ingredients": [
    { "food_id": 10017
    , "amount": 2
    , "display_unit": "cup"
    },
    { "food_id": 78121
    , "amount": 2
    , "display_unit": "cup"
    }
  ]
}
```

For modifying an existing recipe, the object would have an extra key `"id"`
saying which recipe should be overwritten. In that case, all ingredients that
used to belong to the recipe are deleted and the given ingredients are added.

If the request succeeds, return a JSON object like

```
{ "id": 5 }
```

which just specifies the ID of the recipe that was created/modified.

`/eat`
--------

### GET -- retrieves nutrient tracking data

The selected tracking data are summed and returned.

Query string parameters are used to filter the tracking data.
* `consumer` string: select tracking data for a specific consumer
* `begin` YYYY-MM-DD date: starting date
* `end` YYYY-MM-DD date: ending date

**NOTE:** A date like `2020-06-23` refers to 4AM on that day.

The returned data is a JSON object whose keys are nutrient names and whose
values are tuples (lists). The first tuple component is a number and the second
is a string that identifies the units for that number.

### POST -- adds a nutrition tracking entry

Example request:

```
{ "consumer": "Jake",
  "edible": <edible object>,
  "weight": <weight object>,
}
```
(This object is called an `eaten`.)

where an `edible object` is
```
{ "type": "food", "id": <int> }
```
or
```
{ "type": "recipe", "id": <int> }
```
and a `weight object` is
```
{ "amount": <float>, "seq_num": <int> }
```

The `type` field specifies how to interpret the `id` field.

Example request, for consuming a recipe
```
{ "consumer": "Eric",
  "edible": { "type": "recipe", "id": 1 },
  "weight": { "amount": 1.5, "seq_num": 2,
}
```

**NOTE:** The sequence numbers `0` and `-1` are special since they do not
correspond to entries in the `weight` table. Instead, the interpretation is a
number of grams and a total recipe fraction, respectively.
This means that `-1` is not valid as `seq_num` for a food, but instead valid
only for recipes.
