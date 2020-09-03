import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

// Applies a transformation to or replaces a value in an array at a
// specific index, producing a new array.
Array.changing = (array, i, valueOrFunction) => {
  const copy = [...array]
  if(typeof valueOrFunction === 'function')
    copy[i] = valueOrFunction(copy[i]);
  else
    copy[i] = valueOrFunction;
  return copy;
};

// Returns a new array with the given index removed.
Array.deleting = (array, i) => {
  const dup = [...array];
  dup.splice(i, 1);
  return dup;
};

function makeURL(path, qs) {
  if(qs)
    return path + '?' + new URLSearchParams(qs).toString();
  else
    return path
}

// The units to use for recipes, since they do not have real units.
const RECIPE_WEIGHTS = [
  { name: "grams", seq_num: 0 },
  { name: "fraction", seq_num: -1 },
];

const INITIAL_EATEN = {
  edible: null,
  weight: {amount: '', seq_num: 0},
 // consumer: ''
};

function getWeights(edible) {
  if(edible.type === 'recipe')
    return new Promise( (resolve, reject) => resolve(RECIPE_WEIGHTS) );
  else
    return fetch(makeURL("/food/" + edible.id + "/weights"))
      .then(res => res.json())
      .then(data => [ {seq_num: 0, name: 'gram', grams: 1}, ...data.weights ]);
}

function getSearchResults(terms, restrictTo) {
  if(terms.length >= 3)
    return fetch(makeURL("/search", { "for": terms, restrictTo: restrictTo }))
      .then(res => res.json() )
      .then(data => data.results);
  else
    return new Promise( (resolve, reject) => resolve([]) );
}

// Retrieves the nutrients for a given edible with a given quantity.
async function getNutrients(edible, weight) {
  const res = await fetch(makeURL('/macros', {
    id: edible.id,
    type: edible.type,
    amount: weight.amount,
    seq_num: weight.seq_num,
  }));
  return await res.json();
}

async function getConsumerNutrients(consumer, start, end) {
  const res = await fetch(makeURL(
    '/eat', {
      consumer: consumer,
      start: start.toISOString(),
      end: end.toISOString(),
  }));
  return await res.json();
}

function useNutrients(edible, weight) {
  const [ nutrients, setNutrients ] = useState({});

  useEffect(() => {
    (async () => {
      if(!edible || !edible.id || !edible.type || !weight || !weight.amount)
        return;
      if(weight.amount <= 0)
        return;

      setNutrients(await getNutrients(edible, weight));
    })()
  }, [edible, weight]);

  return nutrients;
}

function useConsumerNutrients(consumer) {
  const [ nutrients, setNutrients ] = useState({});

  useEffect(() => {
    (async () => {
      if(!consumer) return;
      const start = new Date();
      start.setHours(4, 0, 0, 0)
      const end = new Date();
      end.setHours(28, 0, 0, 0)
      setNutrients(await getConsumerNutrients(consumer, start, end));
    })()
  }, [consumer]);

  return nutrients;
}

function useEdibleSearch(searchTerms, restrictTo) {
  const [edibles, setEdibles] = useState([]);

  useEffect(() => {
    if(!searchTerms) return;
    getSearchResults(searchTerms, restrictTo).then(setEdibles);
  }, [searchTerms, restrictTo]);

  return edibles;
}

function useEdibleWeights(edible) {
  const [weights, setWeights] = useState(null);

  useEffect(() => {
    if(!edible) return;
    getWeights(edible).then(setWeights)
  }, [edible]);

  return weights;
}

// Higher-order component that provides a "loading" behaviour.
// When the prop "ready" is falsy, the LoadingComponent is rendered.
// When the prop "ready" is truthy, the LoadedComponent is rendered.
function withLoading(LoadingComponent, LoadedComponent) {
  return (props) => {
    if (props.ready)
      return <LoadedComponent {...props} />;
    else
      return <LoadingComponent {...props} />;
  }
}

const MACRO_KEYS = [ 'Energy', 'Protein', 'Carbohydrate, by difference', 'Total lipid (fat)' ]

