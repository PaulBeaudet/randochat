// serve.js ~ Copyright 2015 Paul Beaudet ~ Licence Affero GPL ~ See LICENCE_AFFERO for details
var queue = []; // array for queue of randos to be matched
var when = {
    idle: true,
    connected: function(socket){
        var cookieCrums = socket.request.headers.cookie.split('='); // split correct cookie out
        var user = cookie.user(cookieCrums[cookieCrums.length - 1]);// decrypt email from cookie, make it userID
        if(user){ user = user.content.user; }                       // check for existing cookie
        else{return 0};                                             // this is a nameless (expired) socket!
        if(user.name){                                              // given a valid user connected
            console.log(user.name + ' connected id:' + socket.id);  // log connection event
            sock.ets.to(socket.id).emit('youAre', user.name);       // make sure the socket knows who it is
            when.match(socket.id);                                  // connect randos or queue them
        }
        return user.name;
    },
    match: function(socketID, last){                  // note: last user can be undefined
        if(queue.length === 1 && queue[0] !== last){  // one in que not last convo
            when.start(socketID, queue[0]);           // start conversation
        } else if (queue.length > 1){                 // match with user you were not with last
            if(queue[0] === last){ when.start(socketID, queue[1]); } // basically if there are 2 queue one will match
            else { when.start(socketID, queue[0]); }
        } else { queue.push(socketID); }              // if no users push to list
    },
    start: function(incoming, queued){                // start a conversation between rando one and two
        sock.ets.to(incoming).emit('start', queued);  // get into a conversation with rando
        sock.ets.to(queued).emit('start', incoming);  // make sure this socket knows it
        queue.splice(queue.indexOf(queued), 1);       // remove queued entry from queue
    },
    disconnect: function(socketID){
        var index = queue.indexOf(socketID);          // get possible queued index of this socket
        if(index > -1){queue.splice(index, 1);}       // remove queued entry from queue
        console.log(socketID + ' disconnected');      // note disconnection
    }
}

var sock = {
    ets: require('socket.io'),
    listen: function(server){
        sock.ets = sock.ets(server);
        sock.ets.on('connection', function(socket){
            if(!when.connected(socket)){return;}          // provide no services in the case of a failed connection
            socket.on('chat', function(rtt){sock.ets.to(rtt.to).emit('chat', rtt);});   // emit rtt to partner
            socket.on('interrupt', function(rtt){sock.ets.to(rtt.to).emit('interrupt', rtt);});
            socket.on('end', function(partner){when.match(socket.id, partner);});
            socket.on('disconnect', function(){when.disconnect(socket.id);});
        });
    },
}

var mongo = { // depends on: mongoose
    db: require('mongoose'),
    init: function(){
        mongo.db.connect(process.env.MONGOLAB_URI);                               // connect to our database
        var Schema = mongo.db.Schema; var ObjectId = Schema.ObjectId;
        mongo.user = mongo.db.model('user', new Schema({                          // create user object property
            id: ObjectId,                                                         // unique id of document
            name: { type: String, required: '{PATH} is required', unique: true }, // Name of user
            password: { type: String, required: '{PATH} is required' },           // user password
            type: {type: String},                                                 // type of account, admin, mod, ect
        }));
    }
}

var userAct = { // dep: mongo
    hash: require('bcryptjs'),                                // hash passwords with bcrypt
    auth: function(req, res){                                 // make sure user has a name
        if(req.session.user && req.session.user.name){ res.render('chat'); }
        else{ res.redirect('/signin'); } // redirect to signin route if this user has yet to name oneself
    },
    login: function(req, res){
        if(req.body.password && req.body.name){
            mongo.user.findOne({name: req.body.name}, function(err, rando){          // find a rando in our db
                if(rando){                                                           // say one of our little randos exist
                    if(userAct.hash.compareSync(req.body.password, rando.password)){ // check if their password is right
                        req.session.user = {name: req.body.name, type: 'free'};
                        res.redirect('/');
                    } else {                                                         // if password is wrong case
                        res.render('name', {csrfToken: req.csrfToken, err: true});   // re-render name page
                    }
                } else {                                                             // given no user make one
                    var user = new mongo.user({                                      // create user document
                        name: req.body.name,                                         // give rando's name
                        password: userAct.hash.hashSync(req.body.password, userAct.hash.genSaltSync(10)), // hash rando's password
                        type: 'free'                                                 // what type of account is this?
                    });
                    user.save(function(err){
                        if(err){
                            res.render('name', {csrfToken: req.csrfToken, err: err});// user failed to save
                        } else {                                                     // user successfully saved, log em in
                            req.session.user = {name: req.body.name, type: 'free'};
                            res.redirect('/');
                        }
                    });
                }
            });
        } else if(req.body.name){ // no password but we have a name condition
            req.session.user = {name: req.body.name, type: 'temp'};
            res.redirect('/');
        }
        else {res.redirect('/signin');}                    // maybe re-render with an error message
    },
    room: function(req, res){ // check if this is a legit room else redirect to randochat
        mongo.user.findOne({name: req.params.username}, function(err, rando){
            if(rando){
                userAct.auth(req, res);
            } else {
                res.send('not legit!');
            }
        });
    },
    renderSignin: function(req, res){res.render('name', {csrfToken: req.csrfToken()});},
}

var cookie = { // depends on client-sessions and mongo
    session: require('client-sessions'),
    ingredients: {
        cookieName: 'session',
        secret: process.env.SESSION_SECRET,
        duration: 365 * 24 * 60 * 60 * 1000,  // cookie times out in x amount of time
    },
    meWant: function(){return cookie.session(cookie.ingredients);},
    user: function(content){return cookie.session.util.decode(cookie.ingredients, content);}, // decode cookie for socket reactions
}

var serve = {
    express: require('express'),
    parse: require('body-parser'),
    theSite: function (){
        var app = serve.express();
        var http = require('http').Server(app);              // http server for express framework
        mongo.init();                                        // connect with mongo and set up schema
        app.set('view engine', 'jade');                      // template with jade
        app.use(require('compression')());                   // gzipping for requested pages
        app.use(serve.parse.json());                         // support JSON-encoded bodies
        app.use(serve.parse.urlencoded({extended: true}));   // support URL-encoded bodies
        app.use(cookie.meWant());                            // support for cookies
        app.use(require('csurf')());                         // Cross site request forgery tokens
        app.use(serve.express.static(__dirname + '/views')); // serve page dependancies (sockets, jquery, bootstrap)
        var router = serve.express.Router();                 // create express router object to add routing events to
        router.get('/', userAct.auth);                       // main route for getting into a randochat if you have a name
        router.get('/signin', userAct.renderSignin);         // where one goes to get a name
        router.post('/signin', userAct.login);               // how one create their name
        router.get('/:username', userAct.room);              // personal rooms for special users
        app.use(router);                                     // get express to user the routes we set
        sock.listen(http);                                   // listen for socket connections
        http.listen(process.env.PORT);                       // listen on specified PORT enviornment variable
    }
}

serve.theSite(); //Initiate the site
