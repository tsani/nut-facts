import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

Array.changing = (array, i, valueOrFunction) => {
  const copy = [...array]
  if(typeof valueOrFunction === 'function')
    copy[i] = valueOrFunction(copy[i]);
  else
    copy[i] = valueOrFunction;
  return copy;
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

function useNutrients(edible, weight) {
  const [ nutrients, setNutrients ] = useState({});
  useEffect(() => {
    if(!edible || !edible.id || !edible.type || !weight || !weight.amount)
      return;
    if(weight.amount <= 0)
      return;

    fetch(makeURL(
      '/macros', {
        id: edible.id,
        type: edible.type,
        amount: weight.amount,
        seq_num: weight.seq_num,
    }))
      .then(res => res.json())
      .then(setNutrients);
  }, [edible, weight]);

  return nutrients;
}

const strfdateYYYYMMDD = (date) =>
  // getMonth is 0-based; what the fuck.
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

function useConsumerNutrients(consumer) {
  const [ nutrients, setNutrients ] = useState({});
  useEffect(() => {
    if(!consumer) return;
    fetch(makeURL(
      '/eat', {
        consumer: consumer,
        date: strfdateYYYYMMDD(new Date())
    }))
      .then(res => res.json())
      .then(setNutrients);
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
    res[k] = nutrients[k]
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
    (props) => {
      const handleFocus = props.handleFocus;
      return (
        <div className="weight-picker">
          <input
            type="text"
            name="amount"
            onFocus={() => handleFocus(true)}
            onBlur={() => handleFocus(false)}
            value={props.weight && props.weight.amount}
            onChange={event =>
              props.handleChange({[event.target.name]: event.target.value})
            }
          />
          <select
            name="seq_num"
            onFocus={() => handleFocus(true)}
            onBlur={() => handleFocus(false)}
            onChange={e =>
              props.handleChange({[e.target.name]: parseInt(e.target.value)})
            }
          >
            { props.weights.map(unit =>
              <option
                name="seq_num"
                key={`${props.edibleId}-${unit.seq_num}`}
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

function Edible(props) {
  return <button className="edible" onClick={e => props.handleClick(e)}>{props.label}</button>;
}

function NutrientDetails(props) {
  if(!props.nutrients)
    return null;

  const nonzeroAmount = ([_1, [amount, _2]]) => amount >= 1;
  const toNiceNutrientName = ([nutrientName, _1]) =>
    [ nutrientName.split(",")[0], _1 ];

  return (
    <table className="nutrient-list">
      <tbody>
      { Object
        .entries(props.nutrients)
        .filter(nonzeroAmount)
        .map(toNiceNutrientName)
        .map( ([nutrientName, [amount, unit]]) =>
          <tr key={nutrientName} className="nutrient-list-item">
            <td className="nutrient-name"> {nutrientName} </td>
            <td className="nutrient-amount"> {amount.toFixed(0)} </td>
            <td className="nutrient-unit"> {unit} </td>
          </tr>
      )
      }
      </tbody>
    </table>
  );
}

// required props:
// - handleEdibleChange: function that receives the edible whenever it
//   is selected by the user
function EdibleSelector(props) {
  const [searchTerms, setSearchTerms] = useState('');
  const edibles = useEdibleSearch(searchTerms, props.restrictTo);

  return (
    <div className="edible-selector">
      <div className="dropdown">
        <input
          autoFocus
          type="text"
          placeholder="Type to find a food or recipe..."
          onChange={e => setSearchTerms(e.target.value)}
          value={searchTerms}
        />
        <div
          className={`dropdown-values ${!edibles.length ? 'dropdown-values-empty' : ''} `}
        >
          {edibles.map(edible =>
            <Edible
              key={`${edible.type}-${edible.id}`}
              label={edible.name}
              handleClick={() =>
                props.handleEdibleChange(edible)
              }
            />)
          }
        </div>
      </div>
    </div>
  );
}

// Component for selecting a food or recipe and then a quantity for it.
// required props:
// - eaten, with keys 'edible' and 'weight'
function WeightedEdibleSelector(props) {
  const weights = useEdibleWeights(props.eaten.edible);
  const nutrients = useNutrients(props.eaten.edible, props.eaten.weight);
  const [ weightFocused, setWeightFocused ] = useState(false);

  if(null === props.eaten.edible) {
    return (
      <EdibleSelector
        handleEdibleChange={(edible) =>
          props.handleEatenChange({edible: edible})
        }
      />
    );
  }
  else {
    return (
      <div className="edible-selector">
        <div className="selected-edible">
          <span
            className="cancel-edible-selection"
            onClick={() => props.handleEatenChange({edible: null})}>
            X
          </span>
          {props.eaten.edible.name}
        </div>
        <WeightPicker
          edibleId={props.eaten.edible.id}
          weight={props.eaten.weight}
          handleChange={weight =>
            props.handleEatenChange({weight: {...props.eaten.weight, ...weight}})
          }
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

function EatSomething(props) {
  return (
    <form onSubmit={props.handleSubmit}>
      <WeightedEdibleSelector
        eaten={props.eaten}
        handleEatenChange={props.handleEatenChange}
      />
      <EnableIf
        condition={null !== props.eaten.edible && null !== props.eaten.amount}
      >
        <label htmlFor="consumer">
          <span className="label-text">Consumer</span>

          <input
            name="consumer"
            type="text"
            placeholder="Your name"
            value={props.eaten.consumer}
            onChange={e =>
              props.handleEatenChange({[e.target.name]: e.target.value})
            }
          />
        </label>
      </EnableIf>
      <EnableIf condition={props.eaten.edible && props.eaten.consumer}>
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

  const handleEatenChange = (e) => setEaten({...eaten, ...e});

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
            handleEatenChange={handleEatenChange}
            handleSubmit={handleSubmit}
          />
        </div>
      </div>
    );
  }
  else {
    return <Spinner/>
  }
}

function DynamicWeightedFoodList(props) {
  const addNewFood = () =>
    props.setFoods(foods => [ ...foods, {...INITIAL_EATEN} ]);

  const handleEatenChange = (newEaten, i) => {
    props.setFoods(foods => {
      let newFoods = Array.changing(
        foods, i, oldEaten => {
          return { ...oldEaten, ...newEaten };
        }
      )
      console.log('new foods', newFoods);
      return newFoods;
    });
  }

  return (
    <div className="weighted-foods-list">
      { props.foods.map((weightedFood, i) =>
        <div key={i} className="weighted-foods-list-item">
          <h4>Ingredient #{i+1}</h4>
          <WeightedEdibleSelector
            eaten={weightedFood}
            handleEatenChange={eaten => handleEatenChange(eaten, i)}
          />
        </div>
      )}
      <div>
        <button type="button" onClick={addNewFood}>
          Add another ingredient
        </button>
      </div>
    </div>
  );
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

  const handleSubmit = () => {
    exFetch(setSubmitting, '/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRecipeName,
        ingredients: foods,
      })
    })
      .then(res => {
        setError(!res.ok);
        if(!res.ok) return;
        setFoods([]);
      });
  };

  return (
    <div className="recipe-editor">
      <h2>Add or edit recipe</h2>
      <EnableIf condition={error}>
        <p> Oops, something went wrong. </p>
      </EnableIf>
      <form action="javascript:void(0);" onSubmit={handleSubmit}>
        <label htmlFor="is-new-recipe">
          New recipe?&nbsp;
          <input
            type="checkbox"
            id="is-new-recipe"
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
          foods={foods}
          setFoods={setFoods}
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
    </>
  );
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