// Filters a nutrients object to contain only macronutrients (and energy)
const onlyMacros = (nutrients) => {
  let res = {}
  for (const k of MACRO_KEYS) {
    if(k in nutrients) res[k] = nutrients[k]
  }
  return res
}

// Basic component that renders its children only when a condition is
// true.
const EnableIf = (props) => {
  if(props.condition)
    return props.children;
  else
    return null;
};

const Spinner = (props) => <span className="lds-dual-ring"></span>;

const WeightPicker =
  withLoading(
    Spinner,
    ({ handleFocus, weight, weights, setWeight, edibleId }) => {
      const [
        [ amount, setAmount ],
        [ seqNum, setSeqNum ],
      ] = lens(weight, setWeight, ['amount', 'seq_num']);

      return (
        <div className="weight-picker">
          <input
            type="text"
            name="amount"
            onFocus={() => handleFocus(true)}
            onBlur={() => handleFocus(false)}
            value={amount}
            onChange={event => setAmount(event.target.value)}
          />
          <select
            name="seq_num"
            onFocus={() => handleFocus(true)}
            onBlur={() => handleFocus(false)}
            onChange={e => setSeqNum(parseInt(e.target.value))}
          >
            { weights.map(unit =>
              <option
                name="seq_num"
                key={`${edibleId}-${unit.seq_num}`}
                value={unit.seq_num}
                onFocus={() => handleFocus(true)}
                onBlur={() => handleFocus(false)}
              >
                {unit.name}
              </option>)
            }
      </select>
    </div>
      );
    });

const Edible = (props) =>
    <button
      type="button"
      className="edible"
      onClick={e => props.handleClick(e)}
    >
      {props.label}
    </button>;

function NutrientDetails(props) {
  if(!props.nutrients)
    return null;

  const nonzeroAmount = ([_1, [amount, _2]]) => amount >= 1;
  const toNiceNutrientName = x => x;
  // const toNiceNutrientName = ([nutrientName, _1]) =>
  //   [ nutrientName.split(",")[0], _1 ];

  const innards = Object
    .entries(props.nutrients)
    .filter(nonzeroAmount)
    .map(toNiceNutrientName)
    .map( ([nutrientName, [amount, unit]]) =>
      <tr key={nutrientName} className="nutrient-list-item">
        <td className="nutrient-name"> {nutrientName} </td>
        <td className="nutrient-amount"> {amount.toFixed(0)} </td>
        <td className="nutrient-unit"> {unit} </td>
      </tr>
    );

  return innards.length === 0 ? null : (
    <table className="nutrient-list">
      <tbody>
      { innards }
      </tbody>
    </table>
  );
}

function useNutrientSearch(searchTerms) {
  const [ nutrients, setNutrients ] = useState([]);
  useEffect(() => {
    fetch(makeURL('/nutrients', { search: searchTerms }))
      .then(res => res.json())
      .then(setNutrients)
  }, [searchTerms]);
  return nutrients;
}

const NutrientSelector = dynamicSelector({
  useResults: useNutrientSearch,
  placeholder: "Type the name of a nutrient",
  formatResult: (nutrient, _index, select) =>
    <button
      key={nutrient.id}
      type="button"
      onClick={() => select()}
    >
      {nutrient.name} ({nutrient.unit})
    </button>,
});

// generates a _dynamic selector_, which is a text field that obtains
// a list of options from a data source.
// options:
// - useResults (function)
//   1. search terms (a string) and generates the list of choices
//   2. the whole props dictionary received by the generated component,
//      for further restricting the search results (statically)
// - formatResult (function)
//   formatResult(object, index, select)
//   - object: the object to format as HTML
//   - index: of the object
//   - select(): function that triggers selection of this object
// - placeholder (string)
//   The text to display as a placeholder in the input field.
//
// The generated component requires the following props:
// - onSelect (function)
//   receives the object selected by the user.
function dynamicSelector(options) {
  return (props) => {
    const [searchTerms, setSearchTerms] = useState('');
    const results = options.useResults(searchTerms, props);

    return (
      <div className="dynamic-selector">
        <div className="dropdown">
          <input
            autoFocus
            type="text"
            placeholder={options.placeholder}
            onChange={e => setSearchTerms(e.target.value)}
            value={searchTerms} />
        </div>
        <div
          tabIndex="-1"
          className={
            `dropdown-values ${!results.length ? 'dropdown-values-empty' : ''} `
          }
        >
          { results.map((result, i) =>
            options.formatResult(result, i, () =>
              props.onSelect(result)))
          }
        </div>
      </div>
    );
  }
}

