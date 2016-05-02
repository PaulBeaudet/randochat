// client.js ~ Copyright 2015 Paul Beaudet ~ MIT License see LICENSE_MIT for detials
var OPEN_HELM = 25;     // time before helm can be taken by interuption
var FULL_TIMEOUT = 15;  // timeout for long inactivity
var MAX_MONO = 60;      // maximum time that can be used to monologe
var PAUSE_TIMEOUT = 2;  // inactivity timeout
var TRANSFER_WAIT = 10; // amount of seconds a transfer is considered

var convo = {    // handles visual elements of conversation history
    partner: '', // nickname of partner we are talking to
    entries: 8,  // default number of historical entries (can change based on device)
    items: 0,    // which historical element currently being added to
    chat: function(rtt){                                 // update most current message
        $('.txt:last').text(rtt.text);                   // update message
        myTurn.idle = 0;                                 // reset idle counter
        $('#wpm').html(speed.realTime(rtt.text.length)); // show speed after start
    },
    next: function(rtt){
        var finalSpeed = parseInt($('#wpm').html());                          // grab final speed of user being interupeted
        if(rtt.from === sock.nick){speed.average(finalSpeed, speed.partner);} // we are interupting record partner
        else {
            speed.average(finalSpeed, speed.me);                              // we are being interupted record ourself
            convo.partner = rtt.from;                                         // persistently hold who we are talking to: keymetrics
        }
        if(convo.items === convo.entries){$('.message:first').remove();}      // make room if entries full
        else{convo.items++;}                                                  // count entries
        speed.realTime();                                                     // reset speedometer
        var nameDiv = $('<span class="user col-xs-4 pull-right text-success"/>').text(rtt.from);
        var textDiv = $('<span class="txt col-xs-8"/>').text(rtt.text);
        $('#history').append($('<div class="row message"/>').append( textDiv, nameDiv));
    },
    rm: function(){ // called at end of conversation
        $('.message').remove(); // remove all messages
        convo.items = 0;        // reset number of messages added
        $('#wpm').html('');     // reset wpm counter
        $('#speedo').hide();    // hide your speedo! TODO: make showing your speedo persistent
    }
}

var myTurn = {
    isIt: false,
    elapsed: 0,
    idle: 0,
    clock: 0,
    interrupt: function(rtt){           // only called when partner interupts turn, signaling turn end
        myTurn.set(false);              // note its no longer my turn
        send.clear();                   // clear message that was intrupted
        myTurn.start();                 // engage turn starting actions: timer
        convo.next(rtt);                // display what our partner said
    },
    set: function(status){
        myTurn.isIt = status;                                        // set status of whos turn it is
        if(myTurn.isIt){                                             // if its this clients turn
            $('#textEntry').removeClass('wait');                     // remove color on input box
            $('#sendText').html('Type ').removeClass('text-danger'); // tell client they should type remove color
        } else {                                                     // not clients turn
            $('#sendText').html('Wait ').addClass('text-danger');    // tell client to wait add color
            $('#textEntry').addClass('wait');                        // bar out text box
        }
    },
    start: function(){                                 // called to start a new message
        myTurn.elapsed = 0;                            // reset elapsed time
        myTurn.idle = 0;                               // reset idle time
        clearTimeout(myTurn.clock);                    // Make sure standing timeout is removed if any
        myTurn.clock = setTimeout(myTurn.check, 1000); // create new timeout
    },
    check: function(){
        myTurn.elapsed++;                   // increment elapsed time
        myTurn.idle++;                      // increment idle time (will only really increment w/inactivity)
        if(!myTurn.isIt){                   // not this users turn, might this client talk?
            if(myTurn.elapsed > OPEN_HELM || myTurn.idle > PAUSE_TIMEOUT){myTurn.set(true);} // check for my turn
        }
        if(myTurn.idle > FULL_TIMEOUT ){myTurn.wait();}        // disconnect conditions
        else if(myTurn.elapsed > MAX_MONO){
            if($('.user:last').html() === sock.nick){myTurn.wait();} // just talked for max time without response, new match
            else { // switch from chat to mono when user did too much listening / idling
                pages.toggle('.chat', '.mono');
                myTurn.clear();
            }
        } else {myTurn.clock = setTimeout(myTurn.check, 1000);} // set next timeout when still connected
    },
    wait: function(){
        myTurn.clear();                                         // clear previous data
        pages.wait();                                           // searching process
    },
    clear: function(){
        sock.keyMetric();                                       // send metrics for conversation to server
        convo.rm();                                             // clear out conversation history
        myTurn.set(false);                                      // block typing
        myTurn.idle = 0;                                        // reset idle
        send.clear();                                           // be sure text box is cleared when disconnecting
        if(pages.isMobile.matches){$('#topnav').fadeIn(1000);}  // reshow nav bar in mobile
    }
}

