var PORT = process.env.OPENSHIFT_INTERNAL_PORT || 8080;
var IPADDRESS = process.env.OPENSHIFT_INTERNAL_IP || '0.0.0.0';

var express = require('express');
var server;
var io;
var app;
// Import our common modules.
var Handlebars = require('./common/handlebars').Handlebars;
var Message = require('./common/models').Message;
var User = require('./common/models').User;
// Grab any arguments that are passed in.
var argv = require('optimist').argv;


// Setup a very simple express application.
app = express();
// How we pass our websocket URL to the client.
app.use('/varSocketURI.js', function(req, res) {
    var port = argv['websocket-port'];
    // Modify the URI only if we pass an optional connection port in.
    var socketURI = port ? ':'+port+'/' : '/';
    res.set('Content-Type', 'text/javascript');
    res.send('var socketURI="'+socketURI+'";');
});
// The client path is for client specific code.
app.use('/client', express.static(__dirname + '/client'));
// The common path is for shared code: used by both client and server.
app.use('/common', express.static(__dirname + '/common'));
// The root path should serve the client HTML.
app.get('/', function(req, res) {
    res.sendfile(__dirname + '/client/index.html');
});
app.get('/admin', function(req, res) {
    res.sendfile(__dirname + '/client/admin.html');
});



// Our express application functions as our main listener for HTTP requests
// in this example which is why we don't just invoke listen on the app object.
server = require('http').createServer(app);
server.listen(PORT, IPADDRESS);


var admin_sockets = {};

// Our pool of users.
var users = {
    // The actual list of users.
    list: [],
    // Add a user to the pool. We do not filter for duplicates.
    add: function(user) {
        this.list.push(user);
        // Only tell admins about it
        io.sockets.clients().forEach(function (socket) {
          if (socket.admin) {
            console.log('sending user list to admin');
            socket.emit('user-list', {
              'users': users.list
            })
          }
        });      
    },
    // Remove a user from the pool.
    // If the user was actually removed from the pool we return true,
    // otherwise we return false.
    remove: function(user) {
        var index = this.list.indexOf(user);
        if (index != -1) {
            // remove our name from the list and update everyone.
            this.list.splice(index, 1);
            io.sockets.emit('user-list', {
                'users': this.list
            });
            return true;          
        }
        // no user removed
        return false;
    }
};



// List of message templates, compiled as handlebars template functions.
// To keep with the theme, all messages are handlebars functions, even the 
// ones that don't do substitution.
var messages = {
    // Do not expect a context object.
    "welcome": Handlebars.compile('the chatty server welcomes you. before i let you join the chat room, please provide a username for yourself and hit return. please no spaces or special characters. letters, numbers, and underscores are okay.'),
    "invalidRequireName": Handlebars.compile('sorry, you need to tell me your name first.'),
    "invalidNameChange": Handlebars.compile('not sure what you did, but please do not change your username midchat.'),
    // Expect a context object.
    "leftChatroom": Handlebars.compile("{{name}} has left the chatroom."),
    "haveFun": Handlebars.compile('Welcome {{name}}, someone will be right with you.'),
    "welcomeAdmin": Handlebars.compile('admin {{name}} logged in.'),
    "hasJoinedRoom": Handlebars.compile('{{name}} has joined the chatroom.'),
    "invalidName": Handlebars.compile('sorry, {{name}} is an invalid username. make sure there are no spaces or bizarre characters in your name (underscores are okay). disconnecting.'),
};



// socket.io augments our existing HTTP server instance.
io = require('socket.io').listen(server);
io.configure(function() {
    // Logging: 3 = debug (default), 1 = warn
    var logLevel = (argv["log-level"] === undefined) ? 3 : argv["log-level"];
    io.set("log level", logLevel);
});
// Called on a new connection from the client. The socket object should be
// referenced for future communication with an explicit client.
io.sockets.on('connection', function (socket) {
    
    // The username for this socket.
    var user = User();
    // Cleans up a bit when we disconnect.
    var disconnectSocket = function() {
        var wasUserRemoved = users.remove(user);
        if (user.name && wasUserRemoved) {
            io.sockets.emit('chat', Message(messages.leftChatroom(user), User('server'), "info", "server"));
        }
        // We let the client deliver the final response.
        socket.disconnect();
    };
    
    
    
    // Welcome message.
    socket.emit('chat', Message(messages.welcome(), "info", "server"));
    
    
    // Set up listeners on the server side.
    socket.once('disconnect', function() {
        // Respond if the client side voluntarily disconnects, but respond
        // only once. It appears that disconnecting will fire more disconnect
        // messages, whether from the client or server. So respond once and
        // only once for each client.
        disconnectSocket();
    });
    
    
    socket.on('set-name', function(data){
        // Allows a user to set their username.
        // Very simple username. Must be alphanumeric characters, no spaces.
        user.name = data.username;
        if (user.isValid()) {
            if (user.isAdmin()) {
              socket.admin = true;
              socket.emit('chat', Message(messages.welcomeAdmin(user), User('server'), "info", user.name));
              //Join own room
              socket.join(user.name);
              //Join all user rooms
              users.list.forEach(function (user) {
                socket.join(user.name);
                console.log("joined " + user.name);
              });
              //Attach socket object to admin user, can add to rooms later
              //user.socket = socket;
              admin_sockets[user.name] = socket;
            }
            else {
              socket.emit('chat', Message(messages.haveFun(user), User('server'), "info", user.name));
              //Join own room, named after themselves
              socket.join(user.name);
              //Add all admins
              users.list.forEach(function (otheruser) {
                if (otheruser.isAdmin()) {
                  admin_sockets[otheruser.name].join(user.name); 
                }
              });
            }
            users.add(user);
        }
        else {
            socket.emit('chat', Message(messages.invalidName(user), User('server'), 'error', user.name));
            disconnectSocket();
        }
    });
    
    
    
    socket.on('chat', function(data) {
        // Message passed by a client to the server with the intent of
        // broadcasting to the chatroom.
        if (data.user && data.user.name == user.name) {
          // Admin sending message to a room. dest shouldn't ever be null for admins
          if (socket.admin && data.dest != "null") { 
            io.sockets.in(data.dest).emit('chat', Message(data.message, user, "chat", data.dest));
          }
          else {
            // User chat
            io.sockets.in(data.user.name).emit('chat', Message(data.message, user, "chat", data.dest));
          }
        /* Big changes
          if (socket.admin) {
            io.sockets.emit('chat', Message(data.message, user, "chat"));
          }
          // Send to admins, unless it's an admin sending it
          else {
            // Send back to user
            socket.emit('chat', Message(data.message, user, "chat"));
            // Bcast only to admins
            io.sockets.clients().forEach(function(socket) {
              if (socket.admin) {
                socket.emit('chat', Message(data.message, user, "chat"));
              }
            });
          }
        */
        }
        else if (!user.name) {
            // Do not allow people to communicate without having a saved user
            // name.
            socket.emit('chat', Message(messages.invalidRequireName(), User('server'), 'error', user.name));
            disconnectSocket();
        }
        else {
            // Do not allow people to change their name in the request alone
            // on this socket. (Example of a very pathetic amount of security).
            socket.emit('chat', Message(messages.invalidNameChange(), User('server'), 'error', user.name));
            disconnectSocket();
        }
    });
});
