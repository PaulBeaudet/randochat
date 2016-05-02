// serve.js ~ Copyright 2015 Paul Beaudet ~ Licence Affero GPL ~ See LICENCE_AFFERO for details
var queue = []; // array for queue of randos to be matched
var rooms = []; // array of active rooms

var when = {
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
        var openRM = rooms.map(function(each){return each.socket;}).indexOf(socketID); // check if this room is active
        if(openRM > -1){rooms.splice(openRM, 1);}     // remove room: host has left
        sock.xview('trafic', {status:'disconnected'});// report disconnect to xview
    },
    newRoom: function(socketID, name){
        rooms.push({socket: socketID, room: name});               // push room
        sock.ets.emit('newRoom', {socket: socketID, room: name}); // socket emit availablity, in case folks in room
    },
}

var sock = {
    ets: require('socket.io'),
    listen: function(server){
        sock.ets = sock.ets(server);
        sock.ets.on('connection', function(socket){
            sock.xview('trafic', {status:'connected'});                                 // report connection to xview
            socket.on('newRoom', function(name){when.newRoom(socket.id, name);});       // create active room
            socket.on('knock', function(knock){
                sock.ets.to(knock.to).emit('knock', {name: knock.from, id: socket.id}); // notify room entry
            });
            socket.on('status', function(status){sock.ets.to(status.to).emit('status', status.ready);});//notify availiblity
            socket.on('chat', function(rtt){sock.ets.to(rtt.to).emit('chat', rtt);});   // emit real time chat to partner
            socket.on('interrupt', function(rtt){sock.ets.to(rtt.to).emit('interrupt', rtt);});
            socket.on('match', function(last){when.match(socket.id, last);});
            socket.on('disconnect', function(){when.disconnect(socket.id);});
            socket.on('pause', function(){when.disconnect(socket.id);});
            socket.on('kpi', mongo.kpi);
        });
    },
    xview: function(type, event){            // sends event to crossview
        event.type = type;                   // tack in event type
        sock.ets.emit('xview-event', event); // emit event to statistic tracking application
    }
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
        mongo.room = mongo.db.model('room', new Schema({
            id: ObjectId,
            host: {type: String, required: '{PATH} is required', unique: true },  // name of host room
            visits: [String],                                                     // array of visitors
            chats: {type: Number}                                                 // number of successfull conversations
        }));
        mongo.chat = mongo.db.model('chat', new Schema({
            id: ObjectId,
            timestamp: {type: Date, default: Date.now}, // timestamp of end of conversation
            partners: [String],                         // array of two conversationalist
            speeds: [Number],                           // array of two wpm counts
            duration: {type: Number}                    // duration of chat
        }));
    },
    kpi: function(packet){
        var chatMetric = new mongo.chat({
            partners: packet.partners,
            speeds: packet.speeds,
            duration: packet.duration
        });
        chatMetric.save(function(err){
            if(err){console.log(err);}
            else{console.log('saved chat metric:' + packet.partners);}
        });
        sock.xview('endchat', packet);                           // send metric to crossview
    },
}

var userAct = { // dep: mongo
    hash: require('bcryptjs'), // hash passwords with bcrypt
    auth: function(req, res){  // make sure user has a name
        if(req.session.user){  // given this is a returning user
            res.render('chat', {csrfToken: req.csrfToken(), active: req.session.user.name, account: req.session.user.type});
        } else {               // new user: no name prompts name view: reder w/csrf and account type
            res.render('chat', {csrfToken: req.csrfToken(), active: '', account: 'temp'});
        }
    },
    login: function(req, res){
        if(req.body.password && req.body.name){                                      // if name & password were posted
            mongo.user.findOne({name: req.body.name}, function(err, rando){          // find a rando in our db
                if(rando){                                                           // say one of our little randos exist
                    if(userAct.hash.compareSync(req.body.password, rando.password)){ // check if their password is right
                        req.session.user = {name: req.body.name, type: 'free'};
                        res.render('chat', {
                            csrfToken: req.csrfToken(),
                            active: req.body.name,
                            room: req.body.name,
                            account: 'free',
                        });
                    } else {                                                         // if password is wrong case
                        res.render('chat', {csrfToken: req.csrfToken(), active: '', err: true}); // re-render name page
                    }
                } else {                                                             // given no user make one
                    var user = new mongo.user({                                      // create user document
                        name: req.body.name,                                         // give rando's name
                        password: userAct.hash.hashSync(req.body.password, userAct.hash.genSaltSync(10)), // hash it
                        type: 'free'                                                 // what type of account is this?
                    });
                    user.save(function(err){                                         // request to save this user
                        if(err){                                                     // if error on user save
                            res.render('chat', {csrfToken: req.csrfToken(), active: '', err: err}); // render page w/error
                        } else {                                                     // user successfully saved, log em in
                            req.session.user = {name: req.body.name, type: 'free'};  // save session cookie
                            res.render('chat', {csrfToken: req.csrfToken(), active: req.body.name, account: 'free'});
                        } // render page w/name
                    });
                }
            });
        } else if(req.body.name){                                          // if only name was posted
            req.session.user = {name: req.body.name, type: 'temp'};        // create temp user & render chat view w/name
            res.render('chat', {csrfToken: req.csrfToken(), active: req.body.name, account: 'temp'});
        } else {res.render('chat', {csrfToken: req.csrfToken(), active: '', err: 'no info?'});}    // is this really likely
    },
    room: function(req, res){ // check if this is a legit room else redirect to randochat
        mongo.user.findOne({name: req.params.room}, function(err, room){
            if(room){
                var present = ''; // Availabilty of room pervayer, false if pervayer makes request
                var existingUser = req.session.user ? req.session.user.name : ''; // if(?) user pass name else pass ' '
                if(existingUser !== room.name){ // if this is a user other than the room pervayer
                    var openRM = rooms.map(function(each){return each.room;}).indexOf(room.name); // check room activity
                    if(openRM > -1){present = rooms[openRM].socket;} // give id to ping pervayer when this user gets id
                }
                res.render('chat', {
                    csrfToken: req.csrfToken(),
                    active: existingUser,
                    room: req.params.room,
                    account: req.session.user ? req.session.user.type : '',
                    present: present,
                });  // pass csrf and username
            } else {
                res.send(req.params.room + ' does not exist');
            }
        });
    },
}

var cookie = { // depends on client-sessions and mongo
    session: require('client-sessions'),
    ingredients: {
        cookieName: 'session',
        secret: process.env.SESSION_SECRET,
        duration: 365 * 24 * 60 * 60 * 1000,  // cookie times out in x amount of time
    },
    meWant: function(){return cookie.session(cookie.ingredients);},
    user: function(content){return cookie.session.util.decode(cookie.ingredients, content);},
}   // cookie.user : decode cookie and return (for sockets)

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
        router.get('/', userAct.auth);                       // main route for getting into a randochat if has name
        router.post('/', userAct.login);                     // how one creates their name
        router.get('/:room', userAct.room);                  // personal rooms for special users
        router.post('/:room', userAct.login);                // how one creates their name
        app.use(router);                                     // get express to user the routes we set
        sock.listen(http);                                   // listen for socket connections
        http.listen(process.env.PORT);                       // listen on specified PORT enviornment variable
    }
}

serve.theSite(); //Initiate the site
