var unirest = require('unirest');
var express = require('express');
var events = require('events');
var async = require('async');
var app = require('express');
var app = express();
app.use(express.static('public'));

// api interface to get results
var getFromApi = function(endpoint, args) {
  var emitter = new events.EventEmitter();
  unirest.get('http://api.spotify.com/v1/' + endpoint)
    .qs(args)
    .end(function(response) {
      if(response.ok) {
        // why is our .on 'end' event defined in the get request below this?
        emitter.emit('end', response.body);
      }
      else {
        emitter.emit('error', response.code);
      }
    });
    // return emitter so we can attach handlers for end and error in the calling function
  return emitter;
};

// GET request to client user interface, to get :name value
app.get('/search/:name', function(req, res) {
  var searchReq = getFromApi('search', {
    q: req.params.name,
    limit: 1,
    type: 'artist'
  });

  searchReq.on('end', function(item) {
    var artist = item.artists.items[0];
    var artistId = artist.id
    // console.log(artist);

    // set artist.related to related artists
    getRelated(artistId).on('end', function(data) {
      artist.related = data.artists;
      getTracks(artist).on('end', function(updated) {
        res.json(updated);
      });
    });
  });

  searchReq.on('error', function(code) {
    res.sendStatus(code);
  });
});

// get related artists GET https://api.spotify.com/v1/artists/{id}/related-artists
var getRelated = function(id) {
  var emitter = new events.EventEmitter();
  unirest.get('https://api.spotify.com/v1/artists/' + id + '/related-artists')
    .end(function(response) {
      if(response.ok) {
        emitter.emit('end', response.body);
      } else {
        emitter.emit('error', response.code);
      }
    });
  return emitter;
};

var getTracks = function(artist) {
  var emitter = new events.EventEmitter();
  var topTracks = [];

  for(var i= 0; i < artist.related.length; i++) {
    var id = artist.related[i].id;
    topTracks.push({
      id: id,
      url: 'https://api.spotify.com/v1/artists/' + id + '/top-tracks?country=GB',
      tracks: []
    });
  }

  addTracks = function(item, callback) {
    // where is item coming from above?  how?
    console.log('this is ' + item.url);
    unirest.get(item.url)
      .end(function(response) {
        if (response.ok) {
          item.tracks = response.body.tracks;
          // what does null, item do in the callback?  i see this sometimes
          callback(null, item);
        } else {
          callback(response.code);
        }
      });
  };


    async.map(topTracks, addTracks, function(err, res) {
        if (!err) {
            res.map(function(item, i) {
                artist.related[i].tracks = res[i].tracks;
            });
            emitter.emit('end', artist);
        } else {
            emitter.emit('error', res.code);
        }

    });

    return emitter;



}


app.get('/search-promise/:name', function(req, res) {
  getFromApiPromise('search', {
    q: req.params.name,
    limit: 1,
    type: 'artist'
  })
    .then(function(item) {
      var artist = item.artists.items[0];
      return getRelatedPromise(artist);
    })
    .then(function(artist) {
      return getTracksPromise(artist);
    })
    .then(function(artist) {
      res.json(artist);
    })
    .catch(function(err) {
      res.sendStatus(err);
    });
})

var getFromApiPromise = function(endpoint, args) {
  return new Promise(function(resolve, reject) {
    unirest.get('http://api.spotify.com/v1/' + endpoint)
      .qs(args)
      .end(function(response) {
        if(response.ok) {
          resolve(response.body);
        }
        else {
          reject(response.code);
        }
      });
  });
};

var getRelatedPromise = function(artist) {
  return new Promise(function(resolve, reject) {
    unirest.get('https://api.spotify.com/v1/artists/' + artist.id + '/related-artists')
      .end(function(response) {
        if(response.ok) {
          artist.related = response.body.artists;
          resolve(artist);
        } else {
          reject(response.code);
        }
      });
  });
};

var getTracksPromise = function(artist) {

  var addTracks = function(url) {
    console.log(url);
    return new Promise(function(resolve, reject) {
      unirest.get(url)
        .end(function(response) {
          if (response.ok) {
            resolve(response.body.tracks);
          } else {
            reject(response.code);
          }
        });
    })
  };

  return Promise.all(artist.related.map(function(related) {
    var url = 'https://api.spotify.com/v1/artists/' + related.id + '/top-tracks?country=GB';
    return addTracks(url);
  }))
  .then(function(relatedTracks) {
    relatedTracks.forEach(function(tracks, index) {
      artist.related[index].tracks = tracks;
    });
    return artist;
  })
}

app.listen(8080);


