/**
 * MAL data provider
 * Base abstract class for MalParser and MalApiClient
 * Get useful info about animes (not mangas), user profiles, 
 *  user anime lists (not manga list), users' recommendations anime-to-anime, 
 *  also social info about users: clubs, friends.
 *
 * @author ukrbublik
 */

const deepmerge = require('deepmerge');
const assert = require('assert');
const Helpers = require('../Helpers');
const _ = require('underscore')._;
const http = require('http');
const request = require('request');
const Queue = require('promise-queue');
const FeedRead = require("feed-read");
const ParseXmlString = require('xml2js').parseString;
const MalError = require('./MalError');


/**
 * 
 */
class MalDataProvider {
  /**
   * @return array default options
   */
  static get DefaultOptions() {
    return {
      requestsQueueMaxConcurrent: 10,
      requestsQueueMaxQueue: Infinity,
      logHttp: true,
      endpoint: null,
      retryTimeout: 5000,
      maxRetrues: 5,
    }
  }

  constructor() {
  }

  /**
   *
   */
  init(options = {}) {
    this.options = deepmerge.all([ cls.DefaultOptions, options ]);
    this.queue = new Queue(this.options.requestsQueueMaxConcurrent, 
      this.options.requestsQueueMaxQueue);
  }


  /**
   *
   */
  canAddMoreToQueue() {
    return (this.queue.getPendingLength() < this.queuePendingSize());
  }

  /**
   *
   */
  queuePendingSize() {
    return this.queue.maxPendingPromises;
  }


  //-----------------------------------------------------------

  //Network routines:

  /**
   *
   */
  _log(url, err, time) {
    if (!this.options.logHttp)
      return;

    if (!err) {
      console.log("ok" 
        + " [" + time + " ms" + ", " 
        + "q " + this.queue.getPendingLength() + "/" + this.queue.getQueueLength() + "]"
        + " " + url);
    } else {
      console.error("!!" 
        + " [" + time + " ms" + ", " 
        + "q " + this.queue.getPendingLength() + "/" + this.queue.getQueueLength() + "]"
        + " " + url, 
        (err instanceof MalError ? (err.code ? err.code : err.statusCode) : err));
    }
  }

  /**
   *
   */
  loadUrl(url, retry = -1) {
    return this.queue.add(() => new Promise((resolve, reject) => {
      request.get({
        url: url
      }, (error, response, body) => {
        if (!error && response.statusCode != 200) {
          error = new MalError(http.STATUS_CODES[response.statusCode], 
            response.statusCode, url);
          error.body = body;
          error.response = response;
        }

        let canRetry = false;
        if (error && error instanceof MalError && error.statusCode == 429) {
          //Too Many Requests
          canRetry = (retry < this.options.maxRetrues);
        }
        if (canRetry) {
          //if (this.options.logHttp)
            console.log("Retrying #" + (retry+1) + " after " 
              + this.options.retryTimeout + "ms ...");
          setTimeout(() => {
            this.loadUrl(url, retry + 1).then((res) => {
              resolve(res);
            }).catch((err) => {
              resolve(err);
            });
          }, this.options.retryTimeout);
        } else {
          if (!error) {
            resolve(body);
          } else {
            reject(error);
          }
        }
      });
    }));
  }

  /**
   *
   */
  headUrl(url) {
    return this.queue.add(() => new Promise((resolve, reject) => {
      request.head({
        url: url
      }, (error, response) => {
        if (!error && response.statusCode != 200) {
          error = new MalError(http.STATUS_CODES[response.statusCode], 
            response.statusCode, url);
        }

        if (!error) {
          resolve(response);
        } else {
          reject(error);
        }
      });
    }));
  }

  /**
   *
   */
  loadJson(url) {
    let t1 = new Date();
    return this.loadUrl(url)
      .then((body) => JSON.parse(body))
      .catch((err) => {
        let t2 = new Date();
        this._log(url, err, t2 - t1);
        throw err;
      })
      .then(res => {
        let t2 = new Date();
        this._log(url, null, t2 - t1);
        return res;
      });
  }

