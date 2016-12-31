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
      queueSizeConcurrent: 20,
      parserQueueSizeConcurrent: 10,
      logHttp: true,
      endpoint: null,
      retryTimeout: [2000, 4000],
      maxRetries: 5,
    }
  }

  constructor() {
  }

  /**
   *
   */
  init(options = {}) {
    this.options = deepmerge.all([ cls.DefaultOptions, options ]);
    this.queue = new Queue(this.options.queueSizeConcurrent, 
      Infinity);
  }


  /**
   *
   */
  canAddMoreToQueue() {
    return (this.queue.getPendingLength() < this.queuePendingSize() 
      && this.queue.getQueueLength() < this.queuePendingSize() * 1);
  }

  /**
   *
   */
  queuePendingSize() {
    return this.queue.maxPendingPromises;
  }

  /**
   *
   */
  setQueueConcurrentSize(queueConcurrentSize) {
    console.log("*** Queue concurrent size: " + queueConcurrentSize);
    this.queue.maxPendingPromises = queueConcurrentSize;
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

  getLoadUrlPromise (url, retry = -1) {
    let t1;
    return new Promise((resolve, reject) => {
      t1 = new Date();
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
        let retryTimeout = 0;
        if (error && (
          //MAL's Too Many Requests
          error instanceof MalError && error.statusCode == 429 
          //Heroku's errors
          || error.code == 'EHOSTUNREACH' || error.code == 'EAI_AGAIN'
          //Heroku's "Service Unavailable" 503
          || error instanceof MalError && error.statusCode == 503 
            && this.options.endpoint !== null
        )) {
          canRetry = ((retry+1) < this.options.maxRetries);
          if (error.statusCode == 503 && this.options.endpoint !== null) {
            //If Heroku says 503, wait more (30s at least)
            retryTimeout = 30*1000;
          }
        }
        if (canRetry) {
          retry++;
          if(!retryTimeout)
            retryTimeout = parseInt(this.options.retryTimeout[0] + Math.random() 
            * (this.options.retryTimeout[1] - this.options.retryTimeout[0]));
          if (this.options.logHttp)
            console.log("Retry #" + (retry) + " after " 
              + retryTimeout + "ms for url: " + url);
          setTimeout(() => {
            this.getLoadUrlPromise(url, retry).then((res) => {
              resolve(res);
            }).catch((err) => {
              reject(err);
            });
          }, retryTimeout);
        } else {
          if (!error) {
            resolve(body);
          } else {
            reject(error);
          }
        }
      });
    }).then((res) => {
      let t2 = new Date();
      if (retry == -1)
        this._log(url, null, t2 - t1);
      return res;
    }).catch((err) => {
      let t2 = new Date();
      if (retry == -1)
        this._log(url, err, t2 - t1);
      throw err;
    });
  }

  /**
   *
   */
  loadUrl(url, retry = -1) {
    if (retry == -1)
      return this.queue.add(() => this.getLoadUrlPromise(url));
    else
      return this.getLoadUrlPromise(url, retry);
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
    return this.loadUrl(url)
      .catch((err) => {
        delete err.body;
        delete err.response;
        throw err;
      })
      .then((body) => JSON.parse(body));
  }

  /**
   *
   */
  loadXml(url) {
    return this.loadUrl(url)
      .catch((err) => {
        delete err.body;
        delete err.response;
        throw err;
      })
      .then((body) => {
        return new Promise((resolve, reject) => {
          ParseXmlString(body, (err, res) => {
            if (err)
              reject(err);
            else
              resolve(res);
          });
        });
      });
  }

  /**
   *
   */
  loadRss(url) {
    return this.loadUrl(url)
      .catch((err) => {
        delete err.body;
        delete err.response;
        throw err;
      })
      .then((body) => {
        return new Promise((resolve, reject) => {
          FeedRead.rss(body, (err, items) => {
            if (err)
              reject(err);
            else
              resolve(items);
          });
        });
      });
  }

  /**
   *
   */
  loadHtml(url) {
    return this.loadUrl(url)
      .catch((err) => {
        delete err.body;
        delete err.response;
        throw err;
      })
      .then((body) => {
        let $ = cheerio.load(body);
        return [$, body];
      });
  }

  //-----------------------------------------------------------

  // Data provider interface:


  /**
   *
   */
  setParserQueueConcurrentSize({queueConcurrentSize}) {
    throw new Error("abstract");
  }

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
  getUserList({login, altJson = false}) {
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
