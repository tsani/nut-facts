import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

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

function getWeights(edible) {
  if(edible.type === 'recipe')
    return new Promise( (resolve, reject) => resolve(RECIPE_WEIGHTS) );
  else
    return fetch(makeURL("/food/" + edible.id + "/weights"))
      .then(res => res.json())
      .then(data => [ {seq_num: 0, name: 'gram', grams: 1}, ...data.weights ]);
}

function getSearchResults(terms) {
  if(terms.length >= 3)
    return fetch(makeURL("/search", { "for": terms }))
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

function useEdibleSearch(searchTerms) {
  const [edibles, setEdibles] = useState([]);

  useEffect(() => {
    if(!searchTerms) return;
    getSearchResults(searchTerms).then(setEdibles);
  }, [searchTerms]);

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
      return (
        <div className="weight-picker">
          <input
            type="text"
            name="amount"
            value={props.weight.amount}
            onChange={event =>
              props.handleChange({[event.target.name]: event.target.value})
            }
          />
          <select
            name="seq_num"
            onChange={e =>
              props.handleChange({[e.target.name]: parseInt(e.target.value)})
            }
          >
            { props.weights.map(unit =>
              <option
                name="seq_num"
                key={`${props.edibleId}-${unit.seq_num}`}
                value={unit.seq_num}
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

// Component for selecting a food or recipe and then a quantity for it.
function EdibleSelector(props) {
  const [searchTerms, setSearchTerms] = useState('');
  const edibles = useEdibleSearch(searchTerms);
  const weights = useEdibleWeights(props.eaten.edible);
  const nutrients = useNutrients(props.eaten.edible, props.eaten.weight);

  if(null === props.eaten.edible) {
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
                  props.handleEatenChange({edible: edible})
                }
              />)
            }
          </div>
        </div>
      </div>
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
          weights={weights}
          ready={weights}
        />
        <NutrientDetails nutrients={nutrients} />
      </div>
    );
  }
}

function EatSomething(props) {
  return (
    <form onSubmit={props.handleSubmit}>
      <EdibleSelector
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
      <EnableIf condition={props.eaten.consumer}>
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
  console.log('consumer nutrients', props.consumer, nutrients);
  if(Object.keys(nutrients).length)
    return (
      <div className="personal-day-macros">
        <p>{props.consumer}</p>
        <NutrientDetails nutrients={onlyMacros(nutrients)}/>
      </div>
    )
  else
    return null;
}

function DayMacros(props) {
  return (
    <div className="day-macros">
      { props.consumers.map(
          consumer =>
            <PersonalDayMacros consumer={consumer} />)
      }
    </div>
  );
}

function MacroTraco(props) {
  const INITIAL_EATEN = {edible: null, weight: {amount: '', seq_num: 0}, consumer: ''};
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
        <DayMacros counter={counter} consumers={['jake', 'eric']}/>
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

function App(props) {
  return <MacroTraco/>
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
