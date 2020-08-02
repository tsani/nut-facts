Nut API
=======

`/search`
---------

### GET -- lists foods and recipes

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
