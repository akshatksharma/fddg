const socketio = io.connect();

const user = { username: null };

const checkCommand = () => {
  const msg = document.getElementById("messageText");
  const commandMatch = /(\/pm|\/help|\/ban|\/unban|\/kick|\/admin|\/loud|\/quiet|\/owo)\W*(\w+(?=|$).*)*(?!.contains)/;
  const match = msg.value.match(commandMatch);

  console.log(match);

  let didMatch = null;

  if (match) {
    const command = match[1];
    if (command === "/help") {
      socketio.emit("runCommand", { command: command, args: "" });
    } else {
      const args = match[2].split(" ");
      socketio.emit("runCommand", { command: command, args: args });
    }
    didMatch = true;
    msg.value = "";
    return didMatch;
  } else {
    didMatch = false;
    return didMatch;
  }
};

const sendMessage = (e) => {
  e.preventDefault();
  const msg = document.getElementById("messageText");
  if (user.username) {
    const isCommand = checkCommand();
    if (!isCommand) {
      socketio.emit("msgToServer", { message: msg.value });
      msg.value = "";
    }
  } else {
    const status = "pls login";
    logStatus([status]);
  }
};

const sendUser = (e) => {
  e.preventDefault();
  const username = document.getElementById("userText");
  if (username) {
    socketio.emit("addUser", username.value);
    username.value = "";
  }
};

const sendRoom = (e) => {
  e.preventDefault();
  if (user.username) {
    const roomName = document.getElementById("roomText");
    const roomPass = document.getElementById("roomPass");
    let roomInfo = {};

    if (roomPass) {
      roomInfo = {
        roomName: roomName.value,
        roomPass: roomPass.value,
        admins: {},
      };
      roomPass.value = "";
    } else {
      roomInfo = {
        roomName: roomName.value,
        roomPass: null,
        admins: {},
      };
      roomName.value = "";
    }

    roomInfo.admins[user.username] = user.username;

    if (roomName) {
      socketio.emit("addRoom", roomInfo);
    }
  } else logStatus(["pls login"]);
};

const authRoom = (roomName) => {
  const roomPass = document.getElementById("roomAuthText");
  socketio.emit("joinRoom", {
    roomName: roomName,
    roomPass: roomPass.value,
    previousRoom: user.currentRoom,
  });
  roomPass.value = "";
};

const changeRoom = (e) => {
  e.preventDefault();
  if (user.username) {
    const roomSelector = document.getElementById("roomList");
    const selectedOption = roomSelector.options[roomSelector.selectedIndex];
    const roomName = selectedOption.textContent;
    const hasPass = selectedOption.value;

    if (hasPass === "true") {
      const auth = document.createElement("form");
      auth.id = "roomAuth";

      const passInput = document.createElement("input");
      passInput.setAttribute("type", "password");
      passInput.setAttribute("placeholder", "room password");
      passInput.id = "roomAuthText";

      const submitButton = document.createElement("button");
      submitButton.setAttribute("type", "submit");
      submitButton.innerText = "submit";
      submitButton.onclick = (e) => {
        e.preventDefault();
        authRoom(roomName);
      };

      auth.appendChild(passInput);
      auth.appendChild(submitButton);

      roomSelector.after(auth);
      logStatus(["pls type room password above to join"]);
    } else {
      socketio.emit("joinRoom", {
        roomName: roomName,
        previousRoom: user.currentRoom,
      });
    }
  } else logStatus(["pls login"]);
};

const updateConnectedUsers = (connections) => {
  const nameSelector = document.getElementById("userList");
  nameSelector.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.textContent = "see users";
  nameSelector.appendChild(defaultOption);

  connections.forEach((connection) => {
    const option = document.createElement("option");
    option.textContent = connection;
    nameSelector.appendChild(option);
  });
};

const togglePassword = (e) => {
  if (e.target.checked) {
    const passwordBar = document.createElement("input");
    passwordBar.setAttribute("type", "password");
    passwordBar.id = "roomPass";

    e.target.after(passwordBar);
  } else {
    const passwordBar = document.getElementById("roomPass");
    passwordBar.remove();
  }
};

document.getElementById("sendMessage").onclick = sendMessage;
document.getElementById("sendUser").onclick = sendUser;
document.getElementById("sendRoom").onclick = sendRoom;
document.getElementById("roomList").onchange = changeRoom;
document.getElementById("togglePass").onchange = togglePassword;

