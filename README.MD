This is a test web app for strangers finding common interest and chatting about it in real time


The second version is a rebuild of the first with a stronger focus on the chat mechanics


In order to test this application locally you will need


* Node.js and NPM (grab complete dependencies with "npm install")
Note "postinstall" may fail locally because of the differance in how it points to directories between local and Heroku
Given thats the case run "bower install" in the views directory to get Bootstrap, Socket.io and JQuery
* MongoDB     (probably ~ future)
* A startup script to set the following enviornment variables
* PORT
* SESSION_SECRET
* DB_ADDRESS  (probably ~ future)


The following is an example script (start.sh) to start this web app locally with needed enviornment variables

    #!/bin/bash

    # Script for starting our service locally
    PORT="3000"
    export PORT
    # session secret for client side cookies on the service
    SESSION_SECRET="putyoursecretheremakeitgood"
    export SESSION_SECRET
    # point to the database we will be using
    DB_ADDRESS="mongodb://localhost/strangerDanger"
    export DB_ADDRESS

    node serve.js

The server is subject to the terms of AGPL-1.0 and the Client the MIT license