const EdibleSelector = dynamicSelector({
  placeholder: "Type to find a food or recipe...",
  useResults: (terms, props) => useEdibleSearch(terms, props.restrictTo),
  formatResult: (edible, i, select) =>
    <Edible
      key={`${edible.type}-${edible.id}`}
      label={edible.name}
      handleClick={() => select()}
    />
});

// Component that renders an X floating to the right.
// When clicked, calls onCancel.
const CancelButton = ({onCancel}) =>
  <span
    className="cancel-button"
    onClick={() => onCancel()}>
    X
  </span>;

// Component for selecting a food or recipe and then a quantity for it.
// required props:
// - eaten, with keys 'edible' and 'weight'
function WeightedEdibleSelector({ eaten, setEaten, resetEaten }) {
  const weights = useEdibleWeights(eaten.edible);
  const nutrients = useNutrients(eaten.edible, eaten.weight);

  const [ weightFocused, setWeightFocused ] = useState(false);
  const [ weight, setWeight ] = lens(eaten, setEaten, 'weight');

  if(null === eaten.edible) {
    return (
      <EdibleSelector
        onSelect={(edible) => setEaten(eaten => ({...eaten, edible: edible}))}
      />
    );
  }
  else {
    return (
      <div className="edible-selector">
        <div className="selected-edible">
          <CancelButton onCancel={() => resetEaten()}/>
          {eaten.edible.name}
        </div>
        <WeightPicker
          edibleId={eaten.edible.id}
          weight={weight}
          setWeight={setWeight}
          handleFocus={setWeightFocused}
          weights={weights}
          ready={weights}
        />
        <EnableIf condition={weightFocused}>
          <NutrientDetails nutrients={nutrients} />
        </EnableIf>
      </div>
    );
  }
}

function EatSomething({eaten, setEaten, resetEaten, onSubmit}) {
  const [ consumer, setConsumer ] = lens(eaten, setEaten, 'consumer');

  return (
    <form onSubmit={onSubmit}>
      <WeightedEdibleSelector
        eaten={eaten}
        setEaten={setEaten}
        resetEaten={resetEaten}
      />
      <EnableIf
        condition={null !== eaten.edible && null !== eaten.amount}
      >
        <label>
          <span className="label-text">Consumer</span>
          <TextField
            value={consumer}
            setValue={setConsumer}
            placeholder="Your name" />
        </label>
      </EnableIf>
      <EnableIf condition={eaten.edible && eaten.consumer}>
        <div><input type="submit" value="I ate it!" /></div>
      </EnableIf>
    </form>
  );
}

// Executes a fetch, setting a flag to true while the request is in
// flight and setting it back to false after.
function exFetch(setStatus, ...rest) {
  setStatus(true);
  return fetch(...rest)
    .then(
      res => { setStatus(false); return res; },
      e => { setStatus(false); throw e; }
    );
}

function PersonalDayMacros(props) {
  const nutrients = useConsumerNutrients(props.consumer);
  if(Object.keys(nutrients).length)
    return (
      <div className="personal-day-macros">
        <p>{props.consumer}</p>
        <NutrientDetails nutrients={onlyMacros(nutrients)}/>
      </div>
    );
  else
    return null;
}

function DayMacros(props) {
  return (
    <div className="day-macros">
      { props.consumers.map(
          consumer =>
            <PersonalDayMacros key={consumer} consumer={consumer} />)
      }
    </div>
  );
}

