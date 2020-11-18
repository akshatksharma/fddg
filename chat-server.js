const http = require("http"),
  url = require("url"),
  path = require("path"),
  mime = require("mime"),
  fs = require("fs"),
  socketio = require("socket.io");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
const app = http.createServer((req, resp) => {
  let filename = path.join(__dirname, url.parse(req.url).pathname);

  (fs.exists || path.exists)(filename, (exists) => {
    if (exists) {
      fs.readFile(filename, (err, data) => {
        if (err) {
          // File exists but is not readable (permissions issue?)
          resp.writeHead(500, {
            "Content-Type": "text/plain",
          });
          resp.write("Internal server error: could not read file");
          resp.end();
          return;
        }

        // File exists and is readable
        let mimetype = mime.getType(filename);
        resp.writeHead(200, {
          "Content-Type": mimetype,
        });
        resp.write(data);
        resp.end();
        return;
      });
    } else {
      resp.writeHead(404, {
        "Content-Type": "text/plain",
      });
      resp.write("Requested file not found: " + filename);
      resp.end();
      return;
    }
  });
});
app.listen(3456);

// Do the Socket.IO magic:
const io = socketio.listen(app);

let numUsers = 0;
let userInfo = {};
let roomInfo = {
  general: {
    name: "general",
    password: null,
    admins: {},
    connections: [],
    banList: {},
  },
};

