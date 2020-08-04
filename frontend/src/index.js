import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

function makeURL(path, qs) {
  if(qs)
    return path + '?' + new URLSearchParams(qs).toString();
  else
    return path
}

// /* mock data that could be returned from the API */
// const FAKE_SEARCH_DATA = [
//   { recipe_id: 1, name: "shake" },
//   { food_id: 1, name: "pasta" },
//   { recipe_id: 2, name: "amazing meal 1" },
//   { food_id: 2, name: "apple" },
//   { recipe_id: 3, name: "amazing meal 2" },
// ];

// const FAKE_WEIGHTS = [
//   { name: "grams", seq_num: 0 },
//   { name: "1 cup, shredded", seq_num: 1 },
// ];

// Formats an edible returned from the API into the form we used in
// the client.
const formatEdible = (edible) => {
  return {
    id: edible.recipe_id || edible.food_id,
    "type": edible.recipe_id ? "recipe" : "food",
    value: edible.name
  };
};

const RECIPE_WEIGHTS = [
  { name: "grams", seq_num: 0 },
  { name: "fraction", seq_num: -1 },
];

// const getFakeWeights = (edible) =>
//   new Promise(
//     (resolve, reject) => {
//       if(edible.type === 'recipe')
//         resolve(RECIPE_WEIGHTS);
//       else
//         resolve(FAKE_WEIGHTS);
//     }
//   );

function getWeights(edible) {
  if(edible.type === 'recipe')
    return new Promise( (resolve, reject) => resolve(RECIPE_WEIGHTS) );
  else {
    let url = makeURL("/food/" + edible.id + "/weights");
    console.log("requesting weights for edible", edible, 'url:', url);
    return fetch(url)
      .then(res => res.json())
      .then(data => [ {seq_num: 0, name: 'gram', grams: 1}, ...data.weights ]);
  }
}

// // In the fake search, we do the filtering client-side;
// // In the real search, the filtering happens server-side.
// function getFakeSearchResults (query) {
//   const terms = query.split(" ");
//   const matchesTerms = (edible) =>
//     terms.every(t => edible.value.includes(t));
//
//   return new Promise( (resolve, reject) =>
//     resolve(FAKE_SEARCH_DATA) )
//     .then(results =>
//       results.map(formatEdible).filter(matchesTerms));
// }

function getSearchResults(terms) {
  if(terms.length >= 3)
    return fetch(makeURL("/search", { "for": terms }))
      .then(res => res.json() )
      .then(data => data.results.map(formatEdible));
  else
    return new Promise( (resolve, reject) => resolve([]) );
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
      // const handleTextChange = (event) => {
      //   setAmount(event.target.value);
      //   event.preventDefault();
      //   props.setAmount({ amount: amount, unit: weightType });
      // };

      // const handleSelectChange = (event) => {
      //   setWeightType(props.weights[parseInt(event.target.value)]);
      //   event.preventDefault();
      //   props.setAmount({ amount: amount, unit: weightType });
      // }


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
  return <li onClick={e => props.handleClick(e)}>{props.label}</li>;
}

// Component for selecting a food or recipe and then a quantity for it.
function EdibleSelector(props) {
  const [searchTerms, setSearchTerms] = useState('');
  const [edibles, setEdibles] = useState([]);
  const [weights, setWeights] = useState(null);

  useEffect(() => {
    if(searchTerms && null === props.eaten.edible) {
      getSearchResults(searchTerms)
      .then(setEdibles)
    }
  }, [searchTerms, props.eaten]);

  useEffect(() => {
    if(null !== props.eaten.edible) {
      getWeights(props.eaten.edible)
        .then(ws => {
          console.log("got weights", ws);
          setWeights(ws);
        })
    }
  }, [props.eaten.edible]);

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
          <ul>
            {edibles.map(edible =>
              <Edible
                key={`${edible.type}-${edible.id}`}
                label={edible.value}
                handleClick={() =>
                  props.handleEatenChange({edible: edible})
                }
              />)
            }
          </ul>
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
          {props.eaten.edible.value}
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
      </div>
    );
  }
}

function EatSomething(props) {
  return (
    <div>
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
        <div>
          <button
            type="submit"
            onClick={props.handleSubmit}
          >
            I ate it!
          </button>
        </div>
      </EnableIf>
    </div>
  );
}

// Executes a fetch, setting a flag to true while the request is in
// flight and setting it back to false after.
function exFetch(setStatus, ...rest) {
  setStatus(true);
  return fetch(...rest)
    .then(
      res => {
        setStatus(false);
        return res;
      },
      e => {
        setStatus(false);
        throw e;
    });
}

function MacroTraco(props) {
  const INITIAL_EATEN = {edible: null, weight: {amount: '', seq_num: 0}, consumer: ''};
  const [ eaten, setEaten ] = useState({...INITIAL_EATEN});
  const [ submitting, setSubmitting ] = useState(false);
  const [ error, setError ] = useState(false);

  const handleEatenChange = (e) => {
    // let newEaten = {...eaten, ...e}
    // console.log("Now eaten is", newEaten);
    setEaten({...eaten, ...e});
  };

  const handleSubmit = () => {
    exFetch(setSubmitting, '/eat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(eaten)
    })
      .then(res => {
        setSubmitting(false);
        setError(!res.ok);
        if(res.ok)
          setEaten({...INITIAL_EATEN});
      })
      .catch(e => { setError(true); throw e; });
  };

  if(!submitting) {
    return (
      <div>
        <h1>Macro-Micro-Tracko</h1>
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