var send = {
    empty: true, // only way to know text was clear before typing i.e. client just stared typing
    input: function(){
        if(myTurn.isIt){
            var rtt = {text: $('#textEntry').val(), to: sock.toID, from: sock.nick};
            if(send.empty){                                 // interupting case
                send.empty = false;                         // entry box no longer empty
                sock.et.emit('interrupt', rtt);             // emit interupt event
                convo.next(rtt);                            // start next historical entry
                myTurn.start();                             // reset turn timing
            } else {                                        // continueing conversation case
                sock.et.emit('chat', rtt);                  // send real time chat data to partner
                convo.chat(rtt);                            // fill personal history
            }
        } else {send.clear();}                              // not our turn; block input
    },
    clear: function(){
        $('#textEntry').val(''); // clear out text in entry bar
        send.empty = true;       // note that text is cleared out of entry bar
    }
}

var MAX_RECORDS = 3; // number of wpm records we care to hold in memory
var speed = {        // -- handles gathing speed information
    start: 0,        // when speed started to be recorded
    me: [],          // personal speed records for average
    partner: [],     // partner records
    realTime: function(chars){ // resets on no argument, returns speed with number of chars
        var now = new Date().getTime();
        if(chars){return (60000/((now-speed.start)/chars)/5).toFixed();} // return words per minute
        else { speed.start = now; }                                      // no param/chars starts the clock
    },
    average: function(wpm, records){                    // call on every message sent
        if(wpm){records.push(wpm)};                     // as long as wpm is a number add it to array
        if(records.length > MAX_RECORDS || !wpm){       // take an average if final or max record amount
            var sum = 0;
            for(var i=0; i < records.length; i++){      // for every record
                sum += records[i];                      // add up all records
            }
            var avg = (sum / records.length).toFixed(); // get average of records
            records = [];                               // erase old records
            if(wpm){records.push(parseInt(avg));}       // besides final, roll back into array
            return avg;
        }
    }
}

var sock = {                                        // Handle socket.io connection events
    et: io(),                                       // start socket.io listener
    toID: '',                                       // socketid of our partner
    beginTime: 0,                                   // timestamp of when conversation began
    nick: $('#active').text(),                      // nice name of this client
    host: $('#hostID').html(),                      // socket id of availible room host
    init: function(){                               // allow chat and go when we have a name
        sock.et.on('chat', convo.chat);             // recieves real time chat information
        sock.et.on('interrupt', myTurn.interrupt);  // recieves new chat partners or interuptions from partner
        sock.et.on('connect_error', function(){window.location.replace('/');}); // reload on connection error
        sock.et.on('start', sock.start);            // kick off conversation between two people
    },
    start: function(partner){                       // Called at start of any new interchange
        sock.beginTime = new Date().getTime();      // create timestamp for begining of conversation
        sock.toID = partner;                        // get SOCKETID of who you're talking to
        myTurn.set(true);                           // give ability to talk
        myTurn.start();                             // signal begining of turn
        if(pages.isMobile.matches){$('#topnav').fadeOut(2000);} // fade out navbar on mobile
        $('#msgRow').hide();                        // hide message row
    },
    match: function(){                              // initiates START of conversation
        sock.et.emit('match', sock.toID);           // signal ready for next match
        sock.toID = '';                             // remove old match to show availability
    },
    keyMetric: function(){
        var endTime = new Date().getTime();         // timestamp for end of conversation
        var totalDuration = endTime-sock.beginTime; // get duration
        sock.et.emit('kpi', {                       // only one chatter sends one key performence metric
            speeds: [speed.average(0, speed.me), speed.average(0, speed.partner)],
            partners: [sock.nick, convo.partner],   // record nicknames of parties involved
            duration: totalDuration                 // differance between conversation start and end
        });
    }
}

var visitor = {
    cCount: TRANSFER_WAIT + 1, // counts down transfer proccess, gives host time to respond to a knock
    room: $('#room').html(),
    initChat: function(occupation){
        $('#status').html(visitor.room + ' ' + occupation + ', chat with others in meantime?'); // notify host occupied
        $('#sysBTN').off().text('chat').on('click', pages.wait);
    },
    entry: function(){ // on entering a room
        if(sock.host){ sock.et.emit('knock', {to: sock.host, from: sock.nick});} // knock knock! Are you availible?
        else {visitor.initChat('offline');}                  // show host offline and give option to chat
        sock.et.on('status', function(ready){                // host reply to a knock
            if(ready){sock.start(sock.host); }               // if host replied with their id they are availible
            else { visitor.initChat('talking to someone'); } // host on but not ready AKA talking to someone
        });
        sock.et.on('newRoom', function(id){
            if(id.room === visitor.room){                                           // make sure this is the room we are in
                sock.host = id.socket;                                              // we can now get id of our host
                $('#status').html($('#room').html() + ' became available!').show(); // show that our host became available
                $('#sysBTN').off().text('knock').on('click', function(){            // set up a knock action
                    sock.et.emit('knock', {to: id.socket, from: sock.nick});        // knock on host door
                    $('#sysBTN').off().text('hold on');                             // TODO Cancel knock?
                    visitor.countDown();                                            // count knock opportunity down
                });
            }
        });
    },
    countDown: function(){
        visitor.cCount--;
        if(visitor.cCount){ // count down process
            $('#status').html('waiting for quick reply... ' + visitor.cCount);
            setTimeout(visitor.countDown, 1000);
        } else {            // final act
            visitor.cCount = TRANSFER_WAIT + 1;
            visitor.initChat('is eating pie');
        }
    }
}