  /**
   *
   */
  loadXml(url) {
    let t1 = new Date();
    return this.loadUrl(url)
      .then((body) => {
        return new Promise((resolve, reject) => {
          ParseXmlString(body, (err, res) => {
            if (err)
              reject(err);
            else
              resolve(res);
          });
        });
      })
      .catch((err) => {
        let t2 = new Date();
        this._log(url, err, t2 - t1);
        throw err;
      })
      .then(res => {
        let t2 = new Date();
        this._log(url, null, t2 - t1);
        return res;
      });
  }

  /**
   *
   */
  loadRss(url) {
    let t1 = new Date();
    return this.loadUrl(url)
      .then((body) => {
        return new Promise((resolve, reject) => {
          FeedRead.rss(body, (err, items) => {
            if (err)
              reject(err);
            else
              resolve(items);
          });
        });
      })
      .catch((err) => {
        let t2 = new Date();
        this._log(url, err, t2 - t1);
        throw err;
      })
      .then(res => {
        let t2 = new Date();
        this._log(url, null, t2 - t1);
        return res;
      });
  }

  /**
   *
   */
  loadHtml(url) {
    let t1 = new Date();
    return this.loadUrl(url)
      .then((body) => {
        let $ = cheerio.load(body);
        return [$, body];
      })
      .then(([$, body]) => {
        let t2 = new Date();
        this._log(url, null, t2 - t1);
        return $;
      }).catch((err) => {
        let t2 = new Date();
        this._log(url, err, t2 - t1);
        throw err;
      });
  }

  //-----------------------------------------------------------

  // Data provider interface:

  /**
   * @return string/null login or null if no user with such id ("" if can't parse)
   */
  userIdToLogin({userId}) {
    throw new Error("abstract");
  }

  /**
   * @return Date/null
   */
  getLastUserListUpdates({login}) {
    throw new Error("abstract");
  }

  /**
   * @return object { id: <id>, login: <string>,  joinedDate: <Date>, gender: <Male/Female>, 
   * favs: [<animeId>, ...], friendsLogins: [<userLogin>, ...], clubsIds: [<clubId>, ...] }
   */
  getProfileInfo({login}) {
    throw new Error("abstract");
  }

  /**
   * @return object { friendsLogins: [<userLogin>, ...], clubsIds: [<clubId>, ...] }
   */
  getUserSocialInfo({login}) {
    throw new Error("abstract");
  }

  /**
   * @return { ratings: {<animeId> => <rating>, ..}, listUpdated: <Date>, 
   *  unratedAnimeIdsInList: [<animeId>, ...] }
   */
  getUserList({login}) {
    throw new Error("abstract");
  }

  /**
   * @return int
   */
  getApproxMaxAnimeId({seasonUrl = null}) {
    throw new Error("abstract");
  }

  /**
   * @return object { <id>: <name> }
   */
  getGenres() {
    throw new Error("abstract");
  }

  /**
   * @return null/object { id: <id>, name: <string>, type: <typeName>, genres: [<genreId>, ...], 
   *  rels: { <animeId> => <relName> }, recs: { <animeId> => <weight> } }
   *  where relName = Other, Prequel, Sequel, Side story, Parent story, Alternative version, 
   *   Spin-off, Summary, ...
   *  typeName = Special, OVA, Movie, TV, ONA
   */
  getAnimeInfo({animeId}) {
    throw new Error("abstract");
  }

  /**
   * @return object { <animeId> => <weight> }
   */
  getAnimeUserrecs({animeId}) {
    throw new Error("abstract");
  }

  /**
   * @return object clubs { <clubId> => {membersCnt: <membersCnt>} }
   */
  scanClubs() {
    throw new Error("abstract");
  }

  /**
   * @return object { name: <string>, type: <clubType>, animeIds: [<animeId>, ...], 
   *  membersLogins: [<userLogin>, ...] }
   *  where clubType = Other, Games, Cities & Neighborhoods, ...?
   */
  getClubInfo({clubId}) {
    throw new Error("abstract");
  }

}
var cls = MalDataProvider; //for using "cls.A" as like "self::A" inside class

module.exports = MalDataProvider;