function MacroTraco(props) {
  const [ eaten, setEaten ] = useState({...INITIAL_EATEN});
  const [ submitting, setSubmitting ] = useState(false);
  const [ error, setError ] = useState(false);
  const [ counter, setCounter ] = useState(0);

  const handleSubmit = () => {
    exFetch(setSubmitting, '/eat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(eaten)
    })
      .then(
        res => {
          setSubmitting(false);
          setError(!res.ok);
          if(res.ok) {
            setEaten({...INITIAL_EATEN});
            setCounter(x => x+1);
          }
        },
        e => { setError(true); throw e; }
      );
  };

  if(!submitting) {
    return (
      <div>
        <h1>Macro-Micro-Tracko</h1>
        <DayMacros counter={counter} consumers={['jake', 'eric', 'test']}/>
        <div>
          <h2> Eat something? </h2>
          <EnableIf condition={error}>
            <p>Uh-oh, something went wrong!</p>
          </EnableIf>
          <EatSomething
            eaten={eaten}
            setEaten={setEaten}
            onSubmit={handleSubmit}
            resetEaten={() => setEaten({...INITIAL_EATEN})}
          />
        </div>
      </div>
    );
  }
  else {
    return <Spinner/>
  }
}

// Creates an editable text field
const TextField = ({ setValue, value, ...props }) =>
  <input
    value={value}
    onChange={e => setValue(e.target.value)}
    {...props} />;

const CheckBox = ({ setValue, value, ...props }) =>
  <input
    type="checkbox"
    checked={value}
    onChange={e => setValue(e.target.checked)}
    {...props} />;

function dynamicListWidget({
  renderOnEmpty, // element to render when the list is empty (optional)

  renderItems, // function that renders the list (optional)
  // If this is omitted, then the list is wrapped in a <div>
  // renderItems(renderInside)
  // - renderInside(): renders the inside of the list

  renderItem, // function that renders a single item
  // renderItem(item, index, setItem)
  // - setItem: function that replaces the item or modifies the item
  //   at this index. Passing undefined will delete the item.

  renderAddItem, // function that renders a widget to add a new item
  // renderAddItem(addItem)
  // - addItem: appends the given item to the list of items
}) {
  return ({
    items, // the items to render
    setItems, // function to replace or modify the array of items
  }) => {
    if(items.length === 0 && renderOnEmpty)
      return <>
        {renderOnEmpty}
        { renderAddItem(item => setItems(items => [...items, item])) }
      </>;
    else {
      return (
        <>
          { renderItems(() =>
            items.map((item, index) =>
              renderItem(item, index, (itemOrFunction) =>
                setItems(items =>
                  itemOrFunction === null ?
                  Array.deleting(items, index) :
                  Array.changing(items, index, itemOrFunction)
                )
              )
            )
            )}
          { renderAddItem(item => setItems(items => [...items, item])) }
        </>
      );
    }
  };
}

const EMPTY_UNIT = { name: "", gramEquivalent: 0 };

function UnitEditor({
  unit,
  setUnit,
  ...props
}) {
  const [
    [ name, setName ],
    [ gramEquivalent, setGramEquivalent ],
  ] = lens(unit, setUnit, [ 'name', 'gramEquivalent' ]);

  return (
    <div className="unit-editor-item card">
      <CancelButton onCancel={() => setUnit(null)} />
      <div>
        <label>
          Unit name<br/>
          <TextField
            className="unit-name"
            value={name}
            setValue={setName}
            placeholder="Unit name"
            autoFocus
          />
        </label>
      </div>
      <div>
        <label>
          Gram equivalent<br/>
          <TextField
            className="unit-gram"
            value={gramEquivalent}
            setValue={setGramEquivalent}
            placeholder="Gram equivalent"/>
        </label>
      </div>
    </div>
  );
}

// Widget for constructing a list of units for a food, with gram equivalents.
const UnitListEditor = dynamicListWidget({
  renderOnEmpty: <p> No units in this food. </p>,
  renderAddItem: addUnit =>
    <button
      type="button"
      onClick={() => addUnit({...EMPTY_UNIT})}>
      Add another unit
    </button>,
  renderItems: renderInside => <div className="unit-editor-list">{renderInside()}</div>,
  renderItem: (unit, index, setUnit) =>
    <UnitEditor key={index} unit={unit} setUnit={setUnit} />,
});

