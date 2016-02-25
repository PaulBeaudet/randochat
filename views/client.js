// client.js ~ Copyright 2015 Paul Beaudet ~ MIT License see LICENSE_MIT for detials
var NUM_ENTRIES = 6;   // number of dialog rows allowed in the application
var OPEN_HELM = 25;    // time before helm can be taken by interuption
var FULL_TIMEOUT = 15; // timeout for long inactivity
var MAX_MONO = 60;     // maximum time that can be used to monologe
var PAUSE_TIMEOUT = 3; // inactivity timeout

var hist = {
    row: 0,                                    // notes history row being typed in
    refresh: function(){                       // refresh elements
        for(var i = 0; i<NUM_ENTRIES; i++){    // for all of the entries
            $('#dialog'+i).html('');           // clear previous dialog
            $('#person'+i).html('');           // clear previous users
        }
        hist.row = 0;
        $('#wpm').html('');
    },
    increment: function(){ // decides with row to edit to and when the dialog needs to scoot up
        if(hist.row === NUM_ENTRIES - 1){
            for(var i = 1; i < NUM_ENTRIES; i++){
                $('#dialog' + ( i - 1 )).html( $('#dialog' + i).html() );
                $('#person' + ( i - 1 )).html( $('#person' + i).html() );
            }
            $('#dialog' + (NUM_ENTRIES - 1)).html('');
            $('#person' + (NUM_ENTRIES -1)).html('');
        }
        else {hist.row++;}
    },
    chat: function(rtt){
        $('#dialog'+ hist.row).html(rtt.text);                  // incomming chat dialog
        $('#person'+ hist.row).html(rtt.from);                  // set id of incoming message
        myTurn.idle = 0;                                        // reset idle counter
        $('#wpm').html(speed.realTime(rtt.text.length)+' WPM'); // show speed after start
    },
    taken: function(){ return $('#person'+hist.row).html() === send.to; }, // check if our partner started talking
}

var myTurn = {
    isIt: false,
    elapsed: 0,
    idle: 0,
    clock: 0,
    interrupt: function(rtt){
        myTurn.set(false);
        send.clear();
        myTurn.begin();
        hist.chat(rtt);
    },
    set: function(status){
        myTurn.isIt = status;                                 // set status of whos turn it is
        $('#sendText').html(myTurn.isIt ? 'Type!' : 'Wait!'); // send text reflects ability wether it be true or false
    },
    start: function(){ // first turn
        myTurn.elapsed = 0;
        clearTimeout(myTurn.clock);                    // Make sure standing timeout is removed if any
        myTurn.clock = setTimeout(myTurn.check, 1000); // create new timeout
    },
    begin: function(){ // turn by turn
        hist.increment();
        speed.realTime();
        myTurn.start();
    },
    check: function(){
        myTurn.elapsed++;                   // increment elapsed time
        myTurn.idle++;                      // increment idle time (will only really increment w/inactivity)
        if(myTurn.isIt){                    // might this client talk?
            if($('#person'+hist.row).html()===send.to){myTurn.set(false);} // if someone all ready talk then no
        }else{                              // not this users turn
            if(myTurn.elapsed > OPEN_HELM || myTurn.idle > PAUSE_TIMEOUT){myTurn.set(true);} // check for my turn
        }
        if(myTurn.idle > FULL_TIMEOUT || myTurn.elapsed > MAX_MONO){ // disconnect conditions
            sock.et.emit('end');                                     // signal to server your are ready for a new partner
            hist.refresh();                                          // clear out going conversation
            myTurn.set(false);                                       // block typing
            myTurn.idle = 0;                                         // reset idle to zero
            send.clear();                                            // be sure text box is cleared when disconnecting
        } else {myTurn.clock = setTimeout(myTurn.check, 1000);}      // set next timeout when still connected
    }
}

var send = {
    empty: true, // only way to know text was clear before typing i.e. client just stared typing
    to: '',      // note other socket being messaged with
    input: function(){
        if(myTurn.isIt){
            var rtt = {text: $('#textEntry').val(), to: send.to, from: sock.nick};
            if(send.empty){
                send.empty = false;
                sock.et.emit('interrupt', rtt);
                myTurn.begin();
            } else {
                sock.et.emit('chat', rtt);       // send real time chat data to partner
            }
            hist.chat(rtt);                      // write chat real time chat data to self
        } else {send.clear();}                   // block input
    },
    clear: function(){
        $('#textEntry').val(''); // clear out text in entry bar
        send.empty = true;       // note that text is cleared out of entry bar
    },
}

var speed = { // -- handles gathing speed information
    start: 0,
    realTime: function(chars){
        var now = new Date().getTime();
        if(chars){return (60000/((now-speed.start)/chars)/5).toFixed(2);} // return words per minute
        else { speed.start = now; }                                       // no param/chars starts the clock
    },
}

var sock = {  // -- handle socket.io connection events
    et: io(), // start socket.io listener
    nick: '', // name of this client
    name: function(nickName){           // allow chat and go when we have a name
        sock.nick = nickName;           // learn ones own name
        sock.et.on('chat', hist.chat);  // recieves real time chat information
        sock.et.on('interrupt', myTurn.interrupt); // recieves new chat partners or interuptions from partner
        sock.et.on('connect_error', function(){window.location.replace('/chat');}); // reload on connection error
        sock.et.on('start', function(partner){
            console.log('connecting with ' + partner );
            send.to = partner;          // recognize who you're talking to
            myTurn.set(true);           // give the ability to talk
            myTurn.start();             // signal begining of turn
        });
    }
}

$(document).ready(function(){                                  // when DOM is ready
    myTurn.set(false);                                         // Block untill server gives a match
    sock.et.on('youAre', sock.name);                           // wait for decrypted nickname
    $('#textEntry').keydown(send.enter);                       // capture special key like enter
    document.getElementById('textEntry').oninput = send.input; // listen for input event
});
