// Admin list
var admins = [
  'futonsurfer',
  'earl'
]

// The generic user object constructor.
this.User = function(name) {
    return {
        'name': name || '',
        'isValid': function() {
          return /^\w+$/g.test(this.name);
        },
        'isAdmin': function() {
          if (admins.indexOf(this.name) >= 0) {
            return true;
          }
          else { 
            return false;
          }      
        }
    };
};
// Deal with making the code palatable to both client and module, since
// we reference the code within this file for our model.
// This is essentially a noop on the client (reference global to global).
var User = this.User;


// The generic message object constructor.
this.Message = function(message, user, type, dest) {
    return {
        // If it's not from a user, it is from the server.
        'user': user || User("server"),
        // For admins to send to a room, optional
        'message': message,
        // Default messages are info messages, easier to see as incorrect.
        'type': type || "info",
        'dest': dest || "null"
    }
};