// A dynamic list of foods together with weights for them.
// This is used to configure the ingredients of a recipe.
const DynamicWeightedFoodList = dynamicListWidget({
  renderOnEmpty: <p> No foods in this recipe. </p>,
  renderAddItem: addFood =>
    <div>
      <button type="button" onClick={() => addFood({...INITIAL_EATEN})}>
        Add another ingredient
      </button>
    </div>,
  renderItems: renderInside =>
    <div className="weighted-foods-list"> {renderInside()} </div>,
  renderItem: (eaten, index, setEaten) => {
    return <div key={index} className="weighted-foods-list-item card">
      <CancelButton onCancel={() => setEaten(null)} />
      <h4>Ingredient #{index+1}</h4>
      <WeightedEdibleSelector
        eaten={eaten}
        setEaten={setEaten}
        resetEaten={() => setEaten({...INITIAL_EATEN})}
      />
    </div>
  }
});

// generates an empty food object, with no units and no nutrients
const EMPTY_FOOD = () => ({
  id: null,
  units: [],
  name: '',
  nutrients: [],
});

const EMPTY_WEIGHTED_FOOD = () => ({
  food: EMPTY_FOOD(),
  amount: 0,
});

const lens_ = (value, setter, key) => [
  value[key],
  (xOrF) =>
    (typeof xOrF === 'function') ?
    setter(obj => ({...obj, [key]: xOrF(obj[key])})) :
    setter(obj => ({...obj, [key]: xOrF}))
];

// Construct a getter and setter for a component of an object that
// reconstructs the object.
const lens = (value, setter, key) => {
  return Array.isArray(key) ?
  key.map(key => lens_(value, setter, key)) :
  lens_(value, setter, key);
}

function FoodEditor ({food, setFood}) {
  const [
    [ name, setName ],
    [ units, setUnits ],
    [ nutrients, setNutrients ],
  ] = lens(food, setFood, ['name', 'units', 'nutrients']);

  return (
    <div className="food-editor">
      <div className="food-editor-name">
        <TextField
          value={name}
          setValue={setName}
          placeholder="Name of food" />
      </div>
      <h3>Units</h3>
      <UnitListEditor items={units} setItems={setUnits} />
      <h3>Nutrients</h3>
      <FoodNutrientListEditor items={nutrients} setItems={setNutrients} />
    </div>
  );
}

function FoodEditorManager({}) {
  const [ isNewFood, _setIsNewFood ] = useState(true);
  const [ submitting, setSubmitting ] = useState(false);
  const [ error, setError ] = useState(false);
  const [ weightedFood, setWeightedFood ] = useState(EMPTY_WEIGHTED_FOOD());
  const [
    [ food, setFood ],
    [ amount, setAmount ],
  ] = lens(weightedFood, setWeightedFood, ['food', 'amount']);

  const setIsNewFood = x => {
    if(x) {
      setFood(EMPTY_FOOD());
    }
    _setIsNewFood(x);
  }

  const selectExistingFood = (food) => {
    const {name, id, nutrients, units} = food;
    setFood({ name: name, id: id, nutrients: nutrients, units: units});
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await createFood(weightedFood, setSubmitting);
    const error = undefined === result;
    setError(error);
    if(error) return;
    setWeightedFood(EMPTY_WEIGHTED_FOOD());
  };

  return (
    <form onSubmit={handleSubmit} className="food-editor-manager">
      <h2> Add or edit a food </h2>
      New food?&nbsp;<CheckBox value={isNewFood} setValue={setIsNewFood} />
      <EnableIf condition={!isNewFood}>
        <EdibleSelector restrictTo="food" handleEdibleChange={selectExistingFood}/>
      </EnableIf>
      <EnableIf condition={isNewFood || food.id !== null}>
        <FoodEditor food={food} setFood={setFood} />
        <div className="reference-quantity">
          <label>
            Reference quantity<br/>
            <TextField
              value={amount}
              setValue={setAmount}/>
          </label>
        </div>
      </EnableIf>
      <EnableIf condition={!submitting}>
        <button> Submit </button>
      </EnableIf>
      <EnableIf condition={submitting}>
        <Spinner />
      </EnableIf>
    </form>
  );
}

const EMPTY_NUTRIENT = {
  id: null,
  unit: '',
  name: '',
};

