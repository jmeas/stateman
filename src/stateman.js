var State = require("./state.js"),
  Histery = require("./histery.js"),
  brow = require("./browser.js"),
  _ = require("./util.js");



function StateMan(options){
  if(this instanceof StateMan === false){ return new StateMan(options)}
  options = options || {};
  State.call(this);
  if(options.history) this.history = options.history;
  this.current = this.pending = this;
}


StateMan.prototype = _.extend(

  _.ocreate(State.prototype), {

    constructor: StateMan,

    // start StateMan
    start: function(options){
      if( !this.history ) this.history = new Histery(options); 
      this.history.on("change", _.bind(this._afterPathChange, this));

      // if the history service is not runing, start it
      if(!this.history.isStart) this.history.start();
      return this;
    },
    // @TODO direct go the point state
    go: function(state, option, callback){
      option = option || {};
      if(typeof state === "string") state = this.state(state);
      if(!option.silent){
        var url = state.encode(option.param)
        this.nav(url, {silent: true});
      }
      this._go(state, option, callback);
    },
    nav: function(url, options, callback){
      callback && (this._cb = callback)
      this.history.nav( url, options);
      this._cb = null;
      return this;
    },
    decode: function(path){
      var pathAndQuery = path.split("?");
      var query = this._findQuery(pathAndQuery[1]);
      path = pathAndQuery[0];
      var state = this._findState(this, path);
      if(state) _.extend(state.param, query);
      return state;
    },
    notify: function(path, param){
      this.state(path).emit("notify", {
        from: this,
        param: param
      });
    },
    // after pathchange changed
    // @TODO: afterPathChange need based on decode
    _afterPathChange: function(path){

      this.emit("history:change", path);


      var found = this.decode(path), callback = this._cb;

      if(!found){
        // loc.nav("$default", {silent: true})
        var $notfound = this.state("$notfound");
        if($notfound) this._go($notfound, {}, callback);

        return this.emit("404", {path: path});
      }


      this._go( found, { param: found.param}, callback );
    },

    // goto the state with some option
    _go: function(state, option, callback){

      if(typeof state === "string") state = this.state(state);

      // not touch the end in previous transtion

      if(this.pending !== this.current){
        // we need return

        if(this.pending._pending){
          _.log("beacuse "+ this.pending.name+" is pending, the nav to [" +state.name+ "] is be forbit");
          this.emit("forbid", state);
          return this.nav(this.current.encode(this.param), {silent: true})
        }else{
          _.log("naving to [" + this.current.name + "] will be stoped, trying to ["+state.name+"] now");
          this.current = this.pending;
        }
        // back to before
      }
      this.param = option.param;

      var current = this.current,
        baseState = this._findBase(current, state),
        self = this;


      if(current !== state){
        this.previous = current;
        this.current = state;
        self.emit("begin")
        this._leave(baseState, option, function(){
          self._enter(state, option, function(){
            self.emit("end")
            if(typeof callback === "function") callback.call(self);
          })
        })
      }
      this._checkQueryAndParam(baseState, option);
    },
    _findQuery: function(querystr){
      var queries = querystr && querystr.split("&"), query= {};
      if(queries){
        var len = queries.length;
        var query = {};
        for(var i =0; i< len; i++){
          var tmp = queries[i].split("=");
          query[tmp[0]] = tmp[1];
        }
      }
      return query;
    },
    _findState: function(state, path){
      var states = state._states, found, param;
      if(!state.hasNext){
        param = state.regexp && state.decode(path);
      }
      if(param){
        state.param = param;
        return state;

      }else{
        for(var i in states) if(states.hasOwnProperty(i)){
          found = this._findState( states[i], path );
          if( found ) return found;
        }
        return false;
      }
    },
    // find the same branch;
    _findBase: function(now, before){
      if(!now || !before || now == this || before == this) return this;
      var np = now, bp = before, tmp;
      while(np && bp){
        tmp = bp;
        while(tmp){
          if(np === tmp) return tmp;
          tmp = tmp.parent;
        }
        np = np.parent;
      }
      return this;
    },
    _enter: function(end, options, callback){

      callback = callback || _.noop;

      var pending = this.pending;

      if(pending == end) return callback();
      var stage = [];
      while(end !== pending && end){
        stage.push(end);
        end = end.parent;
      }
      this._enterOne(stage, options, callback)
    },
    _enterOne: function(stage, options, callback){

      var cur = stage.pop(), self = this;
      if(!cur) return callback();

      this.pending = cur;

      cur.done = function(){
        self._enterOne(stage, options, callback)
        cur._pending = false;
        cur.done = null;
        cur.visited = true;
      }

      if(!cur.enter) cur.done();
      else {
        cur.enter(options);
        if(!cur._pending && cur.done) cur.done();
      }
    },
    _leave: function(end, options, callback){
      callback = callback || _.noop;
      if(end == this.pending) return callback();
      this._leaveOne(end, options,callback)
    },
    _leaveOne: function(end, options, callback){
      if( end === this.pending ) return callback();
      var cur = this.pending, self = this;
      cur.done = function(){
        if(cur.parent) self.pending = cur.parent;
        self._leaveOne(end, options, callback)
        cur._pending = false;
        cur.done = null;
      }
      if(!cur.leave) cur.done();
      else{
        cur.leave(options);
        if(!cur._pending && cur.done) cur.done();
      }
    },
    // check the query and Param
    _checkQueryAndParam: function(baseState, options){
      var from = baseState;
      while( from !== this ){
        from.update && from.update(options);
        from = from.parent;
      }
    }

}, true)



module.exports = StateMan;