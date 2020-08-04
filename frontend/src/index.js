import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

function makeURL(path, qs) {
  if(qs)
    return path + '?' + new URLSearchParams(qs).toString();
  else
    return path
}

/* mock data that could be returned from the API */
const FAKE_SEARCH_DATA = [
  { recipe_id: 1, name: "shake" },
  { food_id: 1, name: "pasta" },
  { recipe_id: 2, name: "amazing meal 1" },
  { food_id: 2, name: "apple" },
  { recipe_id: 3, name: "amazing meal 2" },
];

const FAKE_WEIGHTS = [
  { name: "grams", seq_num: 0 },
  { name: "1 cup, shredded", seq_num: 1 },
];

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

const getFakeWeights = (edible) =>
  new Promise(
    (resolve, reject) => {
      if(edible.type === 'recipe')
        resolve(RECIPE_WEIGHTS);
      else
        resolve(FAKE_WEIGHTS);
    }
  );

function getWeights(edible) {
  if(edible.type === 'recipe')
    return new Promise( (resolve, reject) => resolve(RECIPE_WEIGHTS) );
  else {
    let url = makeURL("/food/" + edible.id + "/weights");
    console.log("requesting weights for edible", edible, 'url:', url);
    return fetch(url)
      .then(res => res.json())
      .then(data => data.weights);
  }
}

// In the fake search, we do the filtering client-side;
// In the real search, the filtering happens server-side.
function getFakeSearchResults (query) {
  const terms = query.split(" ");
  const matchesTerms = (edible) =>
    terms.every(t => edible.value.includes(t));

  return new Promise( (resolve, reject) =>
    resolve(FAKE_SEARCH_DATA) )
    .then(results =>
      results.map(formatEdible).filter(matchesTerms));
}

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

const Spinner = (props) => <span className="lds-dual-ring"></span>;

const WeightPicker =
  withLoading(
    Spinner,
    (props) => {
      const [ amount, setAmount ] = useState("");
      const [ weightType, setWeightType ] = useState(null);

      const handleTextChange = (event) => {
        setAmount(event.target.value);
        event.preventDefault();
        props.setAmount({ amount: amount, unit: weightType });
      };

      const handleSelectChange = (event) => {
        setWeightType(props.weights[parseInt(event.target.value)]);
        event.preventDefault();
        props.setAmount({ amount: amount, unit: weightType });
      }

      return (
        <div className="weight-picker">
          <input
            type="text"
            value={amount}
            onChange={(event) => handleTextChange(event)}
          />
          <select name="unit">
            { props.weights === null ? null :
            props.weights.map(
            (unit, i) =>
            <option
              key={props.edibleId + '-' + unit.seq_num}
              value={i}
              onChange={(event) => handleSelectChange(event)}
            >
              {unit.name}
            </option>)
            }
      </select>
    </div>
      );
    });

function Edible(props) {
  return <li onClick={e => props.handleClick(props, e)}>{props.value}</li>;
}

// Component for selecting a food or recipe and then a quantity for it.
function EdibleSelector(props) {
  const [edibles, setEdibles] = useState([]);
  const [weights, setWeights] = useState(null);

  useEffect(() => {
    if(props.searchTerms && null === props.selectedEdible) {
      getSearchResults(props.searchTerms)
      .then(setEdibles)
    }
  }, [props.searchTerms, props.selectedEdible]);

  useEffect(() => {
    if(null !== props.selectedEdible) {
      getWeights(props.selectedEdible)
        .then(ws => {
          console.log("got weights", ws);
          setWeights(ws);
        })
    }
  }, [props.selectedEdible]);

  const edibleKey = (edible) =>
    edible.type + '-' + edible.id;

  if(null === props.selectedEdible) {
    return (
      <div className="edible-selector">
        <div className="dropdown">
          <input
            autoFocus
            type="text"
            placeholder="Type to find a food or recipe..."
            onChange={props.handleChange}
            value={props.searchTerms}
          />
          <ul>
            {edibles.map(edible =>
              <Edible
                key={edibleKey(edible)}
                type={edible.type}
                id={edible.id}
                value={edible.value}
                handleClick={props.selectEdible} />)}
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
            onClick={() => props.selectEdible(null)}>
            X
          </span>
          {props.selectedEdible.value}
        </div>
        <WeightPicker
          edibleId={props.selectedEdible.id}
          handleSelect={props.selectWeight}
          weights={weights}
          ready={weights}
          setAmount={props.setAmount}
        />
      </div>
    );
  }
}

const EnableIf = (props) => {
  if(props.condition)
    return props.children;
  else
    return null;
};

function EatSomething(props) {
  const [ searchTerms, setSearchTerms ] = useState("");
  const [ selectedEdible, setSelectedEdible ] = useState(null);
  const [ amount, setAmount ] = useState(null);
  const [ consumerName, setConsumerName ] = useState("");

  const handleChange = (event) => {
    setSearchTerms(event.target.value);
    event.preventDefault();
  };

  const handleSubmit = () =>
    props.handleSubmit({
      edible: selectedEdible,
      amount: amount,
      consumer: consumerName
    });

  return (
    <div>
      <EdibleSelector
        searchTerms={searchTerms}
        handleChange={handleChange}
        selectedEdible={selectedEdible}
        selectEdible={setSelectedEdible}
        setAmount={setAmount}
      />
      <EnableIf
        condition={null !== selectedEdible && null !== amount}>
        <label for="consumer-name">
          <span className="label-text">Consumer</span>

          <input
            name="consumer-name"
            type="text"
            placeholder="Your name"
            value={consumerName}
            onChange={(event) => setConsumerName(event.target.value)}
          />
        </label>
      </EnableIf>
      <EnableIf condition={consumerName}>
        <div>
          <button
            type="submit"
            onClick={handleSubmit}
          >
            I ate it!
          </button>
        </div>
      </EnableIf>
    </div>
  );
}

function App(props) {
  return (
    <div>
      <h1>Macro-Micro-Tracko</h1>
      <div>
        <h2> Eat something? </h2>
        <EatSomething handleSubmit={() => alert("oh?")}/>
      </div>
      <p> This is some other random content for example. </p>
    </div>
  );
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
