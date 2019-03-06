import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/storage';
import 'firebase/auth';
import { Constants } from 'expo';

import config from './config';

let instance = null;
class Db {
  constructor() {
    firebase.initializeApp(config.firebase);
    firebase.auth().signInAnonymously();
    this.db = firebase.firestore();
    this.storageRef = firebase.storage().ref();
    const noop = () => {};
    this.unsubscribeParty = noop;
    this.unsubscribeGame = noop;
  }

  async getCardUrl(key) {
    return this.storageRef
      .child(`cards/${key}.jpeg`)
      .getDownloadURL()
      .then(url => url);
  }

  subscribeGame(id, callback) {
    return this.db
      .collection('games')
      .doc(id)
      .onSnapshot((d) => {
        callback(d.data());
      });
  }

  subscribeParty(id, callback) {
    return this.db
      .collection('parties')
      .doc(id)
      .onSnapshot((d) => {
        callback(d.data());
      });
  }

  gameOver(id) {
    this.db
      .collection('parties')
      .doc(id)
      .update({ gameInProgress: false });
  }

  async createGame(id, players, callback) {
    await this.db
      .collection('games')
      .doc(id)
      .set(players);

    this.unsubscribeGame = this.subscribeGame(id, callback);

    await this.db
      .collection('parties')
      .doc(id)
      .update({ gameInProgress: true });
  }

  async joinGame(id, callback) {
    const game = await this.db
      .collection('games')
      .doc(id)
      .get()
      .then(d => d.data())
      .catch(() => null);

    callback(game);
    this.unsubscribeGame = this.subscribeGame(id, callback);
  }

  async createParty(username, callback) {
    const createdAt = new Date();
    const { deviceId: playerId } = Constants;

    const id = (createdAt.getTime() % (1000 * 60 * 60 * 24)).toString(36).toUpperCase();
    const moderator = { joinedAt: createdAt, name: username, moderator: true };

    const party = {
      id,
      name: `${username}'s party`,
      createdAt,
      players: { [playerId]: moderator },
    };

    await this.db
      .collection('parties')
      .doc(id)
      .set(party);

    this.unsubscribeParty = this.subscribeParty(id, callback);
    return party;
  }

  async getPartyById(id) {
    return this.db
      .collection('parties')
      .doc(id)
      .get()
      .then(ref => ref.data())
      .catch(() => null);
  }

  killPlayer(gameId, playerId) {
    this.db
      .collection('games')
      .doc(gameId)
      .update({ [`${playerId}.alive`]: false });
  }

  promote(moderatorId, playerId, partyId) {
    this.db
      .collection('parties')
      .doc(partyId)
      .update({
        [`players.${moderatorId}.moderator`]: false,
        [`players.${playerId}.moderator`]: true,
      });
  }

  kick(playerId, partyId) {
    this.db
      .collection('parties')
      .doc(partyId)
      .update({
        [`players.${playerId}.kick`]: true,
      });
  }

  async joinParty(id, name, callback) {
    const { deviceId } = Constants;
    const joinedAt = Date.now();

    const join = { joinedAt, name };

    await this.db
      .collection('parties')
      .doc(id)
      .update({
        [`players.${deviceId}`]: join,
      });

    this.unsubscribeParty = this.subscribeParty(id, callback);
    return { [deviceId]: join };
  }

  async fleeParty(partyId) {
    const { deviceId } = Constants;

    this.db
      .collection('parties')
      .doc(partyId)
      .update({
        [`players.${deviceId}`]: firebase.firestore.FieldValue.delete(),
      });

    this.unsubscribeParty();
    this.unsubscribeParty = this.noop;
  }
}

export default {
  get: () => {
    if (!instance) {
      instance = new Db();
    }

    return instance;
  },
};
