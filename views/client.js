// client.js ~ Copyright 2015 Paul Beaudet ~ MIT License see LICENSE_MIT for detials
var NUM_ENTRIES = 4;   // number of dialog rows allowed in the application
var OPEN_HELM = 25;    // time before helm can be taken by interuption
var FULL_TIMEOUT = 15; // timeout for long inactivity
var MAX_MONO = 60;     // maximum time that can be used to monologe
var PAUSE_TIMEOUT = 3; // inactivity timeout

var convo = {
    items: 0,
    chat: function(rtt){  // update this users most current message
        $('.txt:last').text(rtt.text);                          // update message
        myTurn.idle = 0;                                        // reset idle counter
        $('#wpm').html(speed.realTime(rtt.text.length)+' WPM'); // show speed after start
    },
    next: function(rtt){
        if(convo.items === NUM_ENTRIES){$('.message:first').remove();} // make room if entries full
        else{convo.items++;}                                         // count entries
        speed.realTime();                                            // start speedometer
        var nameDiv = $('<span class="user"/>').text(rtt.from).addClass("pull-right text-success");
        var textDiv = $('<span class="txt"/>').text(rtt.text);
        $('#history').append($('<div class="message"/>').append(textDiv, nameDiv));
    },
    rm: function(){
        $('.message').remove(); // remove all messages
        convo.items = 0;        // reset number of messages added
        $('#wpm').html('');     // reset wpm counter
    }
}

var myTurn = {
    isIt: false,
    elapsed: 0,
    idle: 0,
    clock: 0,
    interrupt: function(rtt){
        myTurn.set(false);   // note its no longer my turn
        send.clear();        // clear message that was intrupted
        myTurn.start();      // engage turn starting actions: timer
        convo.next(rtt);     // display what our partner said
    },
    set: function(status){
        myTurn.isIt = status;                                 // set status of whos turn it is
        $('#sendText').html(myTurn.isIt ? 'Type!' : 'Wait!'); // send text reflects ability wether it be true or false
    },
    start: function(){ // first turn
        myTurn.elapsed = 0;
        myTurn.idle = 0;
        clearTimeout(myTurn.clock);                    // Make sure standing timeout is removed if any
        myTurn.clock = setTimeout(myTurn.check, 1000); // create new timeout
    },
    check: function(){
        myTurn.elapsed++;                   // increment elapsed time
        myTurn.idle++;                      // increment idle time (will only really increment w/inactivity)
        if(!myTurn.isIt){                   // not this users turn, might this client talk?
            if(myTurn.elapsed > OPEN_HELM || myTurn.idle > PAUSE_TIMEOUT){myTurn.set(true);} // check for my turn
        }
        if(myTurn.idle > FULL_TIMEOUT ){                        // disconnect conditions
            sock.match();                                       // signal ready for a new partner, w/ old partner
            myTurn.wait();
        } else if(myTurn.elapsed > MAX_MONO){
            console.log($('.user:last').html() + ' ' + sock.nick);
            if($('.user:last').html() === sock.nick){sock.match();} // just talked for max time without response, new match
            else { pages.toggle('.chat', '.mono');}                 // switch from chat to mono when user did too much listening / idling
            myTurn.wait();
        } else {myTurn.clock = setTimeout(myTurn.check, 1000);} // set next timeout when still connected
    },
    wait: function(){
        convo.rm();                                             // clear out conversation history
        myTurn.set(false);                                      // block typing
        myTurn.idle = 0;                                        // reset idle to zero
        send.clear();                                           // be sure text box is cleared when disconnecting
        $('#topnav').fadeIn(1000);                              // reshow nav bar
        $('#waitMSG').css('display', 'block');                  // show wait message
    }
}

var send = {
    empty: true, // only way to know text was clear before typing i.e. client just stared typing
    input: function(){
        if(myTurn.isIt){
            var rtt = {text: $('#textEntry').val(), to: sock.to, from: sock.nick};
            if(send.empty){
                send.empty = false;
                sock.et.emit('interrupt', rtt);
                convo.next(rtt);
                myTurn.start();
            } else {
                sock.et.emit('chat', rtt);       // send real time chat data to partner
                convo.chat(rtt);                 // fill personal history
            }
        } else {send.clear();}                   // block input
    },
    clear: function(){
        $('#textEntry').val(''); // clear out text in entry bar
        send.empty = true;       // note that text is cleared out of entry bar
    }
}

var speed = { // -- handles gathing speed information
    start: 0,
    realTime: function(chars){
        var now = new Date().getTime();
        if(chars){return (60000/((now-speed.start)/chars)/5).toFixed();} // return words per minute
        else { speed.start = now; }                                       // no param/chars starts the clock
    },
}

var sock = {  // -- handle socket.io connection events
    et: io(), // start socket.io listener
    to: '',   // socketid of our partner
    nick: '', // name of this client
    name: function(nickName){                      // allow chat and go when we have a name
        sock.nick = nickName;                      // learn ones own name
        sock.et.on('chat', convo.chat);            // recieves real time chat information
        sock.et.on('interrupt', myTurn.interrupt); // recieves new chat partners or interuptions from partner
        sock.et.on('connect_error', function(){window.location.replace('/');}); // reload on connection error
        sock.et.on('start', function(partner){
            sock.to = partner;                     // recognize who you're talking to
            myTurn.set(true);                      // give the ability to talk
            myTurn.start();                        // signal begining of turn
            $('#topnav').fadeOut(2000);            // fade out navbar
            $('#waitMSG').css('display', 'none');  // hide wait msg
        });
    },
    match: function(){sock.et.emit('match', sock.to);} // signal ready for next match
}

var pages = {                               // page based opporations
    init: function(){                       // on click functions
        var active = $('#active').html();   // grab name of active user if there is one
        if(active){                         // given there is an active user
            sock.name(active);              // activate socket connection
            myTurn.set(false);              // Block untill server gives a match
            $('#textEntry').keydown(send.enter);                       // capture special key like enter
            document.getElementById('textEntry').oninput = send.input; // listen for input event
            $('.chat.view').show();         // reshow chat view
            sock.match();                   // signal server match desired
        } else {$('.name.view').show();}    // show sign in if no active user was passed by server
        $('#resume').click(function(){      // resume from an inactive state
            sock.match();                   // signal ready for new match
            pages.toggle('.mono', '.chat'); // toggle mono to chat
        });
        $('#rename').click(function(){      // resume from an inactive state
            sock.et.emit('pause');          // soft disconnect event
            pages.toggle('.chat', '.name'); // toggle chat to name
        });
    },
    toggle: function(hide, show){
        $(hide + '.view').hide();       // hide view
        $(show + '.view').show();       // show view
    }
}

$(document).ready(pages.init); // fire up pages when DOM is ready
