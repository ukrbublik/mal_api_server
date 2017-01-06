/**
 * MAL API (unofficial) server
 *
 * @author ukrbublik
 */

const fs = require('fs');
const express = require('express');
const http = require('http');
const app = express();
const server = http.Server(app);
const nodeCleanup = require('node-cleanup');
const MalParser = require('./lib/mal/MalParser');
const MalError = require('./lib/mal/MalError');
const expressValidator = require('express-validator');
const util = require('util');

const config = require('./config/config.js');
var parser = new MalParser();
parser.init(config.parser);

app.use(expressValidator([]));

// API methods description
var apiMethods = {
  setParserQueueConcurrentSize: {
    desc: "Change queue pending size",
    params: {
      queueConcurrentSize: { type: 'int', req: true }
    },
  },
  userIdToLogin: {
    desc: "Get login from user id",
    returns: "string/null",
    params: {
      userId: { type: 'int', req: true }
    },
  },
  getLastUserListUpdates: {
    desc: "Get last date of user list update",
    returns: "Date string/null",
    params: {
      login: { type: 'string', req: true }
    },
  },
  getProfileInfo: {
    desc: "Get user profile info",
    returns: "object { id: <id>, login: <string>,  joinedDate: <Date>, gender: <Male/Female>, "
     + "favs: [<animeId>, ...], friendsLogins: [<userLogin>, ...], clubsIds: [<clubId>, ...] }",
    params: {
      login: { type: 'string', req: true }
    },
  },
  getUserSocialInfo: {
    desc: "Get user social info",
    returns: "object { friendsLogins: [<userLogin>, ...], clubsIds: [<clubId>, ...] }",
    params: {
      login: { type: 'string', req: true }
    },
  },
  getUserList: {
    desc: "Get user anime list",
    returns: "object { ratings: {<animeId> => <rating>, ..}, listUpdated: <Date>, "
     + "unratedAnimeIdsInList: [<animeId>, ...] }",
    params: {
      login: { type: 'string', req: true },
      altJson: { type: 'bool', req: false, default: false },
    },
  },
  getApproxMaxAnimeId: {
    desc: "Find approx. max current anime id",
    returns: "int",
    params: {
      seasonUrl: { type: 'string', req: false, default: null }
    },
  },
  getGenres: {
    desc: "Get anime genres",
    returns: "null/object { id: <id>, name: <string>, type: <typeName>, genres: [<genreId>, ...], "
     + ", rels: { <animeId> => <relName> }, recs: { <animeId> => <weight> } } - "
     + "where relName = Other, Prequel, Sequel, Side story, Parent story, Alternative version, "
     + "Spin-off, Summary, ... ; typeName = Special, OVA, Movie, TV, ONA",
    params: {
    },
  },
  getAnimeInfo: {
    desc: "Get anime info",
    returns: "object { <id>: <name> }",
    params: {
      animeId: { type: 'int', req: true }
    },
  },
  getAnimeUserrecs: {
    desc: "Get users' recommendations of similar animes to this anime",
    returns: "object { <animeId> => <weight> }",
    params: {
      animeId: { type: 'int', req: true }
    },
  },
  scanClubs: {
    desc: "Get clubs",
    returns: "object { <clubId> => {membersCnt: <membersCnt>} }",
    params: {
    },
  },
  getClubInfo: {
    desc: "Get club info",
    returns: "object { name: <string>, type: <clubType>, animeIds: [<animeId>, ...], "
     + "membersLogins: [<userLogin>, ...] } - "
     + " where clubType = Other, Games, Cities & Neighborhoods, ...?",
    params: {
      clubId: { type: 'int', req: true }
    },
  },
};


// Simple map API methods to corresponding parser's functions (with same name and params)
for (let methodName in apiMethods) {
  let methodInfo = apiMethods[methodName];
  app.get('/'+methodName, (req, res) => {
    let paramNames = Object.keys(methodInfo.params);
    for (let paramName in methodInfo.params) {
      let paramInfo = methodInfo.params[paramName];
      if (paramInfo.req === undefined || paramInfo.req == true)
        req.checkQuery(paramName, "Param '"+paramName+"' can't be emptry").notEmpty();
      if (paramInfo.type) {
        switch (paramInfo.type) {
        case 'int':
          req.checkQuery(paramName, "Param '"+paramName+"' must be int").isInt();
        case 'bool':
          req.checkQuery(paramName, "Param '"+paramName+"' must be bool").isBoolean();
        break;
        }
      }
    }

    let methodArgs = {};
    for (let paramName of paramNames) {
      let paramInfo = methodInfo.params[paramName];
      let isEmptyVal = req.query[paramName] === undefined || req.query[paramName] === '';
      let paramVal = !isEmptyVal ? req.query[paramName] : 
        (paramInfo.default !== undefined ? paramInfo.default : null);
      if (!isEmptyVal)
        switch (paramInfo.type) {
        case 'int':
          paramVal = parseInt(paramVal);
        case 'bool':
          paramVal = (paramVal == '1' || (''+paramVal).toLowerCase() == 'true');
        break;
        }
      methodArgs[paramName] = paramVal;
    }

    req.getValidationResult().then((err) => {
      if (!err.isEmpty()) {
        res.status(200).json({ err: err.array() });
      } else {
        parser[methodName](methodArgs).then((data) => {
          res.status(200).json({ res: data });
        }).catch((err) => {
          res.status(200).json({ err: err });
        });
      }
    });
  });
}


server.listen(config.api.apiServerPort, () => {
  console.log('API listening on port ' + config.api.apiServerPort);
});