const EMPTY_WEIGHTED_NUTRIENT = () => ({
  nutrient: {...EMPTY_NUTRIENT},
  amount: 0,
});

function NutrientEditor({weightedNutrient, setWeightedNutrient}) {
  const [
    [ nutrient, setNutrient ],
    [ amount, setAmount ],
  ] = lens(weightedNutrient, setWeightedNutrient, ['nutrient', 'amount']);

  if(null === nutrient.id)
    return (
      <div className="nutrient-selector">
        <NutrientSelector onSelect={setNutrient} />
      </div>
    );

  return (
    <div className="nutrient-selector">
      <div className="nutrient-name"> {nutrient.name} ({nutrient.unit}) </div>
      <TextField
        placeholder={`Amount in ${nutrient.unit}`}
        value={amount}
        setValue={setAmount} />
    </div>
  );
}

const FoodNutrientListEditor = dynamicListWidget({
  renderOnEmpty: <p> No nutrients in this food. </p>,
  renderAddItem: addNutrient =>
    <button
      type="button"
      onClick={() => addNutrient({... EMPTY_WEIGHTED_NUTRIENT()})}>
      Add another nutrient
    </button>,
  renderItems: renderInside => <div className="food-nutrient-list">{renderInside()}</div>,
  renderItem: (weightedNutrient, index, setWeightedNutrient) =>
    <div key={index} className="food-nutrient-list-item card">
      <CancelButton onCancel={() => setWeightedNutrient(null)} />
      <h4> Nutrient #{index+1} </h4>
      <NutrientEditor
        weightedNutrient={weightedNutrient}
        setWeightedNutrient={setWeightedNutrient}/>
    </div>,
});

const optionalFunction = (f) => undefined !== f ? f : () => { return; };

async function createFood(weightedFood, setStatus) {
  const res = await exFetch(optionalFunction(setStatus), '/food', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weightedFood),
  });
  if(res.ok)
    return await res.json();
  else
    return undefined;
}

// A recipe is a list of foods + weights
function RecipeEditor(props) {
  const [ recipeIsSelected, setRecipeIsSelected ] = useState(false);
  // foods: array of objects with keys 'edible' and 'weight'
  // the edibles must all be foods (no recipes allowed within a recipe)
  // weight is a weight object with keys 'seq_num' and 'amount'
  const [ foods, setFoods ] = useState([]);
  const [ isNewRecipe, setIsNewRecipe ] = useState(true);
  const [ newRecipeName, setNewRecipeName ] = useState('');
  const [ submitting, setSubmitting ] = useState(false);
  const [ error, setError ] = useState(false);

  const handleIsNewRecipeChange = (e) => setIsNewRecipe(e.target.checked);
  const handleNewRecipeNameChange = (e) => setNewRecipeName(e.target.value);

  const handleSubmit = async () => {
    const res = await exFetch(setSubmitting, '/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRecipeName,
        ingredients: foods,
      })
    });
    setError(!res.ok);
    if(!res.ok) return;
    setFoods([]);
  };

  return (
    <div className="recipe-editor">
      <h2>Add or edit recipe</h2>
      <EnableIf condition={error}>
        <p> Oops, something went wrong. </p>
      </EnableIf>
      <form action="javascript:void(0);" onSubmit={handleSubmit}>
        <label>
          New recipe?&nbsp;
          <input
            type="checkbox"
            name="is-new-recipe"
            checked={isNewRecipe}
            onChange={handleIsNewRecipeChange}
          />
        </label>

        <EnableIf condition={isNewRecipe}>
          <input
            type="text"
            value={newRecipeName}
            onChange={handleNewRecipeNameChange}
            placeholder="Recipe name"
          />
        </EnableIf>
        <EnableIf condition={!isNewRecipe}>
          <EdibleSelector restrictTo="recipe"/>
        </EnableIf>

        <DynamicWeightedFoodList
          items={foods}
          setItems={setFoods}
        />

        <input type="submit" value="Add this recipe" />
      </form>
    </div>
  );
}

function App(props) {
  return (
    <>
    <MacroTraco/>
    <RecipeEditor/>
    <FoodEditorManager/>
    </>
  );
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