var host = {
    tTime: TRANSFER_WAIT + 1,
    timer: 0,
    openRM: function(active){                       // on hosting a room
        $('#brand').html('randochat/' + sock.nick); // Set default as their room
        $('#speedToggle').show().on('click', function(){
            if($('#speedToggle').text() === 'show speed'){
                $('#speedo').show();
                $('#speedToggle').text('hide speed');
            } else {
                $('#speedo').hide();
                $('#speedToggle').text('show speed');
            }
        });
        sock.et.on('knock', function(from){
            if(sock.toID){                                               // if talking to someone
                $('#status').text(from.name + " just knocked: ");        // display whomever just knocked
                host.transfer();                                         // count down transfer oppertunity
                $('#msgRow').show();                                     // show msg display
                $('#sysBTN').off().text('transfer').on('click', function(){
                    myTurn.clear();                                      // clear out previous conversation
                    sock.et.emit('status', {to: from.id, ready: true});  // all signals go
                    sock.start(from.id);                                 // start a conversation w/knocker
                    host.clearTransMSG();                                // remove system message
                });
                setTimeout($('#msgRow').hide, (TRANSFER_WAIT * 1000));   // TODO cancel timeout
                sock.et.emit('status', {to: from.id, ready: false});     // note host is occupied
            } else {                                                     // if not talking
                sock.et.emit('status', {to: from.id, ready: true});      // all signals go
                sock.start(from.id);                                     // start a conversation w/knocker
            }
        });
        pages.wait()                                                     // rando match while waiting for knocks
    },
    transfer: function(){
        host.tTime--;
        if(host.tTime){
            $('#tCount').text(host.tTime + ' ');
            host.timer = setTimeout(host.transfer, 1000);
        } else { host.clearTransMSG();}
    },
    clearTransMSG: function(){
        $('#tCount').text(' ');
        clearTimeout(host.timer); host.timer = 0;            // tie up timer loose string
        $('#msgRow').hide();
    }
}

var pages = {                               // page based opporations
    account: $('#account').html(),          // account type of user
    room: $('#room').html(),                // room this client is in
    isMobile: window.matchMedia("only screen and (max-width: 760px)"),
    init: function(){                       // on click functions
        if(sock.nick){                      // given this is an active user
            if(pages.isMobile.matches){convo.entries = 4;} // shorten history if mobile
            $('#speedo').hide();            // hide speedometer by default
            $('#speedToggle').hide();       // hide option to display speed by default
            $('.chat.view').show();         // show chat view
            sock.init();                    // activate socket connection
            myTurn.set(false);              // Block untill server gives a match
            document.getElementById('textEntry').oninput = send.input; // listen for input event
            if(pages.room){visitor.entry();}                           // entering someone room case
            else if(pages.account === 'free'){host.openRM();}          // if this is a room host: open room
            else {sock.match();}                                       // rando matches for temp users
        } else { $('.name.view').show(); }  // No active session? must sign in. NOTE: page reload on post request
        $('#resume').click(function(){      // resume from an inactive state
            sock.match();                   // signal ready for new match
            pages.toggle('.mono', '.chat'); // toggle mono to chat
        });
        $('#rename').click(function(){      // resume from an inactive state
            sock.et.emit('pause');          // soft disconnect event
            pages.toggle('.chat', '.name'); // toggle chat to name
        });
        $('#sysBTN').on('click', pages.holdState);
        $('#sendButton').click(function(){$('#topnav').fadeToggle(500);});
    },
    toggle: function(hide, show){
        $(hide + '.view').hide();       // hide view
        $(show + '.view').show();       // show view
    },
    holdState: function(){              // only start wait process for active users, that can press buttons
        sock.et.emit('pause');          // soft disconnect also disactivates rooms
        $('#status').text('only active users are matched press "match" when ready');
        $('#sysBTN').off().text('match').on('click', pages.wait);
    },
    wait: function(){
        if(pages.account === 'free'){sock.et.emit('newRoom', sock.nick);} // show room active (match people to this user)
        $('#status').show().html('waiting for matches...');               // show wait message
        $('#sysBTN').off().text('Cancel').on('click', pages.holdState);   // hold on if clicked
        $('#msgRow').show();                                              // show everything in row
        sock.match();                                                     // do as says search for matches
    }
}

$(document).ready(pages.init); // fire up pages when DOM is ready
