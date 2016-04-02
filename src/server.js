import express from 'express';
import { Server } from 'http';
import socketIO from 'socket.io';
import bodyParser from 'body-parser';
import _keys from 'lodash/keys';
import _pick from 'lodash/pick';
import Container from './components/Container';
import App from './components/App';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { updateLog, logsToJS } from 'lib';
import makeStore from './state/store';
import { INITIAL_STATE } from './state/actions';

const app = express();
const HTTP = new Server(app);
const io = socketIO(HTTP);
const PORT = 8120;
const DATABASE = 'database.json';
const db = {
  logs: {},
  path: DATABASE,
};
const store = makeStore();


function addDataPoint(point) {
  updateLog(db, point);
  io.emit('data point', point);
}

function doNegativeLog(step, bias) {
  const noise = Math.random() + bias;
  const fraction = (step + 1) / 15000;
  const val = -1 * Math.log(fraction);
  return val + (noise - 0.5) * 1;
}

function getAccuracy(step, bias) {
  const noise = Math.random() + bias;
  const fraction = (step + 1) / 15000;
  return fraction + (noise - 0.5) * 0.3;
}

function addNewData(modelName, rate, bias, step = 0, repeat = false) {
  addDataPoint({
    modelName,
    pointType: 'trainLoss',
    pointValue: doNegativeLog(step, bias),
    globalStep: step,
  });

  if (step !== 0 && step % 20 === 0) {
    addDataPoint({
      modelName,
      pointType: 'validLoss',
      pointValue: doNegativeLog(step, bias + 0.2),
      globalStep: step,
    });
    addDataPoint({
      modelName,
      pointType: 'validAccuracy',
      pointValue: getAccuracy(step, bias),
      globalStep: step,
    });
  }

  if (repeat) {
    setTimeout(() => {
      addNewData(modelName, rate, bias, step + 1, true);
    }, rate);
  }
}

const nStartPoints = 7000;

for (let i = 0; i < nStartPoints; i++) {
  addNewData('modelA', null, 0.25, i, false);
  addNewData('modelB', null, 0.1, i, false);
  addNewData('modelC', null, -0.05, i, false);
  addNewData('modelD', null, 0, i, false);
  addNewData('modelE', null, 0, i, false);
}

// generate fake data
addNewData('modelA', 1500, 0.25, nStartPoints, true);
addNewData('modelB', 2000, 0.1, nStartPoints, true);
addNewData('modelC', 1800, -0.05, nStartPoints, true);
addNewData('modelD', 1900, -0.20, nStartPoints, true);
addNewData('modelE', 1850, -0.50, nStartPoints, true);
// end generate fake data


// ROUTES

app.use(bodyParser.json());
app.use(express.static('dist/assets'));

app.get('/', (req, res) => {
  const innerElement = ReactDOMServer.renderToString(
    <Container state={INITIAL_STATE} store={store} />);
  const html = App(innerElement);
  res.send(html);
});

app.post('/data', (req, res) => {
  // to post using curl:
  // curl -H "Content-Type: application/json" -X POST -d '{"modelName":"model1","pointType":"validLoss", "pointValue": 2.5, "globalStep": 1}' http://localhost:8120/data
  if (req.body.modelName === undefined ||
      req.body.pointType === undefined ||
      req.body.pointValue === undefined) {
    res.sendStatus(400);
  } else {
    addDataPoint(req.body);
    res.sendStatus(200);
  }
});

io.on('connection', (socket) => {
  socket.emit('available models', _keys(db.logs));
  socket.on('data request', (models) => {
    socket.emit('refreshed data', logsToJS(_pick(db.logs, models)));
  });
});

HTTP.listen(PORT, () => {
  console.log('Node server listening on localhost:', PORT);
});