io.sockets.on("connection", (socket) => {
  let loggedIn = false;

  if (socket.username) {
    socket.emit("login", {
      success: true,
      username: socket.username,
      numUsers: numUsers,
    });
  }

  socket.emit("loadRooms", {
    success: true,
    rooms: Object.values(roomInfo).map((room) => {
      return { name: room.name, hasPass: room.password ? true : false };
    }),
  });

  socket.on("addRoom", ({ roomName, roomPass, admins }) => {
    roomInfo[roomName] = {
      name: roomName,
      password: roomPass,
      admins: admins,
      connections: [socket.username],
      banList: {},
    };

    console.log(roomInfo);
    socket.leave(socket.currentRoom);
    socket.join(roomName);
    socket.currentRoom = roomName;

    io.sockets.emit("addRoomToClient", {
      success: true,
      name: roomInfo[roomName].name,
      hasPass: roomInfo[roomName].password ? true : false,
    });

    if (!roomPass) {
      socket.emit("roomJoined", {
        success: true,
        roomName: roomInfo[roomName].name,
        admins: roomInfo[roomName].admins,
        connections: [socket.username],
      });
    } else {
      socket.emit("statusToClient", {
        status: ["use the dropdown above to join "],
      });
    }
  });

  socket.on("joinRoom", ({ roomName, roomPass = null, previousRoom }) => {
    if (roomName) {
      const banList = roomInfo[roomName].banList;

      if (banList[socket.id]) {
        socket.emit("statusToClient", {
          status: [`you are banned from ${roomName}`],
        });

        socket.emit("roomJoined", {
          success: true,
          roomName: "general",
          connections: roomInfo["general"].connections,
        });

        return;
      }

      if (roomPass !== roomInfo[roomName].password) {
        socket.emit("statusToClient", {
          status: ["password incorrect"],
        });
        return;
      }

      if (previousRoom !== roomName) {
        socket.leave(previousRoom);
        socket.join(roomName);
        socket.currentRoom = roomName;

        const connections = Object.keys(
          io.sockets.adapter.rooms[roomName].sockets
        ).map((connection) => io.sockets.connected[connection].username);
        roomInfo[roomName].connections = connections;
      }

      console.log(roomInfo[roomName]);
      socket.emit("roomJoined", {
        success: true,
        roomName: roomInfo[roomName].name,
        admins: roomInfo[roomName].admins,
        connections: roomInfo[roomName].connections,
      });

      socket.to(socket.currentRoom).emit("statusToClient", {
        status: [`${socket.username} has joined`],
      });

      socket.to(socket.currentRoom).emit("updateClientUsers", {
        connections: roomInfo[roomName].connections,
      });
    }
  });

  socket.on("msgToServer", ({ message }) => {
    io.in(socket.currentRoom).emit("msgToClient", {
      username: socket.username || "",
      id: socket.id,
      message: message,
      type: "default",
    });
  });

  socket.on("runCommand", ({ command, args }) => {
    console.log(command);
    console.log(args);

    const adminList = roomInfo[socket.currentRoom].admins;

    if (command === "/help") {
      socket.emit("statusToClient", {
        status: [
          "To talk to someone privately:\n\n/pm *username* *message*",
          "To talk loudly: /loud *message* ",
          "To talk quietly: /quiet *message* ",
          "To talk owo: /owo *message*",
          "if you are an admin...",
          "To ban someone: /ban *username*",
          "To unban them: /unban *username*",
          "To temporarily kick someone: /kick *username*",
          "To give someone admin powers: /admin *username*",
        ],
      });
      return;
    }
    if (command === "/loud") {
      const message = args.join(" ") || "";

      io.in(socket.currentRoom).emit("msgToClient", {
        username: socket.username || "",
        id: socket.id,
        message: message,
        type: "loud",
      });

      return;
    } else if (command === "/quiet") {
      const message = args.join(" ") || "";

      console.log(args);

      io.in(socket.currentRoom).emit("msgToClient", {
        username: socket.username || "",
        id: socket.id,
        message: message,
        type: "quiet",
      });

      return;
    } else if (command === "/owo") {
      const message = args.join(" ") || "";
      console.log({ message });

      const owomessage = message.replace(/o/g, "owo");

      io.in(socket.currentRoom).emit("msgToClient", {
        username: socket.username || "",
        id: socket.id,
        message: owomessage,
        type: "owo",
      });

      return;
    } else {
      const doesRecipientExist = roomInfo[socket.currentRoom].connections.some(
        (elem) => elem === args[0]
      );
      console.log(roomInfo[socket.currentRoom]);
      if (!doesRecipientExist) {
        return;
      }
      const recipientId = userInfo[args[0]];

      if (command === "/pm") {
        const message = args.slice(1).join(" ");

        console.log({ message });
        console.log({ recipientId });
        io.to(recipientId).emit("msgToClient", {
          username: socket.username || "",
          id: socket.id,
          message: message,
          type: "pm",
        });
      } else if (command === "/ban") {
        if (!adminList[socket.username]) {
          socket.emit("statusToClient", {
            status: ["you do not have permission to use this command "],
          });
          return;
        }

        const recipient = io.sockets.connected[recipientId];
        const message = `You have been banned from ${recipient.currentRoom}`;

        console.log(socket.currentRoom);

        roomInfo[socket.currentRoom].banList[recipientId] = recipientId;
        recipient.leave(socket.currentRoom);
        recipient.join("general");
        recipient.currentRoom = "general";

        console.log(roomInfo);

        recipient.emit("roomJoined", {
          success: true,
          roomName: "general",
          connections: roomInfo["general"].connections,
        });

        io.to(recipientId).emit("statusToClient", {
          status: [message],
        });
      } else if (command === "/unban") {
        if (!adminList[socket.username]) {
          socket.emit("statusToClient", {
            status: ["you do not have permission to use this command "],
          });
          return;
        }

        delete roomInfo[socket.currentRoom].banList[recipientId];
        console.log(roomInfo);

        const message = `You have been unbanned from ${socket.currentRoom}`;

        io.to(recipientId).emit("statusToClient", {
          status: [message],
        });
      } else if (command === "/kick") {
        if (!adminList[socket.username]) {
          socket.emit("statusToClient", {
            status: ["you do not have permission to use this command "],
          });
          return;
        }

        const recipient = io.sockets.connected[recipientId];
        const message = `You have been kicked from ${recipient.currentRoom}`;

        recipient.leave(socket.currentRoom);
        recipient.join("general");
        recipient.currentRoom = "general";

        recipient.emit("roomJoined", {
          success: true,
          roomName: "general",
          connections: roomInfo["general"].connections,
        });

        io.to(recipientId).emit("statusToClient", {
          status: [message],
        });
      } else if (command === "/admin") {
        if (!adminList[socket.username]) {
          socket.emit("statusToClient", {
            status: ["you do not have permission to use this command "],
          });
          return;
        }

        const recipient = io.sockets.connected[recipientId];
        roomInfo[socket.currentRoom].admins[recipient.username] =
          recipient.username;

        io.to(recipientId).emit("statusToClient", {
          status: [`you are now an admin of ${socket.currentRoom}`],
        });

        console.log(roomInfo[socket.currentRoom]);
      }
    }
  });

  socket.on("addUser", (username) => {
    if (loggedIn) {
      socket.emit("userJoined", {
        success: false,
        status: "User already logged",
      });
      return;
    }

    socket.join("general");
    socket.currentRoom = "general";
    socket.username = username;
    userInfo[username] = socket.id;
    numUsers++;
    loggedIn = true;

    console.log({ userInfo });

    const connections = Object.keys(
      io.sockets.adapter.rooms["general"].sockets
    ).map((connection) => io.sockets.connected[connection].username);

    roomInfo["general"].connections = connections;

    socket.emit("login", {
      success: true,
      username: socket.username,
      id: socket.id,
      numUsers: numUsers,
      connections: Object.keys(userInfo),
    });

    socket.broadcast.emit("userJoined", {
      success: true,
      username: socket.username,
      numUsers: numUsers,
    });
  });

  socket.on("removeUser", () => {
    socket.currentRoom = null;
    delete userInfo[socket.username];
    numUsers--;
    loggedIn = false;

    console.log(userInfo);

    socket.emit("logout");
    socket.disconnect();
  });
});
