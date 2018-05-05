const { copy, max, range, shuffle, xlog } = require('./util.js');

const deck = () => shuffle(range(52));

const numboard = (phase) => {
  switch (phase) {
    case 0: return 0; // preflop
    case 1: return 3; // flop
    case 2: return 4; // turn
    default: return 5; // river and after
  }
};

// XXX: pot has to include opponents' bet
// i.e. pot must be 100+30*2 when two other opponents already bet/call 30.
const potodds = (pot, bet) => (pot + bet) / bet;
const ev = (hsval, pot, bet) => hsval * (pot + bet);

const updateGameStatus = (state0) => {
  const state = copy(state0);
  // check survivors
  const survivors = state.folded.map((x, i) => [i, x]).filter(x => !x[1]);
  if (survivors.length === 1) return { ...state, finished: true };
  // phase shift if needed
  if (survivors.filter(([i]) => state.betchance[i]).length === 0) {
    state.phase += 1;
    state.pot += state.betamount.reduce((acc, x) => acc + x, 0);
    state.betamount = state.players.map(() => 0);
    state.betchance = state.players.map(() => true);
    state.nextPlayer = (state.nextBTN + 1) % state.players.length; // SB is the first player after preflop.
    xlog({ type: 'phaseshift', value: state.phase });
  }
  if (state.phase === 4) return { ...state, finished: true };
  return state;
};

const reducer = (state0, action) => {
  let state = copy(state0);
  switch (action.type) {
    case ('fold'):
      state.folded[action.value.player] = true;
      break;
    case ('check'):
      state.betchance[action.value.player] = false;
      break;
    case ('call'):
      const chipTocall = max(state.betamount) - state.betamount[action.value.player];
      state.betchance[action.value.player] = false;
      state.betamount[action.value.player] += chipTocall;
      state.stacks[action.value.player] -= chipTocall;
      break;
    case ('raise'):
      state.betchance = state.players.map(() => true); // reset.
      state.betchance[action.value.player] = false;
      state.betamount[action.value.player] += action.value.amount;
      state.stacks[action.value.player] -= action.value.amount;
      break;
    case ('allin'):
      throw Error('not implemented'); // TODO: redesign required for side pot
      break;
    case ('phasecheck'):
      state = updateGameStatus(state);
      break;

    default: throw Error(`invalid action ${JSON.stringify(action)}`);
  }
  return {
    ...state,
    nextPlayer: (action.value.player
      ? (action.value.player + 1) % state.players.length
      : state.nextPlayer),
  };
};

// position finding algorithm
// used for 1. determine BTN, and 2. determine next player
const positionOf = (flist, lastBB) => {
  const order = flist
    .map((val, i) => (i <= lastBB ? [i, i + flist.length, val] : [i, i, val]))
    .filter(x => !x[2]) // filter out folded players
    .sort((x, y) => x[1] - y[1]) // sort by effective index
    .map(x => x[0]);
  const posBB = order[0];
  const posSB = order[order.length - 1];
  const posBTN = order[order.length - 2];
  return { posBB, posSB, posBTN };
};

// almost identical
const nextplayer = (flist, clist, cand) => flist
  .map((val, i) => (i < cand ? [i, i + flist.length, val] : [i, i, val]))
  .filter(x => !x[2] && clist[x[0]]) // filter out folded players and players already done.
  .sort((x, y) => x[1] - y[1]) // sort by effective index
  .map(x => x[0])
  .shift();

module.exports = {
  deck,
  ev,
  potodds,
  numboard,
  reducer,

  positionOf,
  nextplayer,
};