const logMessage = ({ username, id, message, type }) => {
  const chatlog = document.getElementById("chatlog");
  const chatMessage = document.createElement("div");
  const userText = document.createElement("div");
  const messageText = document.createElement("div");

  messageText.textContent = message;
  messageText.classList.add("messageText");
  userText.textContent = username;
  userText.classList.add("userText");

  if (id == user.id) {
    chatMessage.classList.add("message", "localMessage");
  } else {
    chatMessage.classList.add("message", "incomingMessage");
  }

  switch (type) {
    case "loud":
      messageText.classList.add("messageText--loud");
      break;
    case "pm":
      messageText.classList.add("messageText--quiet");
      break;
    case "quiet":
      messageText.classList.add("messageText--quiet");
      break;
    case "owo":
      break;
    default:
  }

  chatMessage.appendChild(userText);
  chatMessage.appendChild(messageText);
  chatlog.appendChild(chatMessage);
};

const logStatus = (messages) => {
  const chatlog = document.getElementById("chatlog");
  const statusMsgBlock = document.createElement("div");
  statusMsgBlock.classList.add("statusBlock");

  messages.forEach((message) => {
    const msgDiv = document.createElement("div");
    msgDiv.textContent = message;
    msgDiv.classList.add("message", "status");
    statusMsgBlock.appendChild(msgDiv);
  });
  chatlog.appendChild(statusMsgBlock);
};

socketio.on("login", ({ username, id, numUsers, connections }) => {
  user.id = id;
  user.username = username;
  user.currentRoom = "general";

  updateConnectedUsers(connections);

  let message = null;
  if (numUsers > 1)
    message = `hallo ${username}, there are ${numUsers} users online currently`;
  else {
    message = `hallo ${username}, you are the only one online currently`;
  }
  logStatus([message]);

  const pageNode = document.getElementsByClassName("mainForms")[0];
  document.getElementsByClassName("form--user")[0].classList.add("hidden");
  const userInfoNode = document.createElement("span");
  userInfoNode.className = "userInfo";
  const usernameNode = document.createElement("span");
  usernameNode.className = "username";
  usernameNode.textContent = user.username;
  const disconnectButton = document.createElement("button");
  disconnectButton.textContent = "leave";
  disconnectButton.onclick = () => {
    socketio.emit("removeUser");
    logStatus(["logging you out..."]);
  };

  userInfoNode.appendChild(usernameNode);
  userInfoNode.appendChild(disconnectButton);

  pageNode.insertBefore(userInfoNode, pageNode.firstChild);
});

socketio.on("msgToClient", ({ username, id, message, type }) => {
  logMessage({ username, id, message, type });
});

socketio.on("statusToClient", ({ status }) => {
  logStatus(status);
});

socketio.on("updateClientUsers", ({ connections }) => {
  updateConnectedUsers(connections);
});

socketio.on("userJoined", ({ success, username, status = null }) => {
  if (success) {
    let message = `${username} is online`;
    logStatus([message]);
  } else {
    logStatus([status]);
  }
});

socketio.on("addRoomToClient", ({ success, name, hasPass }) => {
  const roomSelector = document.getElementById("roomList");

  if (success) {
    const option = document.createElement("option");
    option.textContent = name;
    option.value = hasPass;

    roomSelector.appendChild(option);
  }
});

socketio.on("loadRooms", ({ success, rooms }) => {
  const roomSelector = document.getElementById("roomList");

  if (success) {
    for (const room of rooms) {
      const option = document.createElement("option");
      option.textContent = room.name;
      option.value = room.hasPass;

      roomSelector.appendChild(option);
    }
  }
});

socketio.on("roomJoined", ({ success, roomName, admins, connections }) => {
  if (success) {
    user.currentRoom = roomName;

    updateConnectedUsers(connections);

    let m1 = `joined ${roomName}`;
    let m2 = null;
    if (connections.length === 1) {
      m2 = "you are the only one here";
    } else {
      m2 = connections ? `${connections.join(", ")} are currently here` : "";
    }

    logStatus([m1, m2]);

    let roomSelector = document.getElementById("roomList");
    let selectOptions = roomSelector.options;
    for (let i = 0; i < selectOptions.length; i++) {
      if (selectOptions[i].textContent === roomName) {
        roomSelector.selectedIndex = i;
        break;
      }
    }

    const authBar = document.getElementById("roomAuth");
    if (authBar) {
      authBar.remove();
    }
  }
});

socketio.on("logout", () => {
  document.getElementsByClassName("form--user")[0].classList.remove("hidden");
  document.getElementsByClassName("userInfo")[0].remove();

  logStatus(["logged out. refresh the page before logging in again"]);
});
